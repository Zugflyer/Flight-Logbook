// ============================================================================
// Flight Log — Train Log tab
//
// Trips on the left (per-operator logo column), add-form + three stacked
// FFP progress bars on the right (Eurostar / SNCF / DB). TGV Lyria has no
// own program — its trips count toward SNCF.
// ============================================================================

import {
  store, onChange,
  addTrainTrip, updateTrainTrip, deleteTrainTrip,
  setProgramAdjustment,
} from './data.js';

// ----------------------------------------------------------------------------
// Operators (for the picker, the trip-list logo column, and the program
// definitions)
// ----------------------------------------------------------------------------
const OPERATORS = [
  { id: 'Eurostar',   logo: 'assets/logos/eurostar.png' },
  { id: 'SNCF',       logo: 'assets/logos/sncf.png' },
  { id: 'TGV Lyria',  logo: 'assets/logos/lyria.png' },
  { id: 'DB',         logo: 'assets/logos/db.png' },
];
function operatorLogo(name) {
  return OPERATORS.find(o => o.id === name)?.logo || null;
}

// FFP programs. `operators` lists which operator names contribute. `targets`
// is the cumulative tier-point thresholds; the LAST one is the "100%" target
// the percentage is computed against. `windowKind` is 'annual' (anchor in
// program_adjustments.qualification_start) or 'rolling12' (last 365 days).
const PROGRAMS = [
  {
    id: 'es',
    name: 'Eurostar Club Avantage',
    logo: 'assets/logos/eurostar.png',
    operators: ['Eurostar'],
    targets: [2900, 5000],
    windowKind: 'annual',
    accent: '#0d3a8b',
  },
  {
    id: 'sncf',
    name: 'SNCF Voyageur',
    logo: 'assets/logos/sncf.png',
    operators: ['SNCF', 'TGV Lyria'],
    targets: [1500, 2200],
    windowKind: 'annual',
    accent: '#a73786',
  },
  {
    id: 'db',
    name: 'BahnBonus',
    logo: 'assets/logos/db.png',
    operators: ['DB'],
    targets: [1500, 2500, 6000],
    windowKind: 'rolling12',
    accent: '#e2001a',
  },
];

const FFP_VISUAL_CAP = 1.3;  // bar can extend up to 130% of track width

let mounted = null;

// ============================================================
// Init
// ============================================================
export function initTrain() {
  mounted = document.querySelector('[data-panel="trains"]');
  if (!mounted) return;

  mounted.innerHTML = `
    <div class="train-root">
      <section class="train-left">
        <header class="train-head">
          <h2>Trips</h2>
          <p class="train-summary" id="train-summary">—</p>
        </header>
        <div class="train-table-wrap">
          <div class="train-thead">
            <div class="tt-th tt-col-op">Operator</div>
            <div class="tt-th tt-col-date">Date</div>
            <div class="tt-th tt-col-route">Route</div>
            <div class="tt-th tt-col-points">Points</div>
            <div class="tt-th tt-col-actions"></div>
          </div>
          <div class="train-tbody" id="train-tbody"></div>
        </div>
      </section>

      <section class="train-right">
        <div class="train-add-card">
          <header class="train-head"><h2>Add trip</h2></header>
          <form class="train-form" id="train-form" autocomplete="off">
            <div class="train-form-row">
              <div class="train-form-field train-form-field-op">
                <label>Operator</label>
                <div class="logo-dropdown" id="train-form-operator-dd" tabindex="0" role="combobox" aria-haspopup="listbox" aria-expanded="false">
                  <div class="logo-dropdown-current" id="train-form-operator-current"></div>
                  <div class="logo-dropdown-arrow">▾</div>
                  <ul class="logo-dropdown-list" role="listbox" id="train-form-operator-list">
                    ${OPERATORS.map(op => `
                      <li class="logo-dropdown-item" role="option" data-value="${op.id}">
                        <img src="${op.logo}" alt="${op.id}">
                        <span class="logo-dropdown-name">${op.id}</span>
                      </li>
                    `).join('')}
                  </ul>
                </div>
                <input type="hidden" id="train-form-operator" required>
              </div>
              <div class="train-form-field">
                <label for="train-form-date">Date</label>
                <input type="date" id="train-form-date" required>
              </div>
              <div class="train-form-field">
                <label for="train-form-from">From</label>
                <input type="text" id="train-form-from" required autocomplete="off" placeholder="Origin">
              </div>
              <div class="train-form-field">
                <label for="train-form-to">To</label>
                <input type="text" id="train-form-to" required autocomplete="off" placeholder="Destination">
              </div>
              <div class="train-form-field">
                <label for="train-form-points">Points</label>
                <input type="number" id="train-form-points" min="0" step="1" inputmode="numeric" list="train-points-suggestions" required>
                <datalist id="train-points-suggestions"></datalist>
              </div>
              <div class="train-form-action">
                <button type="submit" class="primary" id="train-form-submit">Add to logbook</button>
              </div>
            </div>
            <p class="train-form-error" id="train-form-error"></p>
          </form>
        </div>

        <div class="train-status-card">
          <header class="train-head"><h2>Status</h2></header>
          <div class="train-status-list" id="train-status-list">
            ${PROGRAMS.map(p => `
              <div class="train-prog" data-prog="${p.id}" style="--prog-accent:${p.accent}">
                <div class="train-prog-head">
                  <img class="train-prog-logo" src="${p.logo}" alt="${p.name}">
                  <span class="train-prog-name">${p.name}</span>
                  <span class="train-prog-window" id="train-prog-window-${p.id}"></span>
                  <button class="rollover-btn train-prog-adjust" data-prog="${p.id}" aria-label="Adjustments" title="Adjustments">+</button>
                </div>
                <div class="train-prog-bar-wrap" id="train-prog-bar-${p.id}"></div>
                <div class="train-prog-axis" id="train-prog-axis-${p.id}"></div>
                <div class="train-prog-total" id="train-prog-total-${p.id}"></div>
              </div>
            `).join('')}
          </div>
        </div>
      </section>
    </div>
  `;

  initAddForm();
  initStatusButtons();

  onChange(evt => {
    if (!evt) return;
    if (evt.type === 'data:loaded' || evt.type === 'trains:changed' ||
        evt.type === 'auth:locked' || evt.type === 'program:changed') {
      render();
    }
  });

  if (store.ready) render();
}

