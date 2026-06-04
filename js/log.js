// ============================================================================
// Flight Log — table tab
// Columns (left → right): Logo · EQP · Route · Distance · Cabin · Tier · Date
// Virtual scrolling, filter bar, add/edit/delete modal with autocomplete.
// ============================================================================

import {
  store, onChange, addFlight, updateFlight, deleteFlight,
  uniqueAirlines, uniqueAircraft, searchAirports,
  addAirport, updateAirport, deleteAirport,
  addAircraftType, updateAircraftType, deleteAircraftType,
  isHistoric,
} from './data.js';

import { aircraftCode, fullNameFromIcao, isKnownIcao, knownIcaoCodes } from './aircraft.js';
import { getLogoUrl, hasLogo, uploadLogo, removeLogo, pickLogoFile, onLogoChange } from './logos.js';

function getUnit() {
  try { return JSON.parse(localStorage.getItem('flightlog.settings.v1') || '{}').unit || 'km'; }
  catch { return 'km'; }
}

const ROW_HEIGHT = 60;
const BUFFER_ROWS = 5;
const CABINS = ['Economy', 'Premium Economy', 'Business', 'First'];

// ----- Filter state -----
const filters = {
  search: '',
  year: 'all',
  airline: 'all',
  cabin: 'all',
  sort: { col: 'date', dir: 'desc' },
};

let panel = null;
let lastFlash = null;
let cachedRows = null;

export function initLog() {
  panel = document.querySelector('.panel[data-panel="log"]');
  panel.innerHTML = `
    <div class="log-root">
      <header class="log-header">
        <div class="log-titleblock">
          <h2>Flight Log</h2>
          <p class="log-summary" id="log-summary">—</p>
        </div>
        <div class="log-actions">
          <button class="primary" id="btn-add">+ Add flight</button>
        </div>
      </header>

      <div class="log-filters">
        <input type="search" id="f-search" placeholder="Search city, IATA, airline, aircraft…">
        <select id="f-year"><option value="all">All years</option></select>
        <select id="f-airline"><option value="all">All airlines</option></select>
        <select id="f-cabin">
          <option value="all">All cabins</option>
          ${CABINS.map(c => `<option value="${c}">${c}</option>`).join('')}
        </select>
        <button class="ghost small" id="f-clear">Clear</button>
      </div>

      <div class="log-table-wrap">
        <div class="log-hscroll">
          <div class="log-thead">
            <div class="th col-logo" data-sort="airline">Airline <span class="caret"></span></div>
            <div class="th col-eqp" data-sort="aircraft">EQP <span class="caret"></span></div>
            <div class="th col-route" data-sort="route">Route <span class="caret"></span></div>
            <div class="th col-distance" data-sort="distance">Distance <span class="caret"></span></div>
            <div class="th col-cabin" data-sort="cabin">Cabin <span class="caret"></span></div>
            <div class="th col-tier" data-sort="tier_miles">Tier <span class="caret"></span></div>
            <div class="th col-date" data-sort="date">Date <span class="caret"></span></div>
            <div class="th col-credit"></div>
          </div>
          <div class="log-tbody-scroll" id="tbody-scroll">
            <div class="log-tbody-spacer" id="tbody-spacer"></div>
            <div class="log-tbody" id="tbody"></div>
          </div>
        </div>
      </div>
    </div>

    <aside class="log-side" id="log-side">
      <div class="log-side-empty">Statistics panel — to be filled</div>
    </aside>
  `;

  wireFilters();
  wireSorting();
  wireScroll();
  document.getElementById('btn-add').addEventListener('click', () => openModal());

  document.addEventListener('keydown', e => {
    const isLogActive = panel.classList.contains('active');
    const inField = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
    if (isLogActive && !inField && (e.key === 'n' || e.key === 'N') && !e.metaKey && !e.ctrlKey) {
      openModal();
      e.preventDefault();
    }
  });

  onChange(evt => {
    if (!evt || typeof evt !== 'object') return;
    if (evt.type === 'data:loaded' || evt.type === 'data:changed' || evt.type === 'airports:changed' || evt.type === 'aircraft:changed') {
      populateFilterOptions();
      render();
    }
  });

  // Re-render whenever a logo is added/replaced/removed
  onLogoChange(() => render());

  window.addEventListener('flightlog:settings-changed', () => render());

  if (store.ready) {
    populateFilterOptions();
    render();
  }
}

// ============================================================
// Filter / sort / scroll wiring
// ============================================================
function wireFilters() {
  const $search = document.getElementById('f-search');
  const $year = document.getElementById('f-year');
  const $airline = document.getElementById('f-airline');
  const $cabin = document.getElementById('f-cabin');
  const $clear = document.getElementById('f-clear');

  let searchDebounce;
  $search.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => { filters.search = $search.value.trim(); render(); }, 120);
  });
  $year.addEventListener('change', () => { filters.year = $year.value; render(); });
  $airline.addEventListener('change', () => { filters.airline = $airline.value; render(); });
  $cabin.addEventListener('change', () => { filters.cabin = $cabin.value; render(); });
  $clear.addEventListener('click', () => {
    filters.search = ''; filters.year = 'all'; filters.airline = 'all'; filters.cabin = 'all';
    $search.value = ''; $year.value = 'all'; $airline.value = 'all'; $cabin.value = 'all';
    render();
  });
}

function wireSorting() {
  panel.querySelectorAll('.th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (filters.sort.col === col) {
        filters.sort.dir = filters.sort.dir === 'desc' ? 'asc' : 'desc';
      } else {
        filters.sort.col = col;
        filters.sort.dir = (col === 'date' || col === 'distance' || col === 'tier_miles') ? 'desc' : 'asc';
      }
      render();
    });
  });
}

function wireScroll() {
  document.getElementById('tbody-scroll').addEventListener('scroll', () => render(true));
}

