/**
 * DevOnboard - Developer Workbench & Haptic/Tactile Feedback Controller
 * CLI Terminal Drawer · Haptic & Tactile Audio Engine · Source Inspector · Meet Room · Math Modal
 */

window.WorkbenchUI = {
  soundEnabled: true,
  audioCtx: null,
  _lastToggleTs: 0,
  history: [],
  historyIdx: -1,

  init: function () {
    const saved = localStorage.getItem('devonboard_sound_enabled');
    if (saved !== null) {
      this.soundEnabled = saved === '1';
    }
    this.bindEvents();
    this.renderSoundButtonState();
    this.updatePromptUser();
    this.syncTogglePillState(false);
  },

  initAudio: function () {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext && !this.audioCtx) {
        this.audioCtx = new AudioContext();
      }
    } catch (e) {
      console.warn('Web Audio API not supported', e);
    }
  },

  renderSoundButtonState: function () {
    const soundBtn = document.getElementById('sound-toggle-btn');
    if (soundBtn) {
      soundBtn.classList.toggle('muted', !this.soundEnabled);
      soundBtn.setAttribute('aria-pressed', this.soundEnabled ? 'true' : 'false');
      soundBtn.title = this.soundEnabled
        ? 'Haptic & Sound Feedback is ON (Click to turn OFF)'
        : 'Haptic & Sound Feedback is OFF (Click to turn ON)';

      soundBtn.innerHTML = this.soundEnabled
        ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg><span class="sound-toggle-label">Haptic ON</span>`
        : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" x2="17" y1="9" y2="15"/><line x1="17" x2="23" y1="9" y2="15"/></svg><span class="sound-toggle-label">Haptic OFF</span>`;
    }

    const logoEl = document.getElementById('sidebar-logo-toggle');
    if (logoEl) {
      logoEl.style.opacity = this.soundEnabled ? '1' : '0.45';
      logoEl.style.filter = this.soundEnabled ? 'drop-shadow(0 0 6px rgba(217, 145, 56, 0.45))' : 'grayscale(0.75)';
      logoEl.title = this.soundEnabled
        ? 'Haptic & Sound Feedback: ON (Click logo to turn OFF)'
        : 'Haptic & Sound Feedback: OFF (Click logo to turn ON)';
    }
  },

  toggleSound: function (e) {
    if (e && typeof e.stopPropagation === 'function') {
      e.stopPropagation();
    }
    const nowMs = Date.now();
    if (nowMs - (this._lastToggleTs || 0) < 160) {
      return;
    }
    this._lastToggleTs = nowMs;

    this.soundEnabled = !this.soundEnabled;
    localStorage.setItem('devonboard_sound_enabled', this.soundEnabled ? '1' : '0');
    this.renderSoundButtonState();

    const soundBtn = document.getElementById('sound-toggle-btn');
    const logoEl = document.getElementById('sidebar-logo-toggle');

    if (this.soundEnabled) {
      this.playClickSound('on', soundBtn || logoEl, true);
      if (window.App && window.App.showToast) {
        window.App.showToast('🔊 Haptic & Sound Feedback turned ON', 'success');
      }
    } else {
      // Play a brief descending switch-off click even when turning OFF so the user hears immediate feedback
      this.playClickSound('off', soundBtn || logoEl, true);
      if (window.App && window.App.showToast) {
        window.App.showToast('🔇 Haptic & Sound Feedback turned OFF', 'info');
      }
    }
  },

  playClickSound: function (type = 'click', targetEl = null, forcePlay = false) {
    if (!this.soundEnabled && !forcePlay) return;

    // 1. Hardware vibration haptics (mobile / supported trackpads)
    try {
      if (navigator && typeof navigator.vibrate === 'function') {
        if (type === 'on' || type === 'success') {
          navigator.vibrate([15, 30, 20]);
        } else if (type === 'off') {
          navigator.vibrate(18);
        } else {
          navigator.vibrate(10);
        }
      }
    } catch (e) {
      // Ignore vibration errors
    }

    // 2. Micro-haptic visual spring pulse on the clicked control
    if (targetEl && targetEl.animate) {
      try {
        targetEl.animate(
          [
            { transform: 'scale(1)' },
            { transform: 'scale(0.94)' },
            { transform: 'scale(1.03)' },
            { transform: 'scale(1)' }
          ],
          { duration: 150, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }
        );
      } catch (e) {
        // Ignore animation errors
      }
    }

    // 3. Web Audio tactile mechanical switch + low-end haptic thump synthesis
    try {
      if (!this.audioCtx) {
        this.initAudio();
      }
      if (!this.audioCtx) return;

      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().then(() => {
          this._synthesizeTone(type);
        }).catch(() => {});
      } else {
        this._synthesizeTone(type);
      }
    } catch (e) {
      // Audio autoplay policy fallback
    }
  },

  _synthesizeTone: function (type) {
    if (!this.audioCtx) return;
    const now = this.audioCtx.currentTime;

    if (type === 'click') {
      // Crisp mechanical switch snap
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(720, now);
      osc.frequency.exponentialRampToValueAtTime(180, now + 0.055);
      gain.gain.setValueAtTime(0.28, now);
      gain.gain.exponentialRampToValueAtTime(0.008, now + 0.055);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.06);

      // Low-frequency tactile thump
      const thumpOsc = this.audioCtx.createOscillator();
      const thumpGain = this.audioCtx.createGain();
      thumpOsc.type = 'sine';
      thumpOsc.frequency.setValueAtTime(145, now);
      thumpOsc.frequency.exponentialRampToValueAtTime(52, now + 0.045);
      thumpGain.gain.setValueAtTime(0.32, now);
      thumpGain.gain.exponentialRampToValueAtTime(0.008, now + 0.045);
      thumpOsc.connect(thumpGain);
      thumpGain.connect(this.audioCtx.destination);
      thumpOsc.start(now);
      thumpOsc.stop(now + 0.05);
    } else if (type === 'on' || type === 'success') {
      // Two-note ascending haptic ON / success chime
      const osc1 = this.audioCtx.createOscillator();
      const gain1 = this.audioCtx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(520, now);
      osc1.frequency.setValueAtTime(780, now + 0.065);
      gain1.gain.setValueAtTime(0.32, now);
      gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
      osc1.connect(gain1);
      gain1.connect(this.audioCtx.destination);
      osc1.start(now);
      osc1.stop(now + 0.155);
    } else if (type === 'off') {
      // Soft descending haptic OFF click
      const oscOff = this.audioCtx.createOscillator();
      const gainOff = this.audioCtx.createGain();
      oscOff.type = 'sine';
      oscOff.frequency.setValueAtTime(420, now);
      oscOff.frequency.exponentialRampToValueAtTime(190, now + 0.085);
      gainOff.gain.setValueAtTime(0.26, now);
      gainOff.gain.exponentialRampToValueAtTime(0.008, now + 0.085);
      oscOff.connect(gainOff);
      gainOff.connect(this.audioCtx.destination);
      oscOff.start(now);
      oscOff.stop(now + 0.09);
    }
  },

  bindEvents: function () {
    // Sound / Haptic Toggle Button & Sidebar Brand Logo
    const soundBtn = document.getElementById('sound-toggle-btn');
    if (soundBtn) {
      soundBtn.addEventListener('click', (e) => {
        this.toggleSound(e);
      });
    }

    const brandLogo = document.querySelector('.sidebar-brand');
    if (brandLogo) {
      brandLogo.addEventListener('click', (e) => {
        this.toggleSound(e);
      });
    }

    // Terminal Drawer Toggle
    const termBtn = document.getElementById('terminal-toggle-btn');
    const termHeader = document.getElementById('cli-bar-header');

    if (termBtn) {
      termBtn.addEventListener('click', (e) => {
        this.toggleTerminal(e);
      });
    }

    if (termHeader) {
      termHeader.addEventListener('click', (e) => {
        this.toggleTerminal(e);
      });
    }

    // Keyboard shortcut Ctrl+~ / Cmd+` for Terminal
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === '`' || e.key === '~' || e.code === 'Backquote')) {
        e.preventDefault();
        this.toggleTerminal(e);
      } else if (e.key === 'Escape') {
        const termDrawer = document.getElementById('cli-drawer');
        if (termDrawer && termDrawer.classList.contains('open')) {
          this.closeTerminal();
        }
      }
    });

    // Terminal Input Keyboard Navigation (History: Up/Down)
    const cliInput = document.getElementById('cli-terminal-input');
    if (cliInput) {
      cliInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.submitInputCommand();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (this.history.length > 0) {
            if (this.historyIdx === -1) {
              this.historyIdx = this.history.length - 1;
            } else if (this.historyIdx > 0) {
              this.historyIdx--;
            }
            cliInput.value = this.history[this.historyIdx] || '';
          }
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (this.historyIdx !== -1) {
            if (this.historyIdx < this.history.length - 1) {
              this.historyIdx++;
              cliInput.value = this.history[this.historyIdx] || '';
            } else {
              this.historyIdx = -1;
              cliInput.value = '';
            }
          }
        }
      });
    }

    // Global Haptic & Tactile Click Listener on all interactive UI elements
    document.addEventListener('click', (e) => {
      // Skip if clicking the sound toggle button or sidebar brand logo (toggleSound handles its own sound)
      if (e.target.closest('#sound-toggle-btn') || e.target.closest('.sidebar-brand')) return;

      const interactiveEl = e.target.closest(
        'button, .chip, .nav-item, .dock-card, .mentor-slot-btn, .mentor-milestone-row, .home-task-item, .workspace-card, .header-avatar-circle, .role-choice-card, .skill-pill, .persona-quick-card'
      );
      if (interactiveEl) {
        this.playClickSound('click', interactiveEl);
      }
    });
  },

  submitInputCommand: function () {
    const cliInput = document.getElementById('cli-terminal-input');
    if (!cliInput) return;
    const cmd = cliInput.value.trim();
    if (!cmd) {
      this.focusInput();
      return;
    }
    // Record to history
    if (this.history[this.history.length - 1] !== cmd) {
      this.history.push(cmd);
    }
    this.historyIdx = -1;
    cliInput.value = '';
    this.executeCommand(cmd);
    this.focusInput();
  },

  focusInput: function () {
    const cliInput = document.getElementById('cli-terminal-input');
    if (cliInput) {
      setTimeout(() => {
        try {
          cliInput.focus();
        } catch (_) {}
      }, 50);
    }
  },

  updatePromptUser: function () {
    const promptLabel = document.getElementById('cli-prompt-label');
    if (!promptLabel) return;
    const user = window.App && window.App.state && window.App.state.currentUser
      ? (window.App.state.currentUser.handle || window.App.state.currentUser.name || 'developer').toLowerCase().replace(/\s+/g, '_')
      : 'alex';
    promptLabel.textContent = `${user}@devonboard:~/project $`;
  },

  syncTogglePillState: function (isOpen) {
    const pill = document.getElementById('cli-toggle-pill-btn');
    if (pill) {
      pill.textContent = isOpen ? '▼ Minimize' : '▲ Open';
      pill.style.background = isOpen ? 'rgba(239, 68, 68, 0.22)' : 'rgba(196, 120, 68, 0.22)';
      pill.style.borderColor = isOpen ? 'rgba(239, 68, 68, 0.55)' : 'rgba(196, 120, 68, 0.55)';
    }
  },

  toggleTerminal: function (e) {
    if (e && typeof e.stopPropagation === 'function') {
      e.stopPropagation();
    }
    const now = Date.now();
    if (now - this._lastToggleTs < 160) {
      return; // Debounce rapid multi-events
    }
    this._lastToggleTs = now;

    const termDrawer = document.getElementById('cli-drawer');
    if (!termDrawer) return;

    if (window.App && !window.App.state.isAuthenticated) {
      termDrawer.classList.remove('open');
      this.syncTogglePillState(false);
      return;
    }

    const isOpen = termDrawer.classList.toggle('open');
    this.syncTogglePillState(isOpen);
    this.updatePromptUser();

    if (isOpen) {
      this.focusInput();
      this.playClickSound('on');
    } else {
      this.playClickSound('off');
    }
  },

  closeTerminal: function () {
    const termDrawer = document.getElementById('cli-drawer');
    if (termDrawer) {
      termDrawer.classList.remove('open');
      this.syncTogglePillState(false);
      this.playClickSound('off');
    }
  },

  openTerminal: function () {
    const termDrawer = document.getElementById('cli-drawer');
    if (termDrawer && window.App && window.App.state.isAuthenticated) {
      termDrawer.classList.add('open');
      this.syncTogglePillState(true);
      this.updatePromptUser();
      this.focusInput();
      this.playClickSound('on');
    }
  },

  executeCommand: async function (cmd) {
    const body = document.getElementById('cli-terminal-body');
    if (!body || !cmd) return;

    const user = window.App && window.App.state && window.App.state.currentUser
      ? (window.App.state.currentUser.handle || window.App.state.currentUser.name || 'developer').toLowerCase().replace(/\s+/g, '_')
      : 'alex';

    this.printToTerminal(`${user}@devonboard:~/project $ ${cmd}\n`);

    if (cmd === 'clear') {
      body.textContent = '';
      return;
    }

    try {
      const res = await window.App.apiPost('/api/cli/exec', { command: cmd });
      if (res) {
        if (res.output === '__CLEAR__') {
          body.textContent = '';
        } else {
          this.printToTerminal(`${res.output}\n\n`);
        }
        this.playClickSound(res.success ? 'success' : 'click');
      } else {
        this.printToTerminal(`Error: Failed to connect to server CLI service.\n\n`);
      }
    } catch (err) {
      this.printToTerminal(`Error: ${err.message || 'Execution error'}\n\n`);
    }
  },

  runQuickCommand: function (cmd) {
    const termDrawer = document.getElementById('cli-drawer');
    if (termDrawer && !termDrawer.classList.contains('open')) {
      termDrawer.classList.add('open');
      this.syncTogglePillState(true);
    }
    this.updatePromptUser();
    this.executeCommand(cmd);
    this.focusInput();
  },

  printToTerminal: function (text) {
    const body = document.getElementById('cli-terminal-body');
    if (!body) return;
    body.textContent += text;
    body.scrollTop = body.scrollHeight;
  },

  // ================= DOCUMENT SOURCE INSPECTOR =================
  inspectDocumentSource: async function (docId, sectionTitle, chunkText) {
    const modal = document.getElementById('source-inspector-modal');
    if (!modal) return;

    document.getElementById('source-modal-title').textContent = sectionTitle || 'Document Source Passage';
    const textContainer = document.getElementById('source-modal-content');

    textContainer.innerHTML = `<div style="color: var(--text-muted);">Fetching official repository document...</div>`;
    window.App.openModal('source-inspector-modal');

    const doc = await window.App.apiGet(`/api/documents/raw?doc_id=${docId || ''}`);
    if (doc && doc.raw_text) {
      const lines = doc.raw_text.split('\n');
      const linesHtml = lines.map((line, idx) => {
        const isHighlighted = chunkText && line.trim().length > 10 && chunkText.includes(line.trim().slice(0, 30));
        return `
          <div style="display: flex; gap: 14px; background: ${isHighlighted ? 'rgba(201, 122, 43, 0.15)' : 'transparent'}; padding: 2px 8px; border-left: 3px solid ${isHighlighted ? 'var(--accent-brown)' : 'transparent'};">
            <span style="color: var(--text-dim); user-select: none; width: 34px; text-align: right; font-family: var(--font-mono); font-size: 0.76rem;">${idx + 1}</span>
            <span style="font-family: var(--font-mono); font-size: 0.8rem; color: ${isHighlighted ? 'var(--accent-brown-dark)' : 'var(--text-main)'}; font-weight: ${isHighlighted ? '700' : '400'};">${this.escapeHtml(line)}</span>
          </div>
        `;
      }).join('');

      textContainer.innerHTML = `
        <div style="margin-bottom: 12px; font-size: 0.78rem; color: var(--text-secondary); display: flex; justify-content: space-between;">
          <span>Repository File: <strong>${doc.filename}</strong></span>
          <span>Total Lines: <strong>${lines.length}</strong></span>
        </div>
        <div style="background: var(--bg-card-subtle); border: 1px solid var(--border-main); border-radius: var(--radius-sm); max-height: 420px; overflow-y: auto; padding: 12px 0;">
          ${linesHtml}
        </div>
      `;
    }
  },

  // ================= MATHEMATICAL GATE INSPECTOR MODAL =================
  openMathInspector: function (gateResult) {
    if (!gateResult) return;
    const modal = document.getElementById('gate-math-modal');
    if (!modal) return;

    const matchedTermsHtml = (gateResult.cov_details.matched_terms || []).map(t => `
      <span class="chip" style="background: var(--accent-green-light); color: var(--accent-green); border-color: rgba(43, 110, 72, 0.3);">
        "${t[0]}"
      </span>
    `).join('') || '<span style="color: var(--text-dim); font-size: 0.8rem;">None</span>';

    const oovTermsHtml = (gateResult.cov_details.oov_terms || []).map(t => `
      <span class="chip" style="background: var(--accent-rust-light); color: var(--accent-rust); border-color: rgba(186, 78, 48, 0.3);">
        "${t}"
      </span>
    `).join('') || '<span style="color: var(--accent-green); font-size: 0.8rem;">None (All words found in docs)</span>';

    const isPassed = gateResult.passed;
    const statusText = isPassed ? '✅ Verified in Documentation' : '🤝 Connected to Mentor (Out of Docs Scope)';

    document.getElementById('math-modal-content').innerHTML = `
      <div style="margin-bottom: 16px;">
        <h4 style="font-size: 0.95rem; font-weight: 700; margin-bottom: 6px; color: var(--text-main);">
          1. Documentation Keyword Match
        </h4>
        <div style="background: var(--bg-secondary); padding: 12px 16px; border-radius: var(--radius-sm); font-size: 0.85rem; margin-bottom: 10px; border: 1px solid var(--border-main);">
          Keyword Match Score: <strong>${(gateResult.cov * 100).toFixed(0)}%</strong> (${gateResult.cov_details.in_vocab_count} of ${gateResult.cov_details.total_terms} words verified in repository guides)
        </div>
        <div style="font-size: 0.8rem; margin-bottom: 6px; color: var(--text-secondary);">
          <strong>Words Found in Project Docs:</strong>
          <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px;">${matchedTermsHtml}</div>
        </div>
        <div style="font-size: 0.8rem; margin-top: 8px; color: var(--text-secondary);">
          <strong>Undocumented Words:</strong>
          <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px;">${oovTermsHtml}</div>
        </div>
      </div>

      <div style="margin-bottom: 16px; border-top: 1px solid var(--border-main); padding-top: 14px;">
        <h4 style="font-size: 0.95rem; font-weight: 700; margin-bottom: 6px; color: var(--text-main);">
          2. Guide Relevance & Distinctiveness
        </h4>
        <div style="background: var(--bg-secondary); padding: 12px 16px; border-radius: var(--radius-sm); font-size: 0.85rem; margin-bottom: 8px; border: 1px solid var(--border-main);">
          Top Guide Match: <strong>${(gateResult.marg * 100).toFixed(0)}% relevance</strong>
        </div>
        <div style="font-size: 0.78rem; color: var(--text-muted);">
          Indicates how clearly the primary guide passage answers this specific question without confusion from unrelated topics.
        </div>
      </div>

      <div style="border-top: 1px solid var(--border-main); padding-top: 14px;">
        <h4 style="font-size: 0.95rem; font-weight: 700; margin-bottom: 6px; color: var(--text-main);">
          3. Final Verification Result
        </h4>
        <div style="background: var(--bg-secondary); padding: 12px 16px; border-radius: var(--radius-sm); font-size: 0.85rem; border: 1px solid var(--border-main); display: flex; justify-content: space-between; align-items: center;">
          <div>
            Overall Confidence: <strong>${(gateResult.c_q * 100).toFixed(0)}%</strong> (Required: ${Math.round(gateResult.threshold * 100)}%)
          </div>
          <strong style="color: ${isPassed ? 'var(--accent-green)' : 'var(--accent-rust)'};">${statusText}</strong>
        </div>
      </div>
    `;

    window.App.openModal('gate-math-modal');
  },

  // ================= SIMULATED GOOGLE MEET ROOM =================
  openMeetRoom: function (mentorName, topic) {
    document.getElementById('meet-modal-mentor-name').textContent = mentorName || 'Dr. Elena Rostova';
    document.getElementById('meet-modal-topic').textContent = topic || 'Developer Onboarding & Architecture';

    let seconds = 0;
    if (this.meetTimer) clearInterval(this.meetTimer);
    const timerEl = document.getElementById('meet-call-timer');
    if (timerEl) timerEl.textContent = '00:00';
    this.meetTimer = setInterval(() => {
      seconds++;
      const m = String(Math.floor(seconds / 60)).padStart(2, '0');
      const s = String(seconds % 60).padStart(2, '0');
      if (timerEl) timerEl.textContent = `${m}:${s}`;
    }, 1000);

    window.App.openModal('meet-room-modal');
    this.playClickSound('success');
  },

  endMeetCall: function () {
    if (this.meetTimer) clearInterval(this.meetTimer);
    window.App.closeModal('meet-room-modal');
    window.App.showToast('Mentorship video session concluded.', 'info');
  },

  escapeHtml: function (text) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return (text || '').replace(/[&<>"']/g, m => map[m]);
  }
};

window.addEventListener('DOMContentLoaded', () => {
  window.WorkbenchUI.init();
});