// ============================================================
// Render
// ============================================================
function render() {
  if (!mounted) return;
  refreshPointsSuggestions();
  renderStatusBars();
  renderTrips();
}

function renderTrips() {
  const trips = store.trainTrips || [];
  const total = trips.reduce((s, t) => s + (Number(t.points) || 0), 0);

  const $summary = document.getElementById('train-summary');
  if ($summary) {
    $summary.textContent = trips.length
      ? `${trips.length} trip${trips.length === 1 ? '' : 's'} · ${total.toLocaleString()} points`
      : 'No trips yet.';
  }

  const $body = document.getElementById('train-tbody');
  if (!$body) return;

  if (!trips.length) {
    $body.innerHTML = `<div class="train-empty">No trips yet.</div>`;
    return;
  }

  $body.innerHTML = trips.map(t => {
    const logoUrl = operatorLogo(t.operator);
    const opCell = logoUrl
      ? `<img class="tt-op-logo" src="${escapeAttr(logoUrl)}" alt="${escapeAttr(t.operator)}">`
      : `<span class="tt-op-text">${escapeHtml(t.operator || '')}</span>`;
    return `
      <div class="tt-tr" data-id="${t.id}">
        <div class="tt-td tt-col-op">${opCell}</div>
        <div class="tt-td tt-col-date">
          <div class="tt-date-main">${formatDate(t.date)}</div>
          <div class="tt-date-sub">${formatWeekday(t.date)}</div>
        </div>
        <div class="tt-td tt-col-route">
          <span class="tt-from">${escapeHtml(t.from_station || '')}</span>
          <span class="tt-arrow">→</span>
          <span class="tt-to">${escapeHtml(t.to_station || '')}</span>
        </div>
        <div class="tt-td tt-col-points">${t.points != null ? Number(t.points).toLocaleString() : '—'}</div>
        <div class="tt-td tt-col-actions">
          <button class="tt-action-btn" data-id="${t.id}" data-action="edit" aria-label="Edit">✎</button>
        </div>
      </div>
    `;
  }).join('');

  $body.querySelectorAll('.tt-action-btn[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      openEditModal(btn.dataset.id);
    });
  });
}

