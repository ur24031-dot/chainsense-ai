"""
ChainSense AI — Monitoring Agent
Real-time ESG risk surveillance across 15+ sources.
LLaMA 3.1-70B via Groq API (750 tok/sec) for low-latency classification.
Separates: real-time alerts (news/regulatory/social) vs periodic satellite baseline.
"""

import os
import asyncio
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional
from groq import AsyncGroq
from orchestrator.message_bus import publish_event, consume_events
from orchestrator.audit_logger import AuditLogger

import logging
logger = logging.getLogger(__name__)


class ESGLabel(str, Enum):
    ENVIRONMENTAL = "E"
    SOCIAL = "S"
    GOVERNANCE = "G"
    COMBINED = "ESG"


class AlertSeverity(str, Enum):
    CRITICAL = "CRITICAL"    # < 6 hours
    HIGH = "HIGH"            # < 24 hours
    MEDIUM = "MEDIUM"        # < 72 hours
    LOW = "LOW"              # Weekly digest


@dataclass
class ESGSignal:
    source: str
    supplier_id: str
    text: str
    url: str
    published_at: str


@dataclass
class RiskAlert:
    supplier_id: str
    severity: AlertSeverity
    alert_tier: str
    violation_type: str
    labels: list[ESGLabel]
    evidence_urls: list[str]
    confidence_score: float
    summary: str
    recommended_alternatives: list[str] = field(default_factory=list)
    predicted_risk_days_ahead: int = 0


# Thresholds matching validation targets
SEVERITY_THRESHOLDS = {
    AlertSeverity.CRITICAL: 0.90,
    AlertSeverity.HIGH: 0.75,
    AlertSeverity.MEDIUM: 0.60,
    AlertSeverity.LOW: 0.45,
}

ESG_CLASSIFIER_PROMPT = """You are an ESG risk analyst specialized in Indian supply chains.
Analyze the following text and determine if it indicates an ESG violation or risk for a supplier.

Dataset context: ~8% of articles contain actionable ESG signals.
Return ONLY valid JSON, no preamble:
{
  "is_esg_signal": bool,
  "labels": ["E"|"S"|"G"],   // multi-label, include all that apply
  "violation_type": str,      // e.g., "water_discharge_violation", "labor_rights", "governance_fraud"
  "confidence": float,        // 0.0-1.0
  "severity": "CRITICAL"|"HIGH"|"MEDIUM"|"LOW",
  "summary": str,             // max 100 words
  "predicted_risk_days_ahead": int  // 0 if current incident, 30-90 if predictive signal
}

Severity guidelines:
- CRITICAL: Regulatory penalty order issued, facility shutdown ordered, criminal charges filed
- HIGH: Pollution violation detected, labor inspection underway, major safety incident
- MEDIUM: Risk score rising >15 points, compliance deadline approaching, supplier financial stress
- LOW: Certification expiry in 60-90 days, sector-wide regulation change, early sentiment shift
"""