function populateFilterOptions() {
  const years = new Set();
  let hasHistoric = false;
  for (const f of store.flights) {
    if (isHistoric(f)) { hasHistoric = true; continue; }
    if (f.date) years.add(f.date.slice(0, 4));
  }
  const $year = document.getElementById('f-year');
  const yearOptions = [...years].sort().reverse().map(y => `<option value="${y}">${y}</option>`).join('');
  const datedOption = `<option value="dated">All dated (post-2012)</option>`;
  const historicOption = hasHistoric ? `<option value="historic">Pre-2012</option>` : '';
  $year.innerHTML = `<option value="all">All years</option>${datedOption}${yearOptions}${historicOption}`;
  $year.value = filters.year;

  const $airline = document.getElementById('f-airline');
  $airline.innerHTML = `<option value="all">All airlines</option>` +
    uniqueAirlines().map(a => `<option value="${a}">${a}</option>`).join('');
  $airline.value = filters.airline;
}

// ============================================================
// Filtering + sorting
// ============================================================
function applyFilters() {
  let rows = store.flights;
  if (filters.year === 'historic') {
    rows = rows.filter(isHistoric);
  } else if (filters.year === 'dated') {
    rows = rows.filter(f => !isHistoric(f));
  } else if (filters.year !== 'all') {
    rows = rows.filter(f => !isHistoric(f) && f.date && f.date.startsWith(filters.year));
  }
  if (filters.airline !== 'all') rows = rows.filter(f => f.airline === filters.airline);
  if (filters.cabin !== 'all') rows = rows.filter(f => f.cabin === filters.cabin);
  if (filters.search) {
    const q = filters.search.toLowerCase();
    rows = rows.filter(f => {
      const fromA = store.airports.get(f.from_iata);
      const toA = store.airports.get(f.to_iata);
      const historicMatch = isHistoric(f) && ('pre-2012'.includes(q) || 'historic'.includes(q));
      return (
        historicMatch ||
        f.from_iata?.toLowerCase().includes(q) ||
        f.to_iata?.toLowerCase().includes(q) ||
        f.airline?.toLowerCase().includes(q) ||
        f.aircraft?.toLowerCase().includes(q) ||
        aircraftCode(f.aircraft).toLowerCase().includes(q) ||
        fromA?.city.toLowerCase().includes(q) ||
        toA?.city.toLowerCase().includes(q) ||
        fromA?.country.toLowerCase().includes(q) ||
        toA?.country.toLowerCase().includes(q)
      );
    });
  }

  const { col, dir } = filters.sort;
  const mul = dir === 'asc' ? 1 : -1;
  const distKey = getUnit() === 'mi' ? 'distance_mi' : 'distance_km';
  const cmp = (a, b) => {
    // Historic flights have no date — when sorting by date, they're treated
    // as older than any dated flight (sort to the "oldest" end).
    if (col === 'date') {
      const ah = isHistoric(a), bh = isHistoric(b);
      if (ah && bh) return 0;
      if (ah) return -1 * mul;
      if (bh) return 1 * mul;
      return a.date.localeCompare(b.date) * mul;
    }
    let av, bv;
    if (col === 'route')         { av = a.from_iata + a.to_iata; bv = b.from_iata + b.to_iata; }
    else if (col === 'distance') { av = a[distKey] || 0; bv = b[distKey] || 0; }
    else if (col === 'aircraft') { av = aircraftCode(a.aircraft); bv = aircraftCode(b.aircraft); }
    else                         { av = a[col] || ''; bv = b[col] || ''; }
    if (typeof av === 'string') return av.localeCompare(bv) * mul;
    return ((av || 0) - (bv || 0)) * mul;
  };
  rows = rows.slice().sort(cmp);
  return rows;
}

// ============================================================
// Render (virtual scroll)
// ============================================================
function render(layoutOnly = false) {
  const $scroll = document.getElementById('tbody-scroll');
  const $spacer = document.getElementById('tbody-spacer');
  const $tbody  = document.getElementById('tbody');
  const $summary = document.getElementById('log-summary');

  if (!layoutOnly || !cachedRows) cachedRows = applyFilters();
  const rows = cachedRows || [];

  $spacer.style.height = (rows.length * ROW_HEIGHT) + 'px';

  // Counts and sums exclude historic flights (per spec) — they have no real
  // date, distance, tier miles, or airline.
  const datedRows = rows.filter(f => !isHistoric(f));
  const totalDist = datedRows.reduce((s, f) => s + (getUnit() === 'mi' ? (f.distance_mi || 0) : (f.distance_km || 0)), 0);
  const totalTier = datedRows.reduce((s, f) => s + (f.tier_miles || 0), 0);

  // Airport count includes historic flights.
  const airportCodes = new Set();
  for (const f of rows) {
    if (f.from_iata) airportCodes.add(f.from_iata);
    if (f.to_iata)   airportCodes.add(f.to_iata);
  }

  const parts = [
    `${datedRows.length.toLocaleString()} flights`,
    `${Math.round(totalDist).toLocaleString()} ${getUnit()}`,
  ];
  if (totalTier) parts.push(`${totalTier.toLocaleString()} tier`);
  parts.push(`${airportCodes.size.toLocaleString()} airports`);
  $summary.textContent = parts.join(' · ');

  panel.querySelectorAll('.th[data-sort]').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (th.dataset.sort === filters.sort.col) th.classList.add('sort-' + filters.sort.dir);
  });

  const scrollTop = $scroll.scrollTop;
  const viewport = $scroll.clientHeight;
  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER_ROWS);
  const endIdx   = Math.min(rows.length, Math.ceil((scrollTop + viewport) / ROW_HEIGHT) + BUFFER_ROWS);

  const slice = rows.slice(startIdx, endIdx);
  $tbody.style.transform = `translateY(${startIdx * ROW_HEIGHT}px)`;
  $tbody.innerHTML = slice.map(rowHtml).join('');

  // Wire row clicks for opening edit modal — but NOT when the click is on
  // an airline-cell (those handle their own upload click) or the credit
  // tick button.
  $tbody.querySelectorAll('.tr').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.airline-cell')) return;
      if (e.target.closest('.credit-tick')) return;
      openModal(el.dataset.id);
    });
  });

  // Wire credit-tick: marks the flight as credited and removes the frame.
  $tbody.querySelectorAll('.credit-tick').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      btn.disabled = true;
      try {
        await updateFlight(id, { credited: true });
      } catch (err) {
        btn.disabled = false;
        alert('Failed to mark credited: ' + (err.message || err));
      }
    });
  });

  // Wire airline-cell clicks to file picker / upload flow
  $tbody.querySelectorAll('.airline-cell').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const iata = el.dataset.iata;
      if (!iata) return;
      await handleLogoUpload(iata);
    });
  });
}

