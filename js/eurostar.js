// ============================================================================
// Flight Log — Eurostar tab
//
// Reachable by clicking the Eurostar logo in the right-hand box of the
// header. Currently shows a list of trips on the left half (newest first)
// with edit/delete on each row. The right half is reserved for whatever
// will be added next.
// ============================================================================

import { store, onChange, addEurostarTrip, updateEurostarTrip, deleteEurostarTrip, setProgramAdjustment } from './data.js';

// Cities in the dropdowns. The order is intentional and asymmetric: in the
// FROM list, Paris is first (most flights start there); in the TO list,
// London is first.
const CITIES_FROM = ['Paris', 'London', 'Bruxelles', 'Amsterdam'];
const CITIES_TO   = ['London', 'Paris', 'Bruxelles', 'Amsterdam'];

let mounted = null;

export function initEurostar() {
  mounted = document.querySelector('[data-panel="eurostar"]');
  if (!mounted) return;

  mounted.innerHTML = `
    <div class="eurostar-root">
      <section class="eurostar-left">
        <header class="eurostar-head">
          <h2>Trips</h2>
          <p class="eurostar-summary" id="eurostar-summary">—</p>
        </header>
        <div class="eurostar-table-wrap">
          <div class="eurostar-thead">
            <div class="es-th es-col-date">Date</div>
            <div class="es-th es-col-route">Route</div>
            <div class="es-th es-col-points">Points</div>
            <div class="es-th es-col-actions"></div>
          </div>
          <div class="eurostar-tbody" id="eurostar-tbody"></div>
        </div>
      </section>
      <section class="eurostar-right" id="eurostar-right">
        <div class="es-add-card">
          <header class="eurostar-head">
            <h2>Add trip</h2>
          </header>
          <form class="es-form" id="es-form" autocomplete="off">
            <div class="es-form-row">
              <div class="es-form-field">
                <label for="es-form-date">Date</label>
                <input type="date" id="es-form-date" required>
              </div>
              <div class="es-form-field">
                <label for="es-form-from">From</label>
                <select id="es-form-from" required>
                  ${CITIES_FROM.map(c => `<option value="${c}">${c}</option>`).join('')}
                </select>
              </div>
              <div class="es-form-field">
                <label for="es-form-to">To</label>
                <select id="es-form-to" required>
                  ${CITIES_TO.map(c => `<option value="${c}">${c}</option>`).join('')}
                </select>
              </div>
              <div class="es-form-field">
                <label for="es-form-points">Points</label>
                <input type="number" id="es-form-points" min="0" step="1" inputmode="numeric" list="es-points-suggestions" required>
                <datalist id="es-points-suggestions"></datalist>
              </div>
              <div class="es-form-action">
                <button type="submit" class="primary" id="es-form-submit">Add to logbook</button>
              </div>
            </div>
            <p class="es-form-error" id="es-form-error"></p>
          </form>
        </div>

        <div class="es-progress-card">
          <header class="eurostar-head">
            <div class="eurostar-head-titlewrap">
              <h2>Eurostar Club Avantage</h2>
              <span class="es-progress-window-label" id="es-progress-window"></span>
            </div>
            <button class="rollover-btn" id="es-progress-adjust" aria-label="Adjustments" title="Adjustments">+</button>
          </header>
          <div class="es-progress-body">
            <div class="es-progress-bar-wrap" id="es-progress-bar-wrap">
              <div class="es-progress-track">
                <div class="es-progress-fill" id="es-progress-fill"></div>
                <span class="es-progress-pct" id="es-progress-pct"></span>
              </div>
              <div class="es-progress-axis">
                <span class="es-axis-tick" style="left: 0%"><span class="es-axis-num">0</span></span>
                <span class="es-axis-tick" style="left: 58%"><span class="es-axis-num">2,900</span></span>
                <span class="es-axis-tick" style="left: 100%"><span class="es-axis-num">5,000</span></span>
              </div>
            </div>
            <div class="es-progress-total" id="es-progress-total"></div>
          </div>
        </div>
      </section>
    </div>
  `;

  onChange(evt => {
    if (!evt) return;
    if (evt.type === 'data:loaded' || evt.type === 'eurostar:changed' || evt.type === 'auth:locked' || evt.type === 'program:changed') {
      render();
    }
  });

  initAddForm();

  // Wire the adjustments button on the progress card
  const $adjustBtn = document.getElementById('es-progress-adjust');
  if ($adjustBtn) {
    $adjustBtn.addEventListener('click', openEsAdjustmentsModal);
  }

  if (store.ready) render();
}