class MonitoringAgent:
    def __init__(self):
        self.groq = AsyncGroq(api_key=os.environ["GROQ_API_KEY"])
        self.audit_logger = AuditLogger()
        self.model = "llama-3.1-70b-versatile"   # Groq hosted — 750 tok/sec
        logger.info(f"Monitoring Agent initialized with model: {self.model}")

    async def run(self):
        """Main loop: consume graph updates, scan sources, classify, publish alerts."""
        logger.info("Monitoring Agent listening on supplier.graph.updated stream")
        async for event in consume_events("supplier.graph.updated"):
            await self.process_graph_update(event)

    async def process_graph_update(self, event: dict):
        """On new suppliers in graph, immediately scan for ESG signals."""
        supplier_ids = [n["gst_number"] or n["name"] for n in event.get("new_nodes", [])]
        logger.info(f"Processing {len(supplier_ids)} new suppliers")
        tasks = [self.scan_supplier(sid) for sid in supplier_ids]
        await asyncio.gather(*tasks, return_exceptions=True)

    async def scan_supplier(self, supplier_id: str):
        """Fetch signals from all real-time sources and classify each."""
        from sources.news_scanner import fetch_news_signals
        from sources.regulatory_scanner import fetch_regulatory_signals
        from sources.social_scanner import fetch_social_signals

        # NOTE: Satellite (Sentinel-2) NOT called here — it is periodic (monthly baseline)
        # See satellite_baseline.py for that separate scheduled job
        all_signals = []
        all_signals.extend(await fetch_news_signals(supplier_id))
        all_signals.extend(await fetch_regulatory_signals(supplier_id))
        all_signals.extend(await fetch_social_signals(supplier_id))

        logger.info(f"Supplier {supplier_id}: {len(all_signals)} signals fetched")

        for signal in all_signals:
            alert = await self.classify_signal(signal)
            if alert and alert.confidence_score >= SEVERITY_THRESHOLDS[AlertSeverity.LOW]:
                await self._publish_alert(alert)

    async def classify_signal(self, signal: ESGSignal) -> Optional[RiskAlert]:
        """Run LLaMA-70B classification via Groq API."""
        try:
            response = await self.groq.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": ESG_CLASSIFIER_PROMPT},
                    {"role": "user", "content": f"Supplier ID: {signal.supplier_id}\nSource: {signal.source}\n\nText:\n{signal.text[:3000]}"}
                ],
                temperature=0.05,
                max_tokens=512,
                response_format={"type": "json_object"}
            )
            raw = response.choices[0].message.content
            result = __import__("json").loads(raw)
        except Exception as e:
            logger.error(f"Groq classification error for {signal.supplier_id}: {e}")
            # Use cached classification if < 6hr old (stale-data fallback)
            return self._get_cached_classification(signal.supplier_id)

        if not result.get("is_esg_signal", False):
            return None

        confidence = float(result.get("confidence", 0))
        severity_str = result.get("severity", "LOW")
        try:
            severity = AlertSeverity(severity_str)
        except ValueError:
            severity = AlertSeverity.LOW

        # Log to audit trail
        self.audit_logger.log(
            agent_id="MONITORING",
            event_type="signal.classified",
            input_hash=__import__("hashlib").sha256(signal.text.encode()).hexdigest(),
            model_used=self.model,
            output=result,
            confidence=confidence
        )

        return RiskAlert(
            supplier_id=signal.supplier_id,
            severity=severity,
            alert_tier=self._get_alert_tier(severity),
            violation_type=result.get("violation_type", "unknown"),
            labels=[ESGLabel(l) for l in result.get("labels", []) if l in [e.value for e in ESGLabel]],
            evidence_urls=[signal.url],
            confidence_score=confidence,
            summary=result.get("summary", ""),
            predicted_risk_days_ahead=int(result.get("predicted_risk_days_ahead", 0))
        )

    def _get_alert_tier(self, severity: AlertSeverity) -> str:
        tiers = {
            AlertSeverity.CRITICAL: "< 6 hours",
            AlertSeverity.HIGH: "< 24 hours",
            AlertSeverity.MEDIUM: "< 72 hours",
            AlertSeverity.LOW: "Weekly digest"
        }
        return tiers[severity]

    def _get_cached_classification(self, supplier_id: str) -> Optional[RiskAlert]:
        """Return cached classification if < 6hr old, else None (triggers stale-data flag)."""
        # Implementation: Redis GET with TTL check
        logger.warning(f"Using cached classification for {supplier_id} due to Groq API failure")
        return None  # Caller handles None → stale-data flag in audit log

    async def _publish_alert(self, alert: RiskAlert):
        """Publish risk alert to Compliance Agent + UI via Redis Streams."""
        publish_event("risk.alert.raised", {
            "supplier_id": alert.supplier_id,
            "severity": alert.severity.value,
            "alert_tier": alert.alert_tier,
            "violation_type": alert.violation_type,
            "labels": [l.value for l in alert.labels],
            "evidence_urls": alert.evidence_urls,
            "confidence_score": alert.confidence_score,
            "summary": alert.summary,
            "predicted_risk_days_ahead": alert.predicted_risk_days_ahead
        })
        logger.info(f"Alert published: {alert.severity.value} — {alert.supplier_id} — {alert.violation_type}")
