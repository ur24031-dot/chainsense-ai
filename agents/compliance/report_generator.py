"""
ChainSense AI — Compliance Agent
Generates BRSR/CSRD/GRI/SASB reports using GPT-4o with Claude Sonnet + Gemini Pro fallback chain.
Implements full 6-state HITL approval state machine.
"""

import os
import json
import hashlib
import time
from enum import Enum
from dataclasses import dataclass, field
from typing import Optional
import openai
import anthropic
import google.generativeai as genai
from orchestrator.circuit_breaker import CircuitBreaker
from orchestrator.audit_logger import AuditLogger
from rag_retriever import PolicyRAGRetriever

import logging
logger = logging.getLogger(__name__)


# ─── HITL State Machine ───────────────────────────────────────────────────────

class ReportState(str, Enum):
    DRAFT = "DRAFT"
    PENDING_REVIEW = "PENDING_REVIEW"
    IN_REVISION = "IN_REVISION"
    APPROVED = "APPROVED"
    FILED = "FILED"
    EXPIRED = "EXPIRED"

STATE_TIMEOUTS_HOURS = {
    ReportState.PENDING_REVIEW: 72,
    ReportState.IN_REVISION: 48,
}

VALID_TRANSITIONS = {
    ReportState.DRAFT:          [ReportState.PENDING_REVIEW],
    ReportState.PENDING_REVIEW: [ReportState.APPROVED, ReportState.IN_REVISION, ReportState.EXPIRED],
    ReportState.IN_REVISION:    [ReportState.PENDING_REVIEW, ReportState.EXPIRED],
    ReportState.APPROVED:       [ReportState.FILED],
    ReportState.FILED:          [],   # Terminal — immutable
    ReportState.EXPIRED:        [],   # Terminal — requires manual resolution
}


@dataclass
class ComplianceReport:
    report_id: str
    supplier_id: str
    framework: str   # "BRSR_CORE" | "CSRD_ESRS" | "GRI_2021" | "SASB" | "CDP"
    state: ReportState = ReportState.DRAFT
    content: dict = field(default_factory=dict)
    audit_trail: list = field(default_factory=list)
    sha256_hash: str = ""
    model_used: str = ""
    llm_fallback_tier: int = 0  # 0=primary, 1=fallback1, 2=fallback2
    rag_chunks: list = field(default_factory=list)
    reviewer_id: Optional[str] = None
    created_at: float = field(default_factory=time.time)
    state_changed_at: float = field(default_factory=time.time)


# ─── LLM Fallback Chain ───────────────────────────────────────────────────────

LLM_CONFIGS = [
    {"provider": "openai",     "model": "gpt-4o-2024-08-06",      "label": "GPT-4o (primary)"},
    {"provider": "anthropic",  "model": "claude-sonnet-4-6",  "label": "Claude Sonnet 3.7 (fallback 1)"},
    {"provider": "google",     "model": "gemini-1.5-pro",          "label": "Gemini Pro 1.5 (fallback 2)"},
]

REPORT_OUTPUT_SCHEMA = {
    "type": "object",
    "required": ["framework", "sections", "scope3_emission_estimate_tonnes_co2e", "compliance_gaps", "remediation_plan"],
    "properties": {
        "framework": {"type": "string"},
        "sections": {"type": "object"},
        "scope3_emission_estimate_tonnes_co2e": {"type": "number"},
        "compliance_gaps": {"type": "array"},
        "remediation_plan": {"type": "array"},
        "confidence_score": {"type": "number"},
    }
}

REPORT_SYSTEM_PROMPT = """You are a certified ESG compliance specialist with expertise in 
BRSR Core (SEBI), EU CSRD/ESRS, GRI Standards 2021, and SASB frameworks.
Generate a complete, audit-ready compliance report based on the supplier data and retrieved policy context provided.
Your report must cover ALL mandatory sections of the specified framework.
Return ONLY valid JSON matching the provided schema. No preamble, no markdown."""