// ============================================================
// Eurostar adjustments modal — manual correction + annual reset date
// ============================================================
function openEsAdjustmentsModal() {
  const adj = store.programAdjustments?.get(ES_PROGRAM_ID) || {};
  const currentCorrection = Number.isFinite(adj.manual_correction) ? adj.manual_correction : 0;
  const currentStart = adj.qualification_start || '';

  const wrap = document.createElement('div');
  wrap.className = 'modal';
  wrap.innerHTML = `
    <div class="modal-card rollover-modal">
      <header class="modal-head">
        <h2>Adjustments — Eurostar</h2>
        <button class="ghost icon-only" id="esa-close" aria-label="Close">×</button>
      </header>
      <div class="modal-body">
        <div class="field">
          <label>Manual balance correction</label>
          <input type="number" id="esa-correction" step="1" value="${currentCorrection}" autocomplete="off">
          <p class="hint-text">Added to the total. Use a negative number to subtract.</p>
        </div>
        <div class="field">
          <label>Annual reset date <span class="hint">(optional)</span></label>
          <input type="date" id="esa-start" value="${currentStart}" autocomplete="off">
          <p class="hint-text">The day each year when the program year resets. Pick any date with the right month/day — the year part is auto-rolled. Leave empty to use the calendar year.</p>
          <button type="button" class="ghost small" id="esa-start-clear">Clear date</button>
        </div>
        <p class="error-msg" id="esa-error"></p>
      </div>
      <footer class="modal-foot">
        <span></span>
        <div class="foot-right">
          <button class="ghost" id="esa-cancel">Cancel</button>
          <button class="primary" id="esa-save">Save</button>
        </div>
      </footer>
    </div>
  `;
  document.body.appendChild(wrap);

  const close = () => wrap.remove();
  const $correction = wrap.querySelector('#esa-correction');
  const $start = wrap.querySelector('#esa-start');
  setTimeout(() => { $correction.focus(); $correction.select(); }, 0);

  wrap.querySelector('#esa-close').addEventListener('click', close);
  wrap.querySelector('#esa-cancel').addEventListener('click', close);
  wrap.querySelector('#esa-start-clear').addEventListener('click', () => { $start.value = ''; });
  wrap.addEventListener('click', e => { if (e.target === wrap) close(); });

  const save = async () => {
    const $err = wrap.querySelector('#esa-error');
    $err.textContent = '';
    const cVal = $correction.value.trim();
    if (cVal === '' || isNaN(Number(cVal))) {
      $err.textContent = 'Manual correction must be a number.';
      return;
    }
    const startVal = $start.value || null;
    const $save = wrap.querySelector('#esa-save');
    $save.disabled = true;
    try {
      await setProgramAdjustment(ES_PROGRAM_ID, {
        manual_correction: Number(cVal),
        qualification_start: startVal,
      });
      close();
    } catch (e) {
      $err.textContent = 'Save failed: ' + (e.message || e);
      $save.disabled = false;
    }
  };
  wrap.querySelector('#esa-save').addEventListener('click', save);
  $correction.addEventListener('keydown', e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') close(); });
  $start.addEventListener('keydown', e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') close(); });
}

// ============================================================
// Add-trip form (right side)
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
  const $form = document.getElementById('es-form');
  if (!$form) return;
  const $date = document.getElementById('es-form-date');
  const $from = document.getElementById('es-form-from');
  const $to = document.getElementById('es-form-to');
  const $points = document.getElementById('es-form-points');
  const $error = document.getElementById('es-form-error');
  const $submit = document.getElementById('es-form-submit');

  // Prefill today
  $date.value = todayIso();

  // Arrow keys on the date field shift by ±1 day. The native date input does
  // increment when focused on the day part, but the behavior is inconsistent
  // across browsers / focus states — this makes it reliable.
  $date.addEventListener('keydown', e => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      $date.value = shiftDateIso($date.value, 1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      $date.value = shiftDateIso($date.value, -1);
    }
  });

  // Clear the red "missing" highlight on a field as soon as the user
  // interacts with it, so they get instant feedback.
  for (const el of [$date, $from, $to, $points]) {
    const clear = () => el.classList.remove('error');
    el.addEventListener('input', clear);
    el.addEventListener('change', clear);
    el.addEventListener('focus', clear);
  }

  $form.addEventListener('submit', async e => {
    e.preventDefault();
    $error.textContent = '';

    // Validate. Mark every empty field; do NOT submit if anything is missing.
    let firstMissing = null;
    const check = (el, ok) => {
      if (!ok) {
        el.classList.add('error');
        if (!firstMissing) firstMissing = el;
      } else {
        el.classList.remove('error');
      }
    };
    check($date, !!$date.value);
    check($from, !!$from.value);
    check($to, !!$to.value);
    check($points, $points.value !== '' && !isNaN(Number($points.value)));

    if (firstMissing) {
      $error.textContent = 'Please fill in all fields.';
      firstMissing.focus();
      return;
    }
    if ($from.value === $to.value) {
      $to.classList.add('error');
      $error.textContent = 'From and To must differ.';
      $to.focus();
      return;
    }

    $submit.disabled = true;
    try {
      await addEurostarTrip({
        date: $date.value,
        from_station: $from.value,
        to_station: $to.value,
        points: parseInt($points.value, 10),
      });
      // Reset for next entry: keep today's date, default the cities to their
      // first option, clear points.
      $date.value = todayIso();
      $from.value = CITIES_FROM[0];
      $to.value = CITIES_TO[0];
      $points.value = '';
      $points.focus();
    } catch (err) {
      $error.textContent = 'Save failed: ' + (err.message || err);
    } finally {
      $submit.disabled = false;
    }
  });
}

