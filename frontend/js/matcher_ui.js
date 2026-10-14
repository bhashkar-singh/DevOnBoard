/**
 * DevOnboard - Explainable Load-Aware Mentor Matcher (XMM) UI Controller
 * Implements Eq. (3), Table IV & Table V: Waterfall Term Decomposition & Live Gini Sweep
 */

window.MatcherUI = {
  data: null,

  init: function () {
    this.bindEvents();
  },

  bindEvents: function () {
    const slider = document.getElementById('beta5-slider');
    const valEl = document.getElementById('beta5-val');

    if (slider) {
      slider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        window.App.state.beta5LoadWeight = val;
        if (valEl) valEl.textContent = val.toFixed(2);
        this.load();
      });
    }

    // Edit gap skills button
    const editGapsBtn = document.getElementById('btn-edit-gaps');
    if (editGapsBtn) {
      editGapsBtn.addEventListener('click', () => {
        this.openSkillGapModal();
      });
    }
  },

  load: async function () {
    const container = document.getElementById('mentors-list-container');
    if (!container) return;

    const b5 = window.App.state.beta5LoadWeight;
    const res = await window.App.apiGet(`/api/matching/xmm?beta5=${b5}`);

    if (!res || !res.ranked_mentors) {
      container.innerHTML = `<div style="color: var(--text-muted); padding: 20px;">Failed to evaluate mentor matches.</div>`;
      return;
    }

    this.data = res;
    this.renderHeaderStats(res);
    this.renderMentorsList(res.ranked_mentors);
  },

  renderHeaderStats: function (data) {
    const giniEl = document.getElementById('gini-val');
    const gapsCountEl = document.getElementById('mentee-gaps-count');

    if (giniEl) {
      const g = data.gini_workload;
      if (g < 0.18) {
        giniEl.textContent = 'Fair & Balanced';
        giniEl.style.color = 'var(--accent-green)';
      } else {
        giniEl.textContent = 'Moderate';
        giniEl.style.color = 'var(--accent-amber)';
      }
    }

    if (gapsCountEl) {
      gapsCountEl.textContent = data.mentee_gaps_count;
    }
  },

  renderMentorsList: function (mentors) {
    const container = document.getElementById('mentors-list-container');
    if (!container) return;

    if (mentors.length === 0) {
      container.innerHTML = `<div class="card" style="text-align: center; color: var(--text-muted);">No active mentors available.</div>`;
      return;
    }

    container.innerHTML = mentors.map((m, idx) => {
      const t = m.terms;
      const s = m.raw_stats;
      const rankBadge = idx === 0 ? '🥇 Top Recommendation' : idx === 1 ? '🥈 Strong Match' : idx === 2 ? '🥉 Good Match' : `#${idx+1} Match`;
      const openCapacity = Math.max(0, s.declared_capacity - s.active_mentees);

      return `
        <div class="mentor-card">
          <div class="mentor-card-top">
            <img src="${m.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}" alt="${m.name}" class="mentor-img" />
            <div class="mentor-meta">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span class="mentor-name">${m.name}</span>
                <span class="gate-badge" style="background: rgba(141, 91, 54, 0.12); color: var(--accent-brown); font-size: 0.72rem;">
                  ${rankBadge}
                </span>
              </div>
              <div class="mentor-headline">${m.headline}</div>
              <div style="font-size: 0.78rem; color: var(--text-dim); margin-top: 4px;">
                ${s.raw_rating}★ (${s.session_count} reviews) · ${openCapacity} mentee spots open · Fast response
              </div>
            </div>
            <div class="mentor-score-badge">
              <div class="match-score-big">${(m.total_score * 100).toFixed(0)}%</div>
              <div class="match-score-label">Match Score</div>
            </div>
          </div>

          <!-- Human-friendly Match Breakdown -->
          <div style="font-size: 0.78rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 6px;">
            Why this mentor is recommended for you:
          </div>
          <div class="waterfall-breakdown">
            <div class="waterfall-col">
              <span class="wf-term-name">🎯 Skill Fit</span>
              <span class="wf-term-val pos">+${t.skill_gap}</span>
              <span style="font-size: 0.68rem; color: var(--text-dim);">${s.covered_skills_count} of ${s.total_gap_skills} skills</span>
            </div>
            <div class="waterfall-col">
              <span class="wf-term-name">📅 Schedule Fit</span>
              <span class="wf-term-val pos">+${t.schedule}</span>
              <span style="font-size: 0.68rem; color: var(--text-dim);">${s.overlap_slots} shared times</span>
            </div>
            <div class="waterfall-col">
              <span class="wf-term-name">⭐ Mentee Rating</span>
              <span class="wf-term-val pos">+${t.rating}</span>
              <span style="font-size: 0.68rem; color: var(--text-dim);">${s.raw_rating}★ verified</span>
            </div>
            <div class="waterfall-col">
              <span class="wf-term-name">⚡ Responsiveness</span>
              <span class="wf-term-val pos">+${t.responsiveness}</span>
              <span style="font-size: 0.68rem; color: var(--text-dim);">Quick answers</span>
            </div>
            <div class="waterfall-col">
              <span class="wf-term-name">⚖️ Open Bandwidth</span>
              <span class="wf-term-val ${t.load_penalty < 0 ? 'neg' : ''}">${t.load_penalty}</span>
              <span style="font-size: 0.68rem; color: var(--text-dim);">${openCapacity} spots free</span>
            </div>
          </div>

          <!-- Explanation bullets -->
          <div style="background: rgba(15, 23, 42, 0.4); border-radius: var(--radius-sm); padding: 10px 14px; margin-bottom: 14px;">
            <div style="font-size: 0.78rem; color: var(--text-muted); line-height: 1.5;">
              ${m.explanation_bullets.map(b => `<div>• ${b}</div>`).join('')}
            </div>
          </div>

          <div style="display: flex; justify-content: flex-end; gap: 10px;">
            ${(window.App && window.App.state.currentUser && window.App.state.currentUser.role !== 'mentee') ? `
              <button class="btn btn-secondary btn-sm" onclick="window.App.switchTab('session-booking')">
                📅 View Booked 1-on-1 Sessions
              </button>
            ` : `
              <button class="btn btn-secondary btn-sm" onclick="window.MatcherUI.openRequestModal('${m.name.replace(/'/g, "\\'")}')">
                💬 Request Help Topic
              </button>
              <button class="btn btn-primary btn-sm" onclick="window.MatcherUI.openBookingFor('${m.mentor_id}', '1:1 Mentorship with ${m.name.replace(/'/g, "\\'")}: ${((m.skill_names && m.skill_names.length > 0) ? m.skill_names.slice(0, 3).join(', ') : m.headline).replace(/'/g, "\\'")}')">
                📅 Book 1-on-1 with ${m.name.split(' ')[0]}
              </button>
            `}
          </div>
        </div>
      `;
    }).join('');
  },

  openBookingFor: async function (mentorId, defaultTopic) {
    if (window.BookingUI) {
      window.BookingUI.selectedMentorId = mentorId;
      window.BookingUI.pendingTopic = defaultTopic;
      window.BookingUI.selectedDayIdx = null;
      window.BookingUI.selectedTimeLabel = null;
      window.BookingUI.selectedSlotIdx = null;
      window.App.switchTab('session-booking');
      await window.BookingUI.selectMentorForBooking(mentorId, defaultTopic);
    }
  },

  openRequestModal: function (mentorName) {
    const modal = document.getElementById('request-help-modal');
    const inputTopic = document.getElementById('req-topic');
    if (inputTopic) inputTopic.value = `Guidance from ${mentorName}`;
    window.App.openModal('request-help-modal');
  },

  submitHelpRequest: async function () {
    const topic = document.getElementById('req-topic').value;
    const skill = document.getElementById('req-skill').value;
    const urgency = document.getElementById('req-urgency').value;

    const res = await window.App.apiPost('/api/requests/create', {
      topic: topic,
      skill_name: skill,
      urgency: urgency
    });

    if (res && res.status === 'created') {
      window.App.showToast("Skill-help request broadcasted to mentors!", "success");
      window.App.closeModal('request-help-modal');
    }
  },

  openSkillGapModal: async function () {
    const res = await window.App.apiGet('/api/skills');
    if (!res) return;

    const listEl = document.getElementById('skill-pills-selector');
    if (!listEl) return;

    const gapIds = new Set(res.mentee_gaps.map(g => g.skill_id));

    listEl.innerHTML = res.all_skills.map(s => {
      const isSel = gapIds.has(s.skill_id);
      return `
        <div class="skill-pill ${isSel ? 'selected' : ''}" 
             data-skill-id="${s.skill_id}" 
             onclick="this.classList.toggle('selected');">
          ${s.skill_name} <span style="font-size: 0.65rem; opacity: 0.7;">(${s.category})</span>
        </div>
      `;
    }).join('');

    window.App.openModal('skill-gaps-modal');
  },

  saveSkillGaps: async function () {
    const selected = [];
    document.querySelectorAll('#skill-pills-selector .skill-pill.selected').forEach(el => {
      selected.push(el.getAttribute('data-skill-id'));
    });

    const res = await window.App.apiPost('/api/skills/update-gaps', { skill_ids: selected });
    if (res && res.status === 'updated') {
      window.App.showToast(`Updated mentee target gap skills (${selected.length} skills)`, 'success');
      window.App.closeModal('skill-gaps-modal');
      this.load();
    }
  },

  openAddMentorModal: async function () {
    const res = await window.App.apiGet('/api/skills');
    if (!res) return;

    const listEl = document.getElementById('mentor-skills-selector');
    if (listEl) {
      listEl.innerHTML = res.all_skills.map((s, idx) => `
        <div class="skill-pill ${idx < 3 ? 'selected' : ''}" 
             data-skill-id="${s.skill_id}" 
             onclick="this.classList.toggle('selected');">
          ${s.skill_name} <span style="font-size: 0.65rem; opacity: 0.7;">(${s.category})</span>
        </div>
      `).join('');
    }

    // Render 14 availability slots
    const calEl = document.getElementById('new-mentor-cal-matrix');
    if (calEl) {
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      calEl.innerHTML = days.map((day, dIdx) => `
        <div class="cal-day-col" data-day-col="${dIdx}">
          <div class="cal-day-header" onclick="window.MatcherUI.toggleMentorDaySlots(${dIdx})" title="Click to toggle ${day} availability">${day}</div>
          <button type="button" class="cal-slot-btn available selected" data-slot="${dIdx*2}" onclick="this.classList.toggle('selected'); this.classList.toggle('available');">
            10:00 AM
          </button>
          <button type="button" class="cal-slot-btn available selected" data-slot="${dIdx*2+1}" onclick="this.classList.toggle('selected'); this.classList.toggle('available');">
            03:00 PM
          </button>
        </div>
      `).join('');
    }

    window.App.openModal('add-mentor-modal');
  },

  toggleMentorDaySlots: function (dIdx) {
    const col = document.querySelector(`#new-mentor-cal-matrix .cal-day-col[data-day-col="${dIdx}"]`);
    if (!col) return;
    const btns = col.querySelectorAll('.cal-slot-btn');
    const anySelected = Array.from(btns).some(b => b.classList.contains('selected'));
    btns.forEach(b => {
      b.classList.toggle('selected', !anySelected);
      b.classList.toggle('available', !anySelected);
    });
  },

  submitAddMentor: async function () {
    const name = document.getElementById('new-mentor-name').value.trim();
    const email = document.getElementById('new-mentor-email').value.trim();
    const headline = document.getElementById('new-mentor-headline').value.trim() || 'Senior Software Engineer & Contributor';
    const capacity = parseInt(document.getElementById('new-mentor-capacity').value || 4);

    if (!name || !email) {
      window.App.showToast("Please provide both mentor name and email.", "error");
      return;
    }

    const selectedSkills = [];
    document.querySelectorAll('#mentor-skills-selector .skill-pill.selected').forEach(el => {
      selectedSkills.push(el.getAttribute('data-skill-id'));
    });

    const availSlots = new Array(14).fill(0);
    document.querySelectorAll('#new-mentor-cal-matrix .cal-slot-btn.selected').forEach(el => {
      const slot = parseInt(el.getAttribute('data-slot'));
      if (!isNaN(slot) && slot >= 0 && slot < 14) {
        availSlots[slot] = 1;
      }
    });

    const res = await window.App.apiPost('/api/mentors/create', {
      name: name,
      email: email,
      headline: headline,
      capacity: capacity,
      skills: selectedSkills,
      availability_slots: availSlots
    });

    if (res && res.status === 'created') {
      window.App.showToast(`Mentor ${res.name} onboarded successfully! Added to XMM pool.`, 'success');
      window.App.closeModal('add-mentor-modal');
      await this.load();
      await window.BookingUI.fetchMentors();
    }
  }
};

window.addEventListener('DOMContentLoaded', () => {
  window.MatcherUI.init();
});
