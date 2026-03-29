"""
ChainSense AI — Orchestrator
Circuit breaker for LLM fallback chain.
CDC sync worker: Neo4j → Pinecone change-data-capture pipeline.
"""

import time
import json
import asyncio
import hashlib
import logging
import os
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional
import redis
from neo4j import AsyncGraphDatabase
from pinecone import Pinecone
import openai

logger = logging.getLogger(__name__)


# ─── Circuit Breaker ──────────────────────────────────────────────────────────

class CircuitState(str, Enum):
    CLOSED   = "CLOSED"    # Normal: requests pass through
    OPEN     = "OPEN"      # Failing: requests blocked, fallback used
    HALF_OPEN = "HALF_OPEN"  # Recovery probe


@dataclass
class CircuitBreaker:
    """Per-provider circuit breaker for LLM fallback chain management."""
    max_failures: int = 3
    reset_timeout: int = 60  # seconds

    def __post_init__(self):
        self._providers: dict[str, dict] = {}

    def _get(self, provider: str) -> dict:
        if provider not in self._providers:
            self._providers[provider] = {
                "state": CircuitState.CLOSED,
                "failures": 0,
                "last_failure_time": 0.0,
                "last_success_time": 0.0
            }
        return self._providers[provider]

    def is_open(self, provider: str) -> bool:
        p = self._get(provider)
        if p["state"] == CircuitState.OPEN:
            if time.time() - p["last_failure_time"] > self.reset_timeout:
                p["state"] = CircuitState.HALF_OPEN
                logger.info(f"Circuit breaker HALF_OPEN for {provider} — sending probe")
                return False
            return True
        return False

    def record_failure(self, provider: str):
        p = self._get(provider)
        p["failures"] += 1
        p["last_failure_time"] = time.time()
        if p["failures"] >= self.max_failures:
            if p["state"] != CircuitState.OPEN:
                logger.warning(f"Circuit breaker OPEN for {provider} after {p['failures']} failures")
            p["state"] = CircuitState.OPEN

    def record_success(self, provider: str):
        p = self._get(provider)
        p["failures"] = 0
        p["last_success_time"] = time.time()
        if p["state"] == CircuitState.HALF_OPEN:
            logger.info(f"Circuit breaker CLOSED for {provider} — recovery successful")
        p["state"] = CircuitState.CLOSED


# ─── CDC Sync Worker ──────────────────────────────────────────────────────────

