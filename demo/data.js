// ─── Mock Data for ChainSense AI Demo ─────────────────────────────────────────

const SUPPLIERS = [
  { id:"SUP001", name:"Kaveri Spinning Mills", gst:"33AABCK1234M1Z5", tier:1, location:"Coimbatore, TN", material:"Cotton Yarn", risk:28, certs:["ISO 9001","GOTS"], status:"Active" },
  { id:"SUP002", name:"Sunrise Dyeworks Ltd.", gst:"33AASSD5678N2Z8", tier:3, location:"Tirupur, TN", material:"Synthetic Dyes", risk:91, certs:[], status:"Active" },
  { id:"SUP003", name:"Om Weaving Corporation", gst:"33AACOW3344P3Z2", tier:2, location:"Erode, TN", material:"Woven Fabric", risk:55, certs:["ISO 14001"], status:"Active" },
  { id:"SUP004", name:"Tirumala Thread Works", gst:"29AACTT9988Q4Z1", tier:3, location:"Mysore, KA", material:"Polyester Thread", risk:73, certs:["ISO 9001"], status:"Active" },
  { id:"SUP005", name:"Rajan Chemicals Pvt.", gst:"33AACRJ4422R5Z9", tier:4, location:"Chennai, TN", material:"Bleaching Agent", risk:88, certs:[], status:"Active" },
  { id:"SUP006", name:"Shiv Textiles Exports", gst:"27AACST6688S6Z4", tier:1, location:"Surat, GJ", material:"Polyester Fabric", risk:41, certs:["GOTS","Oeko-Tex"], status:"Active" },
  { id:"SUP007", name:"Lakshmi Embroidery Co.", gst:"33AACLE2255T7Z3", tier:2, location:"Tirupur, TN", material:"Embroidery", risk:33, certs:["ISO 9001"], status:"Active" },
  { id:"SUP008", name:"Balaji Logistics Hub", gst:"33AACBL7711U8Z7", tier:1, location:"Chennai, TN", material:"3PL Logistics", risk:19, certs:["ISO 14001"], status:"Active" },
  { id:"SUP009", name:"KM Printing Works", gst:"33AACKM3388V9Z6", tier:3, location:"Karur, TN", material:"Screen Printing", risk:62, certs:[], status:"Active" },
  { id:"SUP010", name:"Anand Packaging Ltd.", gst:"33AACAN5555W1Z5", tier:2, location:"Salem, TN", material:"Packaging", risk:24, certs:["ISO 14001"], status:"Active" },
  { id:"SUP011", name:"Pooja Zippers & Fastenings", gst:"27AACPZ8877X2Z1", tier:2, location:"Ahmedabad, GJ", material:"Zippers", risk:36, certs:["ISO 9001"], status:"Active" },
  { id:"SUP012", name:"Maansi Water Treatment", gst:"33AACMW1122Y3Z2", tier:4, location:"Tirupur, TN", material:"Water Treatment", risk:79, certs:[], status:"Watch" },
  { id:"SUP013", name:"Future Knits Pvt. Ltd.", gst:"33AACFK4466Z4Z8", tier:2, location:"Ludhiana, PB", material:"Knitwear", risk:45, certs:["ISO 9001","GOTS"], status:"Active" },
  { id:"SUP014", name:"Chandra Button Works", gst:"07AACCB3311A5Z4", tier:3, location:"Delhi, DL", material:"Buttons/Accessories", risk:22, certs:[], status:"Active" },
  { id:"SUP015", name:"EcoThread Solutions", gst:"33AACEL9944B6Z3", tier:2, location:"Tirupur, TN", material:"Recycled Yarn", risk:15, certs:["GRS","Oeko-Tex","ISO 14001"], status:"Active" },
];

