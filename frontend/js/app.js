/**
 * DevOnboard - Central Application Engine & State Management
 */

window.App = {
  state: {
    isAuthenticated: false,
    activeTab: 'home',
    currentUser: null,
    currentProject: null,
    projects: [],
    users: [],
    tauThreshold: 0.37,
    lambdaWeight: 0.75,
    beta5LoadWeight: 0.30
  },

  init: async function () {
    console.log("Initializing DevOnboard Platform...");
    this.initTheme();
    this.bindEvents();
    if (window.HomeUI) window.HomeUI.init();
    await this.fetchHealth();
    await this.fetchUsers();
    await this.fetchProjects();

    const savedToken = localStorage.getItem('devonboard_token');
    const savedUserId = localStorage.getItem('devonboard_user_id');

    if (savedToken && savedUserId) {
      await this.loginWithSavedSession(savedUserId);
    } else {
      // Default to showing the login page first so the user can experience the login flow!
      this.showAuthView();
    }
  },

  initTheme: function () {
    let savedTheme = localStorage.getItem('devonboard_theme') || 'dark';
    if (savedTheme === 'creme') savedTheme = 'light';
    if (savedTheme === 'fieldguide') savedTheme = 'dark';
    this.applyTheme(savedTheme);
  },

  applyTheme: function (theme) {
    const label = document.getElementById('theme-label');
    const icon = document.getElementById('theme-icon');
    if (theme === 'light') {
      document.body.classList.remove('theme-dark');
      document.body.classList.add('theme-light');
      document.body.classList.add('theme-creme');
      if (label) label.textContent = 'Light Mode';
      if (icon) {
        icon.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>';
      }
    } else {
      document.body.classList.remove('theme-light', 'theme-creme');
      document.body.classList.add('theme-dark');
      if (label) label.textContent = 'Dark Mode';
      if (icon) {
        icon.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>';
      }
    }
    localStorage.setItem('devonboard_theme', theme);
  },

  toggleTheme: function () {
    const isDark = document.body.classList.contains('theme-dark') || (!document.body.classList.contains('theme-light') && !document.body.classList.contains('theme-creme'));
    const next = isDark ? 'light' : 'dark';
    this.applyTheme(next);
    this.showToast(`Switched to ${next === 'dark' ? 'Dark Mode' : 'Light Mode'}`, 'info');
  },

  cycleWorkspace: async function () {
    if (!this.state.projects || this.state.projects.length === 0) return;
    const currentId = this.state.currentProject ? this.state.currentProject.project_id : '';
    const currentIndex = this.state.projects.findIndex(p => p.project_id === currentId);
    const nextIndex = (currentIndex + 1) % this.state.projects.length;
    const nextProject = this.state.projects[nextIndex];
    if (nextProject) {
      await this.switchProject(nextProject.project_id);
    }
  },

  showAuthView: function () {
    this.state.isAuthenticated = false;
    const appEl = document.getElementById('app-container');
    const authEl = document.getElementById('auth-view');
    const cliDrawer = document.getElementById('cli-drawer');
    if (appEl) appEl.style.display = 'none';
    if (authEl) authEl.style.display = 'flex';
    if (cliDrawer) {
      cliDrawer.style.display = 'none';
      cliDrawer.classList.remove('open');
    }
    document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
  },

  showAppView: function () {
    this.state.isAuthenticated = true;
    const appEl = document.getElementById('app-container');
    const authEl = document.getElementById('auth-view');
    const cliDrawer = document.getElementById('cli-drawer');
    if (authEl) authEl.style.display = 'none';
    if (appEl) appEl.style.display = 'flex';
    if (cliDrawer) {
      cliDrawer.style.display = 'flex';
      cliDrawer.classList.remove('open');
    }
  },

  switchAuthTab: function (tab) {
    const loginForm = document.getElementById('auth-login-form');
    const regForm = document.getElementById('auth-register-form');
    const tabLogin = document.getElementById('tab-login-btn');
    const tabReg = document.getElementById('tab-register-btn');

    if (tab === 'login') {
      if (loginForm) loginForm.style.display = 'block';
      if (regForm) regForm.style.display = 'none';
      if (tabLogin) tabLogin.classList.add('active');
      if (tabReg) tabReg.classList.remove('active');
    } else {
      if (loginForm) loginForm.style.display = 'none';
      if (regForm) regForm.style.display = 'block';
      if (tabLogin) tabLogin.classList.remove('active');
      if (tabReg) tabReg.classList.add('active');
      this.populateRegisterSkills();
    }
  },

  selectRegisterRole: function (role) {
    const cardMentee = document.getElementById('choice-role-mentee');
    const cardMentor = document.getElementById('choice-role-mentor');
    const roleInput = document.getElementById('reg-role');
    const menteeFields = document.getElementById('reg-mentee-fields');
    const mentorFields = document.getElementById('reg-mentor-fields');
    const submitBtn = document.getElementById('reg-submit-btn');

    if (roleInput) roleInput.value = role;

    if (role === 'mentee') {
      if (cardMentee) cardMentee.classList.add('selected');
      if (cardMentor) cardMentor.classList.remove('selected');
      if (menteeFields) menteeFields.style.display = 'block';
      if (mentorFields) mentorFields.style.display = 'none';
      if (submitBtn) submitBtn.textContent = 'Create Mentee Account & Enter ↗';
    } else {
      if (cardMentee) cardMentee.classList.remove('selected');
      if (cardMentor) cardMentor.classList.add('selected');
      if (menteeFields) menteeFields.style.display = 'none';
      if (mentorFields) mentorFields.style.display = 'block';
      if (submitBtn) submitBtn.textContent = 'Onboard as Senior Mentor ↗';
    }
    this.populateRegisterSkills();
  },

  populateRegisterSkills: async function () {
    const menteeEl = document.getElementById('reg-mentee-skills');
    const mentorEl = document.getElementById('reg-mentor-skills');
    if (!menteeEl && !mentorEl) return;
    if (menteeEl && menteeEl.children.length > 0) return;

    const res = await this.apiGet('/api/skills');
    if (!res || !res.all_skills) return;

    if (menteeEl) {
      menteeEl.innerHTML = res.all_skills.map((s, idx) => `
        <div class="skill-pill ${idx < 3 ? 'selected' : ''}" 
             data-skill-id="${s.skill_id}" 
             onclick="this.classList.toggle('selected');">
          ${s.skill_name} <span style="font-size: 0.65rem; opacity: 0.7;">(${s.category})</span>
        </div>
      `).join('');
    }

    if (mentorEl) {
      mentorEl.innerHTML = res.all_skills.map((s, idx) => `
        <div class="skill-pill ${idx >= 2 && idx < 6 ? 'selected' : ''}" 
             data-skill-id="${s.skill_id}" 
             onclick="this.classList.toggle('selected');">
          ${s.skill_name} <span style="font-size: 0.65rem; opacity: 0.7;">(${s.category})</span>
        </div>
      `).join('');
    }
  },

  handleGithubLogin: async function () {
    this.showToast("Authenticating via GitHub OAuth...", "info");
    const res = await this.apiPost('/api/auth/login', { user_id: 'usr_mentee_alex' });
    if (res && res.status === 'authenticated') {
      localStorage.setItem('devonboard_token', res.token);
      localStorage.setItem('devonboard_user_id', res.user.user_id);
      await this.fetchCurrentUser();
      this.showAppView();
      this.switchTab(this.state.activeTab);
      this.showToast(`GitHub OAuth Verified. Welcome, ${res.user.name}!`, "success");
    }
  },

  handleCredentialsLogin: async function (e) {
    if (e) e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const res = await this.apiPost('/api/auth/login', { email: email });
    if (res && res.status === 'authenticated') {
      localStorage.setItem('devonboard_token', res.token);
      localStorage.setItem('devonboard_user_id', res.user.user_id);
      await this.fetchCurrentUser();
      this.showAppView();
      this.switchTab(this.state.activeTab);
      this.showToast(`Authenticated as ${res.user.name} (${res.user.role.toUpperCase()})`, "success");
    }
  },

  handleRegister: async function (e) {
    if (e) e.preventDefault();
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const role = document.getElementById('reg-role').value;

    if (!name || !email) {
      this.showToast("Please provide your name and email.", "error");
      return;
    }

    let payload = { name, email, role };

    if (role === 'mentee') {
      const targetRole = document.getElementById('reg-target-role').value;
      const selectedGaps = [];
      document.querySelectorAll('#reg-mentee-skills .skill-pill.selected').forEach(el => {
        selectedGaps.push(el.getAttribute('data-skill-id'));
      });
      payload.target_role = targetRole;
      payload.gap_skills = selectedGaps.length > 0 ? selectedGaps : ['skill_py', 'skill_rag'];
    } else {
      const headline = document.getElementById('reg-mentor-headline').value.trim() || 'Senior Software Engineer & Contributor';
      const capacity = parseInt(document.getElementById('reg-mentor-capacity').value || 4);
      const selectedSkills = [];
      document.querySelectorAll('#reg-mentor-skills .skill-pill.selected').forEach(el => {
        selectedSkills.push(el.getAttribute('data-skill-id'));
      });
      payload.headline = headline;
      payload.capacity = capacity;
      payload.skills = selectedSkills.length > 0 ? selectedSkills : ['skill_py', 'skill_rag', 'skill_docker'];
    }

    const res = await this.apiPost('/api/auth/register', payload);
    if (res && res.status === 'registered') {
      localStorage.setItem('devonboard_token', res.token);
      localStorage.setItem('devonboard_user_id', res.user.user_id);
      await this.fetchCurrentUser();
      this.showAppView();
      this.switchTab(this.state.activeTab);
      this.showToast(`Account created for ${res.user.name} (${res.user.role.toUpperCase()})! Welcome aboard.`, "success");
    }
  },

  quickLogin: async function (userId) {
    const res = await this.apiPost('/api/auth/login', { user_id: userId });
    if (res && res.status === 'authenticated') {
      localStorage.setItem('devonboard_token', res.token);
      localStorage.setItem('devonboard_user_id', res.user.user_id);
      await this.fetchCurrentUser();
      this.showAppView();
      this.switchTab(this.state.activeTab);
      this.showToast(`Signed in as ${res.user.name} (${res.user.role.toUpperCase()})`, "success");
    }
  },

  loginWithSavedSession: async function (userId) {
    await this.apiPost('/api/auth/switch-user', { user_id: userId });
    await this.fetchCurrentUser();
    this.showAppView();
    this.switchTab(this.state.activeTab);
  },

  logout: async function () {
    localStorage.removeItem('devonboard_token');
    localStorage.removeItem('devonboard_user_id');
    const cliDrawer = document.getElementById('cli-drawer');
    if (cliDrawer) {
      cliDrawer.classList.remove('open');
      cliDrawer.style.display = 'none';
    }
    document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
    await this.apiPost('/api/auth/logout', {});
    this.showAuthView();
    this.showToast("Signed out. Session ended securely.", "info");
  },

  // Command Palette
  openCommandPalette: function () {
    const m = document.getElementById('command-palette-modal');
    if (!m) return;
    m.classList.add('active');
    const input = document.getElementById('cmd-palette-input');
    if (input) {
      input.value = '';
      input.focus();
    }
    this.filterCommandPalette('');
  },

  closeCommandPalette: function () {
    const m = document.getElementById('command-palette-modal');
    if (m) m.classList.remove('active');
  },

  toggleCommandPalette: function () {
    const m = document.getElementById('command-palette-modal');
    if (m && m.classList.contains('active')) {
      this.closeCommandPalette();
    } else {
      this.openCommandPalette();
    }
  },

  getCommandPaletteItems: function () {
    const isMentor = this.state.currentUser && this.state.currentUser.role !== 'mentee';
    const items = [
      // Navigation
      { group: 'Navigation', icon: '🏠', title: 'Home Dashboard', desc: 'Central onboarding roadmap, quick dock & readiness radar', action: () => this.switchTab('home') },
      { group: 'Navigation', icon: '💬', title: 'Knowledge Assistant & AI', desc: 'Ask questions & search verified guides', action: () => this.switchTab('ai-mentor') },
      ...(!isMentor ? [{ group: 'Navigation', icon: '👥', title: 'Mentor Network', desc: 'Find teammates with open capacity & matching skills', action: () => this.switchTab('mentor-matching') }] : []),
      { group: 'Navigation', icon: '🧭', title: isMentor ? 'Booked 1:1 Mentee Sessions' : 'Learning Path & 1:1 Sessions', desc: isMentor ? 'View mentees who booked a 1:1 session with you' : 'Schedule time with a mentor on video call', action: () => this.switchTab('session-booking') },
      { group: 'Navigation', icon: '💭', title: 'Discussions & Forum', desc: 'Ask questions and discuss best practices', action: () => this.switchTab('community-forum') },
      { group: 'Navigation', icon: '📂', title: 'Repository Documentation', desc: 'Browse and search guides', action: () => this.switchTab('project-workspace') },
      { group: 'Navigation', icon: '📊', title: 'My Progress & Field Notes', desc: 'Check onboarding tasks and readiness score', action: () => this.switchTab('progress-dashboard') },
      { group: 'Navigation', icon: '🧪', title: 'Quality Tests', desc: 'Run automated answer verification tests', action: () => this.switchTab('benchmark-suite') },

      // Theme
      { group: 'Quick Actions', icon: '🌓', title: 'Toggle Dark / Light Mode', desc: 'Switch between Dark Mode (Black & Gradient Brown) and Light Mode', action: () => this.toggleTheme() },

      // Mentors (Mentee view only)
      ...(!isMentor ? [
        { group: 'Team Mentors', icon: '👤', title: 'Dr. Elena Rostova', desc: 'Principal AI Systems Researcher & Gate Designer', action: () => window.MatcherUI.openBookingFor('usr_mentor_elena', '1:1 Onboarding Mentorship with Dr. Elena Rostova') },
        { group: 'Team Mentors', icon: '👤', title: 'David Chen', desc: 'Staff Cloud Infrastructure Architect', action: () => window.MatcherUI.openBookingFor('usr_mentor_david', '1:1 Onboarding Mentorship with David Chen') },
        { group: 'Team Mentors', icon: '👤', title: 'Sarah Jenkins', desc: 'Senior Full-Stack & UI/UX Systems Lead', action: () => window.MatcherUI.openBookingFor('usr_mentor_sarah', '1:1 Onboarding Mentorship with Sarah Jenkins') },
        { group: 'Team Mentors', icon: '👤', title: 'Rajesh Patel', desc: 'High-Performance Systems & CUDA Specialist', action: () => window.MatcherUI.openBookingFor('usr_mentor_raj', '1:1 Onboarding Mentorship with Rajesh Patel') },
        { group: 'Quick Actions', icon: '🎯', title: 'Edit My Learning Skills', desc: 'Choose what skills you want mentorship on', action: () => window.MatcherUI.openSkillGapModal() }
      ] : []),

      // Actions
      { group: 'Quick Actions', icon: '⌨️', title: 'Open Developer Terminal', desc: 'Run devonboard CLI commands (Ctrl+~)', action: () => window.WorkbenchUI.toggleTerminal() },
      { group: 'Quick Actions', icon: '🔊', title: 'Toggle Sound Effects', desc: 'Enable/disable click audio feedback', action: () => window.WorkbenchUI.toggleSound() },
      { group: 'Quick Actions', icon: '🚪', title: 'Sign Out to Login Portal', desc: 'End session and return to login', action: () => this.logout() }
    ];
    return items;
  },

  filterCommandPalette: function (query) {
    const listEl = document.getElementById('cmd-palette-results');
    if (!listEl) return;

    const q = (query || '').toLowerCase().trim();
    const items = this.getCommandPaletteItems().filter(item => {
      if (!q) return true;
      return item.title.toLowerCase().includes(q) || 
             item.desc.toLowerCase().includes(q) || 
             item.group.toLowerCase().includes(q);
    });

    if (items.length === 0) {
      listEl.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 0.85rem;">No matching commands or navigation items found for "${query}"</div>`;
      return;
    }

    let currentGroup = '';
    let html = '';

    items.forEach((item, idx) => {
      if (item.group !== currentGroup) {
        currentGroup = item.group;
        html += `<div class="cmd-palette-group-title">${currentGroup}</div>`;
      }
      html += `
        <div class="cmd-palette-item ${idx === 0 ? 'selected' : ''}" onclick="window.App.executeCommandPaletteItem(${idx})">
          <div class="cmd-palette-item-left">
            <span class="cmd-palette-item-icon">${item.icon}</span>
            <div>
              <div class="cmd-palette-item-title">${item.title}</div>
              <div class="cmd-palette-item-desc">${item.desc}</div>
            </div>
          </div>
          <span class="cmd-palette-item-badge">${item.group}</span>
        </div>
      `;
    });

    listEl.innerHTML = html;
    this._currentPaletteItems = items;
  },

  executeCommandPaletteItem: function (idx) {
    if (this._currentPaletteItems && this._currentPaletteItems[idx]) {
      const item = this._currentPaletteItems[idx];
      this.closeCommandPalette();
      if (item.action) item.action();
    }
  },

  bindEvents: function () {
    // Tab Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const tab = item.getAttribute('data-tab');
        if (tab) {
          this.switchTab(tab);
        }
      });
    });

    // Project Switcher
    const projSelect = document.getElementById('project-select');
    if (projSelect) {
      projSelect.addEventListener('change', async (e) => {
        await this.switchProject(e.target.value);
      });
    }

    // Persona Switcher
    document.querySelectorAll('.persona-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const userId = btn.getAttribute('data-user-id');
        if (userId) {
          await this.switchUser(userId);
        }
      });
    });

    // Global Cmd+K / Ctrl+K Shortcut & Escape
    window.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        this.toggleCommandPalette();
      } else if (e.key === 'Escape') {
        const cmdModal = document.getElementById('command-palette-modal');
        if (cmdModal && cmdModal.classList.contains('active')) {
          this.closeCommandPalette();
        }
      }
    });
  },

  // API Utilities
  apiGet: async function (url) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error(`API GET ${url} error:`, err);
      this.showToast(`Error fetching data: ${err.message}`, 'error');
      return null;
    }
  },

  apiPost: async function (url, body) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      console.error(`API POST ${url} error:`, err);
      this.showToast(err.message, 'error');
      return null;
    }
  },

  // Health and System Stats
  fetchHealth: async function () {
    const health = await this.apiGet('/api/health');
    if (health) {
      const passEl = document.getElementById('indexed-passages-count');
      if (passEl) passEl.textContent = health.passages_indexed;
      const vocabEl = document.getElementById('vocab-terms-count');
      if (vocabEl) vocabEl.textContent = health.vocab_size;
    }
  },

  // Projects
  fetchProjects: async function () {
    const data = await this.apiGet('/api/projects');
    if (data && data.projects) {
      this.state.projects = data.projects;
      const select = document.getElementById('project-select');
      const wsNameEl = document.getElementById('sidebar-ws-name');

      if (select) {
        select.innerHTML = '';
        data.projects.forEach(p => {
          const opt = document.createElement('option');
          opt.value = p.project_id;
          opt.textContent = p.name;
          if (p.project_id === data.active_project_id) {
            opt.selected = true;
            this.state.currentProject = p;
            if (wsNameEl) wsNameEl.textContent = p.name;
          }
          select.appendChild(opt);
        });
      }
      if (!this.state.currentProject && data.projects.length > 0) {
        this.state.currentProject = data.projects[0];
        if (wsNameEl) wsNameEl.textContent = data.projects[0].name;
      }
    }
  },

  switchProject: async function (projectId) {
    const res = await this.apiPost('/api/projects/switch', { project_id: projectId });
    if (res && res.status === 'switched') {
      const p = this.state.projects.find(x => x.project_id === projectId);
      if (p) {
        this.state.currentProject = p;
        const wsNameEl = document.getElementById('sidebar-ws-name');
        if (wsNameEl) wsNameEl.textContent = p.name;
      }
      this.showToast(`Switched active workspace to ${p ? p.name : projectId}`, 'success');
      // Refresh active tab views
      this.refreshCurrentView();
    }
  },

  // Users & Personas
  fetchUsers: async function () {
    const users = await this.apiGet('/api/users');
    if (users) {
      this.state.users = users;
    }
  },

  fetchCurrentUser: async function () {
    const user = await this.apiGet('/api/auth/me');
    if (user) {
      this.state.currentUser = user;
      this.renderUserBadge(user);
      this.highlightPersonaBtn(user.user_id);
    }
  },

  switchUser: async function (userId) {
    const res = await this.apiPost('/api/auth/switch-user', { user_id: userId });
    if (res && res.status === 'switched') {
      await this.fetchCurrentUser();
      this.showToast(`Switched persona to ${this.state.currentUser.name} (${this.state.currentUser.role})`, 'success');
      this.refreshCurrentView();
    }
  },

  renderUserBadge: function (user) {
    if (!user) return;
    const nameEl = document.getElementById('header-user-name');
    const roleEl = document.getElementById('header-user-role');
    const avatarEl = document.getElementById('header-user-avatar');
    const initialsEl = document.getElementById('header-avatar-initials');

    if (nameEl) nameEl.textContent = user.name;
    if (roleEl) roleEl.textContent = user.role.toUpperCase();
    if (avatarEl && user.avatar) avatarEl.src = user.avatar;

    if (initialsEl && user.name) {
      const parts = user.name.trim().split(/\s+/);
      const initials = parts.length > 1 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : user.name.slice(0, 2).toUpperCase();
      initialsEl.textContent = initials;
      initialsEl.title = `${user.name} (${user.role.toUpperCase()}) — Click to view profile details`;
    }

    // Update role-aware session & mentor-network visibility across sidebar & home quick dock
    const isMentor = user.role !== 'mentee';
    const navMentorNet = document.getElementById('nav-item-mentor-network');
    if (navMentorNet) {
      navMentorNet.style.display = isMentor ? 'none' : '';
    }

    const navHomeItem = document.querySelector('.nav-item[data-tab="home"] span:not(.icon)');
    if (navHomeItem) {
      navHomeItem.textContent = isMentor ? 'Mentor Home' : 'Home';
    }
    const navProgressItem = document.querySelector('.nav-item[data-tab="progress-dashboard"] span:not(.icon)');
    if (navProgressItem) {
      navProgressItem.textContent = isMentor ? 'My Mentees' : 'My Progress';
    }

    const navSessionLbl = document.getElementById('nav-session-label');
    if (navSessionLbl) {
      navSessionLbl.textContent = isMentor ? 'My 1:1s' : '1:1 Sessions';
    }

    if (isMentor && this.state.activeTab === 'mentor-matching') {
      this.state.activeTab = 'home';
    }

    if (window.HomeUI && typeof window.HomeUI.load === 'function') {
      window.HomeUI.load();
    }
    if (window.BookingUI && window.BookingUI.applyRoleLayout) {
      window.BookingUI.applyRoleLayout();
    }
  },

  openUserProfileModal: async function () {
    // Refresh current user from backend so stats & skills are up to date
    await this.fetchCurrentUser();
    const user = this.state.currentUser;
    const bodyEl = document.getElementById('user-profile-modal-body');
    if (!user || !bodyEl) return;

    const projName = this.state.currentProject ? this.state.currentProject.name : 'DevOnboard Platform';
    const roleLabel = user.role === 'mentor' ? 'SENIOR MENTOR' : user.role === 'admin' ? 'PLATFORM MAINTAINER' : 'DEVELOPER MENTEE';
    const roleBadgeBg = user.role === 'mentor' ? 'rgba(43, 110, 72, 0.16)' : user.role === 'admin' ? 'rgba(217, 119, 6, 0.18)' : 'rgba(184, 115, 51, 0.16)';
    const roleBadgeColor = user.role === 'mentor' ? 'var(--accent-green)' : user.role === 'admin' ? 'var(--accent-amber)' : 'var(--accent-brown)';

    let roleSpecificHtml = '';

    if (user.role === 'mentee') {
      const mp = user.mentee_profile || {};
      const gaps = user.gap_skills || [];
      const readiness = mp.readiness_score !== undefined ? mp.readiness_score : 52;
      const targetRole = mp.target_role || 'Full-Stack & Python Contributor';
      const currentStep = mp.current_step || 'Environment & Architecture Onboarding';
      const sessionsBooked = user.sessions_count !== undefined ? user.sessions_count : 2;

      const skillsPills = gaps.length > 0
        ? gaps.map(g => `<span class="chip" style="font-size: 0.72rem; background: var(--bg-card-subtle); border-color: var(--border-main); color: var(--text-main);">${g.skill_name} <span style="opacity:0.65;">(${g.category})</span></span>`).join('')
        : `<span style="font-size: 0.78rem; color: var(--text-muted);">No target skills selected yet.</span>`;

      roleSpecificHtml = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 14px;">
          <div style="background: var(--bg-secondary); border: 1px solid var(--border-main); border-radius: var(--radius-sm); padding: 10px 12px;">
            <div style="font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); font-weight: 700;">Target Role</div>
            <div style="font-size: 0.85rem; font-weight: 700; color: var(--text-main); margin-top: 3px;">${targetRole}</div>
          </div>
          <div style="background: var(--bg-secondary); border: 1px solid var(--border-main); border-radius: var(--radius-sm); padding: 10px 12px;">
            <div style="font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); font-weight: 700;">Active Workspace</div>
            <div style="font-size: 0.85rem; font-weight: 700; color: var(--accent-brown); margin-top: 3px;">${projName}</div>
          </div>
          <div style="background: var(--bg-secondary); border: 1px solid var(--border-main); border-radius: var(--radius-sm); padding: 10px 12px;">
            <div style="font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); font-weight: 700;">Onboarding Readiness</div>
            <div style="font-size: 0.92rem; font-weight: 800; color: var(--accent-green); font-family: var(--font-mono); margin-top: 3px;">${readiness}% Ready</div>
          </div>
          <div style="background: var(--bg-secondary); border: 1px solid var(--border-main); border-radius: var(--radius-sm); padding: 10px 12px;">
            <div style="font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); font-weight: 700;">1:1 Sessions Booked</div>
            <div style="font-size: 0.92rem; font-weight: 800; color: var(--accent-brown); font-family: var(--font-mono); margin-top: 3px;">${sessionsBooked} Sessions</div>
          </div>
        </div>
        <div style="background: var(--bg-secondary); border: 1px solid var(--border-main); border-radius: var(--radius-sm); padding: 10px 12px; margin-bottom: 14px;">
          <div style="font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); font-weight: 700;">Current Onboarding Step</div>
          <div style="font-size: 0.84rem; font-weight: 600; color: var(--text-main); margin-top: 3px;">${currentStep}</div>
        </div>
        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <span style="font-size: 0.75rem; font-weight: 700; color: var(--text-secondary);">Target Skills Currently Learning (${gaps.length}):</span>
            <button class="btn btn-secondary btn-sm" style="padding: 2px 8px; font-size: 0.7rem;" onclick="window.App.closeModal('user-profile-modal'); window.MatcherUI.openSkillGapModal();">Edit Skills</button>
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 6px;">
            ${skillsPills}
          </div>
        </div>
      `;
    } else if (user.role === 'mentor') {
      const mtp = user.mentor_profile || {};
      const skills = user.teaching_skills || [];
      const headline = mtp.headline || 'Senior Engineering Mentor';
      const capacity = mtp.declared_capacity || 4;
      const activeMentees = mtp.active_mentees !== undefined ? mtp.active_mentees : 1;
      const rating = mtp.mean_rating !== undefined ? mtp.mean_rating : 4.95;
      const reviews = mtp.session_count !== undefined ? mtp.session_count : 28;
      const resp = mtp.responsiveness_prior ? Math.round(mtp.responsiveness_prior * 100) : 95;

      const skillsPills = skills.length > 0
        ? skills.map(s => `<span class="chip" style="font-size: 0.72rem; background: var(--bg-card-subtle); border-color: var(--border-main); color: var(--text-main);">${s.skill_name} <strong style="color: var(--accent-brown);">${Math.round((s.depth || 1) * 100)}%</strong></span>`).join('')
        : `<span style="font-size: 0.78rem; color: var(--text-muted);">Core Architecture & Systems Mentorship</span>`;

      roleSpecificHtml = `
        <div style="background: var(--bg-secondary); border: 1px solid var(--border-main); border-radius: var(--radius-sm); padding: 10px 12px; margin-bottom: 12px;">
          <div style="font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); font-weight: 700;">Mentor Specialization Headline</div>
          <div style="font-size: 0.86rem; font-weight: 700; color: var(--text-main); margin-top: 3px;">${headline}</div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 14px;">
          <div style="background: var(--bg-secondary); border: 1px solid var(--border-main); border-radius: var(--radius-sm); padding: 10px 12px;">
            <div style="font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); font-weight: 700;">Mentee Bandwidth</div>
            <div style="font-size: 0.9rem; font-weight: 800; color: var(--accent-green); font-family: var(--font-mono); margin-top: 3px;">${activeMentees} / ${capacity} Active Mentees</div>
          </div>
          <div style="background: var(--bg-secondary); border: 1px solid var(--border-main); border-radius: var(--radius-sm); padding: 10px 12px;">
            <div style="font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); font-weight: 700;">Mentor Rating</div>
            <div style="font-size: 0.9rem; font-weight: 800; color: #f59e0b; font-family: var(--font-mono); margin-top: 3px;">${rating} ★ (${reviews} sessions)</div>
          </div>
          <div style="background: var(--bg-secondary); border: 1px solid var(--border-main); border-radius: var(--radius-sm); padding: 10px 12px;">
            <div style="font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); font-weight: 700;">Responsiveness Rate</div>
            <div style="font-size: 0.9rem; font-weight: 800; color: var(--accent-brown); font-family: var(--font-mono); margin-top: 3px;">${resp}% Fast Reply</div>
          </div>
          <div style="background: var(--bg-secondary); border: 1px solid var(--border-main); border-radius: var(--radius-sm); padding: 10px 12px;">
            <div style="font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); font-weight: 700;">Active Workspace</div>
            <div style="font-size: 0.85rem; font-weight: 700; color: var(--text-main); margin-top: 3px;">${projName}</div>
          </div>
        </div>
        <div>
          <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 6px;">Domain & Teaching Expertise (${skills.length}):</div>
          <div style="display: flex; flex-wrap: wrap; gap: 6px;">
            ${skillsPills}
          </div>
        </div>
      `;
    } else {
      roleSpecificHtml = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px;">
          <div style="background: var(--bg-secondary); border: 1px solid var(--border-main); border-radius: var(--radius-sm); padding: 10px 12px;">
            <div style="font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); font-weight: 700;">Access Level</div>
            <div style="font-size: 0.86rem; font-weight: 700; color: var(--accent-amber); margin-top: 3px;">Full Repository Maintainer</div>
          </div>
          <div style="background: var(--bg-secondary); border: 1px solid var(--border-main); border-radius: var(--radius-sm); padding: 10px 12px;">
            <div style="font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); font-weight: 700;">Active Workspace</div>
            <div style="font-size: 0.86rem; font-weight: 700; color: var(--accent-brown); margin-top: 3px;">${projName}</div>
          </div>
        </div>
      `;
    }

    bodyEl.innerHTML = `
      <div style="display: flex; align-items: center; gap: 16px; padding: 14px; background: var(--bg-card-subtle); border: 1px solid var(--border-main); border-radius: var(--radius-md); margin-bottom: 14px;">
        <img src="${user.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}" alt="${user.name}"
             style="width: 64px; height: 64px; border-radius: 50%; object-fit: cover; border: 2px solid var(--accent-brown); flex-shrink: 0;" />
        <div style="flex: 1; min-width: 0;">
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <span style="font-size: 1.1rem; font-weight: 800; color: var(--text-main);">${user.name}</span>
            <span style="font-size: 0.66rem; font-weight: 800; padding: 2px 8px; border-radius: 999px; background: ${roleBadgeBg}; color: ${roleBadgeColor}; letter-spacing: 0.04em;">
              ${roleLabel}
            </span>
          </div>
          <div style="font-size: 0.8rem; color: var(--accent-brown); font-family: var(--font-mono); margin-top: 3px;">
            ${user.email || 'user@devonboard.internal'}
          </div>
          <div style="font-size: 0.78rem; color: var(--text-secondary); margin-top: 6px; line-height: 1.45;">
            ${user.bio || 'Active contributor on the DevOnboard engineering platform.'}
          </div>
        </div>
      </div>
      ${roleSpecificHtml}
    `;

    this.openModal('user-profile-modal');
  },

  highlightPersonaBtn: function (userId) {
    document.querySelectorAll('.persona-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-user-id') === userId);
    });
  },

  // Tab Navigation
  switchTab: function (tabName) {
    const isMentor = this.state.currentUser && this.state.currentUser.role !== 'mentee';
    if (isMentor && tabName === 'mentor-matching') {
      tabName = 'session-booking';
    }
    this.state.activeTab = tabName;
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.getAttribute('data-tab') === tabName);
    });

    document.querySelectorAll('.tab-pane').forEach(pane => {
      pane.classList.toggle('active', pane.id === `tab-${tabName}`);
    });

    // Update breadcrumb
    const breadcrumbTab = document.getElementById('header-breadcrumb-tab');
    if (breadcrumbTab) {
      const isMentor = this.state.currentUser && this.state.currentUser.role !== 'mentee';
      const names = {
        'home': 'Home',
        'ai-mentor': 'Knowledge Assistant',
        'mentor-matching': 'Mentor Network',
        'session-booking': isMentor ? 'Booked 1:1 Sessions' : 'Learning Path & 1:1 Booking',
        'community-forum': 'Discussions',
        'project-workspace': 'Documentation',
        'progress-dashboard': 'My Progress',
        'benchmark-suite': 'Quality Tests'
      };
      breadcrumbTab.textContent = names[tabName] || tabName;
    }

    // Lazy load or refresh view data
    this.refreshCurrentView();
  },

  refreshCurrentView: function () {
    const tab = this.state.activeTab;
    if (tab === 'home' && window.HomeUI) {
      window.HomeUI.load();
    } else if (tab === 'mentor-matching' && window.MatcherUI) {
      window.MatcherUI.load();
    } else if (tab === 'session-booking' && window.BookingUI) {
      window.BookingUI.load();
    } else if (tab === 'community-forum' && window.ForumUI) {
      window.ForumUI.load();
    } else if (tab === 'project-workspace' && window.WorkspaceUI) {
      window.WorkspaceUI.load();
    } else if (tab === 'progress-dashboard' && window.DashboardUI) {
      window.DashboardUI.load();
    } else if (tab === 'benchmark-suite' && window.DashboardUI) {
      window.DashboardUI.loadBenchmark();
    }
  },

  // Toast Notifications
  showToast: function (msg, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
    toast.innerHTML = `<span>${icon}</span> <span>${msg}</span>`;

    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  },

  // Modals
  openModal: function (modalId) {
    const m = document.getElementById(modalId);
    if (m) m.classList.add('active');
  },

  closeModal: function (modalId) {
    const m = document.getElementById(modalId);
    if (m) m.classList.remove('active');
  }
};

window.addEventListener('DOMContentLoaded', () => {
  window.App.init();
});
