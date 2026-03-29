"""
ChainSense AI — Discovery Agent
NER Pipeline: Extracts supplier entities from invoices/POs using LLaMA 3.1-8B (4-bit GGUF).
Runs on a single A10G 24GB GPU via llama.cpp. All enterprise document data stays on-premise.
"""

import json
import re
import hashlib
from pathlib import Path
from typing import Optional
from dataclasses import dataclass, field, asdict
from llama_cpp import Llama
from ocr_processor import extract_text_from_pdf
from graph_writer import SupplierGraphWriter
from orchestrator.message_bus import publish_event
from orchestrator.audit_logger import AuditLogger

import logging
logger = logging.getLogger(__name__)


@dataclass
class SupplierEntity:
    name: str
    gst_number: Optional[str] = None
    cin_number: Optional[str] = None
    tier: int = 1
    location: Optional[str] = None
    material_type: Optional[str] = None
    transaction_value_inr: Optional[float] = None
    confidence: float = 0.0
    source_doc_hash: str = ""


@dataclass
class NERResult:
    suppliers: list[SupplierEntity] = field(default_factory=list)
    doc_hash: str = ""
    model_used: str = ""
    tokens_processed: int = 0


NER_SYSTEM_PROMPT = """You are a supply chain entity extraction specialist.
Extract ALL supplier entities from the given invoice or purchase order text.
For each supplier found, extract: name, GST number (15-char alphanumeric), 
CIN number (21-char), location (city/state), material type, and transaction value in INR.
Identify the tier: Tier 1 = direct vendor on invoice, Tier 2 = sub-supplier mentioned, Tier 3/4 = further upstream references.
Return ONLY a valid JSON array. No preamble, no markdown, no explanation.
Format: [{"name": str, "gst_number": str|null, "cin_number": str|null, "tier": int,
           "location": str|null, "material_type": str|null, "transaction_value_inr": float|null, "confidence": float}]
"""

GST_PATTERN = re.compile(r'\b\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}\b')
CIN_PATTERN = re.compile(r'\b[A-Z]{1}\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}\b')


class DiscoveryAgent:
    def __init__(self, model_path: str, n_gpu_layers: int = 35):
        logger.info(f"Loading LLaMA 3.1-8B from {model_path} ({n_gpu_layers} GPU layers)")
        self.llm = Llama(
            model_path=model_path,
            n_gpu_layers=n_gpu_layers,
            n_ctx=8192,
            n_threads=4,
            verbose=False
        )
        self.graph_writer = SupplierGraphWriter()
        self.audit_logger = AuditLogger()
        logger.info("Discovery Agent initialized")

    def process_document(self, doc_path: str, enterprise_id: str) -> NERResult:
        """Main entry point: OCR → NER → Graph upsert → Event publish."""
        doc_path = Path(doc_path)
        raw_bytes = doc_path.read_bytes()
        doc_hash = hashlib.sha256(raw_bytes).hexdigest()

        # OCR: extract text (PII anonymized before LLM — Presidio runs inside extract_text_from_pdf)
        text = extract_text_from_pdf(str(doc_path), anonymize_pii=True)
        if not text.strip():
            logger.warning(f"Empty text extracted from {doc_path}")
            return NERResult(doc_hash=doc_hash)

        # NER inference
        result = self._run_ner(text, doc_hash)

        # Regex validation pass: catch GST/CIN numbers the LLM missed
        result = self._regex_augment(text, result)

        # Write to Neo4j graph
        graph_delta = self.graph_writer.upsert_suppliers(
            result.suppliers, enterprise_id=enterprise_id, source_doc_hash=doc_hash
        )

        # Audit log
        self.audit_logger.log(
            agent_id="DISCOVERY",
            event_type="ner.completed",
            input_hash=doc_hash,
            model_used=result.model_used,
            output={"supplier_count": len(result.suppliers), "graph_delta": graph_delta},
            confidence=sum(s.confidence for s in result.suppliers) / max(len(result.suppliers), 1)
        )

        # Publish event to Monitoring Agent via Redis Streams
        publish_event("supplier.graph.updated", {
            "enterprise_id": enterprise_id,
            "graph_delta": graph_delta,
            "new_nodes": [asdict(s) for s in result.suppliers],
            "source_doc_hash": doc_hash,
            "schema_version": "v1.2"
        })

        logger.info(f"Discovery complete: {len(result.suppliers)} suppliers, {graph_delta['new_nodes']} new nodes")
        return result

    def _run_ner(self, text: str, doc_hash: str) -> NERResult:
        """Run LLaMA NER inference on extracted document text."""
        # Truncate to context window (8192 tokens ≈ 6000 words)
        truncated = text[:12000]

        response = self.llm.create_chat_completion(
            messages=[
                {"role": "system", "content": NER_SYSTEM_PROMPT},
                {"role": "user", "content": f"Extract all supplier entities from this document:\n\n{truncated}"}
            ],
            temperature=0.1,         # Low temp for factual extraction
            max_tokens=2048,
            response_format={"type": "json_object"}
        )

        raw_output = response["choices"][0]["message"]["content"]
        tokens_used = response["usage"]["total_tokens"]

        try:
            parsed = json.loads(raw_output)
            if isinstance(parsed, dict):
                # Sometimes LLM wraps in {"suppliers": [...]}
                items = parsed.get("suppliers", list(parsed.values())[0] if parsed else [])
            else:
                items = parsed

            suppliers = []
            for item in items:
                suppliers.append(SupplierEntity(
                    name=item.get("name", "").strip(),
                    gst_number=item.get("gst_number"),
                    cin_number=item.get("cin_number"),
                    tier=int(item.get("tier", 1)),
                    location=item.get("location"),
                    material_type=item.get("material_type"),
                    transaction_value_inr=item.get("transaction_value_inr"),
                    confidence=float(item.get("confidence", 0.8)),
                    source_doc_hash=doc_hash
                ))
        except (json.JSONDecodeError, KeyError, ValueError) as e:
            logger.error(f"NER output parse error: {e}. Raw: {raw_output[:200]}")
            suppliers = []

        return NERResult(
            suppliers=suppliers,
            doc_hash=doc_hash,
            model_used="llama-3.1-8b-instruct-q4_K_M",
            tokens_processed=tokens_used
        )

    def _regex_augment(self, text: str, result: NERResult) -> NERResult:
        """Catch GST/CIN numbers missed by LLM via regex; add as low-confidence entities if new."""
        existing_gst = {s.gst_number for s in result.suppliers if s.gst_number}
        existing_cin = {s.cin_number for s in result.suppliers if s.cin_number}

        found_gst = set(GST_PATTERN.findall(text)) - existing_gst
        found_cin = set(CIN_PATTERN.findall(text)) - existing_cin

        for gst in found_gst:
            result.suppliers.append(SupplierEntity(
                name=f"[Regex-extracted: {gst}]",
                gst_number=gst,
                tier=2,  # Conservative: assume Tier 2 if no invoice context
                confidence=0.55,
                source_doc_hash=result.doc_hash
            ))
            logger.debug(f"Regex augment: found GST {gst} not in LLM output")

        return result