function rowHtml(f) {
  const fromA = store.airports.get(f.from_iata);
  const toA   = store.airports.get(f.to_iata);
  const fromCity = fromA?.city || f.from_iata;
  const toCity   = toA?.city   || f.to_iata;
  const dist = getUnit() === 'mi' ? f.distance_mi : f.distance_km;
  const flashClass = f.id === lastFlash ? ' flash' : '';
  const historicClass = isHistoric(f) ? ' historic' : '';
  // Future flights: dated AFTER today's local date. Flights on today's date
  // are still treated as "current" (not future).
  const todayStr = new Date().toISOString().slice(0, 10);
  const futureClass = (!isHistoric(f) && f.date && f.date > todayStr) ? ' future' : '';
  // Uncredited flights: red frame + checkbox at the right end. Historic
  // flights are exempt — they have nothing to credit.
  const uncreditedClass = (!isHistoric(f) && f.credited === false) ? ' uncredited' : '';
  const creditCell = (!isHistoric(f) && f.credited === false)
    ? `<button class="credit-tick" data-id="${f.id}" title="Mark credited" aria-label="Mark credited">☐</button>`
    : '';
  const eqp = aircraftCode(f.aircraft);
  const dateCell = isHistoric(f)
    ? `<div class="date-historic">Pre-2012</div>`
    : `<div class="date-main">${formatDate(f.date)}</div>
       <div class="date-sub">${f.date.slice(0, 4)}</div>`;
  return `
    <div class="tr${flashClass}${historicClass}${futureClass}${uncreditedClass}" data-id="${f.id}" style="height:${ROW_HEIGHT}px">
      <div class="td col-logo">${airlineLogoHtml(f.airline)}</div>
      <div class="td col-eqp"><span class="eqp-code">${escapeHtml(eqp || '—')}</span></div>
      <div class="td col-route">
        <div class="route-iata">${f.from_iata} <span class="arrow">→</span> ${f.to_iata}</div>
        <div class="route-city">${escapeHtml(fromCity)} → ${escapeHtml(toCity)}</div>
      </div>
      <div class="td col-distance">${dist ? Math.round(dist).toLocaleString() : '—'}</div>
      <div class="td col-cabin">${cabinPill(f.cabin)}</div>
      <div class="td col-tier">${f.tier_miles?.toLocaleString() || '—'}</div>
      <div class="td col-date">${dateCell}</div>
      <div class="td col-credit">${creditCell}</div>
    </div>
  `;
}

function airlineLogoHtml(iata) {
  if (!iata) return '<span class="airline-chip airline-cell" data-iata="">—</span>';
  const code = String(iata).toUpperCase();
  const url = getLogoUrl(code);
  if (url) {
    return `<img class="airline-logo airline-cell" data-iata="${escapeHtml(code)}" src="${escapeHtml(url)}" alt="${escapeHtml(code)}" title="Click to replace logo">`;
  }
  return `<span class="airline-chip airline-cell" data-iata="${escapeHtml(code)}" title="Click to upload logo">${escapeHtml(code)}</span>`;
}

