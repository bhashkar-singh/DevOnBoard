/**
 * DevOnboard - Home UI Controller
 * Simple, friendly English interface for both Mentees and Mentors:
 * 1. Mentee Home:
 *    - 4-step onboarding checklist & progress ring
 *    - Next task walkthrough & skill bars
 *    - Available mentors today with 1-click booking
 * 2. Mentor Home:
 *    - Questions waiting for your help (write an answer & save to docs)
 *    - Weekly free times & max mentees
 *    - My mentees & task checklist
 *    - My 1:1 meetings & meeting notes
 */

window.HomeUI = {
  state: {
    streakDays: 4,
    activeFilter: 'all',
    mentorReqFilter: 'open', // 'open' | 'matched' | 'resolved' | 'all'
    mentorReqSearch: '',
    mentorDutyStatus: 'on_duty', // 'on_duty' | 'deep_work'
    mentorDashboard: null,
    draftAvailability: null,
    pathwayPhases: [
      {
        id: 'phase-1',
        title: '1. Setup Your Computer',
        desc: 'Download the code, set up Python, and start the local app.',
        status: 'completed',
        tasks: [
          { id: 't1', title: 'Check Python 3.12 and virtual environment', done: true },
          { id: 't2', title: 'Set up the local database with sample data', done: true },
          { id: 't3', title: 'Start the local server on port 8000', done: true }
        ]
      },
      {
        id: 'phase-2',
        title: '2. Learn How the App Works',
        desc: 'See how login, user roles, and the database work together.',
        status: 'active',
        tasks: [
          { id: 't4', title: 'Follow how a user login request works', done: true },
          { id: 't5', title: 'Check how user roles (Mentee vs Mentor) work', done: false, priority: true },
          { id: 't6', title: 'Look through the main project folders', done: false }
        ]
      },
      {
        id: 'phase-3',
        title: '3. Make Your First Code Change',
        desc: 'Pick a starter task, write code, and run the tests.',
        status: 'upcoming',
        tasks: [
          { id: 't7', title: 'Run the test suite and check that all tests pass', done: false },
          { id: 't8', title: 'Create a branch and submit your first pull request', done: false }
        ]
      },
      {
        id: 'phase-4',
        title: '4. Ready to Contribute',
        desc: 'Review teammate code and help ship new features.',
        status: 'upcoming',
        tasks: [
          { id: 't9', title: 'Join a team code review session', done: false },
          { id: 't10', title: 'Pair with a mentor on a live release check', done: false }
        ]
      }
    ],
    skills: [
      { id: 's1', name: 'Python & Backend APIs', userLevel: 75, targetLevel: 90, category: 'backend' },
      { id: 's2', name: 'AI Search & Docs', userLevel: 50, targetLevel: 85, category: 'backend' },
      { id: 's3', name: 'Database & SQL', userLevel: 65, targetLevel: 80, category: 'systems' },
      { id: 's4', name: 'Caching & Queues', userLevel: 45, targetLevel: 75, category: 'systems' },
      { id: 's5', name: 'Docker & Containers', userLevel: 85, targetLevel: 80, category: 'systems' },
      { id: 's6', name: 'Login & App Security', userLevel: 60, targetLevel: 85, category: 'backend' }
    ]
  },

  init: function () {
    this.load();
  },

  load: function () {
    const currentUser = window.App && window.App.state ? window.App.state.currentUser : null;
    const isMentor = currentUser && currentUser.role !== 'mentee';

    const menteeWs = document.getElementById('mentee-home-workspace');
    const mentorWs = document.getElementById('mentor-home-workspace');

    this.renderGreeting();

    if (isMentor) {
      if (menteeWs) menteeWs.style.display = 'none';
      if (mentorWs) mentorWs.style.display = 'block';
      this.loadMentorWorkspace();
    } else {
      if (menteeWs) menteeWs.style.display = '';
      if (mentorWs) mentorWs.style.display = 'none';
      this.renderPathway();
      this.renderSkillMatrix();
      this.updateProgressMeter();
      this.renderMentorsOnDuty();
    }
  },

  cleanQuestionText: function (rawText) {
    if (!rawText) return '';
    return rawText
      .replace(/^Mentee query abstained by Evidence Gate \([^)]+\):\s*/i, '')
      .replace(/\s*\[Resolved by [^\]]+\]$/i, '')
      .trim();
  },

  renderGreeting: function () {
    const greetingEl = document.getElementById('home-greeting-headline');
    const subtitleEl = document.getElementById('home-greeting-sub');
    const streakEl = document.getElementById('home-streak-badge');
    const rightMetaEl = document.getElementById('home-hero-right-meta');

    const dockCardAi = document.getElementById('dock-card-ai');
    const dockAiTitle = document.getElementById('dock-ai-title');
    const dockAiDesc = document.getElementById('dock-ai-desc');

    const dockMentorCard = document.getElementById('dock-card-mentor-network');
    const dockMentorTitle = document.getElementById('dock-mentor-title');
    const dockMentorDesc = document.getElementById('dock-mentor-desc');

    const dockSessionTitle = document.getElementById('dock-session-title');
    const dockSessionDesc = document.getElementById('dock-session-desc');

    const dockDocsTitle = document.getElementById('dock-docs-title');
    const dockDocsDesc = document.getElementById('dock-docs-desc');

    const currentUser = window.App && window.App.state ? window.App.state.currentUser : null;
    const isMentor = currentUser && currentUser.role !== 'mentee';
    const name = currentUser ? currentUser.name.split(' ')[0] : 'Developer';

    const hour = new Date().getHours();
    const timeGreeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

    if (isMentor) {
      const mp = (this.state.mentorDashboard && this.state.mentorDashboard.profile) || (currentUser && currentUser.mentor_profile) || {};
      const headline = mp.headline || 'Senior Mentor';
      const rating = mp.mean_rating ? Number(mp.mean_rating).toFixed(1) : '4.9';
      const isBusy = this.state.mentorDutyStatus === 'deep_work';

      if (streakEl) {
        streakEl.innerHTML = `👋 MENTOR HOME · ${headline}`;
      }
      if (greetingEl) {
        greetingEl.innerHTML = `${timeGreeting}, <span style="color: var(--accent-brown);">${currentUser.name}</span>`;
      }
      if (subtitleEl) {
        subtitleEl.textContent = 'Answer mentee questions, check off your mentees\' tasks, and set your weekly free times for 1:1 calls.';
      }
      if (rightMetaEl) {
        rightMetaEl.style.display = 'flex';
        rightMetaEl.innerHTML = `
          <div class="mentor-hero-capsule">
            <button type="button" class="mentor-duty-toggle-btn ${isBusy ? 'deep-work' : ''}" onclick="window.HomeUI.toggleMentorDutyStatus()">
              <span class="mentor-duty-dot"></span>
              <span>${isBusy ? 'Busy · Reply Later' : 'Available for Questions'}</span>
            </button>
            <div style="font-size: 0.75rem; color: var(--text-secondary);">
              ⭐ <strong>${rating} / 5.0</strong> Mentor Rating
            </div>
          </div>
        `;
      }

      // Simple, clear Quick Dock Cards for Mentors
      if (dockCardAi) {
        dockCardAi.setAttribute('onclick', "window.HomeUI.scrollToEscalationQueue()");
      }
      if (dockAiTitle) dockAiTitle.textContent = 'Answer Questions';
      if (dockAiDesc) dockAiDesc.textContent = 'Help mentees who are stuck';

      if (dockMentorCard) {
        dockMentorCard.style.display = '';
        dockMentorCard.setAttribute('onclick', "window.App.switchTab('progress-dashboard')");
      }
      if (dockMentorTitle) dockMentorTitle.textContent = 'My Mentees';
      if (dockMentorDesc) dockMentorDesc.textContent = 'Check their progress & tasks';

      if (dockSessionTitle) dockSessionTitle.textContent = 'My 1:1 Meetings';
      if (dockSessionDesc) dockSessionDesc.textContent = 'See who booked a call with you';

      if (dockDocsTitle) dockDocsTitle.textContent = 'Project Docs';
      if (dockDocsDesc) dockDocsDesc.textContent = 'Read or add helpful guides';
    } else {
      if (streakEl) {
        streakEl.textContent = `🔥 ${this.state.streakDays}-Day Learning Streak`;
      }
      if (greetingEl) {
        greetingEl.innerHTML = `${timeGreeting}, <span style="color: var(--accent-brown);">${name}</span>! Welcome to your hub.`;
      }
      if (subtitleEl) {
        subtitleEl.textContent = 'Follow your onboarding steps, ask questions, and connect with a mentor anytime.';
      }
      if (rightMetaEl) {
        rightMetaEl.style.display = 'none';
      }

      if (dockCardAi) {
        dockCardAi.setAttribute('onclick', "window.App.switchTab('ai-mentor')");
      }
      if (dockAiTitle) dockAiTitle.textContent = 'Ask AI Assistant';
      if (dockAiDesc) dockAiDesc.textContent = 'Get quick answers from project docs';

      if (dockMentorCard) {
        dockMentorCard.style.display = '';
        dockMentorCard.setAttribute('onclick', "window.App.switchTab('mentor-matching')");
      }
      if (dockMentorTitle) dockMentorTitle.textContent = 'Find a Mentor';
      if (dockMentorDesc) dockMentorDesc.textContent = 'Match by skills & free times';

      if (dockSessionTitle) dockSessionTitle.textContent = 'Book 1:1 Meeting';
      if (dockSessionDesc) dockSessionDesc.textContent = 'Pick a time for a video call';

      if (dockDocsTitle) dockDocsTitle.textContent = 'Project Docs';
      if (dockDocsDesc) dockDocsDesc.textContent = 'Read setup & code guides';
    }
  },

  toggleMentorDutyStatus: function () {
    this.state.mentorDutyStatus = this.state.mentorDutyStatus === 'on_duty' ? 'deep_work' : 'on_duty';
    this.renderGreeting();
    const msg = this.state.mentorDutyStatus === 'on_duty'
      ? 'You are now shown as Available for Questions.'
      : 'You are now set to Busy — mentees can still leave questions for later.';
    if (window.App && window.App.showToast) {
      window.App.showToast(msg, 'info');
    }
  },

  scrollToEscalationQueue: function () {
    const el = document.getElementById('mentor-escalation-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  },

  /* =========================================================================
   * MENTOR HOME WORKSPACE (SIMPLE ENGLISH)
   * ========================================================================= */
  loadMentorWorkspace: async function () {
    const container = document.getElementById('mentor-home-workspace');
    if (!container) return;

    const data = await window.App.apiGet('/api/mentor/dashboard');
    if (!data) {
      container.innerHTML = `<div class="card"><p style="color: var(--text-muted);">Could not load your mentor dashboard right now.</p></div>`;
      return;
    }

    this.state.mentorDashboard = data;
    const profile = data.profile || {};
    const rawSlots = Array.isArray(profile.availability_slots) && profile.availability_slots.length === 14
      ? profile.availability_slots.slice()
      : [1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0];
    this.state.draftAvailability = rawSlots;

    this.renderGreeting();
    this.renderMentorWorkspace();
  },

  renderMentorWorkspace: function () {
    const container = document.getElementById('mentor-home-workspace');
    if (!container || !this.state.mentorDashboard) return;

    const data = this.state.mentorDashboard;
    const profile = data.profile || {};
    const requests = Array.isArray(data.requests) ? data.requests : [];
    const sessions = Array.isArray(data.sessions) ? data.sessions : [];
    const mentees = Array.isArray(data.mentees) ? data.mentees : [];

    const openRequests = requests.filter(r => r.status !== 'resolved');
    const matchedRequests = requests.filter(r => r.status !== 'resolved' && r.matched_mentor_id === profile.user_id);
    const resolvedRequests = requests.filter(r => r.status === 'resolved');

    let visibleRequests = requests;
    if (this.state.mentorReqFilter === 'open') {
      visibleRequests = openRequests;
    } else if (this.state.mentorReqFilter === 'matched') {
      visibleRequests = matchedRequests;
    } else if (this.state.mentorReqFilter === 'resolved') {
      visibleRequests = resolvedRequests;
    }

    const q = (this.state.mentorReqSearch || '').trim().toLowerCase();
    if (q) {
      visibleRequests = visibleRequests.filter(r =>
        (r.skill_name || '').toLowerCase().includes(q) ||
        (r.notes || '').toLowerCase().includes(q) ||
        (r.mentee_name || '').toLowerCase().includes(q)
      );
    }

    const upcomingSessions = sessions.filter(s => s.status === 'scheduled');
    const completedSessions = sessions.filter(s => s.status === 'completed');
    const activeMenteesCount = profile.active_mentees !== undefined ? profile.active_mentees : mentees.length;
    const declaredCap = profile.declared_capacity || 4;
    const capPct = Math.min(100, Math.round((activeMenteesCount / Math.max(1, declaredCap)) * 100));
    const ratingVal = profile.mean_rating ? Number(profile.mean_rating).toFixed(1) : '4.9';

    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const slots = this.state.draftAvailability || [1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0];
    const activeSlotCount = slots.filter(v => Number(v) === 1).length;

    const teachingSkills = profile.teaching_skills || {};
    const skillChipsHtml = Object.keys(teachingSkills).map(sk => `
      <span class="chip" style="background: rgba(140, 85, 40, 0.12); color: var(--accent-brown); border-color: rgba(140, 85, 40, 0.28); font-size: 0.73rem; cursor: default;">
        ✓ ${sk}
      </span>
    `).join('');

    // Top Spotlight Banner: Next Question to Answer or Next 1:1 Meeting
    const topEscalation = openRequests[0];
    const nextSession = upcomingSessions[0];
    let spotlightHtml = '';

    if (topEscalation) {
      const cleanQ = this.cleanQuestionText(topEscalation.notes);
      const safeQuery = cleanQ.replace(/'/g, "\\'");
      spotlightHtml = `
        <div class="mentor-spotlight-banner">
          <div style="flex: 1; min-width: 280px;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px; flex-wrap: wrap;">
              <span class="badge badge-escalate">⚡ NEEDS YOUR HELP</span>
              <span class="badge badge-amber">Topic: ${topEscalation.skill_name}</span>
              <span style="font-size: 0.76rem; color: var(--text-muted);">
                From: <strong>${topEscalation.mentee_name || 'Alex Rivera'}</strong>
              </span>
            </div>
            <div style="font-size: 1.02rem; font-weight: 800; color: var(--text-main); margin-bottom: 4px;">
              "${cleanQ}"
            </div>
            <div style="font-size: 0.8rem; color: var(--text-secondary);">
              The AI couldn't find this in the project docs. Write a quick answer to help ${topEscalation.mentee_name || 'your mentee'} and save it to the docs for everyone.
            </div>
          </div>
          <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
            <button class="btn btn-secondary btn-sm" onclick="window.HomeUI.testEscalationInAiGate('${safeQuery}')">
              💬 Try in AI Chat
            </button>
            <button class="btn btn-primary btn-sm" onclick="window.HomeUI.openResolveRequestModal('${topEscalation.id}')">
              ✍️ Write Answer &amp; Save to Docs
            </button>
          </div>
        </div>
      `;
    } else if (nextSession) {
      const safeNotes = (nextSession.notes || '').replace(/'/g, "\\'").replace(/\n/g, '\\n');
      spotlightHtml = `
        <div class="mentor-spotlight-banner" style="border-left-color: var(--accent-green);">
          <div style="flex: 1; min-width: 280px;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
              <span class="badge badge-pass">📅 NEXT 1:1 MEETING</span>
              <span style="font-size: 0.76rem; color: var(--accent-brown); font-weight: 700;">${nextSession.scheduled_time}</span>
            </div>
            <div style="font-size: 1.02rem; font-weight: 800; color: var(--text-main); margin-bottom: 4px;">
              ${nextSession.topic} — with ${nextSession.mentee_name}
            </div>
            <div style="font-size: 0.8rem; color: var(--text-secondary);">
              All mentee questions are answered! You can add meeting notes or join the video call below.
            </div>
          </div>
          <div style="display: flex; gap: 8px; align-items: center;">
            <button class="btn btn-secondary btn-sm" onclick="window.BookingUI.openMentorNoteModal('${nextSession.id}', '${safeNotes}')">
              📝 Meeting Notes
            </button>
            <a href="${nextSession.meet_link || 'https://meet.google.com/new'}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm" style="text-decoration: none;">
              📹 Join Video Call ↗
            </a>
          </div>
        </div>
      `;
    }

    // Left Column Card 1: Questions Waiting for Your Help
    const requestsHtml = visibleRequests.length === 0
      ? `<div style="padding: 24px; text-align: center; background: var(--bg-card-subtle); border-radius: var(--radius-sm); border: 1px dashed var(--border-main); color: var(--text-muted); font-size: 0.85rem;">
           🎉 No open questions right now. Everything is answered!
         </div>`
      : visibleRequests.map(req => {
          const isResolved = req.status === 'resolved';
          const isUrgent = (req.urgency || '').toLowerCase() === 'high';
          const cardStateClass = isResolved ? 'resolved' : isUrgent ? 'urgent' : 'matched';
          const urgencyBadge = isResolved
            ? `<span class="badge badge-pass">✓ ANSWERED</span>`
            : isUrgent
              ? `<span class="badge badge-escalate">🔥 NEEDS ANSWER</span>`
              : `<span class="badge badge-amber">⚡ NEEDS HELP</span>`;

          const cleanQ = this.cleanQuestionText(req.notes);
          const safeQuery = cleanQ.replace(/'/g, "\\'");

          return `
            <div class="mentor-escalation-card ${cardStateClass}">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; flex-wrap: wrap;">
                <div style="display: flex; align-items: center; gap: 11px;">
                  <img src="${req.mentee_avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}" style="width: 38px; height: 38px; border-radius: 50%; object-fit: cover; border: 2px solid var(--border-strong);" />
                  <div>
                    <div style="font-weight: 700; font-size: 0.9rem; color: var(--text-main); display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                      <span>${req.mentee_name || 'Mentee'}</span>
                      <span style="font-weight: 600; font-size: 0.72rem; color: var(--text-muted); background: var(--bg-secondary); padding: 2px 8px; border-radius: 99px; border: 1px solid var(--border-subtle);">
                        ${req.target_role || 'New Developer'}
                      </span>
                    </div>
                    <div style="font-size: 0.74rem; color: var(--text-muted); margin-top: 2px;">
                      Topic: <strong style="color: var(--accent-brown);">${req.skill_name}</strong> · Project: <strong>${req.project_name || 'DevOnboard'}</strong>
                    </div>
                  </div>
                </div>
                ${urgencyBadge}
              </div>

              <div class="mentor-escalation-quote">
                "${cleanQ || 'Asked for help with ' + req.skill_name}"
              </div>

              <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap;">
                <div style="font-size: 0.74rem; color: var(--text-muted); font-weight: 600;">
                  ${req.matched_mentor_id === profile.user_id ? '🎯 Sent to you because you know ' + req.skill_name : '🌐 Open question for any mentor'}
                </div>
                <div style="display: flex; gap: 7px; flex-wrap: wrap;">
                  <button class="btn btn-secondary btn-sm" style="font-size: 0.74rem; padding: 5px 10px;" onclick="window.HomeUI.testEscalationInAiGate('${safeQuery}')">
                    💬 Try in AI Chat
                  </button>
                  <a href="https://meet.google.com/new" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm" style="text-decoration: none; font-size: 0.74rem; padding: 5px 10px;">
                    📹 Quick Call ↗
                  </a>
                  ${!isResolved ? `
                    <button class="btn btn-primary btn-sm" style="font-size: 0.74rem; padding: 5px 12px;" onclick="window.HomeUI.openResolveRequestModal('${req.id}')">
                      ✍️ Write Answer &amp; Save to Docs
                    </button>
                  ` : `
                    <button class="btn btn-secondary btn-sm" style="font-size: 0.74rem; padding: 5px 10px;" onclick="window.App.switchTab('community-forum')">
                      See in Discussions ↗
                    </button>
                  `}
                </div>
              </div>
            </div>
          `;
        }).join('');

    // 7-Day x Morning/Afternoon Free Time Matrix
    const weekMatrixHtml = days.map((dayName, dIdx) => {
      const amIdx = dIdx * 2;
      const pmIdx = dIdx * 2 + 1;
      const amOn = Number(slots[amIdx]) === 1;
      const pmOn = Number(slots[pmIdx]) === 1;
      return `
        <div class="mentor-day-col">
          <div class="mentor-day-header">${dayName}</div>
          <button type="button" class="mentor-slot-btn ${amOn ? 'active' : ''}" onclick="window.HomeUI.toggleMentorAvailSlot(${amIdx})">
            <span>☀️ Morning</span>
            <span style="font-size: 0.62rem;">${amOn ? '✓ Free' : 'Busy'}</span>
          </button>
          <button type="button" class="mentor-slot-btn ${pmOn ? 'active' : ''}" onclick="window.HomeUI.toggleMentorAvailSlot(${pmIdx})">
            <span>🌙 Afternoon</span>
            <span style="font-size: 0.62rem;">${pmOn ? '✓ Free' : 'Busy'}</span>
          </button>
        </div>
      `;
    }).join('');

    // Right Column Card 1: My Mentees & Task Checklist
    const menteesHtml = mentees.map(m => {
      const checklist = Array.isArray(m.checklist) ? m.checklist : [];
      const doneCount = checklist.filter(c => c.completed).length;
      const pct = m.computed_readiness || 0;
      const circumference = 138;
      const dashOffset = circumference - (circumference * pct / 100);

      const gapPills = (m.gap_skills || []).map(g => `
        <span class="chip" style="font-size: 0.7rem; padding: 2px 8px; background: rgba(186, 78, 48, 0.1); color: var(--accent-rust); border-color: rgba(186, 78, 48, 0.28); cursor: default;">
          Learning: ${g.skill}
        </span>
      `).join('');

      const checklistRows = checklist.map(item => `
        <div class="mentor-milestone-row ${item.completed ? 'done' : ''}"
             onclick="window.HomeUI.signOffMenteeMilestone('${item.id}')">
          <div style="display: flex; align-items: center; gap: 9px;">
            <span style="width: 18px; height: 18px; border-radius: 5px; display: inline-flex; align-items: center; justify-content: center; font-size: 0.72rem; font-weight: 800; background: ${item.completed ? 'var(--accent-green)' : 'transparent'}; color: #fff; border: 1.5px solid ${item.completed ? 'var(--accent-green)' : 'var(--border-strong)'}; flex-shrink: 0;">
              ${item.completed ? '✓' : ''}
            </span>
            <span style="font-size: 0.8rem; color: var(--text-main); ${item.completed ? 'text-decoration: line-through; opacity: 0.75;' : 'font-weight: 600;'}">
              ${item.title}
            </span>
          </div>
          <span style="font-size: 0.7rem; font-weight: 800; color: ${item.completed ? 'var(--accent-green)' : 'var(--accent-brown)'}; white-space: nowrap;">
            ${item.completed ? 'Done ✓' : 'Mark Done →'}
          </span>
        </div>
      `).join('');

      return `
        <div class="mentor-cohort-card">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; gap: 10px;">
            <div style="display: flex; align-items: center; gap: 11px;">
              <img src="${m.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}" style="width: 44px; height: 44px; border-radius: 50%; object-fit: cover; border: 2px solid var(--accent-brown);" />
              <div>
                <div style="font-weight: 800; font-size: 0.94rem; color: var(--text-main);">${m.name}</div>
                <div style="font-size: 0.75rem; color: var(--text-muted);">${m.target_role || 'Backend Developer'} · ${doneCount} of ${checklist.length} tasks done</div>
              </div>
            </div>

            <div style="position: relative; width: 52px; height: 52px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;" title="${pct}% Onboarding Progress">
              <svg width="52" height="52" style="transform: rotate(-90deg);">
                <circle stroke="var(--border-main)" stroke-width="5" fill="transparent" r="22" cx="26" cy="26"></circle>
                <circle stroke="var(--accent-green)" stroke-width="5" stroke-dasharray="${circumference}" stroke-dashoffset="${dashOffset}" stroke-linecap="round" fill="transparent" r="22" cx="26" cy="26" style="transition: stroke-dashoffset 0.4s ease;"></circle>
              </svg>
              <span style="position: absolute; font-size: 0.72rem; font-weight: 800; font-family: var(--font-mono); color: var(--text-main);">${pct}%</span>
            </div>
          </div>

          ${gapPills ? `<div style="display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px;">${gapPills}</div>` : ''}

          <div style="font-size: 0.72rem; font-weight: 700; color: var(--text-muted); margin-bottom: 7px;">
            Click any task to mark it done for ${m.name.split(' ')[0]}:
          </div>
          <div style="display: flex; flex-direction: column; gap: 6px;">
            ${checklistRows}
          </div>
        </div>
      `;
    }).join('');

    // Right Column Card 2: My 1:1 Meetings
    const sessionsHtml = sessions.length === 0
      ? `<div style="padding: 18px; text-align: center; color: var(--text-muted); font-size: 0.84rem; background: var(--bg-card-subtle); border-radius: var(--radius-sm); border: 1px dashed var(--border-main);">
           No mentees have booked a 1:1 meeting with you yet.
         </div>`
      : sessions.slice(0, 4).map(s => {
          const isCompleted = s.status === 'completed';
          const isCancelled = s.status === 'cancelled';
          const safeNotes = (s.notes || '').replace(/'/g, "\\'").replace(/\n/g, '\\n');
          return `
            <div style="background: var(--bg-card-subtle); border: 1px solid var(--border-main); border-left: 4px solid ${isCompleted ? 'var(--accent-green)' : isCancelled ? 'var(--accent-rust)' : 'var(--accent-brown)'}; border-radius: var(--radius-sm); padding: 14px; transition: all 0.18s ease;">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 8px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                  <img src="${s.mentee_avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}" style="width: 34px; height: 34px; border-radius: 50%; object-fit: cover; border: 1px solid var(--border-strong);" />
                  <div>
                    <div style="font-weight: 700; font-size: 0.86rem; color: var(--text-main);">With ${s.mentee_name}</div>
                    <div style="font-size: 0.74rem; color: var(--accent-brown); font-weight: 700;">📅 ${s.scheduled_time}</div>
                  </div>
                </div>
                <span class="badge ${isCompleted ? 'badge-pass' : isCancelled ? 'badge-escalate' : 'badge-amber'}">
                  ${isCompleted ? `★ ${s.rating || 5}.0 COMPLETED` : isCancelled ? 'CANCELLED' : 'UPCOMING'}
                </span>
              </div>
              <div style="font-size: 0.81rem; color: var(--text-secondary); margin-bottom: 8px; line-height: 1.4;">
                <strong>Topic:</strong> ${s.topic}
              </div>
              ${s.notes ? `
                <div style="font-size: 0.76rem; color: var(--text-main); background: rgba(43, 110, 72, 0.08); padding: 8px 10px; border-radius: 6px; border-left: 3px solid var(--accent-green); margin-bottom: 10px; white-space: pre-line;">${s.notes}</div>
              ` : ''}
              <div style="display: flex; justify-content: flex-end; gap: 6px; flex-wrap: wrap;">
                <button class="btn btn-secondary btn-sm" style="font-size: 0.73rem; padding: 4px 10px;" onclick="window.BookingUI.openMentorNoteModal('${s.id}', '${safeNotes}')">
                  📝 Meeting Notes
                </button>
                ${!isCompleted && !isCancelled && s.can_cancel_24h ? `
                  <button class="btn btn-secondary btn-sm" style="font-size: 0.73rem; padding: 4px 10px; color: var(--accent-rust); border-color: rgba(186, 78, 48, 0.3);" onclick="window.BookingUI.cancelSession('${s.id}')">
                    ✕ Cancel
                  </button>
                ` : ''}
                ${!isCompleted && !isCancelled ? `
                  <a href="${s.meet_link || 'https://meet.google.com/new'}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm" style="font-size: 0.73rem; padding: 4px 10px; text-decoration: none;">
                    📹 Join Call ↗
                  </a>
                ` : ''}
              </div>
            </div>
          `;
        }).join('');

    container.innerHTML = `
      <!-- Row 1: 4 Simple Summary Cards -->
      <div class="grid-4" style="margin-bottom: 20px;">
        <div class="stat-card" style="border-left: 4px solid var(--accent-rust);">
          <div class="stat-card-top">
            <span class="stat-label">Questions Waiting</span>
            <span class="stat-icon-pill">💬</span>
          </div>
          <div class="stat-value" style="color: ${openRequests.length > 0 ? 'var(--accent-rust)' : 'var(--accent-green)'};">
            ${openRequests.length} <span style="font-size: 0.85rem; font-weight: 600; color: var(--text-muted);">Open</span>
          </div>
          <div class="stat-sub">
            <span style="color: var(--accent-green); font-weight: 700;">✓ ${resolvedRequests.length} answered</span> &amp; saved to docs
          </div>
        </div>

        <div class="stat-card" style="border-left: 4px solid var(--accent-brown);">
          <div class="stat-card-top">
            <span class="stat-label">1:1 Meetings</span>
            <span class="stat-icon-pill">📅</span>
          </div>
          <div class="stat-value">
            ${upcomingSessions.length} <span style="font-size: 0.85rem; font-weight: 600; color: var(--text-muted);">Upcoming</span>
          </div>
          <div class="stat-sub">
            <strong>${completedSessions.length}</strong> finished · <strong>${sessions.length}</strong> total
          </div>
        </div>

        <div class="stat-card" style="border-left: 4px solid var(--accent-green);">
          <div class="stat-card-top">
            <span class="stat-label">My Mentee Spots</span>
            <span class="stat-icon-pill">👥</span>
          </div>
          <div class="stat-value">
            ${activeMenteesCount} of ${declaredCap} <span style="font-size: 0.85rem; font-weight: 600; color: var(--text-muted);">Filled</span>
          </div>
          <div style="height: 5px; background: var(--bg-secondary); border-radius: 99px; overflow: hidden; margin-top: 4px;">
            <div style="width: ${capPct}%; height: 100%; background: var(--accent-green);"></div>
          </div>
        </div>

        <div class="stat-card" style="border-left: 4px solid var(--accent-amber);">
          <div class="stat-card-top">
            <span class="stat-label">My Rating &amp; Free Slots</span>
            <span class="stat-icon-pill">⭐</span>
          </div>
          <div class="stat-value">
            ★ ${ratingVal}
          </div>
          <div class="stat-sub">
            <strong>${activeSlotCount} of 14</strong> weekly slots open
          </div>
        </div>
      </div>

      <!-- Row 2: Top Action Banner -->
      ${spotlightHtml}

      <!-- Row 3: Two-Column Mentor Workspace -->
      <div class="home-main-grid">
        <!-- Left Column: Questions Waiting + Weekly Free Times -->
        <div style="display: flex; flex-direction: column; gap: 22px;">
          <!-- Section 1: Questions Waiting for Your Help -->
          <div class="home-section-card" id="mentor-escalation-section">
            <div class="home-card-header" style="margin-bottom: 12px; flex-wrap: wrap; gap: 10px;">
              <div>
                <h2 class="home-card-title">💬 Questions Waiting for Your Help</h2>
                <p class="home-card-sub">When the AI can't find an answer in the docs, mentees send their question here for a mentor to answer.</p>
              </div>
              <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                <button class="skill-filter-btn ${this.state.mentorReqFilter === 'open' ? 'active' : ''}" onclick="window.HomeUI.setMentorReqFilter('open')">
                  Open (${openRequests.length})
                </button>
                <button class="skill-filter-btn ${this.state.mentorReqFilter === 'matched' ? 'active' : ''}" onclick="window.HomeUI.setMentorReqFilter('matched')">
                  For Me (${matchedRequests.length})
                </button>
                <button class="skill-filter-btn ${this.state.mentorReqFilter === 'resolved' ? 'active' : ''}" onclick="window.HomeUI.setMentorReqFilter('resolved')">
                  Answered (${resolvedRequests.length})
                </button>
                <button class="skill-filter-btn ${this.state.mentorReqFilter === 'all' ? 'active' : ''}" onclick="window.HomeUI.setMentorReqFilter('all')">
                  All (${requests.length})
                </button>
              </div>
            </div>

            <div style="margin-bottom: 14px;">
              <input type="text" class="chat-input" style="width: 100%; padding: 8px 12px; font-size: 0.82rem;"
                     placeholder="🔍 Search questions by topic, mentee name, or keyword..."
                     value="${(this.state.mentorReqSearch || '').replace(/"/g, '&quot;')}"
                     oninput="window.HomeUI.setMentorReqSearch(this.value)" />
            </div>

            <div style="display: flex; flex-direction: column; gap: 12px;">
              ${requestsHtml}
            </div>
          </div>

          <!-- Section 2: My Weekly Free Times -->
          <div class="home-section-card">
            <div class="home-card-header" style="margin-bottom: 10px; flex-wrap: wrap; gap: 10px;">
              <div>
                <h2 class="home-card-title">🗓️ My Weekly Free Times for 1:1 Calls</h2>
                <p class="home-card-sub">Click any Morning or Afternoon box to turn your availability on or off.</p>
              </div>
              <span class="badge badge-pass">${activeSlotCount} of 14 Slots Free</span>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 8px;">
              <div style="display: flex; gap: 6px; flex-wrap: wrap; align-items: center;">
                <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700;">Topics I Teach:</span>
                ${skillChipsHtml}
              </div>
              <div style="display: flex; gap: 6px;">
                <button type="button" class="skill-filter-btn" onclick="window.HomeUI.applyAvailabilityPreset('weekdays')">⚡ All Weekdays</button>
                <button type="button" class="skill-filter-btn" onclick="window.HomeUI.applyAvailabilityPreset('mornings')">🌅 Mornings Only</button>
                <button type="button" class="skill-filter-btn" onclick="window.HomeUI.applyAvailabilityPreset('default')">🔄 Reset</button>
              </div>
            </div>

            <div class="mentor-week-matrix">
              ${weekMatrixHtml}
            </div>

            <div style="display: grid; grid-template-columns: 150px 1fr; gap: 12px; margin-bottom: 14px;">
              <div>
                <label style="font-size: 0.76rem; font-weight: 700; color: var(--text-secondary); display: block; margin-bottom: 4px;">Max Mentees at Once</label>
                <input type="number" id="mentor-cap-input" class="chat-input" min="1" max="10" value="${declaredCap}" style="width: 100%; padding: 8px 12px;" />
              </div>
              <div>
                <label style="font-size: 0.76rem; font-weight: 700; color: var(--text-secondary); display: block; margin-bottom: 4px;">My Role / Title</label>
                <input type="text" id="mentor-headline-input" class="chat-input" value="${(profile.headline || '').replace(/"/g, '&quot;')}" style="width: 100%; padding: 8px 12px;" />
              </div>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; border-top: 1px solid var(--border-subtle); padding-top: 12px;">
              <span style="font-size: 0.76rem; color: var(--text-muted);">
                💡 Mentees can only book 1:1 calls during your green "Free" times.
              </span>
              <button class="btn btn-primary btn-sm" onclick="window.HomeUI.saveMentorAvailability()">
                💾 Save My Free Times
              </button>
            </div>
          </div>
        </div>

        <!-- Right Column: My Mentees + My 1:1 Meetings -->
        <div style="display: flex; flex-direction: column; gap: 22px;">
          <!-- Section 3: My Mentees & Task Checklist -->
          <div class="home-section-card">
            <div class="home-card-header" style="margin-bottom: 12px;">
              <div>
                <h3 class="home-card-title" style="font-size: 1.08rem;">🎓 My Mentees &amp; Onboarding Tasks</h3>
                <p class="home-card-sub">See how your mentees are doing and check off completed tasks</p>
              </div>
              <a href="#" onclick="window.App.switchTab('progress-dashboard'); return false;" style="font-size: 0.78rem; color: var(--accent-brown); text-decoration: none; font-weight: 700;">
                View All ↗
              </a>
            </div>
            <div style="display: flex; flex-direction: column; gap: 14px;">
              ${menteesHtml}
            </div>
          </div>

          <!-- Section 4: My 1:1 Meetings -->
          <div class="home-section-card">
            <div class="home-card-header" style="margin-bottom: 12px;">
              <div>
                <h3 class="home-card-title" style="font-size: 1.08rem;">📅 My 1:1 Meetings</h3>
                <p class="home-card-sub">Calls booked with you, meeting notes, and video links</p>
              </div>
              <a href="#" onclick="window.App.switchTab('session-booking'); return false;" style="font-size: 0.78rem; color: var(--accent-brown); text-decoration: none; font-weight: 700;">
                All Meetings (${sessions.length}) ↗
              </a>
            </div>
            <div style="display: flex; flex-direction: column; gap: 10px;">
              ${sessionsHtml}
            </div>
          </div>
        </div>
      </div>
    `;
  },

  setMentorReqFilter: function (filter) {
    this.state.mentorReqFilter = filter;
    this.renderMentorWorkspace();
  },

  setMentorReqSearch: function (val) {
    this.state.mentorReqSearch = val;
    this.renderMentorWorkspace();
    const inputs = document.querySelectorAll('#mentor-escalation-section input[type="text"]');
    if (inputs.length > 0) {
      const inp = inputs[0];
      inp.focus();
      const len = inp.value.length;
      inp.setSelectionRange(len, len);
    }
  },

  testEscalationInAiGate: function (queryText) {
    window.App.switchTab('ai-mentor');
    setTimeout(() => {
      const input = document.getElementById('chat-input');
      if (input) {
        input.value = queryText || 'How do I configure custom CUDA kernel PagedAttention block tables in vLLM?';
        input.focus();
      }
    }, 80);
  },

  toggleMentorAvailSlot: function (idx) {
    if (!Array.isArray(this.state.draftAvailability)) return;
    this.state.draftAvailability[idx] = Number(this.state.draftAvailability[idx]) === 1 ? 0 : 1;
    this.renderMentorWorkspace();
  },

  applyAvailabilityPreset: function (preset) {
    if (preset === 'weekdays') {
      this.state.draftAvailability = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0];
    } else if (preset === 'mornings') {
      this.state.draftAvailability = [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0];
    } else {
      this.state.draftAvailability = [1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0];
    }
    this.renderMentorWorkspace();
  },

  saveMentorAvailability: async function () {
    const capEl = document.getElementById('mentor-cap-input');
    const headlineEl = document.getElementById('mentor-headline-input');
    const declared_capacity = capEl ? parseInt(capEl.value, 10) || 4 : 4;
    const headline = headlineEl ? headlineEl.value.trim() : '';

    const res = await window.App.apiPost('/api/mentor/update-availability', {
      availability_slots: this.state.draftAvailability,
      declared_capacity: declared_capacity,
      headline: headline
    });

    if (res && res.status === 'updated') {
      window.App.showToast('Your weekly free times and max mentees have been saved! ✓', 'success');
      await this.loadMentorWorkspace();
    }
  },

  openResolveRequestModal: function (reqId) {
    const data = this.state.mentorDashboard;
    const requests = data && Array.isArray(data.requests) ? data.requests : [];
    const req = requests.find(r => r.id === reqId);
    if (!req) return;

    const idEl = document.getElementById('mentor-resolve-req-id');
    const ctxEl = document.getElementById('mentor-resolve-context');
    const titleEl = document.getElementById('mentor-resolve-title');
    const bodyEl = document.getElementById('mentor-resolve-body');
    const indexCheck = document.getElementById('mentor-resolve-index-rag');

    const cleanQ = this.cleanQuestionText(req.notes);

    if (idEl) idEl.value = req.id;
    if (ctxEl) {
      ctxEl.innerHTML = `
        <div style="font-weight: 700; color: var(--text-main); margin-bottom: 4px;">
          Question from ${req.mentee_name || 'Mentee'} · Topic: <span style="color: var(--accent-brown);">${req.skill_name}</span>
        </div>
        <div style="color: var(--text-secondary);">"${cleanQ}"</div>
      `;
    }
    if (titleEl) {
      titleEl.value = `How to fix / set up: ${req.skill_name}`;
    }
    if (bodyEl) {
      bodyEl.value = '';
    }
    if (indexCheck) {
      indexCheck.checked = true;
    }

    window.App.openModal('mentor-resolve-modal');
  },

  submitResolveRequest: async function () {
    const idEl = document.getElementById('mentor-resolve-req-id');
    const titleEl = document.getElementById('mentor-resolve-title');
    const bodyEl = document.getElementById('mentor-resolve-body');
    const indexCheck = document.getElementById('mentor-resolve-index-rag');

    const request_id = idEl ? idEl.value : '';
    const resolution_title = titleEl ? titleEl.value.trim() : '';
    const resolution_notes = bodyEl ? bodyEl.value.trim() : '';
    const index_to_rag = indexCheck ? indexCheck.checked : true;

    if (!resolution_notes) {
      window.App.showToast('Please write your answer before posting.', 'warning');
      return;
    }

    const res = await window.App.apiPost('/api/mentor/resolve-request', {
      request_id,
      resolution_title,
      resolution_notes,
      index_to_rag
    });

    if (res && res.status === 'resolved') {
      window.App.closeModal('mentor-resolve-modal');
      window.App.showToast(
        res.indexed_to_rag
          ? 'Answer posted and saved to Project Docs! 📚'
          : 'Answer posted to Discussions! ✓',
        'success'
      );
      await this.loadMentorWorkspace();
      if (window.ForumUI && typeof window.ForumUI.fetchPosts === 'function') {
        window.ForumUI.fetchPosts();
      }
      if (window.WorkspaceUI && typeof window.WorkspaceUI.fetchDocs === 'function') {
        window.WorkspaceUI.fetchDocs();
      }
    }
  },

  signOffMenteeMilestone: async function (itemId) {
    const res = await window.App.apiPost('/api/mentor/signoff-milestone', {
      item_id: itemId
    });
    if (res && res.status === 'updated') {
      window.App.showToast(
        res.completed
          ? `Task marked done! Mentee progress is now ${res.readiness_pct}% 🎉`
          : `Task unmarked (${res.readiness_pct}% progress).`,
        'success'
      );
      await this.loadMentorWorkspace();
      if (window.DashboardUI && typeof window.DashboardUI.fetchDashboardData === 'function') {
        window.DashboardUI.fetchDashboardData();
      }
    }
  },

  /* =========================================================================
   * MENTEE HOME WORKSPACE METHODS
   * ========================================================================= */
  renderPathway: function () {
    const container = document.getElementById('home-pathway-container');
    if (!container) return;

    container.innerHTML = this.state.pathwayPhases.map((phase, pIdx) => {
      const isCompleted = phase.status === 'completed';
      const isActive = phase.status === 'active';
      const statusPill = isCompleted 
        ? '<span class="phase-pill done">Done ✓</span>'
        : isActive 
          ? '<span class="phase-pill active">In Progress ▶</span>'
          : '<span class="phase-pill upcoming">Up Next</span>';

      const taskListHtml = phase.tasks.map(task => `
        <div class="home-task-item ${task.done ? 'done' : ''} ${task.priority ? 'priority' : ''}" 
             onclick="window.HomeUI.toggleTask('${phase.id}', '${task.id}')">
          <div class="home-task-check ${task.done ? 'checked' : ''}">
            ${task.done ? '✓' : ''}
          </div>
          <div class="home-task-title ${task.done ? 'strikethrough' : ''}">
            ${task.title}
          </div>
          ${task.priority ? '<span class="task-badge-priority">Next Step</span>' : ''}
        </div>
      `).join('');

      return `
        <div class="pathway-phase-card ${isActive ? 'active-phase' : ''}">
          <div class="phase-header" onclick="this.parentElement.classList.toggle('collapsed')">
            <div style="display: flex; align-items: center; gap: 10px;">
              <div class="phase-num-circle ${isCompleted ? 'done' : isActive ? 'active' : ''}">
                ${isCompleted ? '✓' : pIdx + 1}
              </div>
              <div>
                <div class="phase-title">${phase.title}</div>
                <div class="phase-desc">${phase.desc}</div>
              </div>
            </div>
            <div>${statusPill}</div>
          </div>
          <div class="phase-tasks-list">
            ${taskListHtml}
          </div>
        </div>
      `;
    }).join('');
  },

  toggleTask: function (phaseId, taskId) {
    const phase = this.state.pathwayPhases.find(p => p.id === phaseId);
    if (!phase) return;
    const task = phase.tasks.find(t => t.id === taskId);
    if (!task) return;

    task.done = !task.done;
    if (task.done) {
      window.App.showToast(`Done: "${task.title}" 🎉`, 'success');
    }

    const allDone = phase.tasks.every(t => t.done);
    if (allDone) {
      phase.status = 'completed';
      const nextUpcoming = this.state.pathwayPhases.find(p => p.status === 'upcoming');
      if (nextUpcoming) nextUpcoming.status = 'active';
    } else {
      phase.status = 'active';
    }

    this.renderPathway();
    this.updateProgressMeter();
  },

  updateProgressMeter: function () {
    let totalTasks = 0;
    let completedTasks = 0;

    this.state.pathwayPhases.forEach(p => {
      p.tasks.forEach(t => {
        totalTasks++;
        if (t.done) completedTasks++;
      });
    });

    const pct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    const pctEl = document.getElementById('home-readiness-pct');
    const tasksDoneEl = document.getElementById('home-tasks-done-stat');
    const tasksTotalEl = document.getElementById('home-tasks-total-stat');
    const svgCircle = document.getElementById('home-readiness-circle');

    if (pctEl) pctEl.textContent = `${pct}%`;
    if (tasksDoneEl) tasksDoneEl.textContent = completedTasks;
    if (tasksTotalEl) tasksTotalEl.textContent = totalTasks;

    if (svgCircle) {
      const circumference = 283;
      const offset = circumference - (circumference * pct / 100);
      svgCircle.style.strokeDashoffset = offset;
    }
  },

  setSkillFilter: function (filter) {
    this.state.activeFilter = filter;
    document.querySelectorAll('.skill-filter-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-filter') === filter);
    });
    this.renderSkillMatrix();
  },

  renderSkillMatrix: function () {
    const container = document.getElementById('home-skill-matrix-bars');
    if (!container) return;

    const filter = this.state.activeFilter;
    const filteredSkills = this.state.skills.filter(s => {
      if (filter === 'all') return true;
      return s.category === filter;
    });

    container.innerHTML = filteredSkills.map(s => `
      <div class="home-skill-row">
        <div class="home-skill-header">
          <span class="home-skill-name">${s.name}</span>
          <span class="home-skill-nums">
            <strong style="color: var(--accent-brown);">${s.userLevel}%</strong>
            <span style="color: var(--text-muted); font-size: 0.74rem;">/ ${s.targetLevel}% goal</span>
          </span>
        </div>
        <div class="home-skill-track">
          <div class="home-skill-target" style="width: ${s.targetLevel}%;"></div>
          <div class="home-skill-fill" style="width: ${s.userLevel}%;"></div>
        </div>
      </div>
    `).join('');
  },

  renderMentorsOnDuty: async function () {
    const container = document.getElementById('home-mentors-duty-list');
    if (!container) return;

    const titleEl = document.getElementById('home-mentors-duty-title');
    const subEl = document.getElementById('home-mentors-duty-sub');
    const linkEl = document.getElementById('home-mentors-duty-link');

    if (titleEl) titleEl.textContent = 'Available Mentors Today';
    if (subEl) subEl.textContent = 'Teammates with open spots for quick questions or 1:1 calls';
    if (linkEl) {
      linkEl.textContent = 'See All ↗';
      linkEl.setAttribute('onclick', "window.App.switchTab('mentor-matching'); return false;");
    }

    const data = await window.App.apiGet('/api/matching/xmm');
    const list = data ? (data.ranked_mentors || data.rankings || []) : [];
    if (list.length === 0) return;

    const mentors = list.slice(0, 3);
    container.innerHTML = mentors.map(m => {
      const s = m.raw_stats || {};
      const openSlots = s.declared_capacity !== undefined ? Math.max(0, s.declared_capacity - s.active_mentees) : (m.free_capacity || 2);
      const safeName = (m.name || 'Mentor').replace(/'/g, "\\'");
      const safeHeadline = (m.headline || 'Mentor').replace(/'/g, "\\'");
      return `
        <div class="mentor-duty-card">
          <div style="display: flex; align-items: center; gap: 10px;">
            <img src="${m.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}" class="mentor-duty-avatar" />
            <div>
              <div style="font-weight: 700; font-size: 0.86rem; color: var(--text-main);">${m.name}</div>
              <div style="font-size: 0.72rem; color: var(--text-muted);">${m.headline || 'Senior Engineer'}</div>
            </div>
          </div>
          <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 10px; border-top: 1px solid var(--border-subtle); padding-top: 8px;">
            <div style="font-size: 0.72rem; color: var(--accent-green); font-weight: 700;">
              ● ${openSlots} Open Spots
            </div>
            <button class="btn btn-secondary btn-sm" onclick="window.MatcherUI.openBookingFor('${m.mentor_id}', '1:1 Call with ${safeName} (${safeHeadline})')" style="padding: 3px 9px; font-size: 0.72rem;">
              Book 1:1 📅
            </button>
          </div>
        </div>
      `;
    }).join('');
  },

  launchPriorityTask: function () {
    window.App.openModal('home-walkthrough-modal');
  },

  askAboutPriorityTask: function () {
    window.App.switchTab('ai-mentor');
    const input = document.getElementById('chat-input');
    if (input) {
      input.value = 'How does user login and session checking work in this codebase?';
      input.focus();
    }
  }
};
