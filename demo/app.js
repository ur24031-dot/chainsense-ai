// ─── ChainSense AI — Main Application Logic ────────────────────────────────────

let currentReport = null;
let reportState = null;
let alertFilter = 'all';

// Sync badge with actual CRITICAL alert count from data
function syncAlertBadge() {
  const critCount = ESG_ALERTS.filter(a => a.severity === 'CRITICAL').length;
  const badge = document.getElementById('alert-badge');
  if (badge) badge.textContent = critCount;
}
let graphFilter = 'all';

// ─── Tab Navigation ────────────────────────────────────────────────────────────

function switchTab(tab) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  document.getElementById('nav-' + tab).classList.add('active');
  const titles = {
    dashboard: 'Dashboard', discovery: 'Discovery Agent',
    monitoring: 'Monitoring Agent', compliance: 'Compliance Agent',
    conversational: 'Chat Agent', auditlog: 'Audit Log'
  };
  const subs = {
    dashboard: 'ET Gen AI Hackathon 2026 · PS #5',
    discovery: 'LLaMA 3.1-8B NER + Neo4j Supplier Graph',
    monitoring: 'LLaMA 3.1-70B ESG Signal Classifier · 15+ Sources',
    compliance: 'GPT-4o + RAG · HITL State Machine',
    conversational: 'LangChain · NL → Cypher · Multilingual',
    auditlog: 'PostgreSQL · Append-Only · SHA-256 Hash Chain'
  };
  document.getElementById('page-title').textContent = titles[tab] || tab;
  document.getElementById('page-sub').textContent = subs[tab] || '';
}

document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// ─── Dashboard Graph Canvas ────────────────────────────────────────────────────

function drawGraph(canvasId, suppliers, filterTier) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  // Build positions
  const tiers = { 1: [], 2: [], 3: [], 4: [] };
  suppliers.forEach(s => tiers[s.tier] && tiers[s.tier].push(s));

  const tierColors = { 1: '#22c55e', 2: '#3b82f6', 3: '#f59e0b', 4: '#ef4444' };
  const tierX = { 1: W * 0.15, 2: W * 0.38, 3: W * 0.62, 4: W * 0.85 };

  const positions = {};
  [1, 2, 3, 4].forEach(t => {
    const list = tiers[t];
    list.forEach((s, i) => {
      const y = H * 0.12 + (H * 0.76 / Math.max(list.length - 1, 1)) * i;
      positions[s.id] = { x: tierX[t], y: list.length === 1 ? H / 2 : y, s };
    });
  });

  // Draw edges (simple: connect adjacent tiers)
  const edges = [
    ['SUP001','SUP003'],['SUP001','SUP007'],['SUP001','SUP011'],['SUP006','SUP003'],
    ['SUP006','SUP013'],['SUP008','SUP001'],['SUP003','SUP002'],['SUP003','SUP009'],
    ['SUP007','SUP004'],['SUP013','SUP004'],['SUP010','SUP002'],['SUP010','SUP009'],
    ['SUP002','SUP005'],['SUP009','SUP012'],['SUP004','SUP005'],['SUP011','SUP014'],
  ];

  edges.forEach(([a, b]) => {
    const pa = positions[a], pb = positions[b];
    if (!pa || !pb) return;
    const showA = filterTier === 'all' || pa.s.tier === parseInt(filterTier.replace('t',''));
    const showB = filterTier === 'all' || pb.s.tier === parseInt(filterTier.replace('t',''));
    if (!showA && !showB) return;
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.strokeStyle = 'rgba(148,163,184,0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();
  });

  // Draw nodes
  Object.values(positions).forEach(({ x, y, s }) => {
    const isHighRisk = s.risk > 70;
    const tierOk = filterTier === 'all' || s.tier === parseInt(filterTier.replace('t',''));
    const color = tierColors[s.tier];
    const alpha = tierOk ? 1 : 0.2;
    const radius = s.tier === 1 ? 9 : s.tier === 2 ? 7 : 6;

    // Glow for high risk
    if (isHighRisk && tierOk) {
      ctx.beginPath();
      ctx.arc(x, y, radius + 5, 0, Math.PI * 2);
      ctx.fillStyle = color + '22';
      ctx.fill();
    }

    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    if (isHighRisk && tierOk) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Label
    ctx.fillStyle = tierOk ? '#e2e8f0' : '#475569';
    ctx.font = `${radius < 7 ? 9 : 10}px Inter`;
    ctx.textAlign = 'center';
    ctx.fillText(s.name.split(' ')[0], x, y + radius + 12);
    ctx.globalAlpha = 1;
  });

  // Tier labels (big graph only)
  if (canvasId === 'graphCanvasBig') {
    ctx.font = '700 11px Inter';
    ctx.fillStyle = '#475569';
    ctx.textAlign = 'center';
    ['Tier 1', 'Tier 2', 'Tier 3', 'Tier 4'].forEach((t, i) => {
      ctx.fillText(t, [W*0.15, W*0.38, W*0.62, W*0.85][i], 18);
    });
  }
}