function cabinPill(cabin) {
  if (!cabin) return '—';
  const klass = cabin.toLowerCase().replace(/\s/g, '-');
  return `<span class="cabin-pill ${klass}">${cabin}</span>`;
}
function formatDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ============================================================
// Manage Airports modal — list view with search, add, edit, delete
// ============================================================
export function openManageAirports() {
  const wrap = document.createElement('div');
  wrap.className = 'modal';
  wrap.innerHTML = `
    <div class="modal-card manage-airports">
      <header class="modal-head">
        <h2>Manage airports</h2>
        <button class="ghost icon-only" id="ma-close" aria-label="Close">×</button>
      </header>
      <div class="ma-toolbar">
        <input type="search" id="ma-search" placeholder="Search by IATA, city, name, country…">
        <button class="primary" id="ma-add">+ Add airport</button>
      </div>
      <div class="ma-list" id="ma-list"></div>
      <footer class="modal-foot">
        <span class="muted small" id="ma-count"></span>
        <button class="ghost" id="ma-done">Done</button>
      </footer>
    </div>
  `;
  document.body.appendChild(wrap);

  const $search = wrap.querySelector('#ma-search');
  const $list = wrap.querySelector('#ma-list');
  const $count = wrap.querySelector('#ma-count');

  function renderList() {
    const q = $search.value.toLowerCase().trim();
    let rows;
    let modeLabel;
    if (q) {
      // Searching: scan the entire airport database
      rows = [...store.airports.values()].filter(a =>
        a.iata.toLowerCase().includes(q) ||
        (a.city || '').toLowerCase().includes(q) ||
        (a.name || '').toLowerCase().includes(q) ||
        (a.country || '').toLowerCase().includes(q)
      );
      modeLabel = `${rows.length.toLocaleString()} match${rows.length === 1 ? '' : 'es'} of ${store.airports.size.toLocaleString()} airports`;
    } else {
      // No search: show only airports actually used in your flights, so the
      // 8k-row global database doesn't overwhelm the list. Use the search
      // box to find any airport.
      const usedIatas = new Set();
      for (const f of store.flights) {
        if (f.from_iata) usedIatas.add(f.from_iata);
        if (f.to_iata) usedIatas.add(f.to_iata);
      }
      rows = [...store.airports.values()].filter(a => usedIatas.has(a.iata));
      modeLabel = `${rows.length.toLocaleString()} airports you've flown to · ${store.airports.size.toLocaleString()} in total — search to find any`;
    }
    rows.sort((a, b) => a.iata.localeCompare(b.iata));
    $count.textContent = modeLabel;
    if (!rows.length) {
      $list.innerHTML = `<div class="ma-empty">No matches.</div>`;
      return;
    }
    $list.innerHTML = rows.map(a => `
      <div class="ma-row" data-iata="${a.iata}">
        <span class="ma-iata">${a.iata}</span>
        <span class="ma-city">${escapeHtml(a.city || '')}</span>
        <span class="ma-country">${escapeHtml(a.country || '')}</span>
        <span class="ma-name">${escapeHtml(a.name || '')}</span>
      </div>
    `).join('');
    $list.querySelectorAll('.ma-row').forEach(el => {
      el.addEventListener('click', async () => {
        const iata = el.dataset.iata;
        const existing = store.airports.get(iata);
        if (!existing) return;
        const result = await openAirportModal({ existing });
        if (result) renderList();
      });
    });
  }

  $search.addEventListener('input', renderList);
  wrap.querySelector('#ma-add').addEventListener('click', async () => {
    const result = await openAirportModal({});
    if (result) {
      $search.value = result.iata || '';
      renderList();
    }
  });

  const close = () => wrap.remove();
  wrap.querySelector('#ma-close').addEventListener('click', close);
  wrap.querySelector('#ma-done').addEventListener('click', close);
  wrap.addEventListener('click', e => { if (e.target === wrap) close(); });

  renderList();
  setTimeout(() => $search.focus(), 0);
}

// ============================================================
// Manage aircraft modal — full list of aircraft type → ICAO mappings
// ============================================================
export function openManageAircraft() {
  const wrap = document.createElement('div');
  wrap.className = 'modal';
  wrap.innerHTML = `
    <div class="modal-card manage-airports">
      <header class="modal-head">
        <h2>Manage aircraft types</h2>
        <button class="ghost icon-only" id="mac-close" aria-label="Close">×</button>
      </header>
      <div class="ma-toolbar">
        <input type="search" id="mac-search" placeholder="Search by full name or ICAO code…">
        <button class="primary" id="mac-add">+ Add aircraft type</button>
      </div>
      <div class="ma-list mac-list" id="mac-list"></div>
      <footer class="modal-foot">
        <span class="muted small" id="mac-count"></span>
        <button class="ghost" id="mac-done">Done</button>
      </footer>
    </div>
  `;
  document.body.appendChild(wrap);

  const $search = wrap.querySelector('#mac-search');
  const $list = wrap.querySelector('#mac-list');
  const $count = wrap.querySelector('#mac-count');

  function renderList() {
    const q = $search.value.toLowerCase().trim();
    const allEntries = [...store.aircraftTypes.entries()];
    let rows = allEntries;
    if (q) {
      rows = allEntries.filter(([name, icao]) =>
        name.toLowerCase().includes(q) || icao.toLowerCase().includes(q)
      );
    }
    rows.sort((a, b) => a[0].localeCompare(b[0]));
    $count.textContent = q
      ? `${rows.length.toLocaleString()} match${rows.length === 1 ? '' : 'es'} of ${allEntries.length.toLocaleString()}`
      : `${allEntries.length.toLocaleString()} aircraft types`;
    if (!rows.length) {
      $list.innerHTML = `<div class="ma-empty">No matches.</div>`;
      return;
    }
    $list.innerHTML = rows.map(([name, icao]) => `
      <div class="ma-row mac-row" data-name="${escapeAttr(name)}">
        <span class="mac-icao">${escapeHtml(icao)}</span>
        <span class="mac-name">${escapeHtml(name)}</span>
      </div>
    `).join('');
    $list.querySelectorAll('.mac-row').forEach(el => {
      el.addEventListener('click', async () => {
        const name = el.dataset.name;
        const icao = store.aircraftTypes.get(name);
        if (icao == null) return;
        const result = await openAircraftTypeModal({ existing: { full_name: name, icao } });
        if (result) renderList();
      });
    });
  }

  $search.addEventListener('input', renderList);
  wrap.querySelector('#mac-add').addEventListener('click', async () => {
    const result = await openAircraftTypeModal({});
    if (result) { $search.value = ''; renderList(); }
  });

  const close = () => wrap.remove();
  wrap.querySelector('#mac-close').addEventListener('click', close);
  wrap.querySelector('#mac-done').addEventListener('click', close);
  wrap.addEventListener('click', e => { if (e.target === wrap) close(); });

  renderList();
  setTimeout(() => $search.focus(), 0);
}