// ============================================================
// Add-trip form
// ============================================================
function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function shiftDateIso(iso, days) {
  if (!iso) return todayIso();
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function initAddForm() {
  const $form = document.getElementById('train-form');
  if (!$form) return;
  const $opDd = document.getElementById('train-form-operator-dd');
  const $opCurrent = document.getElementById('train-form-operator-current');
  const $opList = document.getElementById('train-form-operator-list');
  const $opHidden = document.getElementById('train-form-operator');
  const $date = document.getElementById('train-form-date');
  const $from = document.getElementById('train-form-from');
  const $to = document.getElementById('train-form-to');
  const $points = document.getElementById('train-form-points');
  const $error = document.getElementById('train-form-error');
  const $submit = document.getElementById('train-form-submit');

  $date.value = todayIso();

  // Default operator: Eurostar.
  setLogoDropdownValue($opDd, $opCurrent, $opHidden, OPERATORS[0].id);

  // Wire the custom logo dropdown.
  const closeDd = () => {
    $opDd.classList.remove('open');
    $opDd.setAttribute('aria-expanded', 'false');
  };
  const openDd = () => {
    $opDd.classList.add('open');
    $opDd.setAttribute('aria-expanded', 'true');
  };
  $opDd.addEventListener('click', e => {
    if (e.target.closest('.logo-dropdown-list')) return;
    if ($opDd.classList.contains('open')) closeDd(); else openDd();
  });
  $opList.querySelectorAll('.logo-dropdown-item').forEach(li => {
    li.addEventListener('click', e => {
      e.stopPropagation();
      setLogoDropdownValue($opDd, $opCurrent, $opHidden, li.dataset.value);
      $opDd.classList.remove('error');
      closeDd();
    });
  });
  // Close on outside click
  document.addEventListener('click', e => {
    if (!$opDd.contains(e.target)) closeDd();
  });
  // Keyboard: Enter/Space toggles, Escape closes; letter keys jump-select
  $opDd.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      $opDd.classList.toggle('open');
      return;
    }
    if (e.key === 'Escape') {
      closeDd();
      return;
    }
    // Single printable letter — match operator by first letter of its name.
    // This treats "T" → "TGV Lyria" (since it begins with T) and "E" →
    // "Eurostar". For the German one ("DB"), "D" matches.
    if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) {
      const letter = e.key.toLowerCase();
      // Find all operators starting with this letter; cycle through them
      // on repeat presses.
      const matches = OPERATORS.filter(op => op.id.toLowerCase().startsWith(letter));
      if (matches.length === 0) return;
      e.preventDefault();
      const currentValue = $opHidden.value;
      const currentIdx = matches.findIndex(op => op.id === currentValue);
      // If current is in matches, advance; else jump to the first match.
      const nextOp = matches[currentIdx >= 0 ? (currentIdx + 1) % matches.length : 0];
      setLogoDropdownValue($opDd, $opCurrent, $opHidden, nextOp.id);
      $opDd.classList.remove('error');
    }
  });

  // Arrow keys on the date field shift by ±1 day.
  $date.addEventListener('keydown', e => {
    if (e.key === 'ArrowUp')   { e.preventDefault(); $date.value = shiftDateIso($date.value, 1); }
    if (e.key === 'ArrowDown') { e.preventDefault(); $date.value = shiftDateIso($date.value, -1); }
  });

  // Clear error class on interaction
  for (const el of [$date, $from, $to, $points]) {
    const clear = () => el.classList.remove('error');
    el.addEventListener('input', clear);
    el.addEventListener('change', clear);
    el.addEventListener('focus', clear);
  }

  $form.addEventListener('submit', async e => {
    e.preventDefault();
    $error.textContent = '';

    let firstMissing = null;
    const check = (el, ok) => {
      if (!ok) {
        el.classList.add('error');
        if (!firstMissing) firstMissing = el;
      } else {
        el.classList.remove('error');
      }
    };
    check($opDd, !!$opHidden.value);
    check($date, !!$date.value);
    check($from, !!$from.value.trim());
    check($to, !!$to.value.trim());
    check($points, $points.value !== '' && !isNaN(Number($points.value)));

    if (firstMissing) {
      $error.textContent = 'Please fill in all fields.';
      if (firstMissing.focus) firstMissing.focus();
      return;
    }
    if ($from.value.trim() === $to.value.trim()) {
      $to.classList.add('error');
      $error.textContent = 'From and To must differ.';
      $to.focus();
      return;
    }

    $submit.disabled = true;
    try {
      await addTrainTrip({
        operator: $opHidden.value,
        date: $date.value,
        from_station: $from.value.trim(),
        to_station: $to.value.trim(),
        points: parseInt($points.value, 10),
      });
      // Reset for next entry — keep operator and date so the next entry is
      // typically just from/to/points away.
      $date.value = todayIso();
      $from.value = '';
      $to.value = '';
      $points.value = '';
      $from.focus();
    } catch (err) {
      $error.textContent = 'Save failed: ' + (err.message || err);
    } finally {
      $submit.disabled = false;
    }
  });
}