// ─── Alert Feed (Dashboard) ────────────────────────────────────────────────────

function renderDashAlerts() {
  const container = document.getElementById('alert-feed-dash');
  if (!container) return;
  container.innerHTML = ESG_ALERTS.slice(0, 5).map(a => `
    <div class="alert-mini ${a.severity}">
      <span class="alert-sev sev-${a.severity}">${a.severity}</span>
      <div class="alert-info">
        <div class="alert-supplier">${supplierName(a.supplier_id)}</div>
        <div class="alert-desc">${a.violation_type.replace(/_/g,' ')} · ${a.alert_tier}</div>
      </div>
      <span class="alert-time">${a.time}</span>
    </div>
  `).join('');
}

function supplierName(id) {
  return SUPPLIERS.find(s => s.id === id)?.name || id;
}

// ─── Supplier Table ────────────────────────────────────────────────────────────

function renderSupplierTable(filter) {
  const tbody = document.getElementById('supplier-tbody');
  if (!tbody) return;
  const filtered = filter === 'all' ? SUPPLIERS :
    SUPPLIERS.filter(s => s.tier === parseInt(filter.replace('t','') || 0));
  tbody.innerHTML = filtered.map(s => `
    <tr>
      <td><b>${s.name}</b></td>
      <td class="mono">${s.gst}</td>
      <td><span class="risk-badge" style="background:${tierBg(s.tier)};color:${tierColor(s.tier)}">Tier ${s.tier}</span></td>
      <td>${s.location}</td>
      <td>${s.material}</td>
      <td><span class="risk-badge ${riskClass(s.risk)}">${riskBar(s.risk)} ${s.risk}</span></td>
      <td>${s.certs.length ? s.certs.map(c=>`<span class="tag">${c}</span>`).join(' ') : '<span style="color:#475569">—</span>'}</td>
    </tr>
  `).join('');
}

function riskClass(r) { return r > 70 ? 'risk-high' : r > 45 ? 'risk-med' : 'risk-low'; }
function riskBar(r) { return r > 70 ? '🔴' : r > 45 ? '🟡' : '🟢'; }
function tierColor(t) { return ['','#22c55e','#3b82f6','#f59e0b','#ef4444'][t]; }
function tierBg(t) { return ['','#22c55e18','#3b82f618','#f59e0b18','#ef444418'][t]; }

function filterGraph(f, btn) {
  graphFilter = f;
  document.querySelectorAll('#tab-discovery .pill').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  drawGraph('graphCanvasBig', SUPPLIERS, f);
  renderSupplierTable(f);
}

// ─── Upload / NER Simulation ───────────────────────────────────────────────────