// ============================================================
// Aircraft type add/edit modal
// Usage:
//   openAircraftTypeModal({})                              -> add new
//   openAircraftTypeModal({ existing: {full_name, icao} }) -> edit existing
// Returns a Promise that resolves with the saved row (or null on cancel).
// ============================================================
export function openAircraftTypeModal({ existing = null } = {}) {
  return new Promise(resolve => {
    const isEdit = !!existing;
    const r = existing || { full_name: '', icao: '' };

    const wrap = document.createElement('div');
    wrap.className = 'modal';
    wrap.innerHTML = `
      <div class="modal-card flight-modal">
        <header class="modal-head">
          <h2>${isEdit ? 'Edit aircraft type' : 'Add aircraft type'}</h2>
          <button class="ghost icon-only" id="at-close" aria-label="Close">×</button>
        </header>
        <div class="modal-body">
          <div class="field">
            <label>Full name</label>
            <input type="text" id="at-name" value="${escapeAttr(r.full_name)}" placeholder="e.g. Airbus A321neo" autocomplete="off">
          </div>
          <div class="field">
            <label>ICAO code</label>
            <input type="text" id="at-icao" value="${escapeAttr(r.icao)}" placeholder="e.g. A21N" autocomplete="off" style="text-transform: uppercase">
          </div>
          <p class="error-msg" id="at-error"></p>
        </div>
        <footer class="modal-foot">
          ${isEdit ? `<button class="ghost danger" id="at-delete">Delete</button>` : `<span></span>`}
          <div class="foot-right">
            <button class="ghost" id="at-cancel">Cancel</button>
            <button class="primary" id="at-save">${isEdit ? 'Save' : 'Add'}</button>
          </div>
        </footer>
      </div>
    `;
    document.body.appendChild(wrap);

    const $name = wrap.querySelector('#at-name');
    const $icao = wrap.querySelector('#at-icao');
    const $err = wrap.querySelector('#at-error');

    // Auto-uppercase ICAO as the user types
    $icao.addEventListener('input', () => {
      const v = $icao.value;
      const upper = v.toUpperCase();
      if (upper !== v) {
        const pos = $icao.selectionStart;
        $icao.value = upper;
        $icao.setSelectionRange(pos, pos);
      }
    });

    setTimeout(() => (isEdit ? $icao : $name).focus(), 0);

    const close = (val) => { wrap.remove(); resolve(val); };
    wrap.querySelector('#at-close').addEventListener('click', () => close(null));
    wrap.querySelector('#at-cancel').addEventListener('click', () => close(null));
    wrap.addEventListener('click', e => { if (e.target === wrap) close(null); });

    wrap.querySelector('#at-save').addEventListener('click', async () => {
      $err.textContent = '';
      const fullName = $name.value.trim();
      const icao = $icao.value.trim().toUpperCase();
      if (!fullName) { $err.textContent = 'Full name is required.'; return; }
      if (!icao) { $err.textContent = 'ICAO code is required.'; return; }
      if (!/^[A-Z0-9]{2,5}$/.test(icao)) {
        $err.textContent = 'ICAO should be 2–5 letters or digits.';
        return;
      }
      try {
        let saved;
        if (isEdit) {
          saved = await updateAircraftType(existing.full_name, { full_name: fullName, icao });
        } else {
          saved = await addAircraftType({ full_name: fullName, icao });
        }
        close(saved);
      } catch (e) {
        $err.textContent = 'Save failed: ' + (e.message || e);
      }
    });

    if (isEdit) {
      wrap.querySelector('#at-delete').addEventListener('click', async () => {
        if (!confirm(`Delete the mapping "${existing.full_name}" → "${existing.icao}"?`)) return;
        try {
          await deleteAircraftType(existing.full_name);
          close({ deleted: true });
        } catch (e) {
          $err.textContent = 'Delete failed: ' + (e.message || e);
        }
      });
    }
  });
}