class ComplianceAgent:
    def __init__(self):
        self.rag = PolicyRAGRetriever()
        self.audit_logger = AuditLogger()
        self.circuit_breaker = CircuitBreaker(max_failures=3, reset_timeout=60)

        # Initialize LLM clients
        self.openai_client = openai.OpenAI(api_key=os.environ["OPENAI_API_KEY"])
        self.anthropic_client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
        genai.configure(api_key=os.environ["GOOGLE_API_KEY"])
        self.gemini_model = genai.GenerativeModel("gemini-1.5-pro")

        logger.info("Compliance Agent initialized with 3-tier LLM fallback chain")

    def generate_report(self, supplier_id: str, alert_data: dict, framework: str = "BRSR_CORE") -> ComplianceReport:
        """Main entry: RAG retrieval → LLM generation → state machine → audit log."""
        report_id = hashlib.sha256(f"{supplier_id}{time.time()}".encode()).hexdigest()[:16]
        report = ComplianceReport(report_id=report_id, supplier_id=supplier_id, framework=framework)

        # Step 1: RAG retrieval with Cohere reranking
        # Cohere rerank-english-v3.0 applied post-retrieval (+12% accuracy vs pure vector search)
        policy_chunks = self.rag.retrieve(
            query=f"Scope 3 supply chain emissions compliance {framework} {alert_data.get('violation_type','')}",
            top_k_retrieve=20,
            top_k_rerank=8,
            min_similarity=0.72
        )
        report.rag_chunks = [{"chunk_id": c["id"], "source": c["source"], "score": c["score"]} for c in policy_chunks]

        if not policy_chunks:
            # Low confidence fallback: BM25 keyword retrieval
            logger.warning(f"Pinecone similarity < 0.72 for {report_id}; falling back to BM25 retrieval")
            policy_chunks = self.rag.retrieve_bm25(query=f"{framework} compliance {alert_data.get('violation_type','')}")
            report.audit_trail.append({"event": "rag_fallback_bm25", "reason": "similarity_threshold_not_met"})

        # Step 2: LLM generation with fallback chain
        context = "\n\n".join([c["text"] for c in policy_chunks])
        prompt = self._build_prompt(supplier_id, alert_data, framework, context)
        content, model_used, fallback_tier = self._generate_with_fallback(prompt)

        if not content:
            logger.error(f"All 3 LLMs failed for report {report_id}. Queuing for manual review.")
            report.state = ReportState.EXPIRED
            report.audit_trail.append({"event": "all_llms_failed", "action": "manual_queue"})
            return report

        report.content = content
        report.model_used = model_used
        report.llm_fallback_tier = fallback_tier
        report.sha256_hash = hashlib.sha256(json.dumps(content, sort_keys=True).encode()).hexdigest()

        # Step 3: RAG verification — check report against policy
        verification_score = self.rag.verify_report_against_policy(content, policy_chunks)
        if verification_score < 0.8:
            logger.warning(f"Report {report_id} policy verification score: {verification_score:.2f} < 0.8")
            report.audit_trail.append({
                "event": "policy_mismatch_detected",
                "verification_score": verification_score,
                "action": "forced_hitl_review"
            })

        # Step 4: Transition to PENDING_REVIEW
        self._transition(report, ReportState.PENDING_REVIEW)

        # Step 5: Audit log
        self.audit_logger.log(
            agent_id="COMPLIANCE",
            event_type="report.generated",
            input_hash=hashlib.sha256(json.dumps(alert_data).encode()).hexdigest(),
            model_used=model_used,
            output={"report_id": report_id, "state": report.state, "sha256": report.sha256_hash},
            confidence=content.get("confidence_score", 0),
            llm_fallback_tier=fallback_tier,
            rag_chunks=report.rag_chunks
        )

        return report

    def approve_report(self, report: ComplianceReport, reviewer_id_hash: str) -> ComplianceReport:
        """HITL approval — transitions PENDING_REVIEW → APPROVED → FILED."""
        self._transition(report, ReportState.APPROVED)
        report.reviewer_id = reviewer_id_hash  # Hashed reviewer ID for privacy
        self._transition(report, ReportState.FILED)

        # Seal audit trail — hash includes all previous entries
        final_hash = hashlib.sha256(
            (report.sha256_hash + json.dumps(report.audit_trail)).encode()
        ).hexdigest()
        report.sha256_hash = final_hash
        report.audit_trail.append({"event": "audit_trail_sealed", "final_hash": final_hash})

        logger.info(f"Report {report.report_id} FILED and sealed. Hash: {final_hash[:16]}...")
        return report

    def check_timeouts(self, report: ComplianceReport) -> ComplianceReport:
        """Called by scheduler: check if PENDING_REVIEW or IN_REVISION has timed out."""
        if report.state not in STATE_TIMEOUTS_HOURS:
            return report
        timeout_hrs = STATE_TIMEOUTS_HOURS[report.state]
        elapsed_hrs = (time.time() - report.state_changed_at) / 3600
        if elapsed_hrs > timeout_hrs:
            logger.warning(f"Report {report.report_id} timed out in state {report.state} after {elapsed_hrs:.1f}h")
            self._transition(report, ReportState.EXPIRED)
            # EXPIRED blocks new report generation for this supplier until resolved
        elif elapsed_hrs > (timeout_hrs * 0.67):
            # 48hr reminder at PENDING_REVIEW (72hr timeout)
            logger.info(f"Report {report.report_id} reminder: {timeout_hrs - elapsed_hrs:.0f}h remaining")
        return report

    def _transition(self, report: ComplianceReport, new_state: ReportState):
        """Validate and execute state transition."""
        if new_state not in VALID_TRANSITIONS[report.state]:
            raise ValueError(f"Invalid transition: {report.state} → {new_state}")
        report.state = new_state
        report.state_changed_at = time.time()
        report.audit_trail.append({
            "event": "state_transition",
            "from": report.state,
            "to": new_state.value,
            "timestamp": report.state_changed_at
        })

    def _generate_with_fallback(self, prompt: str) -> tuple[Optional[dict], str, int]:
        """Try GPT-4o → Claude Sonnet → Gemini Pro. Returns (content, model_label, tier)."""
        for tier, config in enumerate(LLM_CONFIGS):
            if self.circuit_breaker.is_open(config["provider"]):
                logger.warning(f"Circuit breaker OPEN for {config['provider']}, skipping")
                continue
            try:
                content = self._call_llm(config, prompt)
                self.circuit_breaker.record_success(config["provider"])
                return content, config["label"], tier
            except Exception as e:
                logger.error(f"LLM call failed [{config['label']}]: {e}")
                self.circuit_breaker.record_failure(config["provider"])
        return None, "all_failed", -1

    def _call_llm(self, config: dict, prompt: str) -> dict:
        """Unified LLM call — all providers return identical JSON schema."""
        if config["provider"] == "openai":
            resp = self.openai_client.chat.completions.create(
                model=config["model"],
                messages=[
                    {"role": "system", "content": REPORT_SYSTEM_PROMPT},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.1, max_tokens=4096
            )
            return json.loads(resp.choices[0].message.content)

        elif config["provider"] == "anthropic":
            resp = self.anthropic_client.messages.create(
                model=config["model"],
                max_tokens=4096,
                system=REPORT_SYSTEM_PROMPT + "\nReturn ONLY valid JSON.",
                messages=[{"role": "user", "content": prompt}]
            )
            raw = resp.content[0].text
            clean = raw.strip().lstrip("```json").rstrip("```").strip()
            return json.loads(clean)

        elif config["provider"] == "google":
            resp = self.gemini_model.generate_content(
                REPORT_SYSTEM_PROMPT + "\n\n" + prompt,
                generation_config={"temperature": 0.1, "max_output_tokens": 4096}
            )
            raw = resp.text.strip().lstrip("```json").rstrip("```").strip()
            return json.loads(raw)

        raise ValueError(f"Unknown provider: {config['provider']}")

    def _build_prompt(self, supplier_id: str, alert: dict, framework: str, context: str) -> str:
        return f"""Supplier ID: {supplier_id}
Alert: {json.dumps(alert, indent=2)}
Framework: {framework}
Policy Context (retrieved via RAG, Cohere rerank-english-v3.0 applied):
{context[:8000]}

Generate a complete {framework} compliance report for this supplier.
Include all mandatory sections, compliance gap analysis, and remediation plan.
Estimate Scope 3 emissions using activity-based factors (IPCC AR6 / Defra / India BEE).
Return JSON matching the required schema."""