function setLogoDropdownValue($dd, $current, $hidden, value) {
  const op = OPERATORS.find(o => o.id === value);
  if (!op) return;
  $hidden.value = value;
  $current.innerHTML = `<img src="${op.logo}" alt="${op.id}"><span class="logo-dropdown-name">${op.id}</span>`;
}

// Build the points-suggestions datalist from previously entered values.
function refreshPointsSuggestions() {
  const $list = document.getElementById('train-points-suggestions');
  if (!$list) return;
  const seen = new Set();
  for (const t of store.trainTrips || []) {
    if (t.points != null) seen.add(Number(t.points));
  }
  const sorted = [...seen].sort((a, b) => a - b);
  $list.innerHTML = sorted.map(n => `<option value="${n}">`).join('');
}

// ============================================================
// FFP status bars
// ============================================================
function computeWindow(program, now) {
  if (program.windowKind === 'rolling12') {
    const end = new Date(now);
    const start = new Date(now);
    start.setFullYear(start.getFullYear() - 1);
    return { start, end, kind: 'rolling12', label: rollingLabel(start, end) };
  }
  // Annual: anchor month/day from program_adjustments.qualification_start.
  const adj = store.programAdjustments?.get(program.id);
  const qs = adj?.qualification_start;
  if (qs) {
    const parts = qs.split('-');
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    let start = new Date(now.getFullYear(), month, day);
    if (start > now) start = new Date(now.getFullYear() - 1, month, day);
    const end = new Date(start);
    end.setFullYear(end.getFullYear() + 1);
    return { start, end, kind: 'annual', label: annualLabel(start, end) };
  }
  // Default: calendar year
  const year = now.getFullYear();
  return {
    start: new Date(year, 0, 1),
    end: new Date(year + 1, 0, 1),
    kind: 'calendar',
    label: String(year),
  };
}

function annualLabel(start, end) {
  const endInc = new Date(end);
  endInc.setDate(endInc.getDate() - 1);
  const f = d => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  return `${f(start)} – ${f(endInc)}`;
}
function rollingLabel(start, end) {
  const f = d => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  return `Last 12 months (${f(start)} – ${f(end)})`;
}

function isoDateLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function computeProgramTotal(program, window) {
  const allowed = new Set(program.operators);
  const startStr = isoDateLocal(window.start);
  const endStr = isoDateLocal(window.end);
  let total = 0;
  for (const t of store.trainTrips || []) {
    if (!t.date) continue;
    if (!allowed.has(t.operator)) continue;
    if (t.date < startStr || t.date >= endStr) continue;
    if (t.points != null) total += Number(t.points) || 0;
  }
  const adj = store.programAdjustments?.get(program.id);
  const correction = (adj && Number.isFinite(adj.manual_correction)) ? adj.manual_correction : 0;
  return { total: total + correction, fromTrips: total, correction };
}

function renderStatusBars() {
  const now = new Date();
  for (const p of PROGRAMS) {
    const window = computeWindow(p, now);
    const balance = computeProgramTotal(p, window);

    const $window = document.getElementById(`train-prog-window-${p.id}`);
    if ($window) $window.textContent = window.label;

    renderProgramBar(p, balance.total);
    renderProgramAxis(p);
    renderProgramTotal(p, balance);
  }
}

function renderProgramBar(program, total) {
  const $wrap = document.getElementById(`train-prog-bar-${program.id}`);
  if (!$wrap) return;
  const finalTarget = program.targets[program.targets.length - 1];
  const fraction = total / finalTarget;
  const widthPct = Math.min(fraction, FFP_VISUAL_CAP) * 100;
  const pct = Math.round(fraction * 100);
  $wrap.innerHTML = `
    <div class="train-track">
      <div class="train-fill" style="width: ${widthPct.toFixed(2)}%"></div>
      <span class="train-pct ${widthPct > 18 ? 'on-fill' : ''}">${pct}%</span>
    </div>
  `;
}