// ============================================================
// Airport add / edit modal
// Usage:
//   openAirportModal({ iata: 'PMO' })  -> add new, prefilled IATA
//   openAirportModal({ existing: airportObj })  -> edit existing
// Returns a Promise that resolves with the saved airport (or null if cancelled).
// ============================================================
export function openAirportModal({ iata = '', existing = null } = {}) {
  return new Promise(resolve => {
    const isEdit = !!existing;
    const a = existing || { iata: iata.toUpperCase(), icao: '', name: '', city: '', country: '', lat: '', lon: '' };

    const wrap = document.createElement('div');
    wrap.className = 'modal';
    wrap.innerHTML = `
      <div class="modal-card flight-modal">
        <header class="modal-head">
          <h2>${isEdit ? 'Edit airport' : 'Add airport'}</h2>
          <button class="ghost icon-only" id="ap-close" aria-label="Close">×</button>
        </header>
        <div class="modal-body">
          <div class="field-row">
            <div class="field" style="flex: 0 0 110px;">
              <label>IATA <span class="hint">3 letters</span></label>
              <input type="text" id="ap-iata" maxlength="3" autocomplete="off" value="${escapeHtml(a.iata)}" ${isEdit ? 'disabled' : ''}>
            </div>
            <div class="field" style="flex: 0 0 130px;">
              <label>ICAO <span class="hint">optional</span></label>
              <input type="text" id="ap-icao" maxlength="4" autocomplete="off" value="${escapeHtml(a.icao || '')}">
            </div>
            <div class="field">
              <label>Country <span class="hint">ISO-2, e.g. IT</span></label>
              <input type="text" id="ap-country" maxlength="2" autocomplete="off" value="${escapeHtml(a.country || '')}">
            </div>
          </div>
          <div class="field">
            <label>Airport name</label>
            <input type="text" id="ap-name" autocomplete="off" placeholder="Falcone–Borsellino Airport" value="${escapeHtml(a.name || '')}">
          </div>
          <div class="field">
            <label>City</label>
            <input type="text" id="ap-city" autocomplete="off" placeholder="Palermo" value="${escapeHtml(a.city || '')}">
          </div>
          <div class="field-row">
            <div class="field">
              <label>Latitude <span class="hint">decimal, e.g. 38.1759</span></label>
              <input type="text" id="ap-lat" autocomplete="off" inputmode="decimal" value="${a.lat ?? ''}">
            </div>
            <div class="field">
              <label>Longitude <span class="hint">decimal, e.g. 13.0910</span></label>
              <input type="text" id="ap-lon" autocomplete="off" inputmode="decimal" value="${a.lon ?? ''}">
            </div>
          </div>
          <p class="muted small" style="margin: 4px 0 0;">Tip: Wikipedia airport pages show lat/lon in the infobox in decimal form.</p>
          <p class="error-msg" id="ap-error"></p>
        </div>
        <footer class="modal-foot">
          ${isEdit ? `<button class="ghost danger" id="ap-delete">Delete</button>` : `<span></span>`}
          <div class="foot-right">
            <button class="ghost" id="ap-cancel">Cancel</button>
            <button class="primary" id="ap-save">${isEdit ? 'Save' : 'Add airport'}</button>
          </div>
        </footer>
      </div>
    `;
    document.body.appendChild(wrap);

    // Auto-uppercase IATA + ICAO + Country
    for (const id of ['ap-iata', 'ap-icao', 'ap-country']) {
      const el = wrap.querySelector('#' + id);
      el.addEventListener('input', () => {
        const pos = el.selectionStart;
        el.value = el.value.toUpperCase().replace(/[^A-Z]/g, '');
        el.setSelectionRange(pos, pos);
      });
    }

    const close = (result = null) => {
      wrap.remove();
      document.removeEventListener('keydown', escClose);
      resolve(result);
    };
    function escClose(e) { if (e.key === 'Escape') close(null); }
    document.addEventListener('keydown', escClose);
    wrap.querySelector('#ap-close').addEventListener('click', () => close(null));
    wrap.querySelector('#ap-cancel').addEventListener('click', () => close(null));
    wrap.addEventListener('click', e => { if (e.target === wrap) close(null); });

    wrap.querySelector('#ap-save').addEventListener('click', async () => {
      const $err = wrap.querySelector('#ap-error');
      $err.textContent = '';
      const iata = wrap.querySelector('#ap-iata').value.trim().toUpperCase();
      const icao = wrap.querySelector('#ap-icao').value.trim().toUpperCase() || null;
      const country = wrap.querySelector('#ap-country').value.trim().toUpperCase();
      const name = wrap.querySelector('#ap-name').value.trim();
      const city = wrap.querySelector('#ap-city').value.trim();
      const lat = parseFloat(wrap.querySelector('#ap-lat').value);
      const lon = parseFloat(wrap.querySelector('#ap-lon').value);

      if (!iata || iata.length !== 3) { $err.textContent = 'IATA must be exactly 3 letters.'; return; }
      if (!country || country.length !== 2) { $err.textContent = 'Country must be a 2-letter ISO code.'; return; }
      if (!name) { $err.textContent = 'Airport name is required.'; return; }
      if (!city) { $err.textContent = 'City is required.'; return; }
      if (Number.isNaN(lat) || lat < -90 || lat > 90) { $err.textContent = 'Latitude must be between -90 and 90.'; return; }
      if (Number.isNaN(lon) || lon < -180 || lon > 180) { $err.textContent = 'Longitude must be between -180 and 180.'; return; }

      wrap.querySelector('#ap-save').disabled = true;
      try {
        const payload = { iata, icao, country, name, city, lat, lon };
        const saved = isEdit
          ? await updateAirport(existing.iata, payload)
          : await addAirport(payload);
        close(saved);
      } catch (e) {
        $err.textContent = 'Save failed: ' + (e.message || e);
        wrap.querySelector('#ap-save').disabled = false;
      }
    });

    if (isEdit) {
      wrap.querySelector('#ap-delete').addEventListener('click', async () => {
        if (!confirm(`Delete ${existing.iata}? Flights referencing this airport will keep the IATA code but lose city/distance lookup.`)) return;
        try {
          await deleteAirport(existing.iata);
          close({ deleted: true, iata: existing.iata });
        } catch (e) {
          wrap.querySelector('#ap-error').textContent = 'Delete failed: ' + (e.message || e);
        }
      });
    }

    setTimeout(() => {
      const focus = isEdit ? wrap.querySelector('#ap-name') : (a.iata ? wrap.querySelector('#ap-name') : wrap.querySelector('#ap-iata'));
      focus.focus();
    }, 0);
  });
}