const ESG_ALERTS = [
  {
    id:"ALT001", supplier_id:"SUP002", severity:"CRITICAL", labels:["E"],
    violation_type:"water_discharge_violation",
    summary:"CPCB inspection on 2026-03-24 confirmed that Sunrise Dyeworks is discharging untreated effluent containing reactive azo dyes directly into the Noyyal River. COD levels at 4,200 mg/L (limit: 250 mg/L). Closure notice issued. Potential ₹2.4Cr penalty.",
    sources:["CPCB Enforcement Report #26/TN/2026","Reuters India", "Tamil Nadu SPCB"],
    confidence:0.96, alert_tier:"< 6 hours", time:"2h ago",
    predicted_risk_days:0
  },
  {
    id:"ALT002", supplier_id:"SUP005", severity:"CRITICAL", labels:["E","G"],
    violation_type:"hazardous_chemical_storage",
    summary:"MCA filing discrepancy detected: Rajan Chemicals Pvt. declared 140MT bleach storage but site inspection by CPCB found 480MT stockpile in unmarked containers, violating Hazardous Waste Rules 2016. Criminal complaint filed by District Collector.",
    sources:["MCA Filings Portal","CPCB Inspection DB","ANI News"],
    confidence:0.93, alert_tier:"< 6 hours", time:"4h ago",
    predicted_risk_days:0
  },
  {
    id:"ALT003", supplier_id:"SUP012", severity:"CRITICAL", labels:["E"],
    violation_type:"groundwater_contamination",
    summary:"Sentinel-2 satellite imagery shows anomalous spectral signature in 500m radius around Maansi Water Treatment facility indicating subsurface leachate plume. Social media reports of discoloured borewell water in adjacent residential areas. TNPCB notified.",
    sources:["Sentinel-2 ESA","Twitter/X API","TNPCB Portal"],
    confidence:0.88, alert_tier:"< 6 hours", time:"6h ago",
    predicted_risk_days:0
  },
  {
    id:"ALT004", supplier_id:"SUP004", severity:"HIGH", labels:["S"],
    violation_type:"labor_rights_violation",
    summary:"Labour Department inspection at Tirumala Thread Works found 38 migrant workers from Odisha employed without proper contracts. Minimum wage records show ₹180/day paid against ₹345/day mandate. Factory manager detained for questioning.",
    sources:["ET Now","Labour Department Karnataka","LinkedIn reports"],
    confidence:0.82, alert_tier:"< 24 hours", time:"11h ago",
    predicted_risk_days:0
  },
  {
    id:"ALT005", supplier_id:"SUP009", severity:"HIGH", labels:["E"],
    violation_type:"air_emission_violation",
    summary:"KM Printing Works screen printing plant exceeded PM2.5 emission threshold by 3.2× during nighttime operations. SPCB stack monitor triggered 14 automated alerts over 48hr period. Warning notice issued; 15-day compliance deadline.",
    sources:["SPCB Real-Time Monitor","Pollution Control Board TN"],
    confidence:0.79, alert_tier:"< 24 hours", time:"18h ago",
    predicted_risk_days:0
  },
  {
    id:"ALT006", supplier_id:"SUP003", severity:"MEDIUM", labels:["E","S"],
    violation_type:"certification_expiry_risk",
    summary:"Om Weaving Corporation's ISO 14001 certification expires in 47 days (May 15, 2026). No renewal audit has been scheduled. Losing this certification will affect BRSR Core Section A9 disclosures and may trigger buyer code-of-conduct clause.",
    sources:["ISO Registry","Internal Supply Chain DB"],
    confidence:0.91, alert_tier:"< 72 hours", time:"1d ago",
    predicted_risk_days:47
  },
  {
    id:"ALT007", supplier_id:"SUP006", severity:"MEDIUM", labels:["G"],
    violation_type:"financial_stress_indicator",
    summary:"Shiv Textiles Exports' Q3 FY26 balance sheet shows 4.2× debt-to-equity ratio, up from 1.8× in Q2. Three promoter shareholding pledges filed with SEBI in past 30 days. Credit rating downgraded from BBB+ to BB by CRISIL. Supply continuity risk flagged.",
    sources:["SEBI Filings","CRISIL Report","BSE Announcements"],
    confidence:0.74, alert_tier:"< 72 hours", time:"2d ago",
    predicted_risk_days:30
  },
  {
    id:"ALT008", supplier_id:"SUP001", severity:"LOW", labels:["E"],
    violation_type:"water_stress_sector_risk",
    summary:"IMD seasonal forecast for Cauvery basin (Q1 2026-27): 19% deficit rainfall probability. Kaveri Spinning Mills draws 4,200 KL/day from Mettur reservoir allocation. Early-stage water stress indicator — no current violation.",
    sources:["IMD Seasonal Forecast","CWC Basin Report"],
    confidence:0.68, alert_tier:"Weekly digest", time:"3d ago",
    predicted_risk_days:60
  },
];

