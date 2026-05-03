// ============================================================================
// Flight Log — stats panel (right side of Log tab)
//
// Two ranked tables:
//   • Flights per airline (logo + bar + count)
//   • Flights per airport (city name + IATA + bar + count)
// Top 20 by default, "Show all" expands. Bars are scaled relative to the #1
// row in each table.
// ============================================================================

import { store, onChange, isHistoric } from './data.js';
import { getLogoUrl } from './logos.js';

const TOP_N = 20;
const state = {
  airlinesExpanded: false,
  airportsExpanded: false,
};

let mounted = null;  // root element

export function initStats() {
  // Find the right-side pane created by log.js and replace its placeholder
  // with our stats markup.
  mounted = document.getElementById('log-side');
  if (!mounted) return;
  mounted.innerHTML = `
    <div class="stats-root">
      <header class="stats-header">
        <h2>Statistics</h2>
        <p class="stats-summary" id="stats-summary">—</p>
      </header>

      <div class="stats-grid">
        <section class="stats-card" id="stats-airlines">
          <header class="stats-card-head">
            <h3>By airline</h3>
            <span class="stats-card-sub" id="airlines-sub"></span>
          </header>
          <div class="stats-rows" id="airlines-rows"></div>
          <button class="stats-toggle" id="airlines-toggle" hidden></button>
        </section>

        <section class="stats-card" id="stats-airports">
          <header class="stats-card-head">
            <h3>By airport</h3>
            <span class="stats-card-sub" id="airports-sub"></span>
          </header>
          <div class="stats-rows" id="airports-rows"></div>
          <button class="stats-toggle" id="airports-toggle" hidden></button>
        </section>
      </div>
    </div>
  `;

  document.getElementById('airlines-toggle').addEventListener('click', () => {
    state.airlinesExpanded = !state.airlinesExpanded;
    render();
  });
  document.getElementById('airports-toggle').addEventListener('click', () => {
    state.airportsExpanded = !state.airportsExpanded;
    render();
  });

  onChange(evt => {
    if (!evt || typeof evt !== 'object') return;
    if (evt.type === 'data:loaded' || evt.type === 'data:changed' || evt.type === 'airports:changed') {
      render();
    }
  });

  // Re-render when logos arrive/change so airline rows pick them up
  window.addEventListener('flightlog:logo-changed', render);

  if (store.ready) render();
}

// ============================================================
// Render
// ============================================================
function render() {
  if (!mounted) return;
  // Stats exclude historic (Pre-2012) flights — they're for the map only.
  const flights = (store.flights || []).filter(f => !isHistoric(f));

  // ---- Aggregate counts ----
  const airlineCounts = new Map();
  for (const f of flights) {
    if (!f.airline) continue;
    const code = f.airline.toUpperCase();
    airlineCounts.set(code, (airlineCounts.get(code) || 0) + 1);
  }
  const airportCounts = new Map();
  for (const f of flights) {
    if (f.from_iata) airportCounts.set(f.from_iata, (airportCounts.get(f.from_iata) || 0) + 1);
    if (f.to_iata)   airportCounts.set(f.to_iata,   (airportCounts.get(f.to_iata)   || 0) + 1);
  }

  const airlineRows = [...airlineCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const airportRows = [...airportCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  // ---- Summary ----
  document.getElementById('stats-summary').textContent =
    `${flights.length.toLocaleString()} flights · ${airlineCounts.size} airlines · ${airportCounts.size} airports`;

  // ---- Airlines table ----
  renderAirlines(airlineRows);

  // ---- Airports table ----
  renderAirports(airportRows);
}

function renderAirlines(rows) {
  const container = document.getElementById('airlines-rows');
  const sub = document.getElementById('airlines-sub');
  const toggle = document.getElementById('airlines-toggle');
  const max = rows[0]?.[1] || 1;
  const visible = state.airlinesExpanded ? rows : rows.slice(0, TOP_N);

  sub.textContent = state.airlinesExpanded
    ? `All ${rows.length}`
    : `Top ${Math.min(TOP_N, rows.length)} of ${rows.length}`;

  container.innerHTML = visible.map(([code, count]) => {
    const pct = (count / max) * 100;
    const url = getLogoUrl(code);
    const logoHtml = url
      ? `<img class="stats-logo" src="${escapeAttr(url)}" alt="${escapeAttr(code)}">`
      : `<span class="stats-logo-chip">${escapeHtml(code)}</span>`;
    return `
      <div class="stats-row">
        <div class="stats-row-label airline">${logoHtml}</div>
        <div class="stats-bar-wrap">
          <div class="stats-bar" style="width: ${pct.toFixed(2)}%"></div>
        </div>
        <div class="stats-count">${count.toLocaleString()}</div>
      </div>
    `;
  }).join('');

  if (rows.length > TOP_N) {
    toggle.hidden = false;
    toggle.textContent = state.airlinesExpanded
      ? `Show top ${TOP_N}`
      : `Show all ${rows.length}`;
  } else {
    toggle.hidden = true;
  }
}

function renderAirports(rows) {
  const container = document.getElementById('airports-rows');
  const sub = document.getElementById('airports-sub');
  const toggle = document.getElementById('airports-toggle');
  const max = rows[0]?.[1] || 1;
  const visible = state.airportsExpanded ? rows : rows.slice(0, TOP_N);

  sub.textContent = state.airportsExpanded
    ? `All ${rows.length}`
    : `Top ${Math.min(TOP_N, rows.length)} of ${rows.length}`;

  container.innerHTML = visible.map(([iata, count]) => {
    const pct = (count / max) * 100;
    const a = store.airports.get(iata);
    const city = a?.city || iata;
    return `
      <div class="stats-row">
        <div class="stats-row-label airport">
          <span class="stats-city">${escapeHtml(city)}</span>
          <span class="stats-iata">${escapeHtml(iata)}</span>
        </div>
        <div class="stats-bar-wrap">
          <div class="stats-bar" style="width: ${pct.toFixed(2)}%"></div>
        </div>
        <div class="stats-count">${count.toLocaleString()}</div>
      </div>
    `;
  }).join('');

  if (rows.length > TOP_N) {
    toggle.hidden = false;
    toggle.textContent = state.airportsExpanded
      ? `Show top ${TOP_N}`
      : `Show all ${rows.length}`;
  } else {
    toggle.hidden = true;
  }
}

// ============================================================
// Helpers
// ============================================================
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function escapeAttr(s) { return escapeHtml(s); }