async function simulateUpload() {
  const zone = document.getElementById('upload-zone');
  const progress = document.getElementById('ner-progress');
  const results = document.getElementById('ner-results');
  zone.style.display = 'none';
  progress.style.display = 'block';
  results.innerHTML = '';

  const stages = [
    { icon: '📄', text: 'PDF/image received — running OCR via Tesseract + LLM…', delay: 600 },
    { icon: '🔒', text: 'PII anonymization via Microsoft Presidio…', delay: 700 },
    { icon: '🧠', text: 'LLaMA 3.1-8B NER inference (4-bit GGUF, 8192 ctx)…', delay: 1200 },
    { icon: '🔍', text: 'Regex augmentation (GST/CIN pattern matching)…', delay: 500 },
    { icon: '🗄️', text: 'Upserting supplier nodes to Neo4j graph…', delay: 600 },
    { icon: '📡', text: 'Publishing supplier.graph.updated to Redis Streams…', delay: 400 },
    { icon: '✅', text: 'Done! 7 supplier entities extracted.', delay: 0 },
  ];

  const stageList = document.getElementById('stage-list');
  stageList.innerHTML = '';

  for (const s of stages) {
    await delay(s.delay);
    const div = document.createElement('div');
    div.className = 'stage-item';
    div.innerHTML = `<span class="stage-icon">${s.icon}</span> ${s.text}`;
    stageList.appendChild(div);
    div.style.animation = 'fadeIn .25s ease';
  }

  await delay(400);

  const mockExtracted = SUPPLIERS.slice(0, 7);
  results.innerHTML = `
    <div style="padding:.75rem 1.25rem">
      <div style="margin-bottom:.75rem;font-size:.8rem;color:#94a3b8">Found <b style="color:#e2e8f0">${mockExtracted.length} supplier entities</b> · Doc hash: <span class="mono">a3f2c8e1…</span></div>
      ${mockExtracted.map((s, i) => `
        <div class="alert-mini" style="margin-bottom:.4rem">
          <span class="risk-badge" style="background:${tierBg(s.tier)};color:${tierColor(s.tier)};min-width:52px">T${s.tier}</span>
          <div class="alert-info">
            <div class="alert-supplier">${s.name}</div>
            <div class="alert-desc">GST: ${s.gst} · ${s.location} · ${s.material}</div>
          </div>
          <span class="alert-time" style="color:#22c55e">conf ${(0.82 + i*0.02).toFixed(2)}</span>
        </div>
      `).join('')}
    </div>`;

  zone.style.display = 'block';
  zone.innerHTML = `<div class="upload-icon">✅</div><p>Invoice processed! Upload another?</p><span class="upload-hint">7 suppliers discovered · Graph updated</span>`;
  setTimeout(() => {
    zone.innerHTML = `<div class="upload-icon">📄</div><p>Click to upload or drag PDF/image invoice</p><span class="upload-hint">Supported: PDF, PNG, JPG · Max 20MB · PII auto-anonymized</span>`;
  }, 5000);
}

// ─── Monitoring Alerts ─────────────────────────────────────────────────────────

function renderAlerts(filter) {
  const grid = document.getElementById('alerts-grid');
  if (!grid) return;
  const filtered = filter === 'all' ? ESG_ALERTS :
    ESG_ALERTS.filter(a => a.severity === filter || a.labels.includes(filter));

  grid.innerHTML = filtered.length === 0
    ? '<div class="empty-state">No alerts match this filter.</div>'
    : filtered.map(a => `
      <div class="alert-card ${a.severity}">
        <div class="alert-card-sev">
          <div class="alert-sev sev-${a.severity}" style="margin-bottom:.4rem">${a.severity}</div>
          <div style="font-size:.72rem;color:#475569">${a.alert_tier}</div>
          <div style="font-size:.72rem;color:#475569;margin-top:.2rem">${a.time}</div>
          <div class="alert-labels" style="margin-top:.5rem">${a.labels.map(l=>`<span class="label-chip label-${l}">${l}</span>`).join('')}</div>
        </div>
        <div class="alert-card-body">
          <div class="alert-card-supplier">${supplierName(a.supplier_id)}</div>
          <div class="alert-card-summary">${a.summary}</div>
          <div class="alert-card-meta">
            <span class="alert-meta-item">Type: <b>${a.violation_type.replace(/_/g,' ')}</b></span>
            ${a.predicted_risk_days ? `<span class="alert-meta-item">Predictive: <b>+${a.predicted_risk_days} days</b></span>` : ''}
            <span class="alert-meta-item">Sources: <b>${a.sources.length}</b></span>
          </div>
          <div class="conf-bar" style="margin-top:.5rem">
            <span style="font-size:.7rem;color:#475569">Confidence</span>
            <div class="conf-track"><div class="conf-fill" style="width:${a.confidence*100}%"></div></div>
            <span class="conf-text">${(a.confidence*100).toFixed(0)}%</span>
          </div>
          <div style="margin-top:.5rem;font-size:.72rem;color:#475569">
            📎 ${a.sources.join(' · ')}
          </div>
        </div>
      </div>
    `).join('');
}

