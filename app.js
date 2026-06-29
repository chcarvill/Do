/* ============================================================
   Communic8 — Marketing & Sales Board
   Vanilla JS. No build step. No frameworks.
   Data persists to localStorage; seed data comes from
   data-embedded.js (a JS copy of data.json) on first run only.
   ============================================================ */

const STORAGE_KEY = "communic8_marketing_state_v1";

const CATEGORY_COLOR_VARS = {
  coral: "coral", amber: "amber", teal: "teal", blue: "blue",
  gray: "gray", purple: "purple", green: "green", pink: "pink"
};

let STATE = {
  categories: [],     // [{id, label, color}]
  ideas: [],           // [{id, category, title, description}]
  children: [],         // [{id, ideaId, type: 'creation'|'application', done:false, scheduledDate: null|'YYYY-MM-DD', parked:false, canvasX, canvasY}]
  canvasPositions: {}, // ideaId -> {x,y}  (idea card positions on canvas)
};

let viewWeekStart = startOfWeek(new Date());
let viewMonthStart = startOfMonth(new Date());
let calendarViewMode = "week"; // 'week' | 'month'
let dragPayload = null; // { childId } while dragging

/* ---------------------------------------------------------- */
/* Bootstrapping                                                */
/* ---------------------------------------------------------- */

async function boot() {
  const saved = loadFromStorage();
  if (saved) {
    STATE = saved;
  } else {
    // Seed data is loaded via a plain <script> tag (data-embedded.js) rather
    // than fetch(), because fetch() of local files is blocked by browsers
    // under the file:// protocol — this way the app works the moment you
    // double-click index.html, with no local server required.
    const seed = window.__COMMUNIC8_SEED_DATA__;
    if (!seed) {
      console.error("Seed data not found — make sure data-embedded.js is loaded before app.js.");
      return;
    }
    STATE.categories = seed.categories;
    STATE.ideas = seed.ideas;
    STATE.children = [];
    STATE.canvasPositions = {};
    layoutCanvasPositions(); // initial clustered layout
    saveToStorage();
  }
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
/* Canvas layout — loose clustering by category, with jitter   */
/* ---------------------------------------------------------- */

function layoutCanvasPositions() {
  const cols = 5;
  const cellW = 430;
  const cellH = 300;
  const catIndex = {};
  STATE.categories.forEach((c, i) => (catIndex[c.id] = i));

  const grouped = {};
  STATE.ideas.forEach((idea) => {
    grouped[idea.category] = grouped[idea.category] || [];
    grouped[idea.category].push(idea);
  });

  STATE.categories.forEach((cat, ci) => {
    const col = ci % cols;
    const row = Math.floor(ci / cols);
    const baseX = 60 + col * cellW;
    const baseY = 50 + row * cellH;
    const ideas = grouped[cat.id] || [];

    ideas.forEach((idea, ii) => {
      const subCol = ii % 2;
      const subRow = Math.floor(ii / 2);
      const jitterX = (Math.random() - 0.5) * 18;
      const jitterY = (Math.random() - 0.5) * 18;
      STATE.canvasPositions[idea.id] = {
        x: baseX + subCol * 205 + jitterX,
        y: baseY + 38 + subRow * 150 + jitterY,
      };
    });
  });
}

function clusterBounds() {
  // compute a bounding box per category from current idea positions, for the halo
  const bounds = {};
  STATE.categories.forEach((cat) => {
    const ideas = STATE.ideas.filter((i) => i.category === cat.id);
    if (!ideas.length) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    ideas.forEach((idea) => {
      const p = STATE.canvasPositions[idea.id];
      if (!p) return;
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + 190);
      maxY = Math.max(maxY, p.y + 130);
    });
    if (minX === Infinity) return;
    bounds[cat.id] = { x: minX - 22, y: minY - 36, w: (maxX - minX) + 44, h: (maxY - minY) + 56 };
  });
  return bounds;
}

/* ---------------------------------------------------------- */
/* Date helpers                                                  */
/* ---------------------------------------------------------- */

