/* ============================================================
   Do — Three a Day
   Vanilla JS. No build step. No frameworks.
   Data persists to localStorage. Seed activities on first run.
   ============================================================ */

const STORAGE_KEY = "do_three_a_day_v1";

const PALETTE = ["sage", "clay", "amber", "teal", "blue", "purple", "pink", "gray"];
// extra colors beyond the core 3 used in CSS vars already defined (sage/clay/amber);
// the rest reuse Communic8-style hues so new activities stay visually distinct.
const EXTRA_COLORS = {
  teal:   "#4D8C8C",
  blue:   "#5A7FB5",
  purple: "#8C6FB0",
  pink:   "#C97DA0",
  gray:   "#8C8C8C",
};

let STATE = {
  activities: [],   // [{id, label, color}]
  days: {},          // 'YYYY-MM-DD' -> { slots: [{id, activityId, status, detail, link, note}], log: [...] }
  timeWasters: {
    habits: [],   // [{id, label}]  -- catch mid-motion
    filters: [],  // [{id, label}]  -- filter before saying yes
  },
};

let pendingSlotIndex = null;   // which stone (0/1/2) the picker modal is filling
let pendingIso = null;         // which day's slot the picker modal is filling
let pendingCancelSlot = null;  // which stone is being cancelled/substituted, awaiting a reason
let pendingCancelIso = null;   // which day's stone is being cancelled/substituted
let pendingSubstituteActivityId = null; // if cancelling-to-substitute, the new activity chosen
let pendingDetailIso = null;   // which day's slot the detail modal is editing
let pendingDetailSlot = null;  // which slot index the detail modal is editing
let currentWeekStart = null;   // Monday ISO of the week currently shown in "This week"

/* ---------------------------------------------------------- */
/* Bootstrapping                                                */
/* ---------------------------------------------------------- */

function boot() {
  const saved = loadFromStorage();
  if (saved) {
    STATE = saved;
  } else {
    STATE.activities = [
      { id: "a_oration", label: "Oration", color: "amber" },
      { id: "a_coding", label: "Coding", color: "blue" },
      { id: "a_bizplanning", label: "Targeted business planning", color: "clay" },
      { id: "a_networking", label: "Networking", color: "purple" },
      { id: "a_practice", label: "Occupational practice", color: "sage" },
      { id: "a_investing", label: "Investing", color: "teal" },
      { id: "a_exercise", label: "Physical exercise", color: "pink" },
    ];
    STATE.days = {};
  }

  // migrate: saved states from before the Time Wasters tab existed won't
  // have this field, so backfill it with defaults rather than crashing.
  if (!STATE.timeWasters) {
    STATE.timeWasters = {
      habits: [
        { id: "w_facebook", label: "Using Facebook" },
        { id: "w_browsing", label: "Aimlessly browsing the internet" },
      ],
      filters: [
        { id: "w_schmucks", label: "Working for arrogant schmucks" },
      ],
    };
  }

  saveToStorage();
  currentWeekStart = mondayOf(todayISO());
  ensureToday();
  render();
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.warn("Could not load saved state, starting fresh.", e);
    return null;
  }
}

function saveToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(STATE));
  } catch (e) {
    console.warn("Could not save state.", e);
  }
}

/* ---------------------------------------------------------- */
/* Date helpers                                                  */
/* ---------------------------------------------------------- */

function fmtISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function todayISO() {
  return fmtISO(new Date());
}

function isoMinusDays(iso, n) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() - n);
  return fmtISO(d);
}

function isoPlusDays(iso, n) {
  return isoMinusDays(iso, -n);
}

function mondayOf(iso) {
  const d = new Date(iso + "T00:00:00");
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return fmtISO(d);
}

function weekDates(mondayIso) {
  const out = [];
  for (let i = 0; i < 7; i++) out.push(isoPlusDays(mondayIso, i));
  return out;
}