function renderProgramAxis(program) {
  const $axis = document.getElementById(`train-prog-axis-${program.id}`);
  if (!$axis) return;
  const finalTarget = program.targets[program.targets.length - 1];
  const ticks = [{ value: 0, pct: 0 }];
  for (const t of program.targets) {
    ticks.push({ value: t, pct: (t / finalTarget) * 100 });
  }
  $axis.innerHTML = ticks.map((t, i) => {
    const cls = i === 0 ? 'first' : (i === ticks.length - 1 ? 'last' : 'mid');
    return `<span class="train-axis-tick train-axis-${cls}" style="left: ${t.pct.toFixed(2)}%">
              <span class="train-axis-num">${t.value.toLocaleString()}</span>
            </span>`;
  }).join('');
}

function renderProgramTotal(program, balance) {
  const $total = document.getElementById(`train-prog-total-${program.id}`);
  if (!$total) return;
  const finalTarget = program.targets[program.targets.length - 1];
  $total.textContent = `${balance.total.toLocaleString()} points`;
  $total.classList.toggle('at-target', balance.total >= finalTarget);
}

// ============================================================
// Adjustments modal (per program)
// ============================================================
function initStatusButtons() {
  mounted.querySelectorAll('.train-prog-adjust').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      openAdjustmentsModal(btn.dataset.prog);
    });
  });
}

