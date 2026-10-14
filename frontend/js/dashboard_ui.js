/**
 * DevOnboard - Progress Dashboard, Append-Only Audit Log & Benchmark Explorer
 * Implements SRS Section 4.6 (REQ-WS-3), Paper Section III-A & Section V
 */

window.DashboardUI = {
  init: function () {
    this.bindEvents();
  },

  bindEvents: {
    // any static bindings
  },

  load: async function () {
    await this.fetchDashboardData();
    await this.fetchAuditLog();
  },

  fetchDashboardData: async function () {
    const currentUser = window.App && window.App.state ? window.App.state.currentUser : null;
    const isMentor = currentUser && currentUser.role !== 'mentee';

    const titleEl = document.getElementById('progress-tab-title');
    const descEl = document.getElementById('progress-tab-desc');
    const menteeGrid = document.getElementById('mentee-progress-grid');
    const mentorCohortEl = document.getElementById('mentor-cohort-dashboard');

    if (isMentor) {
      if (titleEl) titleEl.textContent = '🎓 My Mentees & Their Progress';
      if (descEl) descEl.textContent = 'See how your mentees are doing and check off their completed onboarding tasks.';
      if (menteeGrid) menteeGrid.style.display = 'none';
      if (mentorCohortEl) {
        mentorCohortEl.style.display = 'block';
        const mData = await window.App.apiGet('/api/mentor/dashboard');
        if (mData) {
          const p = mData.profile || {};
          const mentees = Array.isArray(mData.mentees) ? mData.mentees : [];
          const requests = Array.isArray(mData.requests) ? mData.requests : [];
          const sessions = Array.isArray(mData.sessions) ? mData.sessions : [];
          const resolvedCount = requests.filter(r => r.status === 'resolved').length;
          const openCount = requests.filter(r => r.status !== 'resolved').length;

          mentorCohortEl.innerHTML = `
            <div class="grid-4" style="margin-bottom: 20px;">
              <div class="stat-card" style="border-left: 4px solid var(--accent-brown);">
                <div class="stat-label">Mentees I Help</div>
                <div class="stat-value">${p.active_mentees !== undefined ? p.active_mentees : mentees.length} of ${p.declared_capacity || 4}</div>
                <div class="stat-sub">Open spots filled</div>
              </div>
              <div class="stat-card" style="border-left: 4px solid var(--accent-green);">
                <div class="stat-label">My Rating</div>
                <div class="stat-value">★ ${p.mean_rating ? Number(p.mean_rating).toFixed(1) : '4.9'}</div>
                <div class="stat-sub">From ${p.session_count || sessions.length} finished 1:1 calls</div>
              </div>
              <div class="stat-card" style="border-left: 4px solid var(--accent-amber);">
                <div class="stat-label">Questions Answered</div>
                <div class="stat-value">${resolvedCount}</div>
                <div class="stat-sub">${openCount} still waiting</div>
              </div>
              <div class="stat-card" style="border-left: 4px solid var(--accent-rust);">
                <div class="stat-label">Average Progress</div>
                <div class="stat-value">${mentees.length ? Math.round(mentees.reduce((acc, m) => acc + (m.computed_readiness || 0), 0) / mentees.length) : 65}%</div>
                <div class="stat-sub">Tasks completed</div>
              </div>
            </div>

            <div class="card">
              <div class="card-title">
                <span>My Mentees — Click Any Task to Mark It Done</span>
                <span class="badge badge-pass">${mentees.length} Active Mentees</span>
              </div>
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px;">
                ${mentees.map(m => {
                  const checklist = Array.isArray(m.checklist) ? m.checklist : [];
                  return `
                    <div style="background: var(--bg-card-subtle); border: 1px solid var(--border-main); border-radius: var(--radius-sm); padding: 16px;">
                      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                          <img src="${m.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}" style="width: 42px; height: 42px; border-radius: 50%; object-fit: cover; border: 2px solid var(--accent-brown);" />
                          <div>
                            <div style="font-weight: 700; font-size: 0.92rem; color: var(--text-main);">${m.name}</div>
                            <div style="font-size: 0.74rem; color: var(--text-muted);">${m.target_role || 'Backend Developer'}</div>
                          </div>
                        </div>
                        <div style="text-align: right;">
                          <div style="font-size: 1.2rem; font-weight: 800; color: var(--accent-green); font-family: var(--font-mono);">${m.computed_readiness}%</div>
                          <div style="font-size: 0.68rem; color: var(--text-muted);">PROGRESS</div>
                        </div>
                      </div>
                      <div style="display: flex; flex-direction: column; gap: 6px; margin-top: 10px;">
                        ${checklist.map(item => `
                          <div onclick="window.HomeUI.signOffMenteeMilestone('${item.id}')"
                               style="display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; border-radius: 6px; background: ${item.completed ? 'rgba(43, 110, 72, 0.08)' : 'var(--bg-secondary)'}; border: 1px solid ${item.completed ? 'rgba(43, 110, 72, 0.25)' : 'var(--border-subtle)'}; cursor: pointer;">
                            <span style="font-size: 0.8rem; color: var(--text-main); ${item.completed ? 'text-decoration: line-through; opacity: 0.75;' : 'font-weight: 600;'}">
                              ${item.completed ? '✓ ' : '○ '}${item.title}
                            </span>
                            <span class="chip" style="font-size: 0.68rem; padding: 2px 8px; color: ${item.completed ? 'var(--accent-green)' : 'var(--accent-brown)'};">
                              ${item.completed ? 'Done ✓' : 'Mark Done'}
                            </span>
                          </div>
                        `).join('')}
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          `;
        }
      }
      return;
    }

    if (titleEl) titleEl.textContent = '📊 My Progress & Activity History';
    if (descEl) descEl.textContent = 'Track your onboarding checklist, readiness score, and view your recent question history.';
    if (menteeGrid) menteeGrid.style.display = '';
    if (mentorCohortEl) mentorCohortEl.style.display = 'none';

    const data = await window.App.apiGet('/api/dashboard');
    if (!data) return;

    // Render Readiness Score Circle
    const circle = document.getElementById('readiness-progress-circle');
    const valEl = document.getElementById('readiness-percent-val');
    const statsEl = document.getElementById('dashboard-stats-row');

    const score = data.readiness_score || 0;
    if (valEl) valEl.textContent = `${score}%`;
    if (circle) {
      const deg = (score / 100) * 360;
      circle.style.setProperty('--readiness-deg', `${deg}deg`);
    }

    if (statsEl && data.stats) {
      statsEl.innerHTML = `
        <div class="card" style="padding: 14px; text-align: center;">
          <div style="font-size: 1.5rem; font-weight: 800; color: var(--accent-brown); font-family: var(--font-mono);">
            ${data.stats.queries_count}
          </div>
          <div style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase;">RAG Queries</div>
        </div>
        <div class="card" style="padding: 14px; text-align: center;">
          <div style="font-size: 1.5rem; font-weight: 800; color: var(--accent-green); font-family: var(--font-mono);">
            ${data.stats.sessions_completed}
          </div>
          <div style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase;">Sessions Completed</div>
        </div>
        <div class="card" style="padding: 14px; text-align: center;">
          <div style="font-size: 1.5rem; font-weight: 800; color: var(--accent-amber); font-family: var(--font-mono);">
            ${data.stats.completed_tasks}/${data.stats.total_tasks}
          </div>
          <div style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase;">Milestones Done</div>
        </div>
      `;
    }

    // Render Checklist
    const chkListContainer = document.getElementById('onboarding-checklist-items');
    if (chkListContainer && data.checklist) {
      chkListContainer.innerHTML = data.checklist.map(item => `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; background: var(--bg-card-subtle); border: 1px solid var(--border-main); border-radius: var(--radius-sm); margin-bottom: 8px;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <input type="checkbox" ${item.completed ? 'checked' : ''} 
                   style="accent-color: var(--accent-green); width: 18px; height: 18px; cursor: pointer;"
                   onchange="window.DashboardUI.toggleChecklistItem('${item.item_id}')" />
            <div>
              <div style="font-size: 0.88rem; font-weight: 600; color: ${item.completed ? 'var(--text-muted)' : 'var(--text-main)'}; text-decoration: ${item.completed ? 'line-through' : 'none'};">
                ${item.task_title}
              </div>
              <div style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase;">
                ${item.category}
              </div>
            </div>
          </div>
          <span class="badge ${item.completed ? 'badge-pass' : ''}" style="font-size: 0.7rem;">
            ${item.completed ? 'Completed' : 'Pending'}
          </span>
        </div>
      `).join('');
    }
  },

  toggleChecklistItem: async function (itemId) {
    const res = await window.App.apiPost('/api/dashboard/checklist-toggle', { item_id: itemId });
    if (res && res.status === 'toggled') {
      window.App.showToast("Milestone updated!", "success");
      await this.fetchDashboardData();
    }
  },

  fetchAuditLog: async function () {
    const tableBody = document.getElementById('audit-log-table-body');
    if (!tableBody) return;

    const logs = await window.App.apiGet('/api/audit-log');
    if (!logs || logs.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-dim); padding: 20px;">No audit records found.</td></tr>`;
      return;
    }

    tableBody.innerHTML = logs.map(l => {
      const isAccepted = l.gate_decision === 'ACCEPTED';
      const badge = isAccepted 
        ? `<span class="gate-badge accepted" style="font-size: 0.7rem;">✅ Verified in Docs</span>`
        : `<span class="gate-badge abstained" style="font-size: 0.7rem;">🤝 Routed to Mentor</span>`;

      return `
        <tr>
          <td><code style="font-size: 0.75rem; color: var(--text-muted);">${l.log_id}</code></td>
          <td style="max-width: 240px; font-weight: 500; color: var(--text-main);">${this.escapeHtml(l.query)}</td>
          <td><strong>${Math.round(l.combined_conf * 100)}%</strong></td>
          <td style="font-size: 0.78rem; color: var(--text-dim);">${Math.round(l.cov_score * 100)}% match</td>
          <td>${badge}</td>
          <td style="font-size: 0.75rem; color: var(--accent-brown);">${l.latency_ms} ms</td>
          <td style="font-size: 0.72rem; color: var(--text-dim);">${l.timestamp}</td>
        </tr>
      `;
    }).join('');
  },

  // ================= AI QUALITY & ACCURACY TESTS =================
  loadBenchmark: async function () {
    const data = await window.App.apiGet('/api/benchmark');
    if (!data || !data.probes) return;

    const container = document.getElementById('benchmark-probes-list');
    if (!container) return;

    container.innerHTML = data.probes.map((p, idx) => {
      const tierLabel = p.tier === 'in-scope' ? 'IN-DOCS QUESTION' 
                      : p.tier === 'far' ? 'OUT-OF-SCOPE' 
                      : p.tier === 'near' ? 'UNSUPPORTED TECH' 
                      : 'ALTERNATIVE STACK';

      const tierColor = p.tier === 'in-scope' ? 'var(--accent-green)' 
                      : p.tier === 'far' ? 'var(--accent-indigo)' 
                      : p.tier === 'near' ? 'var(--accent-cyan)' 
                      : 'var(--accent-rust)';

      const expectedLabel = p.expected === 'accepted' ? 'Answer Verified' : 'Route to Mentor';

      return `
        <div class="card" style="padding: 14px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;" id="probe-card-${idx}">
          <div style="flex: 1;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
              <span class="gate-badge" style="background: rgba(60, 40, 25, 0.06); color: ${tierColor}; font-size: 0.7rem;">
                ${tierLabel}
              </span>
              <span style="font-size: 0.75rem; color: var(--text-dim);">Expected: <strong>${expectedLabel}</strong></span>
            </div>
            <div style="font-size: 0.88rem; font-weight: 600; color: var(--text-main);">"${p.query}"</div>
          </div>
          <div style="display: flex; align-items: center; gap: 14px;" id="probe-result-${idx}">
            <button class="btn btn-secondary btn-sm" onclick="window.DashboardUI.runSingleProbe(${idx}, '${this.escapeHtml(p.query)}', '${p.expected}')">
              ⚡ Run Test
            </button>
          </div>
        </div>
      `;
    }).join('');
  },

  runSingleProbe: async function (idx, query, expected) {
    const resBox = document.getElementById(`probe-result-${idx}`);
    if (resBox) resBox.innerHTML = `<span style="font-size: 0.78rem; color: var(--accent-cyan);">Testing...</span>`;

    const res = await window.App.apiPost('/api/benchmark/run-probe', { query: query });
    if (!res || !res.gate_result) return;

    const g = res.gate_result;
    const isAccepted = g.passed;
    const isSuccess = (expected === 'accept' && isAccepted) || (expected === 'reject' && !isAccepted);

    if (resBox) {
      resBox.innerHTML = `
        <div style="text-align: right;">
          <span class="gate-badge ${isAccepted ? 'accepted' : 'abstained'}" style="font-size: 0.7rem;">
            ${g.decision} (c=${g.c_q})
          </span>
          <div style="font-size: 0.72rem; color: ${isSuccess ? 'var(--accent-emerald)' : 'var(--accent-rose)'}; margin-top: 2px;">
            ${isSuccess ? '✅ Benchmark Aligned' : '❌ Discrepancy'}
          </div>
        </div>
      `;
    }
  },

  runAllBenchmarkProbes: async function () {
    const data = await window.App.apiGet('/api/benchmark');
    if (!data || !data.probes) return;

    window.App.showToast("Executing Empirical Benchmark Suite (20 Probes)...", "info");
    let acceptedInScope = 0;
    let totalInScope = 0;
    let rejectedOos = 0;
    let totalOos = 0;

    for (let i = 0; i < data.probes.length; i++) {
      const p = data.probes[i];
      const res = await window.App.apiPost('/api/benchmark/run-probe', { query: p.query });
      if (res && res.gate_result) {
        const isAcc = res.gate_result.passed;
        if (p.tier === 'in-scope') {
          totalInScope++;
          if (isAcc) acceptedInScope++;
        } else {
          totalOos++;
          if (!isAcc) rejectedOos++;
        }
        await this.runSingleProbe(i, p.query, p.expected);
      }
    }

    const inScopePct = ((acceptedInScope / totalInScope) * 100).toFixed(1);
    const oosRejPct = ((rejectedOos / totalOos) * 100).toFixed(1);

    window.App.showToast(`Benchmark Complete: In-Scope Recall = ${inScopePct}%, OOS Rejection = ${oosRejPct}%!`, "success");
    document.getElementById('bench-summary-results').innerHTML = `
      <div style="display: flex; gap: 20px; margin-top: 10px;">
        <div class="card" style="flex: 1; padding: 12px; text-align: center;">
          <div style="font-size: 1.4rem; font-weight: 800; color: var(--accent-emerald);">${inScopePct}%</div>
          <div style="font-size: 0.7rem; color: var(--text-dim);">IN-SCOPE COVERAGE (PAPER: 89.4%)</div>
        </div>
        <div class="card" style="flex: 1; padding: 12px; text-align: center;">
          <div style="font-size: 1.4rem; font-weight: 800; color: var(--accent-cyan);">${oosRejPct}%</div>
          <div style="font-size: 0.7rem; color: var(--text-dim);">OOS REJECTION RATE (PAPER: 91.7%)</div>
        </div>
      </div>
    `;
  },

  escapeHtml: function (text) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return (text || '').replace(/[&<>"']/g, m => map[m]);
  }
};

window.addEventListener('DOMContentLoaded', () => {
  window.DashboardUI.init();
});
