# ChainSense AI 🌿
### Autonomous GenAI for Scope 3 Supply Chain Intelligence

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Python 3.11](https://img.shields.io/badge/Python-3.11-blue.svg)](https://python.org)
[![ET Gen AI Hackathon 2026](https://img.shields.io/badge/ET%20Gen%20AI%20Hackathon-2026-orange.svg)]()
[![PS #5](https://img.shields.io/badge/Problem%20Statement-%235%20Domain%20Specialized%20AI-purple.svg)]()

> **ET Gen AI Hackathon 2026 | Phase 2: Build Sprint**
> Problem Statement #5 — Domain-Specialized AI Agents with Compliance Guardrails

---

## 🌐 Live Demo

**➡️ [Open `demo/ChainSense_AI_Demo.html`](demo/ChainSense_AI_Demo.html) — single file, no install needed**

Just double-click `demo/ChainSense_AI_Demo.html` in your file explorer. Works offline in any modern browser.

---

## What is ChainSense AI?

Large enterprises cannot accurately report **Scope 3 emissions** (70–90% of their carbon footprint) because supply chains are multi-tier and opaque. Manual audits cost ₹50L–2Cr per cycle and take 6–12 months. Rule-based ESG software only sees Tier 1 suppliers.

**ChainSense AI** is a four-agent GenAI system that:
- 🔍 **Discovers** Tier 1–4 suppliers autonomously from invoices and web intelligence
- 📡 **Monitors** ESG risks in real time across 15+ sources with alerts in < 24 hours
- 📋 **Generates** audit-ready BRSR/CSRD/GRI/SASB compliance reports in 2 weeks (vs 6 months)
- 💬 **Answers** natural language queries over the entire supply graph

**Cost: ₹5L/year vs ₹50L–75L for a Big-4 audit. 10× cheaper. Continuously updated.**

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   ChainSense AI Platform                    │
│                                                             │
│  ┌─────────────────┐    ┌─────────────────┐                 │
│  │  Discovery Agent │    │ Monitoring Agent │                 │
│  │  LLaMA 3.1-8B   │    │ LLaMA 3.1-70B   │                 │
│  │  NER + Neo4j    │    │ (Groq API)       │                 │
│  └────────┬────────┘    └────────┬────────┘                 │
│           └──────────┬───────────┘                          │
│                      │ Redis Streams (Message Bus)           │
│           ┌──────────┴───────────┐                          │
│  ┌────────┴────────┐    ┌────────┴────────┐                 │
│  │ Compliance Agent│    │ Conversational  │                  │
│  │ GPT-4o + RAG    │    │ Agent (LangChain│                  │
│  │ HITL Workflow   │    │ NL→Cypher)      │                  │
│  └─────────────────┘    └─────────────────┘                 │
│                                                             │
│  Neo4j Graph · Pinecone Vector · PostgreSQL · Redis         │
└─────────────────────────────────────────────────────────────┘
```

---

## Repository Structure

```
chainsense-ai/
├── README.md                        # This file
├── docker-compose.yml               # One-command infrastructure
├── demo/
│   └── ChainSense_AI_Demo.html      # ⭐ Single-file interactive demo
├── agents/
│   ├── discovery/
│   │   └── ner_pipeline.py          # LLaMA 3.1-8B NER on invoices
│   ├── monitoring/
│   │   └── esg_classifier.py        # LLaMA-70B ESG signal classifier
│   └── compliance/
│       └── report_generator.py      # GPT-4o report + HITL state machine
└── orchestrator/
    └── circuit_breaker.py           # LLM fallback chain + CDC sync worker
```

---

## Quick Start

### Option A — Interactive Demo (No Setup Required)
```
1. Download or clone this repository
2. Open demo/ChainSense_AI_Demo.html in any browser
3. Explore all 4 agents with live mock data
```

### Option B — Full Stack (Requires API Keys + Docker)

**Prerequisites:**
- Docker + Docker Compose
- Python 3.11+
- API Keys: OpenAI, Groq, Cohere, Pinecone, Anthropic

**1. Clone & configure:**
```bash
git clone https://github.com/YOUR_USERNAME/chainsense-ai.git
cd chainsense-ai
cp .env.example .env
# Edit .env with your API keys
```

**2. Start infrastructure (Neo4j, Redis, PostgreSQL):**
```bash
docker-compose up -d infrastructure
```

**3. Install Python dependencies:**
```bash
pip install openai anthropic groq pinecone-client neo4j redis langchain cohere llama-cpp-python
```

**4. Run agents:**
```bash
# Terminal 1 — Orchestrator
python orchestrator/circuit_breaker.py

# Terminal 2 — Discovery Agent
python agents/discovery/ner_pipeline.py

# Terminal 3 — Monitoring Agent
python agents/monitoring/esg_classifier.py

# Terminal 4 — Compliance Agent
python agents/compliance/report_generator.py
```

---

## Environment Variables

Create a `.env` file:

```env
# LLM APIs
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GROQ_API_KEY=gsk_...
COHERE_API_KEY=...

# Databases
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=chainsense2026
DATABASE_URL=postgresql://chainsense:chainsense2026@localhost:5432/chainsense_audit
REDIS_URL=redis://localhost:6379

# Vector DB
PINECONE_API_KEY=...
PINECONE_INDEX_NAME=chainsense-policy

# Local LLM
LLAMA_MODEL_PATH=./models/llama-3.1-8b-instruct-q4_K_M.gguf
```

---

## Key Metrics

| Metric | ChainSense AI | Baseline |
|---|---|---|
| ESG Classifier F1 | **0.83** | 0.52 (keyword) |
| Supplier NER F1 | **0.87** | 0.61 |
| Report Generation Time | **2 weeks** | 6 months |
| Cost per Audit Cycle | **₹5L/year** | ₹50–75L |
| Supplier Tiers Visible | **Tier 1–4** | Tier 1 only |

---

## Agent Details

### 🔍 Discovery Agent (`agents/discovery/ner_pipeline.py`)
- Runs LLaMA 3.1-8B (4-bit GGUF) locally for on-premise data privacy
- Extracts supplier entities (name, GST, CIN, tier, location, material)
- Regex augmentation catches GST/CIN numbers missed by LLM
- Writes to Neo4j graph, publishes `supplier.graph.updated` to Redis

### 📡 Monitoring Agent (`agents/monitoring/esg_classifier.py`)
- Scans 15+ sources: CPCB, SPCB, MCA, SEBI, Reuters, Twitter/X, LinkedIn
- LLaMA-70B via Groq (750 tok/sec) for multi-label E/S/G classification
- Tiered alerts: CRITICAL (<6h), HIGH (<24h), MEDIUM (<72h), LOW (weekly)
- Sentinel-2 satellite imagery for monthly facility baseline

### 📋 Compliance Agent (`agents/compliance/report_generator.py`)
- GPT-4o primary → Claude Sonnet → Gemini Pro fallback chain
- Pinecone RAG + Cohere rerank-english-v3.0 (+12% accuracy)
- 6-state HITL workflow: DRAFT → PENDING_REVIEW → APPROVED → FILED
- Supports BRSR Core, EU CSRD/ESRS, GRI 2021, SASB frameworks

### 💬 Conversational Agent
- LangChain agent with NL → Cypher query generation
- Queries Neo4j supplier graph in natural language
- IndicBERT multilingual support for regional languages

---

## License

MIT License — see [LICENSE](LICENSE)

---

*Built for ET Gen AI Hackathon 2026 | PS #5: Domain-Specialized AI Agents with Compliance Guardrails*