// ============================================================
// Add / Edit modal
// ============================================================
function openModal(flightId) {
  const isEdit = !!flightId;
  const f = isEdit ? store.flights.find(x => x.id === flightId) : {
    date: new Date().toISOString().slice(0, 10),
    from_iata: '', to_iata: '',
    airline: '', aircraft: '', cabin: 'Economy',
    tier_miles: '', notes: '',
    is_historic: false,
  };
  if (isEdit && !f) return;
  const startsHistoric = isEdit ? isHistoric(f) : false;

  const wrap = document.createElement('div');
  wrap.className = 'modal';
  wrap.innerHTML = `
    <div class="modal-card flight-modal">
      <header class="modal-head">
        <h2>${isEdit ? 'Edit flight' : 'New flight'}</h2>
        <button class="ghost icon-only" id="m-close" aria-label="Close">×</button>
      </header>
      <div class="modal-body">
        <label class="checkbox-row">
          <input type="checkbox" id="m-historic" ${startsHistoric ? 'checked' : ''}>
          <span>Historic flight (Pre-2012, no date)</span>
        </label>
        <div class="field" id="m-date-field" ${startsHistoric ? 'hidden' : ''}>
          <label>Date</label>
          <input type="date" id="m-date" value="${startsHistoric ? '' : (f.date || '')}">
        </div>
        <div class="field-row">
          <div class="field">
            <label>From</label>
            <div class="autocomplete">
              <input type="text" id="m-from" autocomplete="off" placeholder="Search city or IATA…" value="${f.from_iata ? `${f.from_iata} — ${escapeHtml(store.airports.get(f.from_iata)?.city || '')}` : ''}" data-iata="${f.from_iata || ''}">
              <div class="ac-list" id="ac-from"></div>
            </div>
          </div>
          <div class="field">
            <label>To</label>
            <div class="autocomplete">
              <input type="text" id="m-to" autocomplete="off" placeholder="Search city or IATA…" value="${f.to_iata ? `${f.to_iata} — ${escapeHtml(store.airports.get(f.to_iata)?.city || '')}` : ''}" data-iata="${f.to_iata || ''}">
              <div class="ac-list" id="ac-to"></div>
            </div>
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Airline</label>
            <input type="text" id="m-airline" list="dl-airlines" autocomplete="off" placeholder="LX" value="${escapeHtml(f.airline || '')}" style="text-transform: uppercase">
            <datalist id="dl-airlines">
              ${uniqueAirlines().map(a => `<option value="${a}">`).join('')}
            </datalist>
          </div>
          <div class="field">
            <label>Aircraft <span class="hint">(full name or ICAO code)</span></label>
            <input type="text" id="m-aircraft" list="dl-aircraft" autocomplete="off" placeholder="e.g. A320 or Airbus A320" value="${escapeHtml(f.aircraft || '')}">
            <datalist id="dl-aircraft">
              ${uniqueAircraft().map(a => `<option value="${escapeHtml(a)}">`).join('')}
              ${knownIcaoCodes().map(c => `<option value="${c}">`).join('')}
            </datalist>
            <p class="aircraft-hint" id="m-aircraft-hint"></p>
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Cabin</label>
            <select id="m-cabin">
              ${CABINS.map(c => `<option value="${c}"${f.cabin === c ? ' selected' : ''}>${c}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Tier miles</label>
            <input type="number" id="m-tier" min="0" placeholder="Optional" value="${f.tier_miles ?? ''}">
          </div>
        </div>
        <div class="field">
          <label>Notes</label>
          <textarea id="m-notes" rows="2" placeholder="Optional">${escapeHtml(f.notes || '')}</textarea>
        </div>
        <p class="error-msg" id="m-error"></p>
      </div>
      <footer class="modal-foot">
        ${isEdit ? `<button class="ghost danger" id="m-delete">Delete</button>` : `<span></span>`}
        <div class="foot-right">
          <button class="ghost" id="m-cancel">Cancel</button>
          <button class="primary" id="m-save">${isEdit ? 'Save' : 'Add'}</button>
        </div>
      </footer>
    </div>
  `;
  document.body.appendChild(wrap);

  setupAutocomplete('m-from', 'ac-from');
  setupAutocomplete('m-to',   'ac-to');
  setupAircraftInput(wrap);
  setupAirlineInput(wrap);

  // Wire the historic checkbox: hide/show the date field
  const $historic = wrap.querySelector('#m-historic');
  const $dateField = wrap.querySelector('#m-date-field');
  $historic.addEventListener('change', () => {
    $dateField.hidden = $historic.checked;
  });

  const close = () => wrap.remove();
  wrap.querySelector('#m-close').addEventListener('click', close);
  wrap.querySelector('#m-cancel').addEventListener('click', close);
  wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
  document.addEventListener('keydown', escClose);
  function escClose(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escClose); } }

  wrap.querySelector('#m-save').addEventListener('click', async () => {
    const $err = wrap.querySelector('#m-error');
    $err.textContent = '';
    const is_historic = wrap.querySelector('#m-historic').checked;
    const date = is_historic ? null : wrap.querySelector('#m-date').value;
    const from_iata = wrap.querySelector('#m-from').dataset.iata;
    const to_iata = wrap.querySelector('#m-to').dataset.iata;
    const airline = wrap.querySelector('#m-airline').value.trim() || null;
    let aircraft = wrap.querySelector('#m-aircraft').value.trim() || null;
    // ICAO → full-name conversion: if the user entered a known ICAO code,
    // store the canonical full name so display stays consistent everywhere.
    if (aircraft && isKnownIcao(aircraft)) {
      aircraft = fullNameFromIcao(aircraft);
    }
    const cabin = wrap.querySelector('#m-cabin').value;
    const tierStr = wrap.querySelector('#m-tier').value.trim();
    const tier_miles = tierStr === '' ? null : parseInt(tierStr, 10);
    const notes = wrap.querySelector('#m-notes').value.trim() || null;

    if (!is_historic && !date) {
      $err.textContent = 'Date is required (or check Historic flight).';
      return;
    }
    if (!from_iata || !to_iata) {
      $err.textContent = 'From and To are required.';
      return;
    }
    if (from_iata === to_iata) {
      $err.textContent = 'From and To must differ.';
      return;
    }

    wrap.querySelector('#m-save').disabled = true;
    try {
      const payload = { date, from_iata, to_iata, airline, aircraft, cabin, tier_miles, notes, is_historic };
      let saved;
      if (isEdit) {
        saved = await updateFlight(flightId, payload);
      } else {
        saved = await addFlight(payload);
      }
      lastFlash = saved.id;
      setTimeout(() => { lastFlash = null; render(); }, 1500);
      close();
    } catch (e) {
      $err.textContent = 'Save failed: ' + (e.message || e);
      wrap.querySelector('#m-save').disabled = false;
    }
  });

  if (isEdit) {
    wrap.querySelector('#m-delete').addEventListener('click', async () => {
      const dateLabel = isHistoric(f) ? 'Pre-2012' : f.date;
      if (!confirm(`Delete this flight (${dateLabel} ${f.from_iata}→${f.to_iata})?`)) return;
      try {
        await deleteFlight(flightId);
        close();
      } catch (e) {
        wrap.querySelector('#m-error').textContent = 'Delete failed: ' + (e.message || e);
      }
    });
  }

  setTimeout(() => {
    const focusEl = startsHistoric
      ? wrap.querySelector('#m-from')
      : wrap.querySelector('#m-date');
    focusEl?.focus();
  }, 0);
}

// ============================================================
// Airline-logo upload (right-click flow)
// ============================================================
async function handleLogoUpload(iata) {
  const code = iata.toUpperCase();
  const isReplace = hasLogo(code);
  const file = await pickLogoFile();
  if (!file) return;

  // Optional: warn if file is unusually large (>500KB) — these are logos,
  // shouldn't be photos
  if (file.size > 500_000) {
    if (!confirm(`This file is ${(file.size/1024).toFixed(0)} KB — that's large for a logo. Upload anyway?`)) {
      return;
    }
  }

  try {
    await uploadLogo(code, file);
    // Re-render happens automatically via onLogoChange listener
  } catch (e) {
    console.error('Logo upload failed:', e);
    alert('Logo upload failed: ' + (e.message || e));
  }
}