// Build the points-suggestions datalist from previously entered values.
// Called from render() so it stays current as the user adds trips.
function refreshPointsSuggestions() {
  const $list = document.getElementById('es-points-suggestions');
  if (!$list) return;
  const seen = new Set();
  for (const t of store.eurostarTrips || []) {
    if (t.points != null) seen.add(Number(t.points));
  }
  const sorted = [...seen].sort((a, b) => a - b);
  $list.innerHTML = sorted.map(n => `<option value="${n}">`).join('');
}

// ============================================================
// FFP progress bar (Eurostar Club Avantage)
// ============================================================
const FFP_TARGET = 5000;
const FFP_VISUAL_CAP = 1.3;  // bar can extend up to 130% of track width
const ES_PROGRAM_ID = 'es';  // row in program_adjustments holding the anchor

// Compute the annual-rolling window using the same interpretation as the
// Status tab: only month/day from qualification_start matter; the year is
// the most recent past occurrence. Defaults to calendar year if unset.
function computeEsWindow(now) {
  const adj = store.programAdjustments?.get(ES_PROGRAM_ID);
  const qs = adj?.qualification_start;
  if (qs) {
    const parts = qs.split('-');
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    let start = new Date(now.getFullYear(), month, day);
    if (start > now) {
      start = new Date(now.getFullYear() - 1, month, day);
    }
    const end = new Date(start);
    end.setFullYear(end.getFullYear() + 1);
    return { start, end, custom: true };
  }
  const year = now.getFullYear();
  return {
    start: new Date(year, 0, 1),
    end: new Date(year + 1, 0, 1),
    custom: false,
  };
}

function isoDateLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatWindowLabelShort(start, end) {
  const endInc = new Date(end);
  endInc.setDate(endInc.getDate() - 1);
  const f = d => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  return `${f(start)} – ${f(endInc)}`;
}

function renderProgress() {
  const $fill = document.getElementById('es-progress-fill');
  const $pct = document.getElementById('es-progress-pct');
  const $total = document.getElementById('es-progress-total');
  const $window = document.getElementById('es-progress-window');
  if (!$fill || !$pct || !$total) return;

  const now = new Date();
  const window = computeEsWindow(now);
  const startStr = isoDateLocal(window.start);
  const endStr = isoDateLocal(window.end);  // exclusive

  let total = 0;
  for (const t of store.eurostarTrips || []) {
    if (!t.date) continue;
    if (t.date < startStr || t.date >= endStr) continue;
    if (t.points != null) total += Number(t.points) || 0;
  }

  // Manual correction (same field as the airline programs)
  const adj = store.programAdjustments?.get(ES_PROGRAM_ID);
  const correction = (adj && Number.isFinite(adj.manual_correction)) ? adj.manual_correction : 0;
  total += correction;

  const fraction = total / FFP_TARGET;
  const widthPct = Math.min(fraction, FFP_VISUAL_CAP) * 100;
  const pct = Math.round(fraction * 100);

  $fill.style.width = `${widthPct.toFixed(2)}%`;
  $pct.textContent = `${pct}%`;
  $total.textContent = `${total.toLocaleString()} points`;
  $pct.classList.toggle('on-fill', widthPct > 18);
  $total.classList.toggle('at-target', total >= FFP_TARGET);

  if ($window) {
    $window.textContent = window.custom ? formatWindowLabelShort(window.start, window.end) : String(now.getFullYear());
  }
}