const REPORTS = [
  { id:"RPT6A2F", supplier:"Sunrise Dyeworks Ltd.", framework:"BRSR_CORE", model:"GPT-4o (primary)", state:"PENDING_REVIEW", created:"2026-03-25 09:14" },
  { id:"RPT9C1B", supplier:"Kaveri Spinning Mills", framework:"GRI_2021", model:"GPT-4o (primary)", state:"FILED", created:"2026-03-20 14:30" },
  { id:"RPT3E8D", supplier:"Om Weaving Corporation", framework:"CSRD_ESRS", model:"Claude Sonnet 3.7 (fallback 1)", state:"APPROVED", created:"2026-03-22 11:05" },
  { id:"RPT7A4C", supplier:"Tirumala Thread Works", framework:"BRSR_CORE", model:"GPT-4o (primary)", state:"IN_REVISION", created:"2026-03-18 16:45" },
  { id:"RPT2D5E", supplier:"Rajan Chemicals Pvt.", framework:"SASB", model:"GPT-4o (primary)", state:"FILED", created:"2026-03-15 08:20" },
  { id:"RPT8F3A", supplier:"EcoThread Solutions", framework:"GRI_2021", model:"GPT-4o (primary)", state:"DRAFT", created:"2026-03-29 09:55" },
];

const AUDIT_TRAIL = [
  { ts:"2026-03-29 20:18:04", agent:"DISCOVERY", event:"ner.completed", input_hash:"a3f2c8e1", model:"llama-3.1-8b-instruct-q4_K_M", confidence:0.87, chain:"8f3b2d1a" },
  { ts:"2026-03-29 20:18:12", agent:"MONITORING", event:"signal.classified", input_hash:"b7d4e9f2", model:"llama-3.1-70b-versatile", confidence:0.96, chain:"2c6e9f4b" },
  { ts:"2026-03-29 20:18:15", agent:"MONITORING", event:"risk.alert.raised", input_hash:"c9a1f3d5", model:"llama-3.1-70b-versatile", confidence:0.96, chain:"5e1a8c3d" },
  { ts:"2026-03-29 20:19:03", agent:"COMPLIANCE", event:"rag.retrieved", input_hash:"d2b8c6e1", model:"text-embedding-3-small+cohere-rerank", confidence:0.91, chain:"7d4b2f9a" },
  { ts:"2026-03-29 20:19:41", agent:"COMPLIANCE", event:"report.generated", input_hash:"e5c3a9f8", model:"GPT-4o (primary)", confidence:0.94, chain:"1a7e5c3f" },
  { ts:"2026-03-29 20:20:01", agent:"COMPLIANCE", event:"state_transition DRAFT→PENDING_REVIEW", input_hash:"f1d6b4e2", model:"—", confidence:1.0, chain:"9b3d7e2c" },
  { ts:"2026-03-29 18:44:22", agent:"DISCOVERY", event:"ner.completed", input_hash:"a8e2f5b1", model:"llama-3.1-8b-instruct-q4_K_M", confidence:0.83, chain:"4c8a1f6e" },
  { ts:"2026-03-29 18:44:29", agent:"MONITORING", event:"signal.classified", input_hash:"b3c7d9a4", model:"llama-3.1-70b-versatile", confidence:0.93, chain:"6f2d8b5c" },
  { ts:"2026-03-29 16:30:11", agent:"CONVERSATIONAL", event:"nl.query.executed", input_hash:"c6f1a8d3", model:"gpt-4o + langchain", confidence:0.98, chain:"3a9c5e7b" },
  { ts:"2026-03-29 14:11:58", agent:"COMPLIANCE", event:"audit_trail_sealed", input_hash:"d9b4e2f7", model:"—", confidence:1.0, chain:"8e1f4a2d" },
];