function startOfWeek(d) {
  const date = new Date(d);
  const day = date.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day; // make Monday the start
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function fmtISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isSameDay(a, b) {
  return fmtISO(a) === fmtISO(b);
}

function weekDays(weekStart) {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  return days;
}

function startOfMonth(d) {
  const date = new Date(d.getFullYear(), d.getMonth(), 1);
  date.setHours(0, 0, 0, 0);
  return date;
}

/* a month "grid" always shows full Mon-Sun weeks, so it includes the   */
/* tail of the previous month and the start of the next to fill out the */
/* first and last rows — each returned day knows if it's in-month.      */
function monthGridWeeks(monthStart) {
  const gridStart = startOfWeek(monthStart);
  const monthIndex = monthStart.getMonth();
  const weeks = [];
  let cursor = new Date(gridStart);

  // a calendar month needs at most 6 weeks to fully contain it
  for (let w = 0; w < 6; w++) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      week.push({ date: new Date(cursor), inMonth: cursor.getMonth() === monthIndex });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
    // stop once we've completed the month and filled its last week
    if (cursor.getMonth() !== monthIndex && week.some((d) => d.inMonth)) {
      // we've just stepped past the month's last day and finished that row
      break;
    }
  }
  return weeks;
}

/* ---------------------------------------------------------- */
/* Rendering                                                     */
/* ---------------------------------------------------------- */

function render() {
  renderStats();
  renderCanvas();
  renderStaging();
  renderCalendar();
}

function renderStats() {
  const total = STATE.ideas.length;
  const spawned = STATE.children.length;
  const scheduled = STATE.children.filter((c) => c.scheduledDate).length;
  const done = STATE.children.filter((c) => c.done).length;
  document.getElementById("header-stats").innerHTML = `
    <span><b>${total}</b> ideas</span>
    <span><b>${spawned}</b> in motion</span>
    <span><b>${scheduled}</b> on the calendar</span>
    <span><b>${done}</b> completed</span>
  `;
}

function categoryById(id) {
  return STATE.categories.find((c) => c.id === id);
}

function ideaById(id) {
  return STATE.ideas.find((i) => i.id === id);
}

function childById(id) {
  return STATE.children.find((c) => c.id === id);
}