function openAdjustmentsModal(programId) {
  const program = PROGRAMS.find(p => p.id === programId);
  if (!program) return;
  const adj = store.programAdjustments?.get(programId) || {};
  const currentCorrection = Number.isFinite(adj.manual_correction) ? adj.manual_correction : 0;
  const currentStart = adj.qualification_start || '';
  const isRolling = program.windowKind === 'rolling12';

  const wrap = document.createElement('div');
  wrap.className = 'modal';
  wrap.innerHTML = `
    <div class="modal-card rollover-modal">
      <header class="modal-head">
        <h2>Adjustments — ${escapeHtml(program.name)}</h2>
        <button class="ghost icon-only" id="ta-close" aria-label="Close">×</button>
      </header>
      <div class="modal-body">
        <div class="field">
          <label>Manual balance correction</label>
          <input type="number" id="ta-correction" step="1" value="${currentCorrection}" autocomplete="off">
          <p class="hint-text">Added to the total. Use a negative number to subtract.</p>
        </div>
        ${isRolling ? `
          <div class="field">
            <label>Window</label>
            <p class="hint-text">This program counts the last 12 months from today (rolling). No annual reset date applies.</p>
          </div>
        ` : `
          <div class="field">
            <label>Annual reset date <span class="hint">(optional)</span></label>
            <input type="date" id="ta-start" value="${currentStart}" autocomplete="off">
            <p class="hint-text">The day each year when the program year resets. Pick any date with the right month/day — the year part is auto-rolled. Leave empty to use the calendar year.</p>
            <button type="button" class="ghost small" id="ta-start-clear">Clear date</button>
          </div>
        `}
        <p class="error-msg" id="ta-error"></p>
      </div>
      <footer class="modal-foot">
        <span></span>
        <div class="foot-right">
          <button class="ghost" id="ta-cancel">Cancel</button>
          <button class="primary" id="ta-save">Save</button>
        </div>
      </footer>
    </div>
  `;
  document.body.appendChild(wrap);

  const close = () => wrap.remove();
  const $correction = wrap.querySelector('#ta-correction');
  const $start = wrap.querySelector('#ta-start');
  setTimeout(() => { $correction.focus(); $correction.select(); }, 0);

  wrap.querySelector('#ta-close').addEventListener('click', close);
  wrap.querySelector('#ta-cancel').addEventListener('click', close);
  if (!isRolling) {
    wrap.querySelector('#ta-start-clear').addEventListener('click', () => { $start.value = ''; });
  }
  wrap.addEventListener('click', e => { if (e.target === wrap) close(); });

  const save = async () => {
    const $err = wrap.querySelector('#ta-error');
    $err.textContent = '';
    const cVal = $correction.value.trim();
    if (cVal === '' || isNaN(Number(cVal))) {
      $err.textContent = 'Manual correction must be a number.';
      return;
    }
    const patch = { manual_correction: Number(cVal) };
    if (!isRolling) patch.qualification_start = $start.value || null;
    const $save = wrap.querySelector('#ta-save');
    $save.disabled = true;
    try {
      await setProgramAdjustment(programId, patch);
      close();
    } catch (e) {
      $err.textContent = 'Save failed: ' + (e.message || e);
      $save.disabled = false;
    }
  };
  wrap.querySelector('#ta-save').addEventListener('click', save);
  $correction.addEventListener('keydown', e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') close(); });
  if ($start) $start.addEventListener('keydown', e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') close(); });
}

// ============================================================
// Edit modal (existing trip)
// ============================================================
function openEditModal(tripId) {
  const trip = store.trainTrips.find(t => t.id === tripId);
  if (!trip) return;

  const wrap = document.createElement('div');
  wrap.className = 'modal';
  wrap.innerHTML = `
    <div class="modal-card train-edit-modal">
      <header class="modal-head">
        <h2>Edit trip</h2>
        <button class="ghost icon-only" id="te-close" aria-label="Close">×</button>
      </header>
      <div class="modal-body">
        <div class="field">
          <label>Operator</label>
          <select id="te-operator">
            ${OPERATORS.map(op => `<option value="${op.id}"${op.id === trip.operator ? ' selected' : ''}>${op.id}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Date</label>
          <input type="date" id="te-date" value="${trip.date}">
        </div>
        <div class="field-row">
          <div class="field">
            <label>From</label>
            <input type="text" id="te-from" value="${escapeAttr(trip.from_station || '')}" autocomplete="off">
          </div>
          <div class="field">
            <label>To</label>
            <input type="text" id="te-to" value="${escapeAttr(trip.to_station || '')}" autocomplete="off">
          </div>
        </div>
        <div class="field">
          <label>Points</label>
          <input type="number" id="te-points" min="0" step="1" value="${trip.points ?? ''}" autocomplete="off">
        </div>
        <p class="error-msg" id="te-error"></p>
      </div>
      <footer class="modal-foot">
        <button class="ghost danger" id="te-delete">Delete</button>
        <div class="foot-right">
          <button class="ghost" id="te-cancel">Cancel</button>
          <button class="primary" id="te-save">Save</button>
        </div>
      </footer>
    </div>
  `;
  document.body.appendChild(wrap);

  const close = () => wrap.remove();
  wrap.querySelector('#te-close').addEventListener('click', close);
  wrap.querySelector('#te-cancel').addEventListener('click', close);
  wrap.addEventListener('click', e => { if (e.target === wrap) close(); });

  setTimeout(() => wrap.querySelector('#te-date').focus(), 0);

  wrap.querySelector('#te-save').addEventListener('click', async () => {
    const $err = wrap.querySelector('#te-error');
    $err.textContent = '';
    const operator = wrap.querySelector('#te-operator').value;
    const date = wrap.querySelector('#te-date').value;
    const from_station = wrap.querySelector('#te-from').value.trim();
    const to_station = wrap.querySelector('#te-to').value.trim();
    const pointsStr = wrap.querySelector('#te-points').value.trim();
    const points = pointsStr === '' ? null : parseInt(pointsStr, 10);

    if (!operator || !date || !from_station || !to_station) {
      $err.textContent = 'Operator, date, from and to are required.';
      return;
    }
    if (from_station === to_station) {
      $err.textContent = 'From and To must differ.';
      return;
    }

    const $save = wrap.querySelector('#te-save');
    $save.disabled = true;
    try {
      await updateTrainTrip(tripId, { operator, date, from_station, to_station, points });
      close();
    } catch (e) {
      $err.textContent = 'Save failed: ' + (e.message || e);
      $save.disabled = false;
    }
  });

  wrap.querySelector('#te-delete').addEventListener('click', async () => {
    if (!confirm(`Delete this trip (${trip.date} ${trip.from_station} → ${trip.to_station})?`)) return;
    try {
      await deleteTrainTrip(tripId);
      close();
    } catch (e) {
      wrap.querySelector('#te-error').textContent = 'Delete failed: ' + (e.message || e);
    }
  });
}

// ============================================================
// Helpers
// ============================================================
function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${parseInt(d, 10)} ${months[parseInt(m, 10) - 1]} ${y}`;
}
function formatWeekday(iso) {
  if (!iso) return '';
  const dt = new Date(iso + 'T00:00:00');
  return dt.toLocaleDateString(undefined, { weekday: 'long' });
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function escapeAttr(s) { return escapeHtml(s); }
