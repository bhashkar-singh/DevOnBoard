/**
 * DevOnboard - Session Booking & Google Calendar/Meet UI Controller
 * Implements SRS Section 4.4 (REQ-SB-1 to REQ-SB-5)
 */

window.BookingUI = {
  selectedMentorId: null,
  selectedDayIdx: null,
  selectedSlotIdx: null,
  selectedTimeLabel: null,
  weekOffset: 0,
  periodFilter: 'all',
  mentorAvailabilityMap: {},
  clockIntervalId: null,

  daysShort: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  daysFull: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],

  // Complete 12 hourly time slots covering the entire day (08:00 AM - 08:00 PM)
  dayTimeOptions: [
    { id: 't08', hour24: 8,  label: '08:00 AM', range: '08:00 AM - 09:00 AM', isPm: 0, period: 'morning', tag: 'Morning' },
    { id: 't09', hour24: 9,  label: '09:00 AM', range: '09:00 AM - 10:00 AM', isPm: 0, period: 'morning', tag: 'Morning', preferred: true },
    { id: 't10', hour24: 10, label: '10:00 AM', range: '10:00 AM - 11:00 AM', isPm: 0, period: 'morning', tag: 'Morning', preferred: true },
    { id: 't11', hour24: 11, label: '11:00 AM', range: '11:00 AM - 12:00 PM', isPm: 0, period: 'morning', tag: 'Late AM' },
    { id: 't12', hour24: 12, label: '12:00 PM', range: '12:00 PM - 01:00 PM', isPm: 1, period: 'afternoon', tag: 'Midday' },
    { id: 't13', hour24: 13, label: '01:00 PM', range: '01:00 PM - 02:00 PM', isPm: 1, period: 'afternoon', tag: 'Afternoon' },
    { id: 't14', hour24: 14, label: '02:00 PM', range: '02:00 PM - 03:00 PM', isPm: 1, period: 'afternoon', tag: 'Afternoon', preferred: true },
    { id: 't15', hour24: 15, label: '03:00 PM', range: '03:00 PM - 04:00 PM', isPm: 1, period: 'afternoon', tag: 'Afternoon', preferred: true },
    { id: 't16', hour24: 16, label: '04:00 PM', range: '04:00 PM - 05:00 PM', isPm: 1, period: 'afternoon', tag: 'Late PM' },
    { id: 't17', hour24: 17, label: '05:00 PM', range: '05:00 PM - 06:00 PM', isPm: 1, period: 'evening', tag: 'Evening' },
    { id: 't18', hour24: 18, label: '06:00 PM', range: '06:00 PM - 07:00 PM', isPm: 1, period: 'evening', tag: 'Evening', preferred: true },
    { id: 't19', hour24: 19, label: '07:00 PM', range: '07:00 PM - 08:00 PM', isPm: 1, period: 'evening', tag: 'Evening' }
  ],

  // 6 representative daily slots shown in each column of the 7-day weekly overview matrix
  weeklyMatrixSlots: [
    { hour24: 9,  label: '09:00 AM', range: '09:00 AM - 10:00 AM', isPm: 0 },
    { hour24: 10, label: '10:00 AM', range: '10:00 AM - 11:00 AM', isPm: 0 },
    { hour24: 12, label: '12:00 PM', range: '12:00 PM - 01:00 PM', isPm: 1 },
    { hour24: 14, label: '02:00 PM', range: '02:00 PM - 03:00 PM', isPm: 1 },
    { hour24: 15, label: '03:00 PM', range: '03:00 PM - 04:00 PM', isPm: 1 },
    { hour24: 18, label: '06:00 PM', range: '06:00 PM - 07:00 PM', isPm: 1 }
  ],

  init: function () {
    this.startLiveClock();
    this.bindEvents();
    this.renderAllCalendarViews();
  },

  formatLiveDateTime: function (now) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dayName = days[now.getDay()];
    const monthName = months[now.getMonth()];
    const dateNum = now.getDate();
    const year = now.getFullYear();

    let hours = now.getHours();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    if (hours === 0) hours = 12;
    const hh = String(hours).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');

    return `${dayName}, ${monthName} ${dateNum}, ${year} · ${hh}:${mm} ${ampm}`;
  },

  startLiveClock: function () {
    const updateClockDom = () => {
      const now = new Date();
      const formatted = this.formatLiveDateTime(now);
      const headerClock = document.getElementById('header-live-datetime');
      if (headerClock) headerClock.textContent = formatted;
      const bookingClock = document.getElementById('booking-live-datetime');
      if (bookingClock) bookingClock.textContent = formatted;

      // Refresh slot availability at the top of each minute so elapsed slots auto-lock
      if (now.getSeconds() === 0) {
        this.renderAllCalendarViews();
      }
    };

    updateClockDom();
    if (this.clockIntervalId) clearInterval(this.clockIntervalId);
    this.clockIntervalId = setInterval(updateClockDom, 1000);
  },

  mentorsMap: {},
  pendingTopic: null,

  mentorPreferredHours: {
    'usr_mentor_elena': [10, 14, 15],
    'usr_mentor_david': [9, 11, 16],
    'usr_mentor_sarah': [13, 15, 18],
    'usr_mentor_raj': [8, 14, 17]
  },

  bindEvents: function () {
    const mentorSelect = document.getElementById('booking-mentor-select');
    if (mentorSelect) {
      mentorSelect.addEventListener('change', (e) => {
        const newMentorId = e.target.value;
        const m = this.mentorsMap[newMentorId];
        const defaultTopic = m
          ? `1:1 Mentorship with ${m.name}: ${(m.skill_names && m.skill_names.length > 0) ? m.skill_names.slice(0, 3).join(', ') : m.headline}`
          : '';
        this.selectMentorForBooking(newMentorId, defaultTopic);
      });
    }

    const form = document.getElementById('booking-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.confirmBooking();
      });
    }

    // Rating star clicks
    document.querySelectorAll('.star-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = parseInt(btn.getAttribute('data-val'));
        document.getElementById('rating-score-val').value = val;
        document.querySelectorAll('.star-btn').forEach(b => {
          const bVal = parseInt(b.getAttribute('data-val'));
          b.style.color = bVal <= val ? '#f59e0b' : '#64748b';
        });
      });
    });
  },

  load: async function () {
    this.applyRoleLayout();
    const isMentor = window.App && window.App.state.currentUser && window.App.state.currentUser.role !== 'mentee';
    if (!isMentor) {
      await this.fetchMentors();
    }
    await this.fetchSessions();
  },

  applyRoleLayout: function () {
    const user = window.App && window.App.state.currentUser;
    const isMentor = user && user.role !== 'mentee';

    const formCard = document.getElementById('mentee-booking-form-card');
    const gridEl = document.getElementById('session-booking-grid');
    const tabTitle = document.getElementById('session-tab-title');
    const tabDesc = document.getElementById('session-tab-desc');
    const sessionsTitle = document.getElementById('sessions-card-title');
    const mentorSummary = document.getElementById('mentor-sessions-summary');

    if (isMentor) {
      if (formCard) formCard.style.display = 'none';
      if (gridEl) gridEl.style.gridTemplateColumns = '1fr';
      if (tabTitle) tabTitle.textContent = 'Booked 1:1 Mentorship Sessions';
      if (tabDesc) {
        tabDesc.textContent = 'View mentees who have booked 1-on-1 onboarding sessions with you, inspect their topic & readiness, and join your Google Meet room.';
      }
      if (sessionsTitle) sessionsTitle.textContent = 'Mentees Who Booked a 1:1 Session With You';
      if (mentorSummary) mentorSummary.style.display = 'block';
    } else {
      if (formCard) formCard.style.display = 'block';
      if (gridEl) gridEl.style.gridTemplateColumns = '';
      if (tabTitle) tabTitle.textContent = 'Book a 1:1 Mentorship Session';
      if (tabDesc) {
        tabDesc.textContent = "Switch between any day of the week or navigate upcoming weeks to select a convenient time slot on your mentor's calendar. A Google Meet call link is generated automatically.";
      }
      if (sessionsTitle) sessionsTitle.textContent = 'My Mentoring Sessions';
      if (mentorSummary) mentorSummary.style.display = 'none';
    }
  },

  getWeekDates: function () {
    const now = new Date();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ...
    const diffToMon = (dayOfWeek === 0 ? -6 : 1 - dayOfWeek) + (this.weekOffset * 7);
    const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMon);

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i);
      const dayMidnight = d.getTime();
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');

      dates.push({
        shortDate: `${months[d.getMonth()]} ${d.getDate()}`,
        fullDate: `${this.daysFull[i]}, ${months[d.getMonth()]} ${d.getDate()}, ${yyyy}`,
        isoDate: `${yyyy}-${mm}-${dd}`,
        isPastDay: dayMidnight < todayMidnight,
        isToday: dayMidnight === todayMidnight
      });
    }
    return dates;
  },

  isSlotPast: function (dIdx, hour24, dates) {
    const dateList = dates || this.getWeekDates();
    const dateInfo = dateList[dIdx];
    if (!dateInfo) return false;
    if (dateInfo.isPastDay) return true;
    if (dateInfo.isToday) {
      const now = new Date();
      const currentHourDecimal = now.getHours() + (now.getMinutes() / 60);
      return hour24 <= currentHourDecimal;
    }
    return false;
  },

  isMentorAvailableSlot: function (dIdx, opt) {
    const avail = this.mentorAvailabilityMap[this.selectedMentorId];
    if (!avail || avail.length < 14) return true;
    const slotIdx = dIdx * 2 + opt.isPm;
    return avail[slotIdx] === 1;
  },

  isMentorPreferredHour: function (dIdx, opt) {
    if (!this.isMentorAvailableSlot(dIdx, opt)) return false;
    const prefHours = this.mentorPreferredHours[this.selectedMentorId] || [10, 14, 15];
    return prefHours.includes(opt.hour24);
  },

  getOpenSlotCountForDay: function (dIdx, dates) {
    const dateList = dates || this.getWeekDates();
    const dateInfo = dateList[dIdx];
    if (!dateInfo || dateInfo.isPastDay) return 0;
    return this.dayTimeOptions.filter(
      opt => !this.isSlotPast(dIdx, opt.hour24, dateList) && this.isMentorAvailableSlot(dIdx, opt)
    ).length;
  },

  ensureValidSelection: function (dates) {
    const dateList = dates || this.getWeekDates();

    // 1. Ensure selectedDayIdx points to Today or the first upcoming day where the selected mentor has open slots
    const isCurrentDayValid = (
      this.selectedDayIdx !== null &&
      dateList[this.selectedDayIdx] &&
      !dateList[this.selectedDayIdx].isPastDay &&
      this.getOpenSlotCountForDay(this.selectedDayIdx, dateList) > 0
    );

    if (!isCurrentDayValid) {
      let foundDayIdx = null;
      for (let i = 0; i < 7; i++) {
        if (!dateList[i].isPastDay && this.getOpenSlotCountForDay(i, dateList) > 0) {
          foundDayIdx = i;
          break;
        }
      }
      this.selectedDayIdx = foundDayIdx !== null ? foundDayIdx : 0;
    }

    // 2. Ensure selectedTimeLabel points to a non-passed & mentor-available slot on selectedDayIdx
    const currentOpt = this.dayTimeOptions.find(o => o.range === this.selectedTimeLabel);
    const isCurrentTimeValid = (
      currentOpt &&
      !this.isSlotPast(this.selectedDayIdx, currentOpt.hour24, dateList) &&
      this.isMentorAvailableSlot(this.selectedDayIdx, currentOpt)
    );

    if (!isCurrentTimeValid) {
      // Prefer one of the selected mentor's preferred office hours first
      const preferredOpt = this.dayTimeOptions.find(
        o => !this.isSlotPast(this.selectedDayIdx, o.hour24, dateList) && this.isMentorPreferredHour(this.selectedDayIdx, o)
      );
      const firstOpenOpt = preferredOpt || this.dayTimeOptions.find(
        o => !this.isSlotPast(this.selectedDayIdx, o.hour24, dateList) && this.isMentorAvailableSlot(this.selectedDayIdx, o)
      );
      if (firstOpenOpt) {
        this.selectedTimeLabel = firstOpenOpt.range;
        this.selectedSlotIdx = this.selectedDayIdx * 2 + firstOpenOpt.isPm;
      } else {
        this.selectedTimeLabel = null;
        this.selectedSlotIdx = null;
      }
    } else if (this.selectedSlotIdx === null) {
      this.selectedSlotIdx = this.selectedDayIdx * 2 + currentOpt.isPm;
    }
  },

  changeWeek: function (delta) {
    this.weekOffset = Math.max(0, Math.min(8, this.weekOffset + delta));
    this.selectedDayIdx = null;
    this.renderAllCalendarViews();
  },

  setPeriodFilter: function (period) {
    this.periodFilter = period;
    this.renderDaySlotsPanel(this.getWeekDates());
  },

  getMentorScheduleSummary: function (avail) {
    if (!Array.isArray(avail) || avail.length < 14) return 'Mon – Fri (Flexible)';
    const parts = [];
    for (let d = 0; d < 7; d++) {
      const am = avail[d * 2] === 1;
      const pm = avail[d * 2 + 1] === 1;
      if (am && pm) parts.push(`${this.daysShort[d]} (All Day)`);
      else if (am) parts.push(`${this.daysShort[d]} AM`);
      else if (pm) parts.push(`${this.daysShort[d]} PM`);
    }
    return parts.join(' · ') || 'By Request';
  },

  renderSelectedMentorCard: function () {
    const cardEl = document.getElementById('booking-selected-mentor-card');
    if (!cardEl) return;

    const m = this.mentorsMap[this.selectedMentorId];
    if (!m) {
      cardEl.innerHTML = '';
      return;
    }

    const s = m.raw_stats || {};
    const openSpots = Math.max(0, (s.declared_capacity || 4) - (s.active_mentees || 0));
    const matchPct = Math.round((m.total_score || 0.85) * 100);
    const avail = this.mentorAvailabilityMap[m.mentor_id] || [];
    const schedSummary = this.getMentorScheduleSummary(avail);
    const skillChips = (m.skill_names || []).map(sk =>
      `<span class="chip" style="font-size: 0.68rem; padding: 2px 7px; background: var(--bg-card); border-color: var(--border-main); color: var(--text-main);">${sk}</span>`
    ).join('');

    cardEl.innerHTML = `
      <div style="background: var(--bg-secondary); border: 1px solid var(--border-main); border-left: 4px solid var(--accent-brown); border-radius: var(--radius-sm); padding: 12px 14px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <img src="${m.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}" alt="${m.name}"
                 style="width: 48px; height: 48px; border-radius: 50%; object-fit: cover; border: 2px solid var(--accent-brown); flex-shrink: 0;" />
            <div>
              <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <strong style="font-size: 0.96rem; color: var(--text-main);">${m.name}</strong>
                <span class="gate-badge accepted" style="font-size: 0.68rem; padding: 1px 7px;">${matchPct}% Match</span>
                <span style="font-size: 0.75rem; color: #f59e0b; font-weight: 700;">★ ${s.raw_rating || 4.8} (${s.session_count || 10} reviews)</span>
              </div>
              <div style="font-size: 0.78rem; color: var(--accent-brown); font-weight: 600; margin-top: 2px;">
                ${m.headline || 'Senior Engineering Mentor'} · <span style="color: var(--accent-green);">${openSpots} of ${s.declared_capacity || 4} Mentee Spots Open</span>
              </div>
            </div>
          </div>
        </div>
        ${skillChips ? `
          <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 10px;">
            <span style="font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); font-weight: 700;">Expertise:</span>
            ${skillChips}
          </div>
        ` : ''}
        <div style="font-size: 0.74rem; color: var(--text-secondary); margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--border-subtle);">
          🗓️ <strong>${m.name.split(' ')[0]}'s Weekly Office Hours:</strong> <span style="color: var(--accent-brown); font-weight: 600;">${schedSummary}</span>
        </div>
      </div>
    `;
  },

  fetchMentors: async function () {
    const res = await window.App.apiGet('/api/matching/xmm');
    if (!res || !res.ranked_mentors) return;

    const select = document.getElementById('booking-mentor-select');
    if (!select) return;

    this.mentorsMap = {};
    select.innerHTML = '';
    res.ranked_mentors.forEach(m => {
      this.mentorsMap[m.mentor_id] = m;
      const opt = document.createElement('option');
      opt.value = m.mentor_id;
      const s = m.raw_stats || {};
      const openSpots = Math.max(0, (s.declared_capacity || 4) - (s.active_mentees || 0));
      opt.textContent = `${m.name} — ${m.headline} (${s.raw_rating}★ · ${openSpots} spots open)`;
      select.appendChild(opt);

      if (Array.isArray(m.availability_slots) && m.availability_slots.length === 14) {
        this.mentorAvailabilityMap[m.mentor_id] = m.availability_slots;
      } else {
        const avail = [];
        for (let i = 0; i < 14; i++) {
          avail.push(m.raw_stats.shared_indices.includes(i) ? 1 : 0);
        }
        this.mentorAvailabilityMap[m.mentor_id] = avail;
      }
    });

    if ((!this.selectedMentorId || !this.mentorsMap[this.selectedMentorId]) && res.ranked_mentors.length > 0) {
      this.selectedMentorId = res.ranked_mentors[0].mentor_id;
    }
    select.value = this.selectedMentorId;

    const topicInput = document.getElementById('booking-topic');
    if (topicInput) {
      if (this.pendingTopic) {
        topicInput.value = this.pendingTopic;
        this.pendingTopic = null;
      } else if (!topicInput.value.trim() && this.mentorsMap[this.selectedMentorId]) {
        const m = this.mentorsMap[this.selectedMentorId];
        topicInput.value = `1:1 Mentorship with ${m.name}: ${(m.skill_names && m.skill_names.length > 0) ? m.skill_names.slice(0, 3).join(', ') : m.headline}`;
      }
    }

    this.renderSelectedMentorCard();
    this.renderAllCalendarViews();
  },

  selectMentorForBooking: async function (mentorId, defaultTopic) {
    this.selectedMentorId = mentorId;
    if (defaultTopic) {
      this.pendingTopic = defaultTopic;
    }
    // Reset day/slot selection so ensureValidSelection jumps to this mentor's next available day & preferred office hour
    this.selectedDayIdx = null;
    this.selectedTimeLabel = null;
    this.selectedSlotIdx = null;

    if (!this.mentorsMap || !this.mentorsMap[mentorId]) {
      await this.fetchMentors();
    } else {
      const select = document.getElementById('booking-mentor-select');
      if (select) select.value = mentorId;
      const topicInput = document.getElementById('booking-topic');
      if (topicInput && defaultTopic) {
        topicInput.value = defaultTopic;
        this.pendingTopic = null;
      }
      this.renderSelectedMentorCard();
      this.renderAllCalendarViews();
    }
    await this.fetchSessions();
  },

  selectDay: function (dayIdx) {
    if (dayIdx < 0 || dayIdx > 6) return;
    const dates = this.getWeekDates();
    const targetDate = dates[dayIdx];
    const m = this.mentorsMap[this.selectedMentorId];
    const mentorFirst = m ? m.name.split(' ')[0] : 'Mentor';

    if (targetDate && targetDate.isPastDay) {
      if (window.App && window.App.showToast) {
        window.App.showToast(`Cannot book ${targetDate.fullDate} — past dates are locked.`, 'error');
      }
      return;
    }
    if (this.getOpenSlotCountForDay(dayIdx, dates) === 0) {
      if (window.App && window.App.showToast) {
        window.App.showToast(`${mentorFirst} has no open office hours on ${targetDate.fullDate}. Please select another day.`, 'error');
      }
      return;
    }

    this.selectedDayIdx = dayIdx;
    this.selectedTimeLabel = null;
    this.ensureValidSelection(dates);

    if (window.WorkbenchUI && window.WorkbenchUI.playClickSound) {
      window.WorkbenchUI.playClickSound('click');
    }
    this.renderAllCalendarViews();
  },

  chooseDayTime: function (dayIdx, isPm, timeRange) {
    const dates = this.getWeekDates();
    const opt = this.dayTimeOptions.find(o => o.range === timeRange);
    if ((dates[dayIdx] && dates[dayIdx].isPastDay) || (opt && this.isSlotPast(dayIdx, opt.hour24, dates))) {
      if (window.App && window.App.showToast) {
        window.App.showToast('This date or time slot has already passed. Please select an upcoming slot.', 'error');
      }
      return;
    }
    if (opt && !this.isMentorAvailableSlot(dayIdx, opt)) {
      if (window.App && window.App.showToast) {
        window.App.showToast('The selected mentor is off-duty during this time window.', 'error');
      }
      return;
    }

    this.selectedDayIdx = dayIdx;
    this.selectedSlotIdx = dayIdx * 2 + (isPm ? 1 : 0);
    this.selectedTimeLabel = timeRange;
    if (window.WorkbenchUI && window.WorkbenchUI.playClickSound) {
      window.WorkbenchUI.playClickSound('click');
    }
    this.renderAllCalendarViews();
  },

  chooseSlot: function (slotIdx, customTimeRange) {
    const dayIdx = Math.floor(slotIdx / 2);
    const isPm = (slotIdx % 2 === 1);
    const timeRange = customTimeRange || (isPm ? '03:00 PM - 04:00 PM' : '10:00 AM - 11:00 AM');
    this.chooseDayTime(dayIdx, isPm ? 1 : 0, timeRange);
  },

  renderAllCalendarViews: function () {
    const dates = this.getWeekDates();
    this.ensureValidSelection(dates);

    const weekLabel = document.getElementById('booking-week-label');
    if (weekLabel && dates.length === 7) {
      weekLabel.textContent = `${dates[0].shortDate} – ${dates[6].shortDate}`;
    }

    const m = this.mentorsMap[this.selectedMentorId];
    const mentorFirst = m ? m.name.split(' ')[0] : 'Mentor';

    const activeBadge = document.getElementById('booking-active-day-badge');
    if (activeBadge && dates[this.selectedDayIdx]) {
      const openCount = this.getOpenSlotCountForDay(this.selectedDayIdx, dates);
      const todayTag = dates[this.selectedDayIdx].isToday ? ' (Today)' : '';
      activeBadge.textContent = `${dates[this.selectedDayIdx].fullDate}${todayTag} · ${openCount} Open Slots with ${mentorFirst}`;
    }

    this.renderDaySwitcher(dates);
    this.renderDaySlotsPanel(dates);
    this.renderCalendarMatrix(dates);
    this.updateSelectedPreview(dates);
  },

  renderDaySwitcher: function (dates) {
    const strip = document.getElementById('booking-day-switcher');
    if (!strip) return;

    const m = this.mentorsMap[this.selectedMentorId];
    const mentorFirst = m ? m.name.split(' ')[0] : 'Mentor';
    const avail = this.mentorAvailabilityMap[this.selectedMentorId] || [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];

    strip.innerHTML = this.daysShort.map((day, dIdx) => {
      const dateObj = dates[dIdx] || { shortDate: '', isPastDay: false, isToday: false };
      const mentorHasDay = (avail[dIdx * 2] === 1) || (avail[dIdx * 2 + 1] === 1);
      const openCount = this.getOpenSlotCountForDay(dIdx, dates);
      const isLocked = dateObj.isPastDay || openCount === 0;
      const isActive = !isLocked && (dIdx === this.selectedDayIdx);

      if (dateObj.isPastDay) {
        return `
          <button type="button" class="day-switch-btn past-day" disabled
                  title="${dateObj.fullDate} has already passed — booking locked">
            <span class="day-switch-name">${day}</span>
            <span class="day-switch-date">${dateObj.shortDate}</span>
            <span class="day-switch-dots">✕ Past Date</span>
          </button>
        `;
      }

      if (!mentorHasDay || openCount === 0) {
        return `
          <button type="button" class="day-switch-btn past-day" disabled
                  title="${mentorFirst} is off-duty on ${dateObj.fullDate}">
            <span class="day-switch-name">${day}</span>
            <span class="day-switch-date">${dateObj.shortDate}</span>
            <span class="day-switch-dots">🔒 Off Duty</span>
          </button>
        `;
      }

      const statusLabel = dateObj.isToday
        ? `● Today (${openCount})`
        : `● ${openCount} slots`;

      return `
        <button type="button" class="day-switch-btn ${isActive ? 'active' : ''}"
                onclick="window.BookingUI.selectDay(${dIdx})">
          <span class="day-switch-name">${day}</span>
          <span class="day-switch-date">${dateObj.shortDate}</span>
          <span class="day-switch-dots">${statusLabel}</span>
        </button>
      `;
    }).join('');
  },

  renderDaySlotsPanel: function (dates) {
    const panel = document.getElementById('booking-day-slots-panel');
    if (!panel) return;

    const dIdx = this.selectedDayIdx;
    const dateInfo = dates[dIdx] || { fullDate: this.daysFull[dIdx], isToday: false };
    const m = this.mentorsMap[this.selectedMentorId];
    const mentorFirst = m ? m.name.split(' ')[0] : 'Mentor';

    const filteredOptions = this.dayTimeOptions.filter(opt => {
      if (this.periodFilter === 'all') return true;
      return opt.period === this.periodFilter;
    });

    const buttonsHtml = filteredOptions.map((opt) => {
      const slotPast = this.isSlotPast(dIdx, opt.hour24, dates);
      if (slotPast) {
        return `
          <button type="button" class="day-time-slot-btn past-slot" disabled
                  title="This time slot (${opt.range}) has already passed">
            <div style="font-weight: 800; font-size: 0.84rem;">${opt.label}</div>
            <div style="font-size: 0.65rem; opacity: 0.85; margin-top: 2px;">${opt.range}</div>
            <div style="font-size: 0.64rem; font-weight: 700; margin-top: 3px; color: var(--text-muted);">
              ✕ Passed
            </div>
          </button>
        `;
      }

      const mentorAvail = this.isMentorAvailableSlot(dIdx, opt);
      if (!mentorAvail) {
        return `
          <button type="button" class="day-time-slot-btn past-slot" disabled
                  title="${mentorFirst} is off-duty during ${opt.range}">
            <div style="font-weight: 800; font-size: 0.84rem;">${opt.label}</div>
            <div style="font-size: 0.65rem; opacity: 0.85; margin-top: 2px;">${opt.range}</div>
            <div style="font-size: 0.64rem; font-weight: 700; margin-top: 3px; color: var(--text-muted);">
              🔒 ${mentorFirst} Off-Duty
            </div>
          </button>
        `;
      }

      const isPreferred = this.isMentorPreferredHour(dIdx, opt);
      const isSelected = (this.selectedDayIdx === dIdx && this.selectedTimeLabel === opt.range);

      return `
        <button type="button" class="day-time-slot-btn ${isSelected ? 'selected' : ''}"
                onclick="window.BookingUI.chooseDayTime(${dIdx}, ${opt.isPm}, '${opt.range}')">
          <div style="font-weight: 800; font-size: 0.84rem;">${opt.label}</div>
          <div style="font-size: 0.65rem; opacity: 0.85; margin-top: 2px;">${opt.range}</div>
          <div style="font-size: 0.64rem; font-weight: 700; margin-top: 3px; color: ${isSelected ? '#fff' : (isPreferred ? 'var(--accent-green)' : 'var(--accent-brown)')};">
            ${isPreferred ? `★ ${mentorFirst}'s Preferred` : `● Open (${opt.tag})`}
          </div>
        </button>
      `;
    }).join('');

    panel.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 10px;">
        <div>
          <div style="font-size: 0.86rem; font-weight: 800; color: var(--text-main);">
            ${m ? m.name : 'Mentor'}'s Time Slots for <span style="color: var(--accent-brown);">${dateInfo.fullDate}${dateInfo.isToday ? ' (Today)' : ''}</span>
          </div>
          <div style="font-size: 0.72rem; color: var(--text-muted);">Showing ${mentorFirst}'s real-time availability (08:00 AM – 08:00 PM)</div>
        </div>
        <div style="display: flex; gap: 5px;">
          <button type="button" class="skill-filter-btn ${this.periodFilter === 'all' ? 'active' : ''}" onclick="window.BookingUI.setPeriodFilter('all')">All Day (12)</button>
          <button type="button" class="skill-filter-btn ${this.periodFilter === 'morning' ? 'active' : ''}" onclick="window.BookingUI.setPeriodFilter('morning')">Morning (4)</button>
          <button type="button" class="skill-filter-btn ${this.periodFilter === 'afternoon' ? 'active' : ''}" onclick="window.BookingUI.setPeriodFilter('afternoon')">Afternoon (5)</button>
          <button type="button" class="skill-filter-btn ${this.periodFilter === 'evening' ? 'active' : ''}" onclick="window.BookingUI.setPeriodFilter('evening')">Evening (3)</button>
        </div>
      </div>
      <div class="day-slots-grid">
        ${buttonsHtml}
      </div>
    `;
  },

  renderCalendarMatrix: function (dates) {
    const container = document.getElementById('booking-calendar-matrix');
    if (!container) return;

    const dateList = dates || this.getWeekDates();
    const avail = this.mentorAvailabilityMap[this.selectedMentorId] || [1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1, 0];

    container.innerHTML = this.daysShort.map((day, dIdx) => {
      const dateObj = dateList[dIdx] || { shortDate: '', isPastDay: false, isToday: false };
      const openCount = this.getOpenSlotCountForDay(dIdx, dateList);
      const isDayPast = dateObj.isPastDay || openCount === 0;
      const isDayActive = !isDayPast && (dIdx === this.selectedDayIdx);

      const daySlotsHtml = this.weeklyMatrixSlots.map((slot) => {
        const slotIdx = dIdx * 2 + slot.isPm;
        const slotPast = this.isSlotPast(dIdx, slot.hour24, dateList);

        if (slotPast) {
          return `
            <button type="button" class="cal-slot-btn past-slot" disabled
                    title="Past slot (${dateObj.shortDate} · ${slot.range})">
              <strong>${slot.label}</strong><br/><span style="font-size: 0.62rem;">Passed</span>
            </button>
          `;
        }

        const isMentorAvail = avail[slotIdx] === 1;
        if (!isMentorAvail) {
          return `
            <button type="button" class="cal-slot-btn past-slot" disabled
                    title="Mentor off-duty (${dateObj.shortDate} · ${slot.range})">
              <strong>${slot.label}</strong><br/><span style="font-size: 0.62rem;">Off-Duty</span>
            </button>
          `;
        }

        const isPreferred = this.isMentorPreferredHour(dIdx, slot);
        const isSelected = (this.selectedDayIdx === dIdx && this.selectedTimeLabel === slot.range);
        return `
          <button type="button" class="cal-slot-btn available ${isSelected ? 'selected' : ''}" 
                  data-slot="${slotIdx}" 
                  onclick="window.BookingUI.chooseSlot(${slotIdx}, '${slot.range}')">
            <strong>${slot.label}</strong><br/><span style="font-size: 0.63rem;">${isPreferred ? '★ Preferred' : 'Open'}</span>
          </button>
        `;
      }).join('');

      return `
        <div class="cal-day-col ${isDayActive ? 'active-day' : ''} ${isDayPast ? 'past-day' : ''}">
          <div class="cal-day-header" ${isDayPast ? '' : `onclick="window.BookingUI.selectDay(${dIdx})"`}
               title="${isDayPast ? `${dateObj.fullDate} (Locked / Off-Duty)` : `Switch to ${this.daysFull[dIdx]}`}">
            <div>${day}${dateObj.isToday ? ' •' : ''}</div>
            <div style="font-size: 0.65rem; font-weight: 600; opacity: 0.75;">${dateObj.shortDate}</div>
          </div>
          ${daySlotsHtml}
        </div>
      `;
    }).join('');
  },

  updateSelectedPreview: function (dates) {
    const previewEl = document.getElementById('selected-slot-preview');
    if (!previewEl) return;

    if (this.selectedSlotIdx === null || this.selectedDayIdx === null || !this.selectedTimeLabel) {
      previewEl.textContent = 'None selected';
      return;
    }

    const m = this.mentorsMap[this.selectedMentorId];
    const mentorName = m ? m.name : 'Selected Mentor';
    const dateList = dates || this.getWeekDates();
    const dateInfo = dateList[this.selectedDayIdx] || { fullDate: this.daysFull[this.selectedDayIdx] };
    previewEl.textContent = `${mentorName} · ${dateInfo.fullDate} (${this.selectedTimeLabel})`;
  },

  confirmBooking: async function () {
    const dates = this.getWeekDates();
    const dateInfo = dates[this.selectedDayIdx];
    const selectedOpt = this.dayTimeOptions.find(o => o.range === this.selectedTimeLabel);

    if (
      this.selectedSlotIdx === null ||
      !dateInfo ||
      dateInfo.isPastDay ||
      (selectedOpt && this.isSlotPast(this.selectedDayIdx, selectedOpt.hour24, dates)) ||
      (selectedOpt && !this.isMentorAvailableSlot(this.selectedDayIdx, selectedOpt))
    ) {
      window.App.showToast("Cannot book a past date or off-duty slot. Please choose an upcoming open slot.", "error");
      this.renderAllCalendarViews();
      return;
    }

    const scheduledTimeStr = `${dateInfo.fullDate} (${this.selectedTimeLabel})`;
    const topic = document.getElementById('booking-topic').value.trim() || 'Codebase & Architecture Onboarding';
    const payload = {
      mentor_id: this.selectedMentorId,
      slot_idx: this.selectedSlotIdx,
      scheduled_date: dateInfo.isoDate,
      scheduled_time: scheduledTimeStr,
      topic: topic
    };

    const res = await window.App.apiPost('/api/sessions/book', payload);
    if (res && res.status === 'booked') {
      window.App.showToast(`Session booked for ${scheduledTimeStr}! Synced to Google Calendar (${res.calendar_event_id})`, 'success');
      await this.fetchSessions();
      this.renderAllCalendarViews();
    }
  },

  sessionsCache: [],
  rescheduleDateOptions: [],

  fetchSessions: async function () {
    const listContainer = document.getElementById('sessions-list-container');
    if (!listContainer) return;

    const user = window.App && window.App.state.currentUser;
    const isMentor = user && user.role !== 'mentee';
    const mentorSummary = document.getElementById('mentor-sessions-summary');

    const sessions = await window.App.apiGet('/api/sessions');
    const sessionList = Array.isArray(sessions) ? sessions : [];
    this.sessionsCache = sessionList;

    if (isMentor && mentorSummary) {
      const scheduledCount = sessionList.filter(s => s.status === 'scheduled').length;
      const completedCount = sessionList.filter(s => s.status === 'completed').length;
      const mtp = (user && user.mentor_profile) || {};
      const cap = mtp.declared_capacity || 4;
      const activeMentees = mtp.active_mentees !== undefined ? mtp.active_mentees : scheduledCount;

      mentorSummary.innerHTML = `
        <div class="card" style="padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; border-left: 4px solid var(--accent-brown);">
          <div>
            <div style="font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--accent-brown); font-weight: 800;">
              Mentor 1:1 Schedule Overview
            </div>
            <div style="font-size: 1rem; font-weight: 800; color: var(--text-main); margin-top: 2px;">
              ${user.name} · <span style="font-weight: 600; color: var(--text-secondary); font-size: 0.88rem;">${mtp.headline || 'Senior Engineering Mentor'}</span>
            </div>
            <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 2px;">
              Mentees book 1-on-1 sessions from their onboarding workspace. Both you and the mentee can cancel up to 24 hours before the meeting start.
            </div>
          </div>
          <div style="display: flex; gap: 12px; flex-wrap: wrap;">
            <div style="background: var(--bg-secondary); border: 1px solid var(--border-main); border-radius: var(--radius-sm); padding: 8px 14px; text-align: center;">
              <div style="font-size: 1.05rem; font-weight: 800; color: var(--accent-green); font-family: var(--font-mono);">${scheduledCount}</div>
              <div style="font-size: 0.68rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">Upcoming 1:1s</div>
            </div>
            <div style="background: var(--bg-secondary); border: 1px solid var(--border-main); border-radius: var(--radius-sm); padding: 8px 14px; text-align: center;">
              <div style="font-size: 1.05rem; font-weight: 800; color: var(--accent-brown); font-family: var(--font-mono);">${completedCount}</div>
              <div style="font-size: 0.68rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">Completed</div>
            </div>
            <div style="background: var(--bg-secondary); border: 1px solid var(--border-main); border-radius: var(--radius-sm); padding: 8px 14px; text-align: center;">
              <div style="font-size: 1.05rem; font-weight: 800; color: var(--text-main); font-family: var(--font-mono);">${activeMentees}/${cap}</div>
              <div style="font-size: 0.68rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">Mentee Capacity</div>
            </div>
          </div>
        </div>
      `;
    }

    if (sessionList.length === 0) {
      listContainer.innerHTML = `<div style="color: var(--text-muted); font-size: 0.85rem; padding: 16px;">${isMentor ? 'No mentees have booked a 1:1 session with you yet.' : 'No mentoring sessions booked yet.'}</div>`;
      return;
    }

    listContainer.innerHTML = sessionList.map(s => {
      const isSched = s.status === 'scheduled';
      const isCancelled = s.status === 'cancelled';
      const hoursUntil = typeof s.hours_until_start === 'number' ? s.hours_until_start : 48;
      const isUpcoming = s.is_upcoming !== undefined ? s.is_upcoming : (hoursUntil > 0);
      const canCancel24h = s.can_cancel_24h !== undefined ? s.can_cancel_24h : (isSched && hoursUntil >= 24);
      const canReschedule24h = s.can_reschedule_24h !== undefined ? s.can_reschedule_24h : (isSched && hoursUntil >= 24);
      const canComplete = s.can_complete !== undefined ? s.can_complete : (isSched && !isUpcoming);

      let statusBadge = '';
      if (isCancelled) {
        statusBadge = `<span class="gate-badge" style="background: rgba(169, 68, 56, 0.14); color: var(--accent-rust); border: 1px solid rgba(169, 68, 56, 0.3); font-size: 0.72rem;">✕ Cancelled</span>`;
      } else if (isSched) {
        const timingHint = isUpcoming ? ` · in ${Math.max(1, Math.round(hoursUntil))}h` : ' · In Progress / Ready to Complete';
        statusBadge = `<span class="gate-badge accepted" style="font-size: 0.72rem;">● Upcoming 1:1${timingHint}</span>`;
      } else {
        statusBadge = `<span class="gate-badge" style="background: rgba(148, 163, 184, 0.15); color: var(--text-secondary); font-size: 0.72rem;">✓ Past Session Completed (${s.rating}★)</span>`;
      }

      const cancelBtnHtml = isSched
        ? (canCancel24h
            ? `<button class="btn btn-secondary btn-sm" style="color: var(--accent-rust); border-color: rgba(169, 68, 56, 0.38);" onclick="window.BookingUI.openCancelModal('${s.session_id}')">
                 ✕ Cancel Meeting
               </button>`
            : `<button class="btn btn-secondary btn-sm" disabled title="Cancellation requires at least 24 hours advance notice before the scheduled start time." style="opacity: 0.55; cursor: not-allowed;">
                 🔒 Cancel Locked (&lt;24h)
               </button>`)
        : '';

      const rescheduleBtnHtml = (!isMentor && isSched)
        ? (canReschedule24h
            ? `<button class="btn btn-secondary btn-sm" style="color: var(--accent-brown); border-color: rgba(184, 115, 51, 0.42);" onclick="window.BookingUI.openRescheduleModal('${s.session_id}')">
                 📅 Reschedule
               </button>`
            : `<button class="btn btn-secondary btn-sm" disabled title="Rescheduling requires at least 24 hours advance notice before the scheduled start time." style="opacity: 0.55; cursor: not-allowed;">
                 🔒 Reschedule Locked (&lt;24h)
               </button>`)
        : '';

      if (isMentor) {
        // Mentor view: show WHO booked the 1-on-1 session (Mentee profile, email, role, topic, time) + Join Meet + Cancel (>=24h)
        const menteeAvatar = s.mentee_avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150';
        const menteeRole = s.mentee_target_role || 'Junior Mentee · Contributor';
        const menteeEmail = s.mentee_email || 'alex.rivera@devonboard.internal';
        const menteeReadiness = s.mentee_readiness !== undefined && s.mentee_readiness !== null ? `${s.mentee_readiness}% Readiness` : 'Onboarding Active';

        return `
          <div class="card" style="margin-bottom: 14px; padding: 18px; border: 1px solid var(--border-main); ${isCancelled ? 'opacity: 0.72;' : ''}">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 12px; flex-wrap: wrap;">
              <div style="display: flex; align-items: center; gap: 12px;">
                <img src="${menteeAvatar}" alt="${s.mentee_name}" style="width: 46px; height: 46px; border-radius: 50%; object-fit: cover; border: 2px solid var(--accent-brown);" />
                <div>
                  <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <span style="font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: var(--accent-brown); background: rgba(184, 115, 51, 0.14); padding: 2px 8px; border-radius: 999px;">
                      Booked By Mentee
                    </span>
                    <strong style="font-size: 1rem; color: var(--text-main);">${s.mentee_name}</strong>
                    <span style="font-size: 0.75rem; color: var(--text-muted); font-family: var(--font-mono);">(${menteeEmail})</span>
                  </div>
                  <div style="font-size: 0.78rem; color: var(--text-secondary); margin-top: 3px;">
                    ${menteeRole} · <span style="color: var(--accent-green); font-weight: 700;">${menteeReadiness}</span> · Project: <strong>${s.project_name}</strong>
                  </div>
                </div>
              </div>
              ${statusBadge}
            </div>

            <div style="background: var(--bg-secondary); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 10px 14px; margin-bottom: 12px;">
              <div style="font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); font-weight: 700;">1:1 Discussion Topic</div>
              <div style="font-weight: 700; font-size: 0.92rem; color: var(--text-main); margin-top: 2px;">${s.topic}</div>
              <div style="font-size: 0.78rem; color: var(--accent-brown); margin-top: 6px; font-weight: 600;">
                📅 Scheduled Time: <strong>${s.scheduled_time}</strong> · Mentor Assigned: <strong>${s.mentor_name}</strong> · Cal ID: <code>${s.calendar_event_id}</code>
              </div>
            </div>

            ${s.notes ? `
              <div style="background: rgba(43, 110, 72, 0.08); padding: 9px 12px; border-radius: var(--radius-sm); font-size: 0.78rem; color: var(--text-main); margin-bottom: 10px; border-left: 3px solid var(--accent-green); white-space: pre-line;">
                ${s.notes}
              </div>
            ` : ''}

            ${s.review_text ? `
              <div style="background: var(--bg-card-subtle); padding: 8px 12px; border-radius: var(--radius-sm); font-size: 0.78rem; color: var(--text-secondary); margin-bottom: 10px; font-style: italic; border-left: 3px solid #f59e0b;">
                <strong>${isCancelled ? 'Cancellation Note:' : `Feedback from ${s.mentee_name} (${s.rating}★):`}</strong> "${s.review_text}"
              </div>
            ` : ''}

            <div style="display: flex; gap: 10px; justify-content: flex-end; align-items: center; flex-wrap: wrap;">
              <button class="btn btn-secondary btn-sm" onclick="window.BookingUI.openMentorNoteModal('${s.session_id || s.id}', '${(s.notes || '').replace(/'/g, "\\'").replace(/\n/g, '\\n')}')">
                📝 Add / Edit Action Notes
              </button>
              ${isSched ? `
                ${cancelBtnHtml}
                <button class="btn btn-primary btn-sm" onclick="window.WorkbenchUI.openMeetRoom('${s.mentee_name}', '${s.topic.replace(/'/g, "\\'")}')">
                  Join Google Meet with ${s.mentee_name} ↗
                </button>
              ` : isCancelled ? `
                <span style="font-size: 0.75rem; color: var(--accent-rust); font-weight: 600;">✕ Session Cancelled · Slot Released on Google Calendar</span>
              ` : `
                <span style="font-size: 0.75rem; color: var(--accent-green); font-weight: 600;">✓ Past Session Completed · Rated ${s.rating}★ by ${s.mentee_name}</span>
              `}
            </div>
          </div>
        `;
      }

      // Mentee view: show mentor details, Reschedule (>=24h), Cancel (>=24h), Join Meet, and (only after session starts) Mark Completed & Rate
      return `
        <div class="card" style="margin-bottom: 14px; padding: 16px; ${isCancelled ? 'opacity: 0.72;' : ''}">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; gap: 8px; flex-wrap: wrap;">
            <div>
              <div style="font-weight: 700; font-size: 0.95rem; color: var(--text-main);">${s.topic}</div>
              <div style="font-size: 0.82rem; color: var(--accent-brown); margin-top: 2px; font-weight: 600;">
                With ${s.mentor_name} (Project: ${s.project_name})
              </div>
            </div>
            ${statusBadge}
          </div>

          <div style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: 12px;">
            <strong>${s.scheduled_time}</strong> · Google Cal Event: <code>${s.calendar_event_id}</code>
          </div>

          ${s.review_text ? `
            <div style="background: var(--bg-secondary); padding: 8px 12px; border-radius: var(--radius-sm); font-size: 0.78rem; color: var(--text-secondary); margin-bottom: 10px; font-style: italic;">
              "${s.review_text}"
            </div>
          ` : ''}

          <div style="display: flex; gap: 8px; justify-content: flex-end; align-items: center; flex-wrap: wrap;">
            ${isSched ? `
              ${rescheduleBtnHtml}
              ${cancelBtnHtml}
              <button class="btn btn-primary btn-sm" onclick="window.WorkbenchUI.openMeetRoom('${s.mentor_name}', '${s.topic.replace(/'/g, "\\'")}')">
                Join Google Meet Room ↗
              </button>
              ${canComplete ? `
                <button class="btn btn-secondary btn-sm" onclick="window.BookingUI.openRateModal('${s.session_id}', '${s.mentor_name}')">
                  Mark Completed &amp; Rate ⭐
                </button>
              ` : `
                <span style="font-size: 0.71rem; color: var(--text-muted); padding: 4px 8px; background: var(--bg-secondary); border: 1px dashed var(--border-main); border-radius: var(--radius-sm);" title="Upcoming meetings cannot be marked completed or rated until the scheduled session takes place.">
                  ⏳ Rating unlocks after session
                </span>
              `}
            ` : isCancelled ? `
              <span style="font-size: 0.75rem; color: var(--accent-rust); font-weight: 600;">✕ Session Cancelled · Calendar invite removed</span>
            ` : `
              <span style="font-size: 0.75rem; color: var(--accent-green); font-weight: 600;">✓ Past Session Completed · Rated ${s.rating}★</span>
            `}
          </div>
        </div>
      `;
    }).join('');
  },

  openCancelModal: function (sessionId) {
    const s = (this.sessionsCache || []).find(item => item.session_id === sessionId);
    if (!s) return;

    const user = window.App && window.App.state.currentUser;
    const isMentor = user && user.role !== 'mentee';
    const partnerName = isMentor ? (s.mentee_name || 'Mentee') : (s.mentor_name || 'Mentor');
    const hoursLeft = Math.max(24, Math.round(s.hours_until_start || 48));

    document.getElementById('cancel-session-id').value = s.session_id;
    document.getElementById('cancel-modal-topic').textContent = s.topic;
    document.getElementById('cancel-modal-partner').textContent = partnerName;
    document.getElementById('cancel-modal-time').textContent = s.scheduled_time;
    document.getElementById('cancel-modal-hours-left').textContent = `~${hoursLeft}h`;
    document.getElementById('cancel-session-reason').value = '';

    window.App.openModal('cancel-session-modal');
  },

  submitCancelSession: async function () {
    const sessionId = document.getElementById('cancel-session-id').value;
    const reason = document.getElementById('cancel-session-reason').value.trim();
    const user = window.App && window.App.state.currentUser;
    const cancelledBy = (user && user.role !== 'mentee') ? 'mentor' : 'mentee';

    const res = await window.App.apiPost('/api/sessions/cancel', {
      session_id: sessionId,
      cancelled_by: cancelledBy,
      reason: reason
    });

    if (res && res.status === 'cancelled') {
      window.App.showToast(res.message || '1:1 Session cancelled and removed from Google Calendar.', 'info');
      window.App.closeModal('cancel-session-modal');
      await this.fetchSessions();
    }
  },

  openRescheduleModal: function (sessionId) {
    const s = (this.sessionsCache || []).find(item => item.session_id === sessionId);
    if (!s) return;

    const hoursLeft = Math.max(24, Math.round(s.hours_until_start || 48));
    document.getElementById('resched-session-id').value = s.session_id;
    document.getElementById('resched-modal-mentor').textContent = s.mentor_name;
    document.getElementById('resched-modal-current-time').textContent = s.scheduled_time;
    document.getElementById('resched-modal-hours-left').textContent = `~${hoursLeft}h`;
    document.getElementById('resched-topic-input').value = s.topic || '';

    // Build next 14 upcoming non-past calendar days
    const now = new Date();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    this.rescheduleDateOptions = [];

    for (let offset = 1; offset <= 14; offset++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const jsDay = d.getDay(); // 0=Sun..6=Sat
      const mondayBasedIdx = jsDay === 0 ? 6 : jsDay - 1;

      this.rescheduleDateOptions.push({
        isoDate: `${yyyy}-${mm}-${dd}`,
        fullDate: `${dayNames[jsDay]}, ${months[d.getMonth()]} ${d.getDate()}, ${yyyy}`,
        dayIdx: mondayBasedIdx
      });
    }

    const dateSelect = document.getElementById('resched-date-select');
    if (dateSelect) {
      dateSelect.innerHTML = this.rescheduleDateOptions.map((d, idx) =>
        `<option value="${idx}">${d.fullDate}</option>`
      ).join('');
    }

    this.onRescheduleDateChange();
    window.App.openModal('reschedule-session-modal');
  },

  onRescheduleDateChange: function () {
    const timeSelect = document.getElementById('resched-time-select');
    if (!timeSelect) return;

    timeSelect.innerHTML = this.dayTimeOptions.map((opt, idx) =>
      `<option value="${idx}" ${opt.preferred ? 'selected' : ''}>${opt.range} (${opt.tag}${opt.preferred ? ' · ★ Mentor Preferred' : ''})</option>`
    ).join('');
  },

  submitRescheduleSession: async function () {
    const sessionId = document.getElementById('resched-session-id').value;
    const dateIdx = parseInt(document.getElementById('resched-date-select').value || '0', 10);
    const timeIdx = parseInt(document.getElementById('resched-time-select').value || '0', 10);
    const topic = document.getElementById('resched-topic-input').value.trim();

    const dateObj = this.rescheduleDateOptions[dateIdx];
    const timeOpt = this.dayTimeOptions[timeIdx];
    if (!dateObj || !timeOpt) {
      window.App.showToast('Please select a valid upcoming date and time slot.', 'error');
      return;
    }

    const newScheduledTime = `${dateObj.fullDate} (${timeOpt.range})`;
    const newSlotIdx = dateObj.dayIdx * 2 + timeOpt.isPm;

    const res = await window.App.apiPost('/api/sessions/reschedule', {
      session_id: sessionId,
      scheduled_date: dateObj.isoDate,
      scheduled_time: newScheduledTime,
      slot_idx: newSlotIdx,
      topic: topic
    });

    if (res && res.status === 'rescheduled') {
      window.App.showToast(`Session rescheduled to ${newScheduledTime}! Google Calendar updated.`, 'success');
      window.App.closeModal('reschedule-session-modal');
      await this.fetchSessions();
    }
  },

  openRateModal: function (sessionId, mentorName) {
    document.getElementById('rate-session-id').value = sessionId;
    document.getElementById('rate-mentor-name').textContent = mentorName;
    window.App.openModal('rate-session-modal');
  },

  submitRating: async function () {
    const sessionId = document.getElementById('rate-session-id').value;
    const rating = parseFloat(document.getElementById('rating-score-val').value || 5);
    const review = document.getElementById('rate-review-text').value.trim();

    const res = await window.App.apiPost('/api/sessions/complete-and-rate', {
      session_id: sessionId,
      rating: rating,
      review_text: review
    });

    if (res && res.status === 'completed_and_rated') {
      window.App.showToast(`Review submitted! Mentor rating updated to ${res.new_rating}★ across ${res.new_count} sessions.`, 'success');
      window.App.closeModal('rate-session-modal');
      await this.fetchSessions();
      if (window.MatcherUI) window.MatcherUI.load();
    }
  },

  cancelSession: function (sessionId) {
    this.openCancelModal(sessionId);
  },

  openMentorNoteModal: function (sessionId, existingNotes) {
    const idEl = document.getElementById('mentor-note-session-id');
    const txtEl = document.getElementById('mentor-note-textarea');
    if (idEl) idEl.value = sessionId;
    if (txtEl) {
      const cleaned = (existingNotes || '').replace(/^\[Mentor Action Plan & Notes\]:\s*/i, '');
      txtEl.value = cleaned;
    }
    window.App.openModal('mentor-note-modal');
  },

  submitMentorNote: async function () {
    const idEl = document.getElementById('mentor-note-session-id');
    const txtEl = document.getElementById('mentor-note-textarea');
    const session_id = idEl ? idEl.value : '';
    const mentor_note = txtEl ? txtEl.value.trim() : '';

    if (!mentor_note) {
      window.App.showToast('Please enter action items or preparation notes.', 'warning');
      return;
    }

    const res = await window.App.apiPost('/api/sessions/mentor-note', {
      session_id,
      mentor_note
    });

    if (res && res.status === 'updated') {
      window.App.closeModal('mentor-note-modal');
      window.App.showToast('Session action plan & engineering notes saved! ✓', 'success');
      await this.fetchSessions();
      if (window.HomeUI && typeof window.HomeUI.loadMentorWorkspace === 'function') {
        window.HomeUI.loadMentorWorkspace();
      }
    }
  }
};

window.addEventListener('DOMContentLoaded', () => {
  window.BookingUI.init();
});