const CHAT_RESPONSES = {
  tamil_nadu: {
    query: "Show Tamil Nadu suppliers with water risk score > 70",
    cypher: `MATCH (s:Supplier)
WHERE s.state = "Tamil Nadu"
  AND s.water_risk_score > 70
RETURN s.name, s.tier, s.location,
       s.water_risk_score, s.risk_score
ORDER BY s.water_risk_score DESC`,
    answer: `Found **4 suppliers** in Tamil Nadu with water risk score > 70:\n\n| Supplier | Tier | Water Risk | ESG Risk |\n|---|---|---|---|\n| Sunrise Dyeworks Ltd. | 3 | 🔴 96 | 91 |\n| Maansi Water Treatment | 4 | 🔴 89 | 79 |\n| KM Printing Works | 3 | 🟡 74 | 62 |\n| Om Weaving Corporation | 2 | 🟡 71 | 55 |\n\n⚠️ **Sunrise Dyeworks** has an active CRITICAL CPCB violation. Recommend immediate supply chain risk review.`
  },
  cpcb: {
    query: "Which Tier-3 suppliers have CPCB violations in the last 30 days?",
    cypher: `MATCH (s:Supplier)-[:HAS_VIOLATION]->(v:Violation)
WHERE s.tier = 3
  AND v.source = "CPCB"
  AND v.date >= date() - duration({days: 30})
RETURN s.name, s.location, v.type,
       v.severity, v.date
ORDER BY v.date DESC`,
    answer: `Found **2 Tier-3 suppliers** with CPCB violations in the past 30 days:\n\n1. **Sunrise Dyeworks Ltd.** (Tirupur, TN)\n   - Untreated effluent discharge to Noyyal River\n   - COD: 4,200 mg/L (limit 250 mg/L) · Closure notice issued\n   - Date: 2026-03-24 · Severity: 🔴 CRITICAL\n\n2. **KM Printing Works** (Karur, TN)\n   - PM2.5 exceedance (3.2× threshold)\n   - 15-day compliance deadline\n   - Date: 2026-03-27 · Severity: 🟡 HIGH`
  },
  scope3: {
    query: "Generate a Scope 3 emissions summary for Kaveri Spinning Mills",
    cypher: `MATCH (s:Supplier {name: "Kaveri Spinning Mills"})
OPTIONAL MATCH (s)-[:SUPPLIES]->(e:Enterprise)
OPTIONAL MATCH (s)-[:HAS_EMISSION_DATA]->(em:EmissionData)
RETURN s.name, s.location, s.material_type,
       sum(em.scope3_tco2e) as total_scope3,
       collect(em.category) as categories`,
    answer: `**Scope 3 Emissions Summary — Kaveri Spinning Mills (FY2025-26)**\n\n📊 Total Scope 3: **1,240 tCO₂e/year** *(±8% confidence)*\n\n| Category | Source | tCO₂e |\n|---|---|---|\n| Cat 1 – Purchased Goods | Cotton lint processing | 680 |\n| Cat 4 – Upstream Transport | Road freight | 180 |\n| Cat 11 – Processing of sold products | Downstream weaving | 280 |\n| Cat 12 – End-of-life | Textile waste | 100 |\n\n📎 Emission factors: IPCC AR6 Table 11.2 (textiles) + India BEE 2023\nWater intensity: 4,200 KL/day · Energy: 2.8 MW grid\n\n✅ Meets BRSR Core GHG boundary requirements (GHG Protocol Scope 3 Standard)`
  },
  top5: {
    query: "What are the top 5 suppliers by ESG risk score?",
    cypher: `MATCH (s:Supplier)
RETURN s.name, s.tier, s.location,
       s.risk_score, s.risk_factors
ORDER BY s.risk_score DESC
LIMIT 5`,
    answer: `**Top 5 Suppliers by ESG Risk Score:**\n\n| Rank | Supplier | Tier | Location | Risk Score | Top Risk |\n|---|---|---|---|---|---|\n| 1 | Sunrise Dyeworks | 3 | Tirupur, TN | 🔴 **91** | CPCB violation |\n| 2 | Rajan Chemicals | 4 | Chennai, TN | 🔴 **88** | Hazardous waste |\n| 3 | Maansi Water Trtmt | 4 | Tirupur, TN | 🔴 **79** | Groundwater |\n| 4 | Tirumala Thread Works | 3 | Mysore, KA | 🟡 **73** | Labor rights |\n| 5 | KM Printing Works | 3 | Karur, TN | 🟡 **62** | Air emissions |\n\n💡 4 of top 5 are Tier 3-4 suppliers — invisible to traditional Tier-1 audits.`
  },
  iso: {
    query: "List all suppliers missing ISO 14001 certification",
    cypher: `MATCH (s:Supplier)
WHERE NOT (s)-[:HAS_CERTIFICATION]->(:Certification {name: "ISO 14001"})
RETURN s.name, s.tier, s.location,
       s.risk_score, s.certifications
ORDER BY s.tier, s.risk_score DESC`,
    answer: `Found **9 suppliers** without ISO 14001 Environmental Management certification:\n\n| Supplier | Tier | Location | Risk Score |\n|---|---|---|---|\n| Sunrise Dyeworks Ltd. | 3 | Tirupur, TN | 🔴 91 |\n| Rajan Chemicals Pvt. | 4 | Chennai, TN | 🔴 88 |\n| Maansi Water Treatment | 4 | Tirupur, TN | 🔴 79 |\n| Tirumala Thread Works | 3 | Mysore, KA | 🟡 73 |\n| KM Printing Works | 3 | Karur, TN | 🟡 62 |\n| Chandra Button Works | 3 | Delhi, DL | 🟢 22 |\n...and 3 more\n\n🎯 **Recommendation:** Prioritize ISO 14001 onboarding for Tier 3-4 high-risk suppliers. Estimated cost: ₹3-8L per supplier.`
  },
  water: {
    query: "Show suppliers with water discharge violations near Tirupur",
    cypher: `MATCH (s:Supplier)-[:HAS_VIOLATION]->(v:Violation)
WHERE s.location CONTAINS "Tirupur"
  AND v.type CONTAINS "water"
RETURN s.name, s.tier, v.type,
       v.severity, v.regulatory_body, v.date
ORDER BY v.severity, v.date DESC`,
    answer: `Found **2 suppliers** near Tirupur with water-related violations:\n\n🔴 **Sunrise Dyeworks Ltd.** (Tier 3)\n- Untreated effluent to Noyyal River (COD: 4,200 mg/L)\n- Regulatory body: CPCB + TNPCB\n- Status: Closure notice · Fine: ₹2.4Cr\n- Evidence: [CPCB Report #26/TN/2026]\n\n🔴 **Maansi Water Treatment** (Tier 4)\n- Groundwater contamination via leachate plume\n- Regulatory body: TNPCB (notified)\n- Status: Investigation ongoing · Satellite confirmed\n\n💡 Both suppliers share a watershed zone. Combined risk may trigger district-level regulatory scrutiny.`
  }
};
