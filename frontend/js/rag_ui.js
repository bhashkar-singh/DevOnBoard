/**
 * DevOnboard - Evidence-Gated RAG UI Controller
 * Implements Algorithm 1 & Equations (1), (2) with Interactive Gate HUD
 */

window.RagUI = {
  init: function () {
    this.bindEvents();
    this.updateGateHUD(null);
  },

  bindEvents: function () {
    const form = document.getElementById('chat-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.submitQuery();
      });
    }

    // Quick Prompt Chips
    document.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const query = chip.getAttribute('data-prompt');
        const input = document.getElementById('chat-input');
        if (input && query) {
          input.value = query;
          this.submitQuery();
        }
      });
    });

    // Threshold Tau Slider
    const tauSlider = document.getElementById('gate-tau-slider');
    const tauValEl = document.getElementById('gate-tau-val');
    if (tauSlider) {
      tauSlider.addEventListener('input', (e) => {
        window.App.state.tauThreshold = parseFloat(e.target.value);
        if (tauValEl) tauValEl.textContent = parseFloat(e.target.value).toFixed(2);
      });
    }

    // Lambda Weight Slider
    const lambdaSlider = document.getElementById('gate-lambda-slider');
    const lambdaValEl = document.getElementById('gate-lambda-val');
    if (lambdaSlider) {
      lambdaSlider.addEventListener('input', (e) => {
        window.App.state.lambdaWeight = parseFloat(e.target.value);
        if (lambdaValEl) lambdaValEl.textContent = parseFloat(e.target.value).toFixed(2);
      });
    }
  },

  submitQuery: async function () {
    const input = document.getElementById('chat-input');
    if (!input) return;
    const query = input.value.trim();
    if (!query) return;

    input.value = '';
    this.appendUserMessage(query);

    // Show loading indicator
    const loadingId = this.appendLoadingMessage();

    const payload = {
      query: query,
      tau: window.App.state.tauThreshold,
      lambda: window.App.state.lambdaWeight
    };

    const res = await window.App.apiPost('/api/rag/ask', payload);
    this.removeMessage(loadingId);

    if (res && res.gate_result && res.answer_result) {
      this.updateGateHUD(res.gate_result);
      this.appendAiMessage(res.answer_result, res.gate_result);
    } else {
      this.appendSystemError("Failed to query Evidence-Gated RAG Engine.");
    }
  },

  updateGateHUD: function (gate) {
    const hudContainer = document.getElementById('gate-hud-panel');
    if (!hudContainer) return;

    if (!gate) {
      hudContainer.innerHTML = `
        <div class="card">
          <div class="card-title">
            <span>Verification Status</span>
            <span class="gate-badge" style="background: rgba(148, 163, 184, 0.1); color: #94a3b8;">Ready for Questions</span>
          </div>
          <p style="font-size: 0.82rem; color: var(--text-muted);">
            Answers are verified against project documentation. If a topic isn't documented, you'll be connected to a mentor.
          </p>
        </div>
      `;
      return;
    }

    const isAccepted = gate.passed;
    const badgeClass = isAccepted ? 'accepted' : 'abstained';
    const badgeText = isAccepted ? '✅ Verified in Docs' : '🤝 Needs Senior Mentor';

    const covPct = (gate.cov * 100).toFixed(0);
    const margPct = (gate.marg * 100).toFixed(0);
    const confPct = (gate.c_q * 100).toFixed(0);
    const tauPct = (gate.threshold * 100).toFixed(0);

    this.lastGateResult = gate;

    hudContainer.innerHTML = `
      <div class="card">
        <div class="card-title">
          <span>Verification Check</span>
          <span class="gate-badge ${badgeClass}">${badgeText}</span>
        </div>

        <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
          <span>Speed: <strong style="color: var(--accent-brown);">${gate.latency_ms} ms</strong> | Target: <strong>${tauPct}%</strong></span>
          <button class="btn btn-secondary btn-sm" onclick="window.WorkbenchUI.openMathInspector(window.RagUI.lastGateResult)" style="font-size: 0.72rem; padding: 4px 8px;">
            🔍 Breakdown
          </button>
        </div>

        <!-- Verification Confidence Meter -->
        <div class="meter-group">
          <div class="meter-header">
            <span>Doc Match Confidence</span>
            <strong>${confPct}%</strong>
          </div>
          <div class="meter-track">
            <div class="meter-fill ${isAccepted ? 'emerald' : 'amber'}" style="width: ${Math.min(100, confPct)}%;"></div>
            <div class="threshold-marker" style="left: ${tauPct}%;" title="Required: ${tauPct}%"></div>
          </div>
          <div style="font-size: 0.7rem; color: var(--text-dim); margin-top: 4px; display: flex; justify-content: space-between;">
            <span>0%</span>
            <span>Pass Threshold: ${tauPct}%</span>
            <span>100%</span>
          </div>
        </div>

        <!-- Coverage Meter -->
        <div class="meter-group" style="margin-top: 14px;">
          <div class="meter-header">
            <span>Documentation Match</span>
            <strong>${covPct}%</strong>
          </div>
          <div class="meter-track">
            <div class="meter-fill cyan" style="width: ${covPct}%;"></div>
          </div>
          <div style="font-size: 0.72rem; color: var(--text-dim); margin-top: 4px;">
            ${gate.cov_details.in_vocab_count} of ${gate.cov_details.total_terms} question words found in docs
          </div>
        </div>

        <!-- Relevance Meter -->
        <div class="meter-group" style="margin-top: 14px;">
          <div class="meter-header">
            <span>Top Guide Relevance</span>
            <strong>${margPct}%</strong>
          </div>
          <div class="meter-track">
            <div class="meter-fill violet" style="width: ${Math.min(100, margPct)}%;"></div>
          </div>
          <div style="font-size: 0.72rem; color: var(--text-dim); margin-top: 4px;">
            ${isAccepted ? 'Strong specific section match found' : 'No clear guide matches this question'}
          </div>
        </div>
      </div>

      <!-- Citations Container -->
      <div class="card" style="margin-top: 14px;">
        <div class="card-title" style="font-size: 0.95rem;">
          <span>Verified Reference Passages</span>
          <span style="font-size: 0.74rem; color: var(--accent-brown); font-weight: 700;">
            ${gate.citations ? gate.citations.length : 0} source sections (click to view)
          </span>
        </div>
        <div class="citations-list">
          ${(gate.citations || []).map((c, i) => `
            <div class="citation-card" onclick="window.WorkbenchUI.inspectDocumentSource('${c.doc_id}', '${c.section_title.replace(/'/g, "\\'")}', '${c.text_snippet.replace(/'/g, "\\'")}')">
              <div class="citation-title">
                <span>[#${i+1}] ${c.section_title}</span>
                <span style="font-size: 0.7rem; color: var(--accent-brown); font-weight: 600;">🔍 View Source</span>
              </div>
              <div class="citation-snippet">"${c.text_snippet}"</div>
              <div style="font-size: 0.7rem; color: var(--text-dim); margin-top: 4px;">
                Relevance: ${(c.score * 100).toFixed(0)}%
              </div>
            </div>
          `).join('') || '<div style="font-size: 0.8rem; color: var(--text-dim);">No citations retrieved.</div>'}
        </div>
      </div>
    `;
  },

  appendUserMessage: function (text) {
    const chatMsgBox = document.getElementById('chat-messages-list');
    if (!chatMsgBox) return;

    const div = document.createElement('div');
    div.className = 'chat-msg user';
    div.innerHTML = `
      <div class="chat-msg-avatar">🧑‍💻</div>
      <div class="chat-bubble">
        <div>${this.escapeHtml(text)}</div>
      </div>
    `;
    chatMsgBox.appendChild(div);
    chatMsgBox.scrollTop = chatMsgBox.scrollHeight;
  },

  appendLoadingMessage: function () {
    const chatMsgBox = document.getElementById('chat-messages-list');
    if (!chatMsgBox) return null;

    const id = `loading-${Date.now()}`;
    const div = document.createElement('div');
    div.id = id;
    div.className = 'chat-msg ai';
    div.innerHTML = `
      <div class="chat-msg-avatar">🛡️</div>
      <div class="chat-bubble">
        <span style="color: var(--accent-cyan); font-size: 0.85rem;">
          Searching documentation & verifying answer...
        </span>
      </div>
    `;
    chatMsgBox.appendChild(div);
    chatMsgBox.scrollTop = chatMsgBox.scrollHeight;
    return id;
  },

  removeMessage: function (id) {
    if (!id) return;
    const el = document.getElementById(id);
    if (el) el.remove();
  },

  appendAiMessage: function (answerData, gateResult) {
    const chatMsgBox = document.getElementById('chat-messages-list');
    if (!chatMsgBox) return;

    const div = document.createElement('div');
    div.className = 'chat-msg ai';

    let formattedText = this.formatMarkdown(answerData.answer);

    let escalationHtml = '';
    if (answerData.escalated && answerData.escalated_mentor) {
      const em = answerData.escalated_mentor;
      escalationHtml = `
        <div class="escalation-box">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <strong style="color: var(--accent-amber); font-size: 0.88rem;">
              🤝 Connected with an Available Mentor
            </strong>
            <span class="gate-badge" style="background: rgba(245, 158, 11, 0.2); color: var(--accent-amber); font-size: 0.72rem;">
              Top Match
            </span>
          </div>
          <p style="font-size: 0.82rem; color: var(--text-muted); margin-bottom: 10px;">
            This topic isn't in our current documentation. We've matched you with <strong>${em.name}</strong> (${em.headline}) who is experienced in this area.
          </p>
          <button class="btn btn-primary btn-sm" onclick="window.MatcherUI.openBookingFor('${em.mentor_id}', 'Assistance on: ${this.escapeHtml(gateResult.query || '')}')">
            📅 Book Session with ${em.name.split(' ')[0]}
          </button>
        </div>
      `;
    }

    div.innerHTML = `
      <div class="chat-msg-avatar">🛡️</div>
      <div class="chat-bubble">
        ${formattedText}
        ${escalationHtml}
      </div>
    `;

    chatMsgBox.appendChild(div);
    chatMsgBox.scrollTop = chatMsgBox.scrollHeight;
  },

  appendSystemError: function (err) {
    const chatMsgBox = document.getElementById('chat-messages-list');
    if (!chatMsgBox) return;

    const div = document.createElement('div');
    div.className = 'chat-msg ai';
    div.innerHTML = `
      <div class="chat-msg-avatar">⚠️</div>
      <div class="chat-bubble" style="border-color: var(--accent-rose);">
        <span style="color: var(--accent-rose); font-weight: 600;">System Error:</span> ${err}
      </div>
    `;
    chatMsgBox.appendChild(div);
    chatMsgBox.scrollTop = chatMsgBox.scrollHeight;
  },

  formatMarkdown: function (text) {
    if (!text) return '';
    return text
      .replace(/^### (.*$)/gim, '<h4 style="color: var(--accent-cyan); margin: 8px 0 4px;">$1</h4>')
      .replace(/^## (.*$)/gim, '<h3 style="color: #fff; margin: 10px 0 6px;">$1</h3>')
      .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/gim, '<em>$1</em>')
      .replace(/`([^`]+)`/gim, '<code>$1</code>')
      .replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>')
      .replace(/\n\n/g, '<br/><br/>')
      .replace(/\n/g, '<br/>');
  },

  escapeHtml: function (text) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return (text || '').replace(/[&<>"']/g, m => map[m]);
  }
};

window.addEventListener('DOMContentLoaded', () => {
  window.RagUI.init();
});