// ============================================================
// Render
// ============================================================
function render() {
  if (!mounted) return;
  refreshPointsSuggestions();
  renderProgress();
  const trips = store.eurostarTrips || [];
  const total = trips.reduce((s, t) => s + (Number(t.points) || 0), 0);

  const $summary = document.getElementById('eurostar-summary');
  if ($summary) {
    $summary.textContent = trips.length
      ? `${trips.length} trip${trips.length === 1 ? '' : 's'} · ${total.toLocaleString()} points`
      : 'No trips yet.';
  }

  const $body = document.getElementById('eurostar-tbody');
  if (!$body) return;

  if (!trips.length) {
    $body.innerHTML = `<div class="eurostar-empty">No trips yet.</div>`;
    return;
  }

  $body.innerHTML = trips.map(t => `
    <div class="es-tr" data-id="${t.id}">
      <div class="es-td es-col-date">
        <div class="es-date-main">${formatDate(t.date)}</div>
        <div class="es-date-sub">${formatWeekday(t.date)}</div>
      </div>
      <div class="es-td es-col-route">
        <span class="es-from">${escapeHtml(t.from_station || '')}</span>
        <span class="es-arrow">→</span>
        <span class="es-to">${escapeHtml(t.to_station || '')}</span>
      </div>
      <div class="es-td es-col-points">${t.points != null ? Number(t.points).toLocaleString() : '—'}</div>
      <div class="es-td es-col-actions">
        <button class="es-action-btn" data-id="${t.id}" data-action="edit" aria-label="Edit">✎</button>
      </div>
    </div>
  `).join('');

  $body.querySelectorAll('.es-action-btn[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      openEditModal(btn.dataset.id);
    });
  });
}

// ============================================================
// Edit / delete modal
// ============================================================
function openEditModal(tripId) {
  const trip = store.eurostarTrips.find(t => t.id === tripId);
  if (!trip) return;

  const wrap = document.createElement('div');
  wrap.className = 'modal';
  wrap.innerHTML = `
    <div class="modal-card eurostar-modal">
      <header class="modal-head">
        <h2>Edit trip</h2>
        <button class="ghost icon-only" id="es-close" aria-label="Close">×</button>
      </header>
      <div class="modal-body">
        <div class="field">
          <label>Date</label>
          <input type="date" id="es-date" value="${trip.date}">
        </div>
        <div class="field-row">
          <div class="field">
            <label>From</label>
            <input type="text" id="es-from" value="${escapeAttr(trip.from_station || '')}" autocomplete="off">
          </div>
          <div class="field">
            <label>To</label>
            <input type="text" id="es-to" value="${escapeAttr(trip.to_station || '')}" autocomplete="off">
          </div>
        </div>
        <div class="field">
          <label>Points</label>
          <input type="number" id="es-points" min="0" step="1" value="${trip.points ?? ''}" autocomplete="off">
        </div>
        <p class="error-msg" id="es-error"></p>
      </div>
      <footer class="modal-foot">
        <button class="ghost danger" id="es-delete">Delete</button>
        <div class="foot-right">
          <button class="ghost" id="es-cancel">Cancel</button>
          <button class="primary" id="es-save">Save</button>
        </div>
      </footer>
    </div>
  `;
  document.body.appendChild(wrap);

  const close = () => wrap.remove();
  wrap.querySelector('#es-close').addEventListener('click', close);
  wrap.querySelector('#es-cancel').addEventListener('click', close);
  wrap.addEventListener('click', e => { if (e.target === wrap) close(); });

  setTimeout(() => wrap.querySelector('#es-date').focus(), 0);

  wrap.querySelector('#es-save').addEventListener('click', async () => {
    const $err = wrap.querySelector('#es-error');
    $err.textContent = '';
    const date = wrap.querySelector('#es-date').value;
    const from_station = wrap.querySelector('#es-from').value.trim();
    const to_station = wrap.querySelector('#es-to').value.trim();
    const pointsStr = wrap.querySelector('#es-points').value.trim();
    const points = pointsStr === '' ? null : parseInt(pointsStr, 10);

    if (!date || !from_station || !to_station) {
      $err.textContent = 'Date, From and To are required.';
      return;
    }
    if (from_station === to_station) {
      $err.textContent = 'From and To must differ.';
      return;
    }

    const $save = wrap.querySelector('#es-save');
    $save.disabled = true;
    try {
      await updateEurostarTrip(tripId, { date, from_station, to_station, points });
      close();
    } catch (e) {
      $err.textContent = 'Save failed: ' + (e.message || e);
      $save.disabled = false;
    }
  });

  wrap.querySelector('#es-delete').addEventListener('click', async () => {
    if (!confirm(`Delete this trip (${trip.date} ${trip.from_station} → ${trip.to_station})?`)) return;
    try {
      await deleteEurostarTrip(tripId);
      close();
    } catch (e) {
      wrap.querySelector('#es-error').textContent = 'Delete failed: ' + (e.message || e);
    }
  });
}

// ============================================================
// Helpers
// ============================================================
function formatDate(iso) {
  // "2025-10-20" → "20 Oct 2025"
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
