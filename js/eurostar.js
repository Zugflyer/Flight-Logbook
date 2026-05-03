// ============================================================================
// Flight Log — Eurostar tab
//
// Reachable by clicking the Eurostar logo in the right-hand box of the
// header. Currently shows a list of trips on the left half (newest first)
// with edit/delete on each row. The right half is reserved for whatever
// will be added next.
// ============================================================================

import { store, onChange, updateEurostarTrip, deleteEurostarTrip } from './data.js';

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
        <!-- Reserved for future content -->
      </section>
    </div>
  `;

  onChange(evt => {
    if (!evt) return;
    if (evt.type === 'data:loaded' || evt.type === 'eurostar:changed' || evt.type === 'auth:locked') {
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