function fmtDayLabelShort(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function fmtWeekRangeLabel(mondayIso) {
  const sunday = isoPlusDays(mondayIso, 6);
  const mondayLabel = new Date(mondayIso + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const sundayLabel = new Date(sunday + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${mondayLabel} – ${sundayLabel}`;
}

function fmtDayLabel(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/* ---------------------------------------------------------- */
/* Day / slot helpers                                            */
/* ---------------------------------------------------------- */

function ensureDay(iso) {
  if (!STATE.days[iso]) {
    STATE.days[iso] = {
      slots: [
        { id: "s_" + iso + "_0", activityId: null, status: "empty", detail: "", link: "", note: "" },
        { id: "s_" + iso + "_1", activityId: null, status: "empty", detail: "", link: "", note: "" },
        { id: "s_" + iso + "_2", activityId: null, status: "empty", detail: "", link: "", note: "" },
      ],
      log: [],
    };
    saveToStorage();
  } else {
    // migrate: older saved days may predate detail/link/note fields
    let changed = false;
    STATE.days[iso].slots.forEach((s) => {
      if (s.detail === undefined) { s.detail = ""; changed = true; }
      if (s.link === undefined) { s.link = ""; changed = true; }
      if (s.note === undefined) { s.note = ""; changed = true; }
    });
    if (changed) saveToStorage();
  }
}

function ensureToday() {
  ensureDay(todayISO());
}

function ensureWeek(mondayIso) {
  weekDates(mondayIso).forEach(ensureDay);
}

function dayData(iso) {
  return STATE.days[iso];
}

function todayData() {
  return STATE.days[todayISO()];
}

function activityById(id) {
  return STATE.activities.find((a) => a.id === id);
}

function colorHex(colorName) {
  return EXTRA_COLORS[colorName] || `var(--${colorName})`;
}

/* ---------------------------------------------------------- */
/* Streak calculation                                            */
/* A day "counts" toward the streak if all 3 slots ended the    */
/* day marked done. Today never breaks an existing streak while */
/* still in progress — it only extends it once complete.        */
/* ---------------------------------------------------------- */

function dayIsComplete(dayData) {
  if (!dayData) return false;
  return dayData.slots.length === 3 && dayData.slots.every((s) => s.status === "done");
}

function computeStreak() {
  let streak = 0;
  let cursor = todayISO();
  const today = STATE.days[cursor];

  // if today is already fully done, it counts; otherwise start checking from yesterday
  if (dayIsComplete(today)) {
    streak++;
    cursor = isoMinusDays(cursor, 1);
  } else {
    cursor = isoMinusDays(cursor, 1);
  }

  while (STATE.days[cursor] && dayIsComplete(STATE.days[cursor])) {
    streak++;
    cursor = isoMinusDays(cursor, 1);
  }
  return streak;
}

/* ---------------------------------------------------------- */
/* Rendering                                                     */
/* ---------------------------------------------------------- */

function render() {
  renderHeader();
  renderStones();
  renderHistory();
  renderTimeWasters();
  renderWeekTab();
}

function renderHeader() {
  document.getElementById("today-label").textContent =
    new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  const streak = computeStreak();
  document.getElementById("streak-badge").innerHTML =
    streak > 0
      ? `<b>${streak}</b> day${streak === 1 ? "" : "s"} strong`
      : `<span>start today</span>`;
}

function renderStones() {
  const row = document.getElementById("stones-row");
  row.innerHTML = "";
  const iso = todayISO();
  const day = dayData(iso);

  day.slots.forEach((slot, i) => {
    const stone = document.createElement("div");
    stone.dataset.slotIndex = i;

    if (slot.status === "empty") {
      stone.className = "stone empty";
      stone.innerHTML = `
        <span class="stone-number">${i + 1}</span>
        <span class="stone-plus">+</span>
        <span class="stone-cta">Pick a task</span>
      `;
      stone.addEventListener("click", () => openPicker(iso, i));
    } else {
      const activity = activityById(slot.activityId);
      const label = activity ? activity.label : "Unknown";
      const statusClass = slot.status === "done" ? "done" : "active";
      stone.className = `stone ${statusClass}`;
      stone.innerHTML = `
        <span class="stone-number">${i + 1}</span>
        <span class="stone-cancel" title="Cancel or swap this task">✕</span>
        <span class="stone-detail-btn" title="Add detail, link, or a note">✎</span>
        <span class="stone-activity">${escapeHtml(label)}</span>
        <span class="stone-indicators">${slotIndicatorsHtml(slot)}</span>
        ${
          slot.status === "done"
            ? `<span class="stone-check">✓ done</span>`
            : `<button class="stone-mark-done">Mark done</button>`
        }
      `;
      const cancelEl = stone.querySelector(".stone-cancel");
      cancelEl.addEventListener("click", (e) => {
        e.stopPropagation();
        openCancelReason(iso, i);
      });
      const detailEl = stone.querySelector(".stone-detail-btn");
      detailEl.addEventListener("click", (e) => {
        e.stopPropagation();
        openDetailModal(iso, i);
      });
      const linkEl = stone.querySelector(".stone-link");
      if (linkEl) linkEl.addEventListener("click", (e) => e.stopPropagation());
      const doneBtn = stone.querySelector(".stone-mark-done");
      if (doneBtn) {
        doneBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          markDone(iso, i);
        });
      }
    }

    row.appendChild(stone);
  });
}

function slotIndicatorsHtml(slot) {
  let out = "";
  if (isSafeUrl(slot.link)) {
    out += `<a class="stone-link" href="${escapeAttr(slot.link)}" target="_blank" rel="noopener" title="Open link">🔗</a>`;
  }
  if (slot.detail) {
    out += `<span title="${escapeAttr(slot.detail)}">📝</span>`;
  }
  if (slot.note) {
    out += `<span title="${escapeAttr(slot.note)}">💡</span>`;
  }
  return out;
}

function renderHistory() {
  const list = document.getElementById("history-list");
  list.innerHTML = "";

  const todayIso = todayISO();
  const isoKeys = Object.keys(STATE.days)
    .filter((iso) => iso !== todayIso)
    .sort((a, b) => (a < b ? 1 : -1))
    .slice(0, 14);

  if (!isoKeys.length) {
    const empty = document.createElement("div");
    empty.id = "history-empty";
    empty.textContent = "Your past days will show up here once today wraps up.";
    list.appendChild(empty);
    return;
  }

  isoKeys.forEach((iso) => {
    const day = STATE.days[iso];
    const row = document.createElement("div");
    row.className = "day-row";

    const dots = day.slots
      .map((s) => `<span class="day-dot ${s.status === "done" ? "done" : s.status === "cancelled" ? "cancelled" : ""}"></span>`)
      .join("");

    const doneCount = day.slots.filter((s) => s.status === "done").length;
    const namedDone = day.slots
      .filter((s) => s.status === "done")
      .map((s) => (activityById(s.activityId) || {}).label)
      .filter(Boolean)
      .join(", ");

    row.innerHTML = `
      <span class="day-date">${fmtDayLabel(iso)}</span>
      <span class="day-dots">${dots}</span>
      <span class="day-summary">${doneCount}/3 — ${escapeHtml(namedDone || "nothing logged")}</span>
    `;

    if (day.log && day.log.length) {
      row.style.cursor = "pointer";
      row.title = "Click to see what changed that day";
      row.addEventListener("click", () => toggleLogDetail(row, day.log));
    }

    list.appendChild(row);
  });
}

function toggleLogDetail(row, log) {
  const existing = row.nextElementSibling;
  if (existing && existing.classList.contains("log-entry-wrap")) {
    existing.remove();
    return;
  }
  const wrap = document.createElement("div");
  wrap.className = "log-entry-wrap";
  log.forEach((entry) => {
    const activity = activityById(entry.activityId);
    const div = document.createElement("div");
    div.className = "log-entry";
    const verb = entry.type === "substituted" ? "Swapped" : "Cancelled";
    div.innerHTML = `<b>${verb}</b> ${escapeHtml(activity ? activity.label : "a task")} — ${escapeHtml(entry.reason)}`;
    wrap.appendChild(div);
  });
  row.insertAdjacentElement("afterend", wrap);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function isSafeUrl(url) {
  return /^https?:\/\//i.test(url || "");
}

/* ---------------------------------------------------------- */
/* Slot actions                                                  */
/* ---------------------------------------------------------- */

function markDone(iso, slotIndex) {
  const day = dayData(iso);
  day.slots[slotIndex].status = "done";
  saveToStorage();
  render();
}

function assignActivity(iso, slotIndex, activityId) {
  const day = dayData(iso);
  day.slots[slotIndex].activityId = activityId;
  day.slots[slotIndex].status = "active";
  saveToStorage();
  render();
}

/* ---------------------------------------------------------- */
/* Picker modal (filling an empty stone)                         */
/* ---------------------------------------------------------- */

function openPicker(iso, slotIndex) {
  pendingIso = iso;
  pendingSlotIndex = slotIndex;
  pendingCancelIso = null;
  pendingCancelSlot = null;
  document.getElementById("picker-title").textContent = "Choose your task";
  document.getElementById("picker-sub").textContent = "Pick one of your key empowering activities.";
  renderActivityList();
  document.getElementById("new-activity-input").value = "";
  document.getElementById("picker-overlay").classList.add("open");
}

function renderActivityList() {
  const list = document.getElementById("activity-list");
  list.innerHTML = "";
  STATE.activities.forEach((activity) => {
    const opt = document.createElement("div");
    opt.className = "activity-option";
    opt.innerHTML = `<span class="dot" style="background:${colorHex(activity.color)};"></span> ${escapeHtml(activity.label)}`;
    opt.addEventListener("click", () => {
      if (pendingCancelSlot !== null) {
        // we're substituting: this choice becomes the new activity, but only
        // after a reason is confirmed — so stash it and open the reason modal.
        pendingSubstituteActivityId = activity.id;
        document.getElementById("picker-overlay").classList.remove("open");
        openReasonModal(pendingCancelIso, pendingCancelSlot, "substituted", activity.id);
      } else {
        assignActivity(pendingIso, pendingSlotIndex, activity.id);
        closePicker();
      }
    });
    list.appendChild(opt);
  });
}

function closePicker() {
  document.getElementById("picker-overlay").classList.remove("open");
  pendingIso = null;
  pendingSlotIndex = null;
}

/* ---------------------------------------------------------- */
/* Cancel / substitute flow — always requires a reason           */
/* ---------------------------------------------------------- */

function openCancelReason(iso, slotIndex) {
  pendingCancelIso = iso;
  pendingCancelSlot = slotIndex;
  pendingIso = null;
  pendingSlotIndex = null;
  // offer the choice: cancel outright, or pick a substitute first (which
  // re-opens the picker, then funnels into the same reason requirement)
  document.getElementById("picker-title").textContent = "Swap for a different task";
  document.getElementById("picker-sub").textContent = "Or cancel outright below — either way, you'll explain why.";
  renderActivityList();
  document.getElementById("new-activity-input").value = "";

  // add a "cancel outright, no substitute" action above the list
  const list = document.getElementById("activity-list");
  const cancelOutright = document.createElement("div");
  cancelOutright.className = "activity-option";
  cancelOutright.style.borderColor = "var(--clay)";
  cancelOutright.style.background = "var(--clay-tint)";
  cancelOutright.style.color = "var(--clay-dark)";
  cancelOutright.innerHTML = `<span class="dot" style="background:var(--clay);"></span> Cancel — leave this slot empty`;
  cancelOutright.addEventListener("click", () => {
    document.getElementById("picker-overlay").classList.remove("open");
    openReasonModal(iso, slotIndex, "cancelled", null);
  });
  list.insertBefore(cancelOutright, list.firstChild);

  document.getElementById("picker-overlay").classList.add("open");
}

function openReasonModal(iso, slotIndex, type, substituteActivityId) {
  pendingCancelIso = iso;
  pendingCancelSlot = slotIndex;
  pendingSubstituteActivityId = substituteActivityId;
  const day = dayData(iso);
  const currentActivity = activityById(day.slots[slotIndex].activityId);
  document.getElementById("reason-activity-name").textContent = currentActivity ? currentActivity.label : "this task";
  document.getElementById("reason-text").value = "";
  document.getElementById("btn-confirm-reason").disabled = true;
  document.getElementById("reason-overlay").dataset.type = type;
  document.getElementById("reason-overlay").classList.add("open");
}

function closeReasonModal() {
  document.getElementById("reason-overlay").classList.remove("open");
  pendingCancelIso = null;
  pendingCancelSlot = null;
  pendingSubstituteActivityId = null;
}

function confirmReason() {
  const reasonText = document.getElementById("reason-text").value.trim();
  if (!reasonText) return;
  const type = document.getElementById("reason-overlay").dataset.type;
  const day = dayData(pendingCancelIso);
  const slot = day.slots[pendingCancelSlot];

  day.log.push({
    ts: new Date().toISOString(),
    type,
    activityId: slot.activityId,
    reason: reasonText,
  });

  if (type === "substituted" && pendingSubstituteActivityId) {
    slot.activityId = pendingSubstituteActivityId;
    slot.status = "active";
  } else {
    slot.activityId = null;
    slot.status = "empty";
  }

  saveToStorage();
  closeReasonModal();
  render();
}

/* ---------------------------------------------------------- */
/* Task detail modal — notes, link, and a static reminder note   */
/* ---------------------------------------------------------- */

function openDetailModal(iso, slotIndex) {
  pendingDetailIso = iso;
  pendingDetailSlot = slotIndex;
  const slot = dayData(iso).slots[slotIndex];
  const activity = activityById(slot.activityId);
  document.getElementById("detail-activity-name").textContent = activity ? activity.label : "this task";
  document.getElementById("detail-text").value = slot.detail || "";
  document.getElementById("detail-link").value = slot.link || "";
  document.getElementById("detail-note").value = slot.note || "";
  document.getElementById("detail-overlay").classList.add("open");
}

function closeDetailModal() {
  document.getElementById("detail-overlay").classList.remove("open");
  pendingDetailIso = null;
  pendingDetailSlot = null;
}

function saveDetail() {
  const slot = dayData(pendingDetailIso).slots[pendingDetailSlot];
  slot.detail = document.getElementById("detail-text").value.trim();
  slot.link = document.getElementById("detail-link").value.trim();
  slot.note = document.getElementById("detail-note").value.trim();
  saveToStorage();
  closeDetailModal();
  render();
}

/* ---------------------------------------------------------- */
/* Add a brand-new activity (from picker or manage modal)        */
/* ---------------------------------------------------------- */

function addActivity(label) {
  const trimmed = label.trim();
  if (!trimmed) return null;
  const usedColors = STATE.activities.map((a) => a.color);
  const color = PALETTE.find((c) => !usedColors.includes(c)) || PALETTE[STATE.activities.length % PALETTE.length];
  const activity = { id: "a_" + Date.now(), label: trimmed, color };
  STATE.activities.push(activity);
  saveToStorage();
  return activity;
}

/* ---------------------------------------------------------- */
/* Manage activities modal                                       */
/* ---------------------------------------------------------- */

function openManageModal() {
  renderManageList();
  document.getElementById("new-activity-input-2").value = "";
  document.getElementById("manage-overlay").classList.add("open");
}

function renderManageList() {
  const list = document.getElementById("manage-list");
  list.innerHTML = "";
  STATE.activities.forEach((activity) => {
    const row = document.createElement("div");
    row.className = "manage-row";
    row.innerHTML = `
      <span class="dot" style="background:${colorHex(activity.color)};"></span>
      <span class="name">${escapeHtml(activity.label)}</span>
      <span class="remove-activity" title="Remove from your pool">✕</span>
    `;
    row.querySelector(".remove-activity").addEventListener("click", () => {
      STATE.activities = STATE.activities.filter((a) => a.id !== activity.id);
      saveToStorage();
      renderManageList();
    });
    list.appendChild(row);
  });
}

/* ---------------------------------------------------------- */
/* Time Wasters tab                                               */
/* Two flat lists, no statuses to track — just a checkpoint to     */
/* read before drifting, not a log of failures.                    */
/* ---------------------------------------------------------- */

function renderTimeWasters() {
  renderWasterList("habits", "waster-habits-list");
  renderWasterList("filters", "waster-filters-list");
}

function renderWasterList(group, containerId) {
  const list = document.getElementById(containerId);
  list.innerHTML = "";
  const items = STATE.timeWasters[group];

  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "wasters-empty";
    empty.textContent = "Nothing here yet — add one below.";
    list.appendChild(empty);
    return;
  }

  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "waster-row";
    row.innerHTML = `
      <span class="dot"></span>
      <span class="name">${escapeHtml(item.label)}</span>
      <span class="remove-waster" title="Remove">✕</span>
    `;
    row.querySelector(".remove-waster").addEventListener("click", () => {
      removeWaster(group, item.id);
    });
    list.appendChild(row);
  });
}

function addWaster(group, label) {
  const trimmed = label.trim();
  if (!trimmed) return null;
  const item = { id: "w_" + Date.now(), label: trimmed };
  STATE.timeWasters[group].push(item);
  saveToStorage();
  return item;
}

function removeWaster(group, id) {
  STATE.timeWasters[group] = STATE.timeWasters[group].filter((w) => w.id !== id);
  saveToStorage();
  renderTimeWasters();
}

/* ---------------------------------------------------------- */
/* This week tab — plan ahead across a Mon–Sun grid, plus a       */
/* rolling agenda of everything upcoming across any days visited. */
/* ---------------------------------------------------------- */

function renderWeekTab() {
  if (!currentWeekStart) currentWeekStart = mondayOf(todayISO());
  ensureWeek(currentWeekStart);
  document.getElementById("week-range-label").textContent = fmtWeekRangeLabel(currentWeekStart);
  renderWeekDays();
  renderUpcomingList();
}

function renderWeekDays() {
  const container = document.getElementById("week-days");
  container.innerHTML = "";
  const todayIso = todayISO();

  weekDates(currentWeekStart).forEach((iso) => {
    const day = dayData(iso);
    const card = document.createElement("div");
    card.className = "day-card" + (iso === todayIso ? " is-today" : "");
    card.innerHTML = `
      <div class="day-card-header">
        <span class="day-card-date">${fmtDayLabelShort(iso)}</span>
        ${iso === todayIso ? `<span class="day-card-today-tag">Today</span>` : ""}
      </div>
      <div class="day-card-slots"></div>
    `;
    const slotsWrap = card.querySelector(".day-card-slots");

    day.slots.forEach((slot, i) => {
      const chip = document.createElement("div");
      if (slot.status === "empty") {
        chip.className = "week-slot-chip empty";
        chip.innerHTML = `<span>+ Plan a task</span>`;
        chip.addEventListener("click", () => openPicker(iso, i));
      } else {
        const activity = activityById(slot.activityId);
        const label = activity ? activity.label : "Unknown";
        chip.className = `week-slot-chip ${slot.status}`;
        chip.innerHTML = `
          <span class="chip-label">${escapeHtml(label)}</span>
          <span class="stone-indicators">${slotIndicatorsHtml(slot)}</span>
          <span class="chip-actions">
            <span class="chip-detail-btn" title="Detail, link, or note">✎</span>
            <span class="chip-cancel-btn" title="Change or remove">✕</span>
          </span>
        `;
        chip.querySelector(".chip-detail-btn").addEventListener("click", (e) => {
          e.stopPropagation();
          openDetailModal(iso, i);
        });
        chip.querySelector(".chip-cancel-btn").addEventListener("click", (e) => {
          e.stopPropagation();
          openCancelReason(iso, i);
        });
        const linkEl = chip.querySelector(".stone-link");
        if (linkEl) linkEl.addEventListener("click", (e) => e.stopPropagation());
      }
      slotsWrap.appendChild(chip);
    });

    container.appendChild(card);
  });
}

function renderUpcomingList() {
  const list = document.getElementById("upcoming-list");
  list.innerHTML = "";
  const todayIso = todayISO();

  const rows = [];
  Object.keys(STATE.days)
    .filter((iso) => iso >= todayIso)
    .sort()
    .forEach((iso) => {
      const day = STATE.days[iso];
      day.slots.forEach((slot) => {
        if (slot.activityId && slot.status !== "empty") {
          rows.push({ iso, slot });
        }
      });
    });

  if (!rows.length) {
    const empty = document.createElement("div");
    empty.id = "upcoming-empty";
    empty.textContent = "Nothing planned ahead yet — assign a task on This week to see it here.";
    list.appendChild(empty);
    return;
  }

  rows.forEach(({ iso, slot }) => {
    const activity = activityById(slot.activityId);
    const label = activity ? activity.label : "Unknown";
    const row = document.createElement("div");
    row.className = "upcoming-row";
    row.innerHTML = `
      <span class="upcoming-date">${fmtDayLabelShort(iso)}</span>
      <span class="upcoming-label">${escapeHtml(label)}${slot.status === "done" ? " ✓" : ""}</span>
      <span class="stone-indicators">${slotIndicatorsHtml(slot)}</span>
    `;
    const linkEl = row.querySelector(".stone-link");
    if (linkEl) linkEl.addEventListener("click", (e) => e.stopPropagation());
    list.appendChild(row);
  });
}

function goToWeek(offsetDays) {
  currentWeekStart = isoPlusDays(currentWeekStart, offsetDays);
  renderWeekTab();
}

function emailWeek() {
  const dates = weekDates(currentWeekStart);
  let body = `Do — Week of ${fmtWeekRangeLabel(currentWeekStart)}\n\n`;

  dates.forEach((iso) => {
    const day = dayData(iso);
    body += `${fmtDayLabelShort(iso)}\n`;
    const filled = day.slots.filter((s) => s.activityId);
    if (!filled.length) {
      body += "  (nothing planned)\n";
    } else {
      filled.forEach((s) => {
        const activity = activityById(s.activityId);
        const label = activity ? activity.label : "Unknown";
        body += `  - ${label}${s.status === "done" ? " (done)" : ""}\n`;
        if (s.detail) body += `      detail: ${s.detail}\n`;
        if (s.link) body += `      link: ${s.link}\n`;
        if (s.note) body += `      worth checking: ${s.note}\n`;
      });
    }
    body += "\n";
  });

  sendMailto(`Do — Week of ${fmtWeekRangeLabel(currentWeekStart)}`, body);
}

function emailToday() {
  const iso = todayISO();
  const day = dayData(iso);
  const dayLabel = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  let body = `Do — ${dayLabel}\n\n`;

  const filled = day.slots.filter((s) => s.activityId);
  if (!filled.length) {
    body += "(nothing planned yet)\n";
  } else {
    filled.forEach((s) => {
      const activity = activityById(s.activityId);
      const label = activity ? activity.label : "Unknown";
      body += `- ${label}${s.status === "done" ? " (done)" : ""}\n`;
      if (s.detail) body += `    detail: ${s.detail}\n`;
      if (s.link) body += `    link: ${s.link}\n`;
      if (s.note) body += `    worth checking: ${s.note}\n`;
    });
  }

  sendMailto(`Do — ${dayLabel}`, body);
}

function emailWasters() {
  let body = `Do — Time Wasters\n\n`;

  body += `Catch mid-motion\n`;
  if (!STATE.timeWasters.habits.length) {
    body += "  (none yet)\n";
  } else {
    STATE.timeWasters.habits.forEach((h) => (body += `  - ${h.label}\n`));
  }

  body += `\nFilter before saying yes\n`;
  if (!STATE.timeWasters.filters.length) {
    body += "  (none yet)\n";
  } else {
    STATE.timeWasters.filters.forEach((f) => (body += `  - ${f.label}\n`));
  }

  sendMailto("Do — Time Wasters", body);
}

function sendMailto(subject, body) {
  const encodedSubject = encodeURIComponent(subject);
  const encodedBody = encodeURIComponent(body);
  window.location.href = `mailto:?subject=${encodedSubject}&body=${encodedBody}`;
}

/* ---------------------------------------------------------- */
/* Tab switching                                                  */
/* ---------------------------------------------------------- */

function switchTab(tab) {
  document.getElementById("tab-today-panel").style.display = tab === "today" ? "" : "none";
  document.getElementById("tab-week-panel").style.display = tab === "week" ? "" : "none";
  document.getElementById("tab-wasters-panel").style.display = tab === "wasters" ? "" : "none";
  document.getElementById("tab-today").classList.toggle("active", tab === "today");
  document.getElementById("tab-week").classList.toggle("active", tab === "week");
  document.getElementById("tab-wasters").classList.toggle("active", tab === "wasters");
  if (tab === "week") renderWeekTab();
}

/* ---------------------------------------------------------- */
/* Wiring                                                         */
/* ---------------------------------------------------------- */

function wireUI() {
  document.getElementById("btn-cancel-picker").addEventListener("click", closePicker);

  document.getElementById("btn-add-activity").addEventListener("click", () => {
    const input = document.getElementById("new-activity-input");
    const activity = addActivity(input.value);
    if (activity) {
      input.value = "";
      renderActivityList();
    }
  });
  document.getElementById("new-activity-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("btn-add-activity").click();
  });

  document.getElementById("btn-cancel-reason").addEventListener("click", closeReasonModal);
  document.getElementById("reason-text").addEventListener("input", (e) => {
    document.getElementById("btn-confirm-reason").disabled = !e.target.value.trim();
  });
  document.getElementById("btn-confirm-reason").addEventListener("click", confirmReason);

  document.getElementById("manage-link").addEventListener("click", openManageModal);
  document.getElementById("btn-close-manage").addEventListener("click", () => {
    document.getElementById("manage-overlay").classList.remove("open");
    render(); // in case activities were removed, refresh stones/history labels
  });
  document.getElementById("btn-add-activity-2").addEventListener("click", () => {
    const input = document.getElementById("new-activity-input-2");
    const activity = addActivity(input.value);
    if (activity) {
      input.value = "";
      renderManageList();
    }
  });
  document.getElementById("new-activity-input-2").addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("btn-add-activity-2").click();
  });

  document.getElementById("tab-today").addEventListener("click", () => switchTab("today"));
  document.getElementById("tab-week").addEventListener("click", () => switchTab("week"));
  document.getElementById("tab-wasters").addEventListener("click", () => switchTab("wasters"));

  document.getElementById("btn-prev-week").addEventListener("click", () => goToWeek(-7));
  document.getElementById("btn-next-week").addEventListener("click", () => goToWeek(7));
  document.getElementById("btn-email-week").addEventListener("click", emailWeek);
  document.getElementById("btn-email-today").addEventListener("click", emailToday);
  document.getElementById("btn-email-wasters").addEventListener("click", emailWasters);

  document.getElementById("btn-cancel-detail").addEventListener("click", closeDetailModal);
  document.getElementById("btn-save-detail").addEventListener("click", saveDetail);

  document.getElementById("btn-add-waster-habit").addEventListener("click", () => {
    const input = document.getElementById("waster-habit-input");
    if (addWaster("habits", input.value)) {
      input.value = "";
      renderWasterList("habits", "waster-habits-list");
    }
  });
  document.getElementById("waster-habit-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("btn-add-waster-habit").click();
  });

  document.getElementById("btn-add-waster-filter").addEventListener("click", () => {
    const input = document.getElementById("waster-filter-input");
    if (addWaster("filters", input.value)) {
      input.value = "";
      renderWasterList("filters", "waster-filters-list");
    }
  });
  document.getElementById("waster-filter-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("btn-add-waster-filter").click();
  });

  // close modals on overlay background click (not when clicking the modal itself)
  [
    ["picker-overlay", closePicker],
    ["reason-overlay", closeReasonModal],
    ["manage-overlay", () => document.getElementById("manage-overlay").classList.remove("open")],
    ["detail-overlay", closeDetailModal],
  ].forEach(([id, closeFn]) => {
    document.getElementById(id).addEventListener("click", (e) => {
      if (e.target.id === id) closeFn();
    });
  });
}

/* ---------------------------------------------------------- */
/* Go                                                              */
/* ---------------------------------------------------------- */

function init() {
  wireUI();
  boot();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

/* ---------------------------------------------------------- */
/* PWA service worker registration                               */
/* Only works over https:// (or localhost) — silently does       */
/* nothing on file://, which is expected.                        */
/* ---------------------------------------------------------- */

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((err) => {
      console.warn("Service worker registration failed:", err);
    });
  });
}