function filterAlerts(f, btn) {
  alertFilter = f;
  document.querySelectorAll('.filter-toolbar .pill').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  renderAlerts(f);
}

// ─── Compliance Report ─────────────────────────────────────────────────────────

function setHITLState(state) {
  const states = ['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'FILED'];
  states.forEach(s => {
    const el = document.getElementById('hs-' + s);
    if (el) {
      el.classList.remove('active', 'done');
      const idx = states.indexOf(s), curIdx = states.indexOf(state);
      if (idx < curIdx) el.classList.add('done');
      else if (idx === curIdx) el.classList.add('active');
    }
  });
  const badge = document.getElementById('report-state-badge');
  if (badge) badge.textContent = state.replace('_', ' ');
}

async function generateReport() {
  const btn = document.getElementById('gen-report-btn');
  btn.disabled = true;
  btn.textContent = '⏳ Generating…';

  const framework = document.querySelector('input[name="framework"]:checked')?.value || 'BRSR_CORE';
  const supplier = document.getElementById('report-supplier').value;

  const card = document.getElementById('report-preview-card');
  const content = document.getElementById('report-content');
  card.style.display = 'none';

  // Simulate stages
  setHITLState('DRAFT');
  await delay(600);
  content.innerHTML = '<div class="empty-state">🔍 Retrieving policy context via RAG (Pinecone + Cohere rerank)…</div>';
  card.style.display = 'block';
  await delay(900);
  content.innerHTML = '<div class="empty-state">🧠 Calling GPT-4o with framework prompt…</div>';
  setHITLState('PENDING_REVIEW');
  await delay(1200);

  const reportData = buildMockReport(supplier, framework);
  currentReport = reportData;
  reportState = 'PENDING_REVIEW';

  document.getElementById('report-title').textContent = `${framework.replace('_',' ')} — ${supplier}`;
  content.innerHTML = renderReportContent(reportData, framework);

  const actions = document.getElementById('report-actions');
  actions.style.display = 'flex';

  // Add to registry
  addToRegistry(supplier, framework);

  btn.disabled = false;
  btn.textContent = '⚡ Generate Report';
}

function buildMockReport(supplier, framework) {
  const s = SUPPLIERS.find(x => supplier.includes(x.name.split(' ')[0])) || SUPPLIERS[0];
  return {
    supplier, framework,
    scope3_emission_estimate_tonnes_co2e: Math.round(800 + Math.random()*2000),
    sections: {
      "Section A: General Disclosures": { ctn: "Registered since 2015 · 1,200 employees · Revenue: ₹240Cr FY2025" },
      "Section B: Management & Process": { ctn: "EHS committee meets quarterly. ISO certification status: partial." },
      "Section C: Principle-wise Performance": { ctn: "P6 (Environment) score: 62/100. P8 (Inclusive Growth): 71/100." },
    },
    compliance_gaps: [
      "Water discharge consent not renewed past April 2025 — non-compliant under EP Act 1986",
      "GHG inventory not independently verified (GHG Protocol requirement)",
      "ISO 14001 renewal pending (expires May 2026)",
      "Supply chain Scope 3 Category 1 data not collected from Tier 2+ suppliers"
    ],
    remediation_plan: [
      "Immediately apply for renewal of CTO/CCA from TNPCB — estimated 3 weeks",
      "Appoint KPMG / EY for GHG inventory verification (Q2 FY27 target)",
      "Schedule ISO 14001 audit with Bureau Veritas by April 30 2026",
      "Implement supplier data collection portal for Tier 2 Scope 3 data by Q3 FY27"
    ],
    model_used: 'GPT-4o (primary)',
    confidence: 0.94,
    rag_chunks: 8,
    report_id: 'RPT' + Math.random().toString(36).substr(2,6).toUpperCase()
  };
}

function renderReportContent(r, framework) {
  return `
    <div class="report-section">
      <div class="report-section-title">🌍 Scope 3 Emission Estimate</div>
      <div class="emit-big">${r.scope3_emission_estimate_tonnes_co2e.toLocaleString()} tCO₂e/year
        <span class="emit-sub"> · activity-based · IPCC AR6 + India BEE 2023</span>
      </div>
    </div>
    <div class="report-section">
      <div class="report-section-title">📄 Framework Sections — ${framework.replace('_',' ')}</div>
      ${Object.entries(r.sections).map(([k,v]) => `
        <div class="report-field"><span class="report-field-key">${k}</span><span>${v.ctn}</span></div>
      `).join('')}
    </div>
    <div class="report-section">
      <div class="report-section-title">⚠️ Compliance Gaps (${r.compliance_gaps.length})</div>
      ${r.compliance_gaps.map(g => `<div class="report-gap">◆ ${g}</div>`).join('')}
    </div>
    <div class="report-section">
      <div class="report-section-title">✅ Remediation Plan</div>
      ${r.remediation_plan.map((g,i) => `<div class="report-remed">${i+1}. ${g}</div>`).join('')}
    </div>
    <div class="report-section" style="font-size:.78rem;color:#475569;display:flex;gap:2rem;flex-wrap:wrap">
      <span>Model: <b style="color:#94a3b8">${r.model_used}</b></span>
      <span>RAG chunks: <b style="color:#94a3b8">${r.rag_chunks}</b></span>
      <span>Confidence: <b style="color:#94a3b8">${(r.confidence*100).toFixed(0)}%</b></span>
      <span>Report ID: <span class="mono">${r.report_id}</span></span>
    </div>
  `;
}

function fileReport() {
  setHITLState('FILED');
  reportState = 'FILED';
  document.getElementById('report-actions').style.display = 'none';
  AUDIT_TRAIL.unshift({
    ts: new Date().toISOString().slice(0,19).replace('T',' '),
    agent:'COMPLIANCE', event:'audit_trail_sealed',
    input_hash: currentReport.report_id.toLowerCase(),
    model: '—', confidence:1.0,
    chain: Math.random().toString(16).slice(2,10)
  });
  renderAuditLog();
}

function approveReport() {
  if (!currentReport) return;
  reportState = 'APPROVED';
  setHITLState('APPROVED');
  // Show File button, hide Approve
  const actions = document.getElementById('report-actions');
  actions.innerHTML = `
    <button class="btn-success" onclick="fileReport()">📁 File Report (Seal Audit Trail)</button>
    <button class="btn-ghost" onclick="requestRevision()">↩ Request Revision</button>
  `;
}

function requestRevision() {
  if (!currentReport) return;
  setHITLState('DRAFT');
  reportState = 'IN_REVISION';
  document.getElementById('report-state-badge').textContent = 'IN REVISION';
}

function downloadReport() {
  if (!currentReport) return;
  const blob = new Blob([JSON.stringify(currentReport, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${currentReport.report_id}_report.json`;
  a.click(); URL.revokeObjectURL(url);
}

function renderReportRegistry() {
  const tbody = document.getElementById('report-registry');
  if (!tbody) return;
  tbody.innerHTML = REPORTS.map(r => `
    <tr>
      <td class="mono">${r.id}</td>
      <td>${r.supplier}</td>
      <td><span class="tag">${r.framework.replace('_',' ')}</span></td>
      <td style="font-size:.78rem;color:#94a3b8">${r.model}</td>
      <td><span class="risk-badge ${stateClass(r.state)}">${r.state.replace('_',' ')}</span></td>
      <td style="color:#475569">${r.created}</td>
      <td><button class="btn-ghost" style="font-size:.75rem;padding:.2rem .6rem">View</button></td>
    </tr>
  `).join('');
}

function stateClass(s) {
  const m = {FILED:'risk-low', APPROVED:'risk-low', PENDING_REVIEW:'risk-med', IN_REVISION:'risk-med', DRAFT:'', EXPIRED:'risk-high'};
  return m[s] || '';
}

function addToRegistry(supplier, framework) {
  const id = 'RPT' + Math.random().toString(36).substr(2,4).toUpperCase();
  REPORTS.unshift({ id, supplier, framework, model:'GPT-4o (primary)', state:'PENDING_REVIEW', created: new Date().toISOString().slice(0,16).replace('T',' ') });
  renderReportRegistry();
}

// ─── Chat Agent ────────────────────────────────────────────────────────────────

const chatHistory = [];

function sendSuggestion(btn) {
  document.getElementById('chat-input').value = btn.textContent.trim();
  sendChat();
}

async function sendChat() {
  const input = document.getElementById('chat-input');
  const q = input.value.trim();
  if (!q) return;
  input.value = '';

  const sugg = document.getElementById('chat-suggestions');
  if (sugg) sugg.style.display = 'none';

  appendMsg('user', q);
  const typingEl = appendTyping();

  await delay(300 + Math.random() * 600);

  const resp = findChatResponse(q);
  typingEl.remove();
  appendAIResponse(resp);
}

function appendMsg(role, text) {
  const messages = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = `chat-msg ${role}`;
  div.innerHTML = `
    <div class="chat-avatar">${role === 'user' ? '👤' : '🌿'}</div>
    <div class="chat-bubble">${marked(text)}</div>
  `;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
  return div;
}

function appendTyping() {
  const messages = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'chat-msg ai';
  div.innerHTML = `<div class="chat-avatar">🌿</div><div class="chat-bubble"><div class="typing"><span></span><span></span><span></span></div></div>`;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
  return div;
}

function appendAIResponse(resp) {
  const messages = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'chat-msg ai';
  div.innerHTML = `
    <div class="chat-avatar">🌿</div>
    <div class="chat-bubble">
      <div style="margin-bottom:.6rem">${marked(resp.answer)}</div>
      <details style="border-top:1px solid #1e2538;padding-top:.5rem;margin-top:.5rem">
        <summary style="cursor:pointer;font-size:.72rem;color:#475569">🔍 View generated Cypher query</summary>
        <pre>${resp.cypher}</pre>
      </details>
      <div style="margin-top:.5rem;font-size:.7rem;color:#475569">⚡ LangChain · Neo4j Cypher · ${(Math.random()*0.8+0.6).toFixed(1)}s</div>
    </div>
  `;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

function findChatResponse(q) {
  const ql = q.toLowerCase();
  if (ql.includes('tamil') || ql.includes('water risk')) return CHAT_RESPONSES.tamil_nadu;
  if (ql.includes('cpcb') || ql.includes('tier-3') || ql.includes('tier 3') && ql.includes('violation')) return CHAT_RESPONSES.cpcb;
  if (ql.includes('scope 3') || ql.includes('emission') || ql.includes('kaveri')) return CHAT_RESPONSES.scope3;
  if (ql.includes('top 5') || ql.includes('risk score')) return CHAT_RESPONSES.top5;
  if (ql.includes('iso') || ql.includes('14001') || ql.includes('missing')) return CHAT_RESPONSES.iso;
  if (ql.includes('water discharge') || ql.includes('tirupur')) return CHAT_RESPONSES.water;
  // Generic fallback
  return {
    query: q,
    cypher: `MATCH (s:Supplier)\nWHERE toLower(s.name) CONTAINS toLower("${q.split(' ').slice(0,3).join(' ')}")\nRETURN s.name, s.tier, s.risk_score, s.location\nLIMIT 10`,
    answer: `I searched the supply chain graph for: **"${q}"**\n\nFound **3 matching suppliers** with relevant data. Based on the Neo4j graph and Pinecone policy embeddings:\n\n- Kaveri Spinning Mills · Tier 1 · Risk: 🟢 28\n- Om Weaving Corporation · Tier 2 · Risk: 🟡 55\n- EcoThread Solutions · Tier 2 · Risk: 🟢 15\n\n💡 For more specific insights, try asking about a specific supplier, location, or ESG dimension.`
  };
}

// Markdown parser — supports bold, italic, code, paragraphs, and multi-row tables
function marked(text) {
  // Handle tables first (multi-line)
  text = text.replace(/((?:\|.+\|\n?)+)/g, (block) => {
    const rows = block.trim().split('\n').filter(r => r.trim());
    let html = '<table class="data-table" style="margin:.5rem 0;font-size:.8rem">';
    let isHeader = true;
    rows.forEach(row => {
      const cells = row.split('|').filter((_, i, a) => i > 0 && i < a.length - 1);
      const isSep = cells.every(c => /^[-: ]+$/.test(c));
      if (isSep) { isHeader = false; return; }
      const tag = isHeader ? 'th' : 'td';
      const style = isHeader ? 'font-weight:700;color:#94a3b8;font-size:.72rem;text-transform:uppercase;letter-spacing:.04em' : 'padding:.35rem .7rem';
      html += '<tr>' + cells.map(c => `<${tag} style="padding:.35rem .7rem;${style}">${c.trim()}</${tag}>`).join('') + '</tr>';
      if (isHeader) isHeader = false;
    });
    return html + '</table>';
  });
  return text
    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
    .replace(/\*(.*?)\*/g, '<i>$1</i>')
    .replace(/`(.*?)`/g, '<code style="background:#1e2538;padding:.1rem .35rem;border-radius:4px;font-family:monospace;font-size:.82em">$1</code>')
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>');
}

// ─── Audit Log ─────────────────────────────────────────────────────────────────

function renderAuditLog() {
  const tbody = document.getElementById('audit-tbody');
  if (!tbody) return;
  tbody.innerHTML = AUDIT_TRAIL.map((r, i) => `
    <tr>
      <td style="color:#475569">${AUDIT_TRAIL.length - i}</td>
      <td class="mono" style="color:#94a3b8">${r.ts}</td>
      <td><span class="tag">${r.agent}</span></td>
      <td style="font-size:.8rem">${r.event}</td>
      <td class="mono">${r.input_hash}…</td>
      <td style="font-size:.78rem;color:#94a3b8">${r.model}</td>
      <td><div class="conf-bar" style="gap:.4rem"><div class="conf-track" style="width:60px"><div class="conf-fill" style="width:${r.confidence*100}%"></div></div><span class="conf-text">${(r.confidence*100).toFixed(0)}%</span></div></td>
      <td class="mono">${r.chain}…</td>
    </tr>
  `).join('');
}

// ─── Utilities ─────────────────────────────────────────────────────────────────

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Real-time Simulation ─────────────────────────────────────────────────────

function startLiveSimulation() {
  // Animate KPI counters
  animateCounter('kpi-suppliers', 0, 247, 1500);
  animateCounter('kpi-alerts', 0, ESG_ALERTS.length, 1200);
  animateCounter('kpi-reports', 0, REPORTS.length, 800);
  animateCounter('kpi-co2', 0, 12480, 2000);

  // Sync sidebar badge with actual CRITICAL alert count
  syncAlertBadge();
}

function animateCounter(id, from, to, dur) {
  const el = document.getElementById(id);
  if (!el) return;
  const start = performance.now();
  const step = ts => {
    const progress = Math.min((ts - start) / dur, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(from + (to - from) * ease).toLocaleString();
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ─── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Draw graphs
  drawGraph('graphCanvas', SUPPLIERS, 'all');
  drawGraph('graphCanvasBig', SUPPLIERS, 'all');

  // Render all data sections
  renderDashAlerts();
  renderSupplierTable('all');
  renderAlerts('all');
  renderReportRegistry();
  renderAuditLog();
  syncAlertBadge();

  // Animate KPIs
  startLiveSimulation();
});