function renderCanvas() {
  const canvas = document.getElementById("canvas");
  const filterText = (document.getElementById("search").value || "").toLowerCase().trim();
  canvas.innerHTML = "";

  // halos first (so cards render above them)
  const bounds = clusterBounds();
  STATE.categories.forEach((cat) => {
    const b = bounds[cat.id];
    if (!b) return;
    const halo = document.createElement("div");
    halo.className = "cluster-halo";
    halo.style.left = b.x + "px";
    halo.style.top = b.y + "px";
    halo.style.width = b.w + "px";
    halo.style.height = b.h + "px";
    halo.style.background = `var(--${cat.color}-tint)`;
    canvas.appendChild(halo);

    const label = document.createElement("div");
    label.className = "cluster-label";
    label.style.left = b.x + 10 + "px";
    label.style.top = b.y - 4 + "px";
    label.textContent = cat.label;
    canvas.appendChild(label);
  });

  STATE.ideas.forEach((idea) => {
    if (filterText) {
      const hay = (idea.title + " " + (idea.description || "")).toLowerCase();
      if (!hay.includes(filterText)) return;
    }
    const pos = STATE.canvasPositions[idea.id] || { x: 40, y: 40 };
    const cat = categoryById(idea.category);
    const card = document.createElement("div");
    card.className = "idea-card";
    card.style.left = pos.x + "px";
    card.style.top = pos.y + "px";
    card.dataset.ideaId = idea.id;

    const creationChild = STATE.children.find((c) => c.ideaId === idea.id && c.type === "creation");
    const applicationChild = STATE.children.find((c) => c.ideaId === idea.id && c.type === "application");

    card.innerHTML = `
      <span class="cat-tag" style="color: var(--${cat.color});">${escapeHtml(cat.label)}</span>
      <div class="idea-title">${escapeHtml(idea.title)}</div>
      <div class="idea-desc">${escapeHtml(idea.description || "")}</div>
      <div class="spawn-row">
        <button class="spawn-btn creation ${creationChild ? "spawned" : ""}" data-action="spawn-creation" data-idea="${idea.id}">
          <img src="assets/icon-creation.png" alt="" /> ${creationChild ? "Building ✓" : "Build it"}
        </button>
        <button class="spawn-btn application ${applicationChild ? "spawned" : ""}" data-action="spawn-application" data-idea="${idea.id}">
          <img src="assets/icon-application.png" alt="" /> ${applicationChild ? "Doing ✓" : "Do it"}
        </button>
      </div>
      <div class="idea-children"></div>
    `;

    // a parked child (spawned, no date, dragged back onto the canvas) lives
    // embedded right here on its parent idea card. Dragging it back to the
    // staging row (or anywhere on the canvas, to re-park) toggles between
    // the two; giving it a date sends it to the calendar from either place.
    const childSlot = card.querySelector(".idea-children");
    [creationChild, applicationChild].forEach((child) => {
      if (child && child.parked && !child.scheduledDate) {
        childSlot.appendChild(buildChildCardEl(child, { hideParent: true }));
      }
    });

    canvas.appendChild(card);
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/* ---------------------------------------------------------- */
/* Staging panel — holds spawned creation/application tiles    */
/* that are actively being scheduled: no scheduledDate yet, and */
/* not parked back on their idea card. Setting a date (here, or */
/* by dragging straight onto a calendar day) moves a tile out   */
/* of staging; clearing a calendar date brings it back here.    */
/* Dragging a staging tile onto the canvas parks it back on its */
/* idea card instead — see wireCanvasDropTarget.                */
/* ---------------------------------------------------------- */

function renderStaging() {
  const row = document.getElementById("staging-row");
  row.innerHTML = "";

  const active = STATE.children.filter((c) => !c.scheduledDate && !c.parked);

  if (!active.length) {
    const empty = document.createElement("div");
    empty.id = "staging-empty";
    empty.textContent = "Nothing waiting — spawned tiles will land here until you give them a date.";
    row.appendChild(empty);
  } else {
    active.forEach((child) => row.appendChild(buildChildCardEl(child)));
  }
}

/* wired once on init — #staging-row itself is reused across renders */
/* (only its contents are replaced), so listeners go here, not above. */
function wireStagingDropTarget() {
  const row = document.getElementById("staging-row");
  row.addEventListener("dragover", (e) => {
    e.preventDefault();
    row.classList.add("drag-over");
  });
  row.addEventListener("dragleave", () => row.classList.remove("drag-over"));
  row.addEventListener("drop", (e) => {
    e.preventDefault();
    row.classList.remove("drag-over");
    if (!dragPayload) return;
    const child = childById(dragPayload.childId);
    if (!child) return;
    child.scheduledDate = null;
    child.parked = false; // dropping in staging always re-activates it, even if it came from being parked
    saveToStorage();
    render();
  });
}

/* ---------------------------------------------------------- */
/* Idea card dragging (repositioning within canvas)             */
/* One delegated drag controller for the whole canvas, rather   */
/* than per-card window listeners — avoids listener buildup     */
/* across repeated re-renders.                                  */
/* ---------------------------------------------------------- */

let canvasDragState = null; // { ideaId, startX, startY, origX, origY, cardEl }

function wireCanvasDragController() {
  const canvasWrap = document.getElementById("canvas-wrap");

  canvasWrap.addEventListener("mousedown", (e) => {
    const card = e.target.closest(".idea-card");
    if (!card) return;
    if (e.target.closest(".spawn-btn")) return; // don't drag when clicking a button
    if (e.target.closest(".child-card")) return; // don't drag the idea card when interacting with an embedded chip (date field, icons, or dragging the chip itself)

    const ideaId = card.dataset.ideaId;
    const pos = STATE.canvasPositions[ideaId];
    if (!pos) return;

    canvasDragState = {
      ideaId,
      startX: e.clientX,
      startY: e.clientY,
      origX: pos.x,
      origY: pos.y,
      cardEl: card,
    };
    card.classList.add("dragging");
    e.preventDefault();
  });

  window.addEventListener("mousemove", (e) => {
    if (!canvasDragState) return;
    const dx = e.clientX - canvasDragState.startX;
    const dy = e.clientY - canvasDragState.startY;
    const newX = canvasDragState.origX + dx;
    const newY = canvasDragState.origY + dy;
    STATE.canvasPositions[canvasDragState.ideaId] = { x: newX, y: newY };
    canvasDragState.cardEl.style.left = newX + "px";
    canvasDragState.cardEl.style.top = newY + "px";
  });

  window.addEventListener("mouseup", () => {
    if (!canvasDragState) return;
    canvasDragState.cardEl.classList.remove("dragging");
    canvasDragState = null;
    saveToStorage();
    renderCanvas(); // redraw halos to fit new position
  });
}

/* ---------------------------------------------------------- */
/* Spawning children                                             */
/* ---------------------------------------------------------- */

function spawnChild(ideaId, type) {
  const exists = STATE.children.find((c) => c.ideaId === ideaId && c.type === type);
  if (exists) return; // one creation + one application per idea
  const child = {
    id: "c_" + ideaId + "_" + type + "_" + Date.now(),
    ideaId,
    type, // 'creation' | 'application'
    done: false,
    scheduledDate: null,
    parked: false, // false = sitting in the staging panel; true = parked back on its idea card
  };
  STATE.children.push(child);
  saveToStorage();
  render();
}

/* ---------------------------------------------------------- */
/* Child card builder (used on idea cards and on the calendar)  */
/* ---------------------------------------------------------- */

function buildChildCardEl(child, opts = {}) {
  const idea = ideaById(child.ideaId);
  const el = document.createElement("div");
  el.className = `child-card ${child.type} ${child.done ? "done" : ""}`;
  el.draggable = true;
  el.dataset.childId = child.id;

  const icon = child.type === "creation" ? "assets/icon-creation.png" : "assets/icon-application.png";
  const label = child.type === "creation" ? "Creation" : "Application";

  el.innerHTML = `
    <div class="child-head">
      <img src="${icon}" alt="" />
      ${label}
      <span class="done-toggle" data-action="toggle-done" data-child="${child.id}">${child.done ? "↺" : "✓"}</span>
      ${child.scheduledDate ? `<span class="unschedule-toggle" data-action="unschedule" data-child="${child.id}" title="Clear date — sends it back to the staging panel">⤺</span>` : ""}
    </div>
    ${opts.hideParent ? "" : `<div class="child-parent">${escapeHtml(idea ? idea.title : "Unknown idea")}</div>`}
    <div class="schedule-row">
      <label class="schedule-label">${child.scheduledDate ? "Scheduled" : "Schedule for…"}</label>
      <input type="date" class="schedule-date-input" data-child="${child.id}" value="${child.scheduledDate || ""}" />
    </div>
  `;

  const dateInput = el.querySelector(".schedule-date-input");
  dateInput.addEventListener("click", (e) => e.stopPropagation());
  dateInput.addEventListener("change", (e) => {
    child.scheduledDate = e.target.value || null;
    if (child.scheduledDate) child.parked = false; // a dated tile is never "parked"
    saveToStorage();
    render();
  });

  el.addEventListener("dragstart", (e) => {
    dragPayload = { childId: child.id };
    el.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
  });
  el.addEventListener("dragend", () => {
    el.classList.remove("dragging");
    dragPayload = null;
  });

  return el;
}

/* ---------------------------------------------------------- */
/* Calendar — week view and month view share one nav row;        */
/* calendarViewMode picks which grid is visible and what the     */
/* Prev/Next/Today buttons operate on.                           */
/* ---------------------------------------------------------- */

function renderCalendar() {
  if (calendarViewMode === "month") {
    document.getElementById("calendar-grid").style.display = "none";
    document.getElementById("calendar-month-grid").style.display = "flex";
    renderCalendarMonth();
  } else {
    document.getElementById("calendar-grid").style.display = "grid";
    document.getElementById("calendar-month-grid").style.display = "none";
    renderCalendarWeek();
  }
}

function renderCalendarWeek() {
  const grid = document.getElementById("calendar-grid");
  grid.innerHTML = "";

  const days = weekDays(viewWeekStart);
  const today = new Date();

  const label = `${days[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${days[6].toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
  document.getElementById("week-label").textContent = label;

  days.forEach((day) => {
    const col = document.createElement("div");
    col.className = "day-col" + (isSameDay(day, today) ? " today" : "");

    const header = document.createElement("div");
    header.className = "day-col-header";
    header.innerHTML = `
      <div class="day-name">${day.toLocaleDateString(undefined, { weekday: "short" })}</div>
      <div class="day-date">${day.getDate()}</div>
    `;
    col.appendChild(header);

    const dropZone = document.createElement("div");
    dropZone.className = "day-drop-zone";
    dropZone.dataset.date = fmtISO(day);

    const dayChildren = STATE.children.filter((c) => c.scheduledDate === fmtISO(day));
    dayChildren.forEach((child) => dropZone.appendChild(buildChildCardEl(child)));

    dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropZone.classList.add("drag-over");
    });
    dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
    dropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropZone.classList.remove("drag-over");
      if (!dragPayload) return;
      const child = childById(dragPayload.childId);
      if (!child) return;
      child.scheduledDate = dropZone.dataset.date;
      child.parked = false; // a dated tile is never "parked"
      saveToStorage();
      render();
    });

    col.appendChild(dropZone);
    grid.appendChild(col);
  });
}

/* Month view shows compact dots rather than full cards — clicking a    */
/* day jumps into week view for that day's week, where the full cards   */
/* (and drag/date/unschedule controls) live.                            */
function renderCalendarMonth() {
  const container = document.getElementById("calendar-month-grid");
  container.innerHTML = "";

  const today = new Date();
  const weeks = monthGridWeeks(viewMonthStart);

  const label = viewMonthStart.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  document.getElementById("week-label").textContent = label;

  const weekdayRow = document.createElement("div");
  weekdayRow.className = "month-weekday-row";
  ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].forEach((d) => {
    const span = document.createElement("span");
    span.textContent = d;
    weekdayRow.appendChild(span);
  });
  container.appendChild(weekdayRow);

  const weeksWrap = document.createElement("div");
  weeksWrap.className = "month-weeks";

  weeks.forEach((week) => {
    const weekRow = document.createElement("div");
    weekRow.className = "month-week-row";

    week.forEach(({ date, inMonth }) => {
      const iso = fmtISO(date);
      const cell = document.createElement("div");
      cell.className = "month-cell" + (inMonth ? "" : " outside-month") + (isSameDay(date, today) ? " today" : "");

      const dayChildren = STATE.children.filter((c) => c.scheduledDate === iso);
      const maxDots = 6;
      const shown = dayChildren.slice(0, maxDots);
      const overflowCount = dayChildren.length - shown.length;

      const dotsHtml = shown
        .map((c) => `<span class="month-dot ${c.type}${c.done ? " done" : ""}" title="${escapeHtml((ideaById(c.ideaId) || {}).title || "")}"></span>`)
        .join("");

      cell.innerHTML = `
        <span class="month-date">${date.getDate()}</span>
        <span class="month-dots">${dotsHtml}${overflowCount > 0 ? `<span class="month-overflow">+${overflowCount}</span>` : ""}</span>
      `;

      cell.addEventListener("click", () => {
        viewWeekStart = startOfWeek(date);
        calendarViewMode = "week";
        setViewToggleUI();
        renderCalendar();
      });

      weekRow.appendChild(cell);
    });

    weeksWrap.appendChild(weekRow);
  });

  container.appendChild(weeksWrap);
}

function setViewToggleUI() {
  document.getElementById("btn-view-week").classList.toggle("active", calendarViewMode === "week");
  document.getElementById("btn-view-month").classList.toggle("active", calendarViewMode === "month");
}

/* ---------------------------------------------------------- */
/* Email backups — two flavours:                                 */
/*  - "Calendar" : just what's currently scheduled, as a dated   */
/*    itinerary. Useful as a quick "what's coming up" share.     */
/*  - "Full board": every idea, every spawned child (wherever it  */
/*    currently sits — parked, staging, or scheduled), plus a     */
/*    compact raw-data block at the end so the board could be      */
/*    reconstructed by hand if ever needed.                       */
/* Both open as a mailto: link with a pre-filled subject/body,    */
/* matching the email-snapshot pattern used across the other      */
/* apps — no server, no account, just your own mail client.       */
/* ---------------------------------------------------------- */

function statusLabel(child) {
  if (child.scheduledDate) return `scheduled ${child.scheduledDate}${child.done ? " — done" : ""}`;
  if (child.parked) return "parked on idea card";
  return "in staging, no date yet";
}

function buildCalendarEmailBody() {
  const scheduled = STATE.children.filter((c) => c.scheduledDate);
  scheduled.sort((a, b) => (a.scheduledDate < b.scheduledDate ? -1 : a.scheduledDate > b.scheduledDate ? 1 : 0));

  const lines = [];
  lines.push("COMMUNIC8 — CALENDAR SNAPSHOT");
  lines.push(new Date().toLocaleString());
  lines.push("");

  if (!scheduled.length) {
    lines.push("Nothing is currently scheduled on the calendar.");
  } else {
    let lastDate = null;
    scheduled.forEach((child) => {
      if (child.scheduledDate !== lastDate) {
        lines.push("");
        lines.push(`— ${child.scheduledDate} —`);
        lastDate = child.scheduledDate;
      }
      const idea = ideaById(child.ideaId);
      const typeLabel = child.type === "creation" ? "Build" : "Do";
      const doneTag = child.done ? " [done]" : "";
      lines.push(`  • [${typeLabel}] ${idea ? idea.title : "Unknown idea"}${doneTag}`);
    });
  }

  lines.push("");
  lines.push(`Total scheduled: ${scheduled.length} (${scheduled.filter((c) => c.done).length} done)`);
  return lines.join("\n");
}

function buildFullBoardEmailBody() {
  const lines = [];
  lines.push("COMMUNIC8 — FULL BOARD BACKUP");
  lines.push(new Date().toLocaleString());
  lines.push("");
  lines.push(`${STATE.ideas.length} ideas, ${STATE.children.length} spawned task${STATE.children.length === 1 ? "" : "s"}`);
  lines.push("");

  STATE.categories.forEach((cat) => {
    const ideasInCat = STATE.ideas.filter((i) => i.category === cat.id);
    if (!ideasInCat.length) return;
    lines.push(`=== ${cat.label} ===`);
    ideasInCat.forEach((idea) => {
      lines.push(`• ${idea.title}`);
      if (idea.description) lines.push(`   ${idea.description}`);
      const kids = STATE.children.filter((c) => c.ideaId === idea.id);
      kids.forEach((child) => {
        const typeLabel = child.type === "creation" ? "Build" : "Do";
        lines.push(`   - [${typeLabel}] ${statusLabel(child)}`);
      });
    });
    lines.push("");
  });

  lines.push("");
  lines.push("---");
  lines.push("Raw data (for backup / re-import — do not edit by hand):");
  lines.push(JSON.stringify(STATE));
  return lines.join("\n");
}

function openMailto(subject, body) {
  const url = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  // mailto: links have practical length limits in some clients; if the body
  // is very large (e.g. a big board with lots of history), warn rather than
  // silently truncate, so nothing important gets lost without the person knowing.
  if (url.length > 1800) {
    const proceed = confirm(
      "This backup is fairly large and some email apps may cut off long mailto links. " +
      "It should still work in most mail clients, but if the email arrives empty or truncated, " +
      "consider copying the board data manually instead. Open email now?"
    );
    if (!proceed) return;
  }
  window.location.href = url;
}

function wireEmailActions() {
  document.getElementById("btn-email-calendar").addEventListener("click", () => {
    const body = buildCalendarEmailBody();
    openMailto("Communic8 — Calendar snapshot", body);
  });
  document.getElementById("btn-email-board").addEventListener("click", () => {
    const body = buildFullBoardEmailBody();
    openMailto("Communic8 — Full board backup", body);
  });
}

/* dropping a card onto the canvas parks it back on its parent idea  */
/* card — no exact spot to aim for, since a parked tile's position   */
/* is always derived from its idea, not stored x/y.                  */
function wireCanvasDropTarget() {
  const canvasWrap = document.getElementById("canvas-wrap");
  canvasWrap.addEventListener("dragover", (e) => e.preventDefault());
  canvasWrap.addEventListener("drop", (e) => {
    e.preventDefault();
    if (!dragPayload) return;
    const child = childById(dragPayload.childId);
    if (!child) return;
    child.scheduledDate = null;
    child.parked = true;
    saveToStorage();
    render();
  });
}

/* ---------------------------------------------------------- */
/* Event delegation for buttons rendered dynamically             */
/* ---------------------------------------------------------- */

document.addEventListener("click", (e) => {
  const spawnBtn = e.target.closest("[data-action='spawn-creation'], [data-action='spawn-application']");
  if (spawnBtn) {
    const ideaId = spawnBtn.dataset.idea;
    const type = spawnBtn.dataset.action === "spawn-creation" ? "creation" : "application";
    spawnChild(ideaId, type);
    return;
  }

  const toggleBtn = e.target.closest("[data-action='toggle-done']");
  if (toggleBtn) {
    const child = childById(toggleBtn.dataset.child);
    if (child) {
      child.done = !child.done;
      saveToStorage();
      render();
    }
    return;
  }

  const unscheduleBtn = e.target.closest("[data-action='unschedule']");
  if (unscheduleBtn) {
    const child = childById(unscheduleBtn.dataset.child);
    if (child) {
      child.scheduledDate = null;
      child.parked = false; // unscheduling sends it to the staging panel, matching its tooltip
      saveToStorage();
      render();
    }
    return;
  }
});

/* ---------------------------------------------------------- */
/* Toolbar interactions                                          */
/* ---------------------------------------------------------- */

function wireToolbar() {
  document.getElementById("search").addEventListener("input", renderCanvas);

  document.getElementById("btn-view-week").addEventListener("click", () => {
    // if we navigated the month view away from today, landing back on an
    // unrelated week would be just as confusing as the month-sync issue
    // above -- so default to the first week of whatever month was shown,
    // unless today actually falls within it.
    const today = new Date();
    if (calendarViewMode === "month") {
      viewWeekStart =
        today.getFullYear() === viewMonthStart.getFullYear() && today.getMonth() === viewMonthStart.getMonth()
          ? startOfWeek(today)
          : startOfWeek(viewMonthStart);
    }
    calendarViewMode = "week";
    setViewToggleUI();
    renderCalendar();
  });
  document.getElementById("btn-view-month").addEventListener("click", () => {
    // land on whichever month the currently-viewed week falls in, so
    // switching views doesn't jump you somewhere unrelated to what you
    // were just looking at.
    viewMonthStart = startOfMonth(viewWeekStart);
    calendarViewMode = "month";
    setViewToggleUI();
    renderCalendar();
  });

  document.getElementById("btn-prev-week").addEventListener("click", () => {
    if (calendarViewMode === "month") {
      viewMonthStart = startOfMonth(new Date(viewMonthStart.getFullYear(), viewMonthStart.getMonth() - 1, 1));
    } else {
      viewWeekStart.setDate(viewWeekStart.getDate() - 7);
    }
    renderCalendar();
  });
  document.getElementById("btn-next-week").addEventListener("click", () => {
    if (calendarViewMode === "month") {
      viewMonthStart = startOfMonth(new Date(viewMonthStart.getFullYear(), viewMonthStart.getMonth() + 1, 1));
    } else {
      viewWeekStart.setDate(viewWeekStart.getDate() + 7);
    }
    renderCalendar();
  });
  document.getElementById("btn-today").addEventListener("click", () => {
    viewWeekStart = startOfWeek(new Date());
    viewMonthStart = startOfMonth(new Date());
    renderCalendar();
  });

  /* Divider drag-to-resize between canvas and the staging/calendar area below */
  const divider = document.getElementById("divider");
  const canvasWrap = document.getElementById("canvas-wrap");
  const stagingWrap = document.getElementById("staging-wrap");
  const calendarWrap = document.getElementById("calendar-wrap");
  let resizing = false;

  divider.addEventListener("mousedown", (e) => {
    resizing = true;
    e.preventDefault();
  });
  window.addEventListener("mousemove", (e) => {
    if (!resizing) return;
    const splitRect = document.getElementById("main-split").getBoundingClientRect();
    const fromTop = e.clientY - splitRect.top;
    const stagingH = stagingWrap.getBoundingClientRect().height;
    const minH = 140;
    const maxH = splitRect.height - minH - stagingH - 60; // leave room for staging panel + calendar
    const clamped = Math.max(minH, Math.min(maxH, fromTop));
    canvasWrap.style.flex = `0 0 ${clamped}px`;
    calendarWrap.style.flex = `1 1 auto`;
  });
  window.addEventListener("mouseup", () => (resizing = false));

  /* Modal: add new idea */
  const overlay = document.getElementById("modal-overlay");
  const catSelect = document.getElementById("modal-category");

  document.getElementById("btn-add-idea").addEventListener("click", () => {
    catSelect.innerHTML = STATE.categories.map((c) => `<option value="${c.id}">${escapeHtml(c.label)}</option>`).join("");
    document.getElementById("modal-title").value = "";
    document.getElementById("modal-desc").value = "";
    overlay.classList.add("open");
  });

  document.getElementById("btn-cancel-modal").addEventListener("click", () => {
    overlay.classList.remove("open");
  });

  document.getElementById("btn-save-idea").addEventListener("click", () => {
    const title = document.getElementById("modal-title").value.trim();
    if (!title) return;
    const id = "custom_" + Date.now();
    const categoryId = catSelect.value;
    STATE.ideas.push({
      id,
      category: categoryId,
      title,
      description: document.getElementById("modal-desc").value.trim(),
    });

    // place new card near its category cluster, with slight randomness
    const bounds = clusterBounds();
    const b = bounds[categoryId];
    STATE.canvasPositions[id] = b
      ? { x: b.x + 20 + Math.random() * 40, y: b.y + b.h + 10 }
      : { x: 80 + Math.random() * 200, y: 80 + Math.random() * 200 };

    saveToStorage();
    overlay.classList.remove("open");
    render();
  });
}

/* ---------------------------------------------------------- */
/* Go                                                              */
/* ---------------------------------------------------------- */

function init() {
  wireCanvasDropTarget();
  wireStagingDropTarget();
  wireToolbar();
  wireCanvasDragController();
  wireEmailActions();
  boot();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  // DOM is already parsed (script is at end of body) — run immediately
  init();
}

/* ---------------------------------------------------------- */
/* PWA service worker registration                               */
/* Only works over https:// (or localhost) — browsers block       */
/* service workers on file:// for security reasons, so this        */
/* silently does nothing when opened as a local file. That's       */
/* expected: the app still works fine locally, it just won't be    */
/* installable as a home-screen app until it's hosted.             */
/* ---------------------------------------------------------- */

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((err) => {
      console.warn("Service worker registration failed:", err);
    });
  });
}