function setupAircraftInput(wrap) {
  const $input = wrap.querySelector('#m-aircraft');
  const $hint = wrap.querySelector('#m-aircraft-hint');

  // ICAO codes are 3-4 chars, all caps, alphanumeric. We don't enforce that
  // strictly (user might still want to type a full name with spaces) — but
  // when the input *looks* like an ICAO attempt (no spaces, ≤6 chars), we
  // auto-uppercase as they type.
  const looksLikeCode = s => s.length <= 6 && /^[A-Za-z0-9]*$/.test(s);

  function updateHint() {
    const v = $input.value.trim();
    if (!v) { $hint.textContent = ''; $hint.className = 'aircraft-hint'; return; }
    if (isKnownIcao(v)) {
      const full = fullNameFromIcao(v);
      $hint.textContent = `→ ${full}`;
      $hint.className = 'aircraft-hint resolved';
    } else if (looksLikeCode(v) && v.length >= 3) {
      $hint.textContent = '(unknown ICAO code — will be saved as-is)';
      $hint.className = 'aircraft-hint warn';
    } else {
      $hint.textContent = '';
      $hint.className = 'aircraft-hint';
    }
  }

  $input.addEventListener('input', () => {
    const v = $input.value;
    if (looksLikeCode(v)) {
      const upper = v.toUpperCase();
      if (upper !== v) {
        const pos = $input.selectionStart;
        $input.value = upper;
        $input.setSelectionRange(pos, pos);
      }
    }
    updateHint();
  });

  // Initial hint based on existing value (edit mode)
  updateHint();
}

function setupAirlineInput(wrap) {
  const $input = wrap.querySelector('#m-airline');
  if (!$input) return;
  // Uppercase the value as the user types, preserving caret position so it
  // doesn't jump to the end of the field.
  $input.addEventListener('input', () => {
    const v = $input.value;
    const upper = v.toUpperCase();
    if (upper !== v) {
      const pos = $input.selectionStart;
      $input.value = upper;
      $input.setSelectionRange(pos, pos);
    }
  });
}

function setupAutocomplete(inputId, listId) {
  const $input = document.getElementById(inputId);
  const $list = document.getElementById(listId);
  let active = -1;
  let candidates = [];

  function close() { $list.innerHTML = ''; $list.classList.remove('open'); active = -1; }
  function open(q) {
    candidates = q ? searchAirports(q) : [];
    const queryLooksIATA = /^[A-Za-z]{3}$/.test(q.trim());
    const showAdd = q.trim().length > 0;
    if (!candidates.length && !showAdd) { close(); return; }

    let html = candidates.map((a, i) =>
      `<div class="ac-item${i === active ? ' active' : ''}" data-iata="${a.iata}">
         <span class="ac-iata">${a.iata}</span>
         <span class="ac-city">${escapeHtml(a.city)}</span>
         <span class="ac-name">${escapeHtml(a.name)}</span>
       </div>`).join('');
    if (showAdd) {
      const label = queryLooksIATA
        ? `+ Add airport "${q.trim().toUpperCase()}"`
        : `+ Add new airport`;
      const idx = candidates.length;
      html += `<div class="ac-item ac-add${idx === active ? ' active' : ''}" data-add="1">${label}</div>`;
    }
    $list.innerHTML = html;
    $list.classList.add('open');
    $list.querySelectorAll('.ac-item').forEach((el, i) => {
      el.addEventListener('mousedown', e => {
        e.preventDefault();
        if (el.dataset.add) {
          handleAdd();
        } else {
          pick(candidates[i]);
        }
      });
    });
  }
  function pick(a) {
    $input.value = `${a.iata} — ${a.city}`;
    $input.dataset.iata = a.iata;
    close();
  }
  async function handleAdd() {
    const q = $input.value.trim();
    const prefillIata = /^[A-Za-z]{3}$/.test(q) ? q.toUpperCase() : '';
    close();
    const saved = await openAirportModal({ iata: prefillIata });
    if (saved && !saved.deleted) pick(saved);
  }

  $input.addEventListener('input', () => {
    $input.dataset.iata = '';
    active = -1;
    open($input.value);
  });
  $input.addEventListener('focus', () => {
    if ($input.value) open($input.value);
  });
  $input.addEventListener('blur', () => setTimeout(close, 120));
  $input.addEventListener('keydown', e => {
    const isOpen = $list.classList.contains('open');
    const totalItems = candidates.length + ($input.value.trim().length > 0 ? 1 : 0);
    if (e.key === 'ArrowDown' && isOpen) {
      active = Math.min(active + 1, totalItems - 1); open($input.value); e.preventDefault();
    } else if (e.key === 'ArrowUp' && isOpen) {
      active = Math.max(active - 1, 0); open($input.value); e.preventDefault();
    } else if (e.key === 'Enter') {
      if (isOpen) {
        if (active >= candidates.length) {
          // "+ Add airport" option highlighted
          handleAdd(); e.preventDefault();
        } else if (candidates.length) {
          pick(candidates[active >= 0 ? active : 0]); e.preventDefault();
        }
      }
    } else if (e.key === 'Tab') {
      if (isOpen && candidates.length) {
        pick(candidates[active >= 0 ? active : 0]);
      }
    } else if (e.key === 'Escape') {
      close();
    }
  });
}