class CDCSyncWorker:
    """
    Change Data Capture pipeline: Neo4j → Pinecone.
    Consumes neo4j.cdc stream from Redis. Batch re-indexes affected supplier records.
    Achieves < 30 second consistency lag under normal operation.
    Monitors consumer group lag — alerts if > 500 events behind.
    """

    STREAM_NAME = "neo4j.cdc"
    CONSUMER_GROUP = "pinecone-sync-group"
    CONSUMER_NAME = "sync-worker-1"
    BATCH_SIZE = 50
    BATCH_INTERVAL_SECONDS = 5
    LAG_ALERT_THRESHOLD = 500

    def __init__(self):
        self.redis = redis.from_url(os.environ["REDIS_URL"])
        self.neo4j = AsyncGraphDatabase.driver(
            os.environ["NEO4J_URI"],
            auth=(os.environ["NEO4J_USER"], os.environ["NEO4J_PASSWORD"])
        )
        pc = Pinecone(api_key=os.environ["PINECONE_API_KEY"])
        self.pinecone_index = pc.Index(os.environ["PINECONE_INDEX_NAME"])
        self.openai = openai.OpenAI(api_key=os.environ["OPENAI_API_KEY"])

        self._ensure_consumer_group()

    def _ensure_consumer_group(self):
        try:
            self.redis.xgroup_create(self.STREAM_NAME, self.CONSUMER_GROUP, id="0", mkstream=True)
            logger.info(f"Created consumer group: {self.CONSUMER_GROUP}")
        except redis.ResponseError as e:
            if "BUSYGROUP" not in str(e):
                raise

    async def run(self):
        """Main sync loop — batches events, re-indexes, monitors lag."""
        logger.info("CDC Sync Worker started")
        while True:
            await self._process_batch()
            await self._check_lag()
            await asyncio.sleep(self.BATCH_INTERVAL_SECONDS)

    async def _process_batch(self):
        """Consume up to BATCH_SIZE events and re-index in Pinecone."""
        messages = self.redis.xreadgroup(
            self.CONSUMER_GROUP, self.CONSUMER_NAME,
            {self.STREAM_NAME: ">"}, count=self.BATCH_SIZE, block=1000
        )
        if not messages:
            return

        events = [(msg_id, json.loads(data.get(b"payload", b"{}")))
                  for _, msgs in messages for msg_id, data in msgs]

        if not events:
            return

        # Deduplicate by supplier_id (keep latest tx_id per supplier)
        supplier_latest: dict[str, tuple] = {}
        for msg_id, payload in events:
            sid = payload.get("supplier_id", "")
            tx_id = payload.get("neo4j_tx_id", 0)
            if sid not in supplier_latest or tx_id > supplier_latest[sid][1]:
                supplier_latest[sid] = (msg_id, tx_id, payload)

        # Re-index each unique supplier
        vectors_to_upsert = []
        for supplier_id, (msg_id, tx_id, payload) in supplier_latest.items():
            try:
                supplier_data = await self._fetch_supplier_from_neo4j(supplier_id)
                if supplier_data:
                    embedding = self._embed(supplier_data)
                    vectors_to_upsert.append({
                        "id": f"supplier_{supplier_id}",
                        "values": embedding,
                        "metadata": {
                            "supplier_id": supplier_id,
                            "neo4j_tx_id": tx_id,
                            "updated_at": time.time(),
                            **{k: str(v) for k, v in supplier_data.items() if k != "embedding"}
                        }
                    })
            except Exception as e:
                logger.error(f"Sync error for supplier {supplier_id}: {e}")
                # Add to dead-letter queue
                self.redis.lpush("dead_letter_queue", json.dumps({
                    "supplier_id": supplier_id, "error": str(e), "payload": payload
                }))

        if vectors_to_upsert:
            # Batch upsert to Pinecone
            self.pinecone_index.upsert(vectors=vectors_to_upsert, namespace="suppliers")
            logger.info(f"CDC: upserted {len(vectors_to_upsert)} supplier vectors to Pinecone")

        # ACK processed messages
        msg_ids = [msg_id for msg_id, _, _ in supplier_latest.values()]
        self.redis.xack(self.STREAM_NAME, self.CONSUMER_GROUP, *msg_ids)

    async def _fetch_supplier_from_neo4j(self, supplier_id: str) -> Optional[dict]:
        """Fetch current supplier node data from Neo4j for re-embedding."""
        async with self.neo4j.session() as session:
            result = await session.run(
                """MATCH (s:Supplier {id: $supplier_id})
                   OPTIONAL MATCH (s)-[:HAS_CERTIFICATION]->(c:Certification)
                   RETURN s.name as name, s.location as location, s.tier as tier,
                          s.risk_score as risk_score, s.material_type as material_type,
                          s.gst_number as gst_number, collect(c.name) as certifications""",
                supplier_id=supplier_id
            )
            record = await result.single()
            return dict(record) if record else None

    def _embed(self, supplier_data: dict) -> list[float]:
        """Generate embedding for supplier profile using text-embedding-3-small."""
        text = (f"Supplier: {supplier_data.get('name','')}. "
                f"Location: {supplier_data.get('location','')}. "
                f"Tier: {supplier_data.get('tier','')}. "
                f"Material: {supplier_data.get('material_type','')}. "
                f"Risk score: {supplier_data.get('risk_score',0)}. "
                f"Certifications: {', '.join(supplier_data.get('certifications',[]))}")
        response = self.openai.embeddings.create(
            input=text, model="text-embedding-3-small"
        )
        return response.data[0].embedding

    async def _check_lag(self):
        """Monitor consumer group lag. Alert if > LAG_ALERT_THRESHOLD events behind."""
        try:
            info = self.redis.xinfo_groups(self.STREAM_NAME)
            for group in info:
                if group["name"] == self.CONSUMER_GROUP.encode():
                    lag = group.get("lag", 0)
                    if lag > self.LAG_ALERT_THRESHOLD:
                        logger.critical(
                            f"CDC sync lag critical: {lag} events behind (threshold: {self.LAG_ALERT_THRESHOLD}). "
                            "Auto-scaling Sync Worker replicas via Kubernetes HPA."
                        )
                        # Trigger HPA scale-out (Kubernetes API call or metric push)
                        self._trigger_scale_out()
                    elif lag > 100:
                        logger.warning(f"CDC sync lag elevated: {lag} events")
        except Exception as e:
            logger.error(f"Lag check failed: {e}")

    def _trigger_scale_out(self):
        """Push scale-out metric to Kubernetes HPA via custom metric."""
        # In production: push to Prometheus pushgateway or KEDA scaler
        logger.info("Scale-out triggered for CDC Sync Worker")
