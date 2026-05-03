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

// ----------------------------------------------------------------------------
// Multi-airport city groupings.
// For each entry, we render an extra italic "<City> / all airports" row that
// sums the per-IATA counts. IATAs not present in the user's data are simply
// ignored, so safe to over-include.
// ----------------------------------------------------------------------------
const CITY_GROUPS = [
  { name: 'London',         iatas: ['LHR', 'LGW', 'STN', 'LTN', 'LCY', 'SEN'] },
  { name: 'Paris',          iatas: ['CDG', 'ORY', 'BVA'] },
  { name: 'Milan',          iatas: ['LIN', 'MXP', 'BGY'] },
  { name: 'Rome',           iatas: ['FCO', 'CIA'] },
  { name: 'Berlin',         iatas: ['BER', 'TXL', 'SXF', 'THF'] },
  { name: 'Istanbul',       iatas: ['IST', 'ISL', 'SAW'] },
  { name: 'Tokyo',          iatas: ['HND', 'NRT'] },
  { name: 'Bangkok',        iatas: ['BKK', 'DMK'] },
  { name: 'Rio de Janeiro', iatas: ['GIG', 'SDU'] },
  { name: 'São Paulo',      iatas: ['GRU', 'CGH', 'VCP'] },
  { name: 'Buenos Aires',   iatas: ['EZE', 'AEP'] },
  { name: 'Washington',     iatas: ['IAD', 'DCA', 'BWI'] },
  { name: 'New York',       iatas: ['JFK', 'LGA', 'EWR'] },
  { name: 'Chicago',        iatas: ['ORD', 'MDW'] },
  { name: 'Los Angeles',    iatas: ['LAX', 'SNA', 'BUR', 'LGB', 'ONT'] },
  // Common multi-airport cities that often show up in long-haul logs.
  // Comment out any you don't want surfaced.
  { name: 'Stockholm',      iatas: ['ARN', 'BMA', 'NYO'] },
  { name: 'Oslo',           iatas: ['OSL', 'TRF'] },
  { name: 'Brussels',       iatas: ['BRU', 'CRL'] },
  { name: 'Belfast',        iatas: ['BFS', 'BHD'] },
  { name: 'Houston',        iatas: ['IAH', 'HOU'] },
  { name: 'Moscow',         iatas: ['SVO', 'DME', 'VKO'] },
  { name: 'Shanghai',       iatas: ['PVG', 'SHA'] },
  { name: 'Seoul',          iatas: ['ICN', 'GMP'] },
  { name: 'Osaka',          iatas: ['KIX', 'ITM'] },
  { name: 'Toronto',        iatas: ['YYZ', 'YTZ'] },
];

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

  // Per-airport rows, then derived "all airports" rows for multi-airport cities.
  const airportEntries = [...airportCounts.entries()].map(([iata, count]) => ({
    kind: 'airport', iata, count,
  }));
  const groupRows = [];
  for (const group of CITY_GROUPS) {
    let sum = 0;
    let hits = 0;
    for (const code of group.iatas) {
      const c = airportCounts.get(code);
      if (c) { sum += c; hits++; }
    }
    // Only surface a group row when at least 2 of its airports were used —
    // otherwise it's just a duplicate of the single airport row.
    if (hits >= 2) {
      groupRows.push({ kind: 'group', name: group.name, count: sum });
    }
  }
  const airportRows = [...airportEntries, ...groupRows]
    .sort((a, b) => b.count - a.count || (
      (a.kind === 'group' ? a.name : a.iata).localeCompare(
        b.kind === 'group' ? b.name : b.iata
      )
    ));

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
  const visible = state.airlinesExpanded ? rows : rows.slice(0, TOP_N);

  const top1 = rows[0]?.[1] || 1;
  const top2 = rows[1]?.[1] || top1;
  const truncate = top1 > top2 * 2.5;
  const displayMax = truncate ? top2 * 1.5 : top1;

  sub.textContent = state.airlinesExpanded
    ? `All ${rows.length}`
    : `Top ${Math.min(TOP_N, rows.length)} of ${rows.length}`;

  container.innerHTML = visible.map(([code, count], i) => {
    const isTruncatedTop = truncate && i === 0;
    const pct = isTruncatedTop ? 100 : Math.min(100, (count / displayMax) * 100);
    const url = getLogoUrl(code);
    const logoHtml = url
      ? `<img class="stats-logo" src="${escapeAttr(url)}" alt="${escapeAttr(code)}">`
      : `<span class="stats-logo-chip">${escapeHtml(code)}</span>`;
    const barClass = isTruncatedTop ? 'stats-bar stats-bar-truncated' : 'stats-bar';
    return `
      <div class="stats-row">
        <div class="stats-row-label airline">${logoHtml}</div>
        <div class="stats-bar-wrap">
          <div class="${barClass}" style="width: ${pct.toFixed(2)}%"></div>
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
  const visible = state.airportsExpanded ? rows : rows.slice(0, TOP_N);

  // Truncation threshold: when #1 is more than 2.5× #2, the long tail gets
  // crushed. We render #1 with a "broken bar" effect — a wider-but-not-actual
  // proportional fill plus a zig-zag rip overlay near the right end.
  const top1 = rows[0]?.count || 1;
  const top2 = rows[1]?.count || top1;
  const truncate = top1 > top2 * 2.5;
  // For non-truncated rows, scale to top1 as before. For truncated mode, we
  // scale the visible portion to a "display max" of top2 × 1.5 — this gives
  // #2 a bar at ~67% width (clearly the largest non-#1) and #1 at 100% with
  // the rip overlay implying it's actually larger.
  const displayMax = truncate ? top2 * 1.5 : top1;

  sub.textContent = state.airportsExpanded
    ? `All ${rows.length}`
    : `Top ${Math.min(TOP_N, rows.length)} of ${rows.length}`;

  container.innerHTML = visible.map((row, i) => {
    // The #1 row in truncated mode renders as 100% with a `truncated` flag
    // that triggers the zig-zag. Everyone else uses linear scale to displayMax.
    const isTruncatedTop = truncate && i === 0;
    const pct = isTruncatedTop ? 100 : Math.min(100, (row.count / displayMax) * 100);
    const labelHtml = row.kind === 'group'
      ? `<span class="stats-city">${escapeHtml(row.name)}</span>
         <span class="stats-iata stats-group-tag">all airports</span>`
      : (() => {
          const a = store.airports.get(row.iata);
          const city = a?.city || row.iata;
          return `<span class="stats-city">${escapeHtml(city)}</span>
                  <span class="stats-iata">${escapeHtml(row.iata)}</span>`;
        })();
    const rowClass = row.kind === 'group' ? 'stats-row stats-row-group' : 'stats-row';
    const barClass = isTruncatedTop ? 'stats-bar stats-bar-truncated' : 'stats-bar';
    return `
      <div class="${rowClass}">
        <div class="stats-row-label airport">${labelHtml}</div>
        <div class="stats-bar-wrap">
          <div class="${barClass}" style="width: ${pct.toFixed(2)}%"></div>
        </div>
        <div class="stats-count">${row.count.toLocaleString()}</div>
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
