// ============================================================================
// Flight Log — Status tab
//
// Three-column layout (Air France / Finnair / Swiss). Each column has:
//   1. Alliance badge at the top
//   2. Tier-point progress bar (segmented for Air France: 0→900→1850)
//   3. Calendar-pace bar — white = year progress, blue inside = tier-point
//      progress vs target, percentage at the right = pace ratio.
// ============================================================================

import { store, onChange, isHistoric, setProgramAdjustment } from './data.js';
import { getLogoUrl as _supabaseLogoUrl } from './logos.js';

// Sim uses local assets/logos/<CODE>.png (committed to repo).
// Falls back to Supabase Storage URL if the local file isn't there.
function simLogoUrl(code) {
  return `assets/logos/${code.toUpperCase()}.png`;
}

// ---------- Program definitions ----------
// Logos live in assets/logos/. Files are PNGs (despite the original SVG
// extension on upload) — that's fine, browsers don't care about extensions.
const PROGRAMS = [
  {
    id: 'af',
    name: 'Air France',
    alliance: 'SkyTeam',
    allianceLogo: 'assets/logos/skyteam.png',
    airlineLogo: 'assets/logos/airfrance.png',
    accent: '#002157',
    accentSoft: '#e6ecf5',
    targets: [900, 1850],
    airlines: ['AF', 'KL'],
  },
  {
    id: 'ay',
    name: 'Finnair',
    alliance: 'oneworld',
    allianceLogo: 'assets/logos/oneworld.png',
    airlineLogo: 'assets/logos/finnair.png',
    accent: '#0a4ea4',
    accentSoft: '#e7f0fa',
    targets: [57500],
    extendedScale: 80000,
    airlines: ['BA', 'IB', 'AY', 'AA', 'CX', 'AT', 'JL'],
  },
  {
    id: 'lx',
    name: 'Swiss',
    alliance: 'Star Alliance',
    allianceLogo: 'assets/logos/staralliance.png',
    airlineLogo: 'assets/logos/swiss.png',
    accent: '#cc0000',
    accentSoft: '#fde8e8',
    targets: [6000],
    airlines: ['LX', 'LH', 'SN', 'OS', 'EW', 'LG', 'AZ', 'EN'],
  },
];

let mounted = null;

export function initStatus() {
  mounted = document.querySelector('[data-panel="status"]');
  if (!mounted) return;

  mounted.innerHTML = `
    <div class="status-root">
      <div class="status-grid">
        ${PROGRAMS.map(p => `
          <section class="status-col" data-program="${p.id}" style="--prog-accent:${p.accent}; --prog-accent-soft:${p.accentSoft}">
            <header class="status-col-head">
              <div class="alliance-logo-wrap">
                <img class="alliance-logo" src="${p.allianceLogo}" alt="${p.alliance}">
              </div>
              <div class="airline-logo-wrap">
                <img class="airline-logo-status" src="${p.airlineLogo}" alt="${p.name}">
              </div>
            </header>

            <div class="status-card">
              <div class="status-card-label">
                <span>Tier points <span class="status-year" id="status-year-${p.id}"></span></span>
                <button class="rollover-btn" data-program="${p.id}" aria-label="Manual balance correction" title="Manual balance correction">+</button>
              </div>
              <div class="tp-bar" id="tp-bar-${p.id}"></div>
              <div class="tp-axis" id="tp-axis-${p.id}"></div>
              <div class="tp-rollover-note" id="tp-rollover-${p.id}"></div>
              <details class="tp-breakdown">
                <summary>Show contributing flights</summary>
                <div id="tp-breakdown-${p.id}"></div>
              </details>
            </div>

            <div class="status-card">
              <div class="status-card-label">Year-pace</div>
              <div class="pace-bar" id="pace-bar-${p.id}">
                <div class="pace-year-fill"></div>
                <div class="pace-tp-fill"></div>
                <div class="pace-pct"></div>
              </div>
              <div class="pace-axis"><span>JAN</span><span>DEC</span></div>
            </div>

            ${p.id === 'ay' ? `
            <div class="status-card sim-card" id="ay-sim-card">
              <div class="status-card-label">
                <span>Tier point simulator</span>
              </div>

              <div class="sim-summary-row">
                <div class="sim-summary-item">
                  <span class="sim-summary-label">Target</span>
                  <span class="sim-summary-val" id="sim-target">57,500</span>
                </div>
                <div class="sim-summary-item">
                  <span class="sim-summary-label">Current</span>
                  <span class="sim-summary-val sim-current" id="sim-current">—</span>
                </div>
                <div class="sim-summary-item">
                  <span class="sim-summary-label">Simulated</span>
                  <span class="sim-summary-val sim-projected" id="sim-projected">—</span>
                </div>
                <div class="sim-summary-item">
                  <span class="sim-summary-label">Still needed</span>
                  <span class="sim-summary-val sim-needed" id="sim-needed">—</span>
                </div>
              </div>

              <div class="sim-forecast-table" id="sim-forecast-table"></div>

              <div class="sim-earnings-section">
                <div class="sim-mult-label">Earning rates by airline</div>
                <div class="sim-airline-picker-wrap" id="sim-airline-picker-wrap">
                  <div class="sim-airline-logo-strip" id="sim-airline-logo-strip"></div>
                  <div class="sim-airline-panel" id="sim-airline-panel" hidden></div>
                </div>
              </div>

              <div class="sim-flights-section">
                <div class="sim-sect-label">Flight simulator</div>
                <div id="sim-rows"></div>
                <button class="sim-add-btn" id="sim-add-row">+ Add flight</button>
              </div>

              <div class="sim-grand-total-row">
                <span class="sim-grand-label">Total simulated tier points</span>
                <span class="sim-grand-val" id="sim-grand-total">0</span>
              </div>
            </div>
            ` : ''}
          </section>
        `).join('')}
      </div>
    </div>
  `;

  // Wire rollover buttons
  mounted.querySelectorAll('.rollover-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const programId = btn.dataset.program;
      openRolloverModal(programId);
    });
  });

  onChange(evt => {
    if (!evt) return;
    if (evt.type === 'data:loaded' || evt.type === 'data:changed' || evt.type === 'auth:locked' || evt.type === 'program:changed') {
      render();
    }
  });

  if (store.ready) render();
  initFinnairSim();
}

// ============================================================
// Render
// ============================================================
function render() {
  const now = new Date();

  for (const p of PROGRAMS) {
    const window = computeWindow(p, now);
    const windowProgress = computeWindowProgress(window, now);
    const b = computeBalance(p, window);

    renderTierBar(p, b.total);
    renderPaceBar(p, b.total, windowProgress, window);
    renderBreakdown(p, b, window);

    const $year = document.getElementById(`status-year-${p.id}`);
    if ($year) $year.textContent = window.label;

    const $note = document.getElementById(`tp-rollover-${p.id}`);
    if ($note) {
      if (b.correction > 0) {
        $note.textContent = `Includes ${fmt(b.correction)} manual correction`;
      } else if (b.correction < 0) {
        $note.textContent = `Includes ${fmt(b.correction)} manual correction`;
      } else {
        $note.textContent = '';
      }
    }
  }
}

// ---------- Qualification window ----------
// Annual-rolling interpretation: we take ONLY the month/day from
// `qualification_start` (the year stored is ignored). The current window
// runs from the most recent past occurrence of that month-day up to one
// year later. Examples on May 3, 2026:
//   • Jan 1  → window: Jan 1 2026 → Dec 31 2026
//   • Feb 1  → window: Feb 1 2026 → Jan 31 2027
//   • Oct 1  → window: Oct 1 2025 → Sep 30 2026 (last Oct 1 was 7 months ago)
// When no anchor is set, defaults to calendar year.
function computeWindow(program, now) {
  const adj = store.programAdjustments?.get(program.id);
  const qs = adj?.qualification_start;
  if (qs) {
    // Parse just the month/day; year is computed from `now`.
    const parts = qs.split('-');
    const month = parseInt(parts[1], 10) - 1;  // 0-indexed
    const day = parseInt(parts[2], 10);
    let start = new Date(now.getFullYear(), month, day);
    // If the anchor for this year hasn't happened yet, the current window
    // started one year earlier.
    if (start > now) {
      start = new Date(now.getFullYear() - 1, month, day);
    }
    const end = new Date(start);
    end.setFullYear(end.getFullYear() + 1);
    return { start, end, custom: true, label: formatWindowLabel(start, end) };
  }
  const year = now.getFullYear();
  const start = new Date(year, 0, 1);
  const end = new Date(year + 1, 0, 1);
  return { start, end, custom: false, label: String(year) };
}

function formatWindowLabel(start, end) {
  // End is exclusive (start + 365 days). Show end-1 for human readability:
  // "Aug 15 2025 – Aug 14 2026"
  const endInclusive = new Date(end);
  endInclusive.setDate(endInclusive.getDate() - 1);
  const fmt = d => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  return `${fmt(start)} – ${fmt(endInclusive)}`;
}

// ---------- Balance ----------
function computeBalance(program, window) {
  const allowed = new Set(program.airlines.map(a => a.toUpperCase()));
  const contributions = [];
  let sum = 0;
  // Compare flight dates as 'YYYY-MM-DD' strings (string compare works for
  // ISO dates and avoids timezone issues from Date parsing).
  const startStr = isoDate(window.start);
  const endStr = isoDate(window.end);  // exclusive
  for (const f of store.flights) {
    if (isHistoric(f) || !f.date) continue;
    if (f.date < startStr || f.date >= endStr) continue;
    if (!f.airline) continue;
    if (!allowed.has(f.airline.toUpperCase())) continue;
    if (f.tier_miles == null) continue;
    const miles = Number(f.tier_miles) || 0;
    sum += miles;
    contributions.push({ flight: f, miles });
  }
  const adj = store.programAdjustments?.get(program.id);
  const correction = (adj && Number.isFinite(adj.manual_correction)) ? adj.manual_correction : 0;
  return { total: sum + correction, fromFlights: sum, contributions, correction };
}

function isoDate(d) {
  // Local-time YYYY-MM-DD (matching how flight dates are stored)
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ---------- Window progress ----------
// Fraction of the qualification window elapsed (0..1+, can exceed 1 if past end).
function computeWindowProgress(window, now) {
  return (now - window.start) / (window.end - window.start);
}

// ============================================================
// Tier-point bar (top)
// ============================================================
function renderTierBar(program, balance) {
  const $bar = document.getElementById(`tp-bar-${program.id}`);
  const $axis = document.getElementById(`tp-axis-${program.id}`);
  if (!$bar || !$axis) return;

  const targets = program.targets;
  const visualMax = program.extendedScale || targets[targets.length - 1];

  if (targets.length === 1) {
    // Single-segment bar
    const target = targets[0];
    const fillPct = clamp(balance / target * 100, 0, 100 * (visualMax / target));
    // The visual width of the "fill" relative to the visualMax axis
    const visualPct = clamp(balance / visualMax * 100, 0, 100);
    // Position of the "target" line relative to the visualMax axis
    const targetMarkPct = (target / visualMax) * 100;
    $bar.innerHTML = `
      <div class="tp-track">
        <div class="tp-fill" style="width: ${visualPct.toFixed(2)}%"></div>
        <div class="tp-target-mark" style="left: ${targetMarkPct.toFixed(2)}%"></div>
      </div>
    `;
    $axis.innerHTML = `
      <span class="tp-axis-num start">0</span>
      <span class="tp-axis-num target" style="left:${targetMarkPct.toFixed(2)}%">${fmt(target)}</span>
      ${visualMax !== target ? `<span class="tp-axis-num end">${fmt(visualMax)}</span>` : ''}
      <span class="tp-axis-current">${fmt(balance)} / ${fmt(target)}</span>
    `;
  } else {
    // Two-segment bar (Air France: 0→900→1850).
    // Each segment occupies its proportional share of the full axis.
    const t1 = targets[0];
    const t2 = targets[1];
    const seg1Width = (t1 / t2) * 100;
    const seg2Width = ((t2 - t1) / t2) * 100;
    const seg1Fill = clamp(balance / t1 * 100, 0, 100);
    const seg2Fill = balance > t1 ? clamp((balance - t1) / (t2 - t1) * 100, 0, 100) : 0;
    $bar.innerHTML = `
      <div class="tp-track tp-track-segmented">
        <div class="tp-seg" style="flex-basis: ${seg1Width.toFixed(2)}%">
          <div class="tp-fill" style="width: ${seg1Fill.toFixed(2)}%"></div>
        </div>
        <div class="tp-seg-divider"></div>
        <div class="tp-seg" style="flex-basis: ${seg2Width.toFixed(2)}%">
          <div class="tp-fill" style="width: ${seg2Fill.toFixed(2)}%"></div>
        </div>
      </div>
    `;
    $axis.innerHTML = `
      <span class="tp-axis-num start">0</span>
      <span class="tp-axis-num target" style="left:${seg1Width.toFixed(2)}%">${fmt(t1)}</span>
      <span class="tp-axis-num end">${fmt(t2)}</span>
      <span class="tp-axis-current">${fmt(balance)} / ${fmt(t2)}</span>
    `;
  }
}

// ============================================================
// Pace bar (bottom)
// ============================================================
function renderPaceBar(program, balance, windowProgress, window) {
  const $bar = document.getElementById(`pace-bar-${program.id}`);
  if (!$bar) return;

  const finalTarget = program.targets[program.targets.length - 1];
  const tpFraction = clamp(balance / finalTarget, 0, Infinity);
  const yearPct = clamp(windowProgress * 100, 0, 100).toFixed(2);
  const tpPct = clamp(tpFraction * 100, 0, 100).toFixed(2);

  let paceRatio;
  if (windowProgress <= 0) {
    paceRatio = tpFraction > 0 ? Infinity : 1;
  } else {
    paceRatio = tpFraction / windowProgress;
  }
  const pacePct = isFinite(paceRatio) ? Math.round(paceRatio * 100) : '∞';

  $bar.querySelector('.pace-year-fill').style.width = `${yearPct}%`;
  $bar.querySelector('.pace-tp-fill').style.width = `${tpPct}%`;

  const $pct = $bar.querySelector('.pace-pct');
  $pct.textContent = `${pacePct}%`;
  if (typeof paceRatio === 'number') {
    if (paceRatio >= 1) $pct.dataset.tone = 'good';
    else if (paceRatio >= 0.75) $pct.dataset.tone = 'warn';
    else $pct.dataset.tone = 'bad';
  } else {
    $pct.dataset.tone = 'good';
  }

  // Update the axis labels under the pace bar to reflect the window.
  // For a custom window we show short month-day labels at both ends; for
  // calendar-year we keep the simple JAN / DEC labels.
  const $axis = $bar.parentElement.querySelector('.pace-axis');
  if ($axis) {
    if (window.custom) {
      const endInclusive = new Date(window.end);
      endInclusive.setDate(endInclusive.getDate() - 1);
      const fmt = d => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      $axis.innerHTML = `<span>${fmt(window.start)}</span><span>${fmt(endInclusive)}</span>`;
    } else {
      $axis.innerHTML = `<span>JAN</span><span>DEC</span>`;
    }
  }
}

// ============================================================
// Helpers
// ============================================================
// ============================================================
// Debug breakdown — every flight contributing to this program's balance
// ============================================================
function renderBreakdown(program, balance, window) {
  const $el = document.getElementById(`tp-breakdown-${program.id}`);
  if (!$el) return;
  const rows = balance.contributions.map(({ flight: f, miles }) => `
    <tr>
      <td class="bd-date">${f.date}</td>
      <td class="bd-airline">${escapeHtml(f.airline || '')}</td>
      <td class="bd-route">${f.from_iata}→${f.to_iata}</td>
      <td class="bd-miles">${fmt(miles)}</td>
    </tr>
  `).join('');
  const filterSummary = `Window: ${window.label} · Airlines: ${program.airlines.join(', ')}`;
  $el.innerHTML = `
    <p class="bd-filter">${filterSummary}</p>
    <table class="bd-table">
      <thead><tr><th>Date</th><th>AL</th><th>Route</th><th>TP</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4" class="bd-empty">No matching flights this window.</td></tr>'}</tbody>
      <tfoot>
        <tr class="bd-subtotal">
          <td colspan="3">Subtotal from flights</td>
          <td class="bd-miles">${fmt(balance.fromFlights)}</td>
        </tr>
        ${balance.correction !== 0 ? `
          <tr class="bd-rollover">
            <td colspan="3">${balance.correction > 0 ? '+' : ''} Manual correction</td>
            <td class="bd-miles">${fmt(balance.correction)}</td>
          </tr>
        ` : ''}
        <tr class="bd-total">
          <td colspan="3">Total</td>
          <td class="bd-miles">${fmt(balance.total)}</td>
        </tr>
      </tfoot>
    </table>
  `;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function escapeAttr(s) { return escapeHtml(s); }


function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function fmt(n) { return Number(n).toLocaleString(); }
function slug(s) { return String(s).toLowerCase().replace(/\s+/g, '-'); }

// ============================================================
// Finnair Tier Point Simulator
// ============================================================

// Oneworld airline IATA codes and their Finnair tier point multipliers.
// Source: attached screenshot. All others default to 100%.
const AY_AIRLINES = [
  { code: 'AS', name: 'Alaska Airlines',    tierMult: 1.00,
    classes: [
      { cabin: 'First',   codes: ['J','C','D'],                         pct: 2.00 },
      { cabin: 'First',   codes: ['I'],                                  pct: 1.25 },
      { cabin: 'Premium', codes: ['W','P','R'],                          pct: 1.10 },
      { cabin: 'Economy', codes: ['Y','B','H'],                          pct: 1.00 },
      { cabin: 'Economy', codes: ['K','M','L','V','S','N','Q','O'],      pct: 0.50 },
      { cabin: 'Economy', codes: ['G','X'],                              pct: 0.25 },
    ]},
  { code: 'HA', name: 'Hawaiian Airlines',  tierMult: 1.00,
    classes: [
      { cabin: 'First',   codes: ['J','C','D'],                         pct: 2.00 },
      { cabin: 'First',   codes: ['I'],                                  pct: 1.25 },
      { cabin: 'Premium', codes: ['W','P','R'],                          pct: 1.10 },
      { cabin: 'Economy', codes: ['Y','B','H'],                          pct: 1.00 },
      { cabin: 'Economy', codes: ['K','M','L','V','S','N','Q','O'],      pct: 0.50 },
      { cabin: 'Economy', codes: ['G','X'],                              pct: 0.25 },
    ]},
  { code: 'AA', name: 'American Airlines',  tierMult: 1.25,
    classes: [
      { cabin: 'First',           codes: ['F'],                          pct: 3.00 },
      { cabin: 'First',           codes: ['A'],                          pct: 2.50 },
      { cabin: 'Business',        codes: ['J','C','D'],                  pct: 2.50 },
      { cabin: 'Business',        codes: ['R','I'],                      pct: 1.50 },
      { cabin: 'Premium Economy', codes: ['W'],                          pct: 1.50 },
      { cabin: 'Premium Economy', codes: ['P'],                          pct: 1.00 },
      { cabin: 'Economy',         codes: ['Y','H'],                      pct: 1.00 },
      { cabin: 'Economy',         codes: ['K','L','M','V','S'],          pct: 0.50 },
      { cabin: 'Economy',         codes: ['B','G','O','Q','N'],          pct: 0.25 },
    ]},
  { code: 'BA', name: 'British Airways',    tierMult: 1.25,
    classes: [
      { cabin: 'First',           codes: ['F'],                          pct: 3.00 },
      { cabin: 'First',           codes: ['A'],                          pct: 2.50 },
      { cabin: 'Business',        codes: ['J','C','D'],                  pct: 2.50 },
      { cabin: 'Business',        codes: ['R','I'],                      pct: 1.50 },
      { cabin: 'Premium Economy', codes: ['W'],                          pct: 1.50 },
      { cabin: 'Premium Economy', codes: ['E','T'],                      pct: 1.00 },
      { cabin: 'Economy',         codes: ['Y','B','H'],                  pct: 1.00 },
      { cabin: 'Economy',         codes: ['K','L','M','V','S','N'],      pct: 0.50 },
      { cabin: 'Economy',         codes: ['G','O','Q'],                  pct: 0.25 },
    ]},
  { code: 'CX', name: 'Cathay Pacific',     tierMult: 1.00,
    classes: [
      { cabin: 'First',           codes: ['A','F'],                      pct: 1.50 },
      { cabin: 'Business',        codes: ['J','C','D'],                  pct: 1.25 },
      { cabin: 'Business',        codes: ['P','I'],                      pct: 1.00 },
      { cabin: 'Premium Economy', codes: ['W','R','E'],                  pct: 1.00 },
      { cabin: 'Economy',         codes: ['Y','B','H'],                  pct: 1.00 },
      { cabin: 'Economy',         codes: ['K','L','M','V'],              pct: 0.50 },
    ]},
  { code: 'FJ', name: 'Fiji Airways',       tierMult: 1.00,
    classes: [
      { cabin: 'Business', codes: ['J','C'],                             pct: 1.50 },
      { cabin: 'Business', codes: ['I','D','Z'],                         pct: 1.25 },
      { cabin: 'Economy',  codes: ['Y'],                                 pct: 1.00 },
      { cabin: 'Economy',  codes: ['B','H','K'],                         pct: 0.75 },
      { cabin: 'Economy',  codes: ['M','L','W','V','S','N'],             pct: 0.50 },
      { cabin: 'Economy',  codes: ['Q','O','T','G'],                     pct: 0.35 },
    ]},
  { code: 'IB', name: 'Iberia',             tierMult: 1.25,
    classes: [
      { cabin: 'Business',        codes: ['J','C','D'],                  pct: 2.50 },
      { cabin: 'Business',        codes: ['R','I'],                      pct: 1.50 },
      { cabin: 'Premium Economy', codes: ['W'],                          pct: 1.50 },
      { cabin: 'Premium Economy', codes: ['E','T'],                      pct: 1.00 },
      { cabin: 'Economy',         codes: ['Y','B','H'],                  pct: 1.00 },
      { cabin: 'Economy',         codes: ['K','L','M','V','S','N','G','Z','F'], pct: 0.50 },
      { cabin: 'Economy',         codes: ['O','Q','A'],                  pct: 0.25 },
    ]},
  { code: 'JL', name: 'Japan Airlines',     tierMult: 1.00,
    classes: [
      { cabin: 'First',           codes: ['F'],                          pct: 3.00 },
      { cabin: 'First',           codes: ['A'],                          pct: 2.50 },
      { cabin: 'Business',        codes: ['C','D','I','J'],              pct: 2.50 },
      { cabin: 'Business',        codes: ['X'],                          pct: 1.50 },
      { cabin: 'Premium Economy', codes: ['R','W'],                      pct: 1.50 },
      { cabin: 'Premium Economy', codes: ['E'],                          pct: 1.00 },
      { cabin: 'Premium Economy', codes: ['P'],                          pct: 0.50 },
      { cabin: 'Economy',         codes: ['B','Y'],                      pct: 1.00 },
      { cabin: 'Economy',         codes: ['H','K','M'],                  pct: 0.70 },
      { cabin: 'Economy',         codes: ['L','S','V'],                  pct: 0.50 },
      { cabin: 'Economy',         codes: ['G','N','O','Q','Z'],          pct: 0.30 },
    ]},
  { code: 'MH', name: 'Malaysia Airlines',  tierMult: 1.00,
    classes: [
      { cabin: 'First',    codes: ['A','F'],                             pct: 1.40 },
      { cabin: 'Business', codes: ['C','D','J'],                         pct: 1.25 },
      { cabin: 'Business', codes: ['Z'],                                 pct: 1.00 },
      { cabin: 'Economy',  codes: ['B','H','Y'],                         pct: 1.00 },
      { cabin: 'Economy',  codes: ['K','M'],                             pct: 0.50 },
      { cabin: 'Economy',  codes: ['L','S','V'],                         pct: 0.25 },
    ]},
  { code: 'WY', name: 'Oman Air',           tierMult: 1.00,
    classes: [
      { cabin: 'Business Studio', codes: ['F'],                          pct: 2.40 },
      { cabin: 'Business Studio', codes: ['A'],                          pct: 2.00 },
      { cabin: 'Business',        codes: ['J','C','D'],                  pct: 2.00 },
      { cabin: 'Business',        codes: ['I','P'],                      pct: 1.50 },
      { cabin: 'Economy',         codes: ['Y','B','H','K'],              pct: 1.00 },
      { cabin: 'Economy',         codes: ['M','L','V','S'],              pct: 0.50 },
      { cabin: 'Economy',         codes: ['G','N','Q','O','R','T'],      pct: 0.25 },
      { cabin: 'Economy',         codes: ['E'],                          pct: 0.10 },
    ]},
  { code: 'QF', name: 'Qantas',             tierMult: 1.00,
    classes: [
      { cabin: 'Business Studio', codes: ['F'],                          pct: 2.40 },
      { cabin: 'Business Studio', codes: ['A'],                          pct: 2.00 },
      { cabin: 'Business',        codes: ['J','C','D'],                  pct: 2.00 },
      { cabin: 'Business',        codes: ['I','P'],                      pct: 1.50 },
      { cabin: 'Economy',         codes: ['Y','B','H','K'],              pct: 1.00 },
      { cabin: 'Economy',         codes: ['M','L','V','S'],              pct: 0.50 },
      { cabin: 'Economy',         codes: ['G','N','Q','O','R','T'],      pct: 0.25 },
      { cabin: 'Economy',         codes: ['E'],                          pct: 0.10 },
    ]},
  { code: 'QR', name: 'Qatar Airways',      tierMult: 1.00,
    classes: [
      { cabin: 'First',    codes: ['A','F'],                             pct: 1.50 },
      { cabin: 'Business', codes: ['C','D','I','J','R'],                 pct: 1.25 },
      { cabin: 'Business', codes: ['P'],                                 pct: 0.75 },
      { cabin: 'Economy',  codes: ['B','H','K','M','Y'],                 pct: 1.00 },
      { cabin: 'Economy',  codes: ['L','V'],                             pct: 0.75 },
      { cabin: 'Economy',  codes: ['N','S','T','Q'],                     pct: 0.50 },
      { cabin: 'Economy',  codes: ['G','O','W'],                         pct: 0.25 },
    ]},
  { code: 'AT', name: 'Royal Air Maroc',    tierMult: 1.00,
    classes: [
      { cabin: 'Business', codes: ['J','C','D'],                         pct: 1.25 },
      { cabin: 'Business', codes: ['I'],                                  pct: 1.00 },
      { cabin: 'Economy',  codes: ['Y','B','H'],                         pct: 1.00 },
      { cabin: 'Economy',  codes: ['K','M'],                             pct: 0.50 },
      { cabin: 'Economy',  codes: ['L','V','S','N','Q','O','T','R','W'], pct: 0.25 },
    ]},
  { code: 'RJ', name: 'Royal Jordanian',    tierMult: 1.00,
    classes: [
      { cabin: 'Business', codes: ['J','C','D'],                         pct: 1.50 },
      { cabin: 'Business', codes: ['I','Z'],                             pct: 1.25 },
      { cabin: 'Economy',  codes: ['Y'],                                 pct: 1.00 },
      { cabin: 'Economy',  codes: ['B','H','K','M'],                     pct: 0.75 },
      { cabin: 'Economy',  codes: ['L','V','S','N','Q'],                 pct: 0.50 },
      { cabin: 'Economy',  codes: ['O','P','W'],                         pct: 0.25 },
    ]},
  { code: 'UL', name: 'SriLankan Airlines', tierMult: 1.00,
    classes: [
      { cabin: 'Business', codes: ['J'],                                 pct: 1.50 },
      { cabin: 'Business', codes: ['C','D'],                             pct: 1.25 },
      { cabin: 'Business', codes: ['I'],                                 pct: 1.00 },
      { cabin: 'Economy',  codes: ['Y','B','H','P'],                     pct: 0.80 },
      { cabin: 'Economy',  codes: ['K','W','M','E'],                     pct: 0.70 },
      { cabin: 'Economy',  codes: ['L','R','V','S'],                     pct: 0.50 },
      { cabin: 'Economy',  codes: ['N','Q','O'],                         pct: 0.30 },
    ]},
  { code: 'AY', name: 'Finnair',            tierMult: 1.00,
    classes: [
      { cabin: 'First',           codes: ['F'],                          pct: 3.00 },
      { cabin: 'First',           codes: ['A'],                          pct: 2.50 },
      { cabin: 'Business',        codes: ['J','C','D'],                  pct: 2.50 },
      { cabin: 'Business',        codes: ['R','I'],                      pct: 1.50 },
      { cabin: 'Premium Economy', codes: ['W'],                          pct: 1.50 },
      { cabin: 'Premium Economy', codes: ['P'],                          pct: 1.00 },
      { cabin: 'Economy',         codes: ['Y','H'],                      pct: 1.00 },
      { cabin: 'Economy',         codes: ['K','L','M','V','S'],          pct: 0.50 },
      { cabin: 'Economy',         codes: ['B','G','O','Q','N'],          pct: 0.25 },
    ]},
];
// Build a flat class→pct lookup per airline for fast calculation
function buildClassMap(airline) {
  const map = {};
  for (const row of airline.classes) {
    for (const c of row.codes) map[c.toUpperCase()] = row.pct;
  }
  return map;
}

const SIM_TARGET = 57500;
let simRows          = [];
let simCounter       = 0;
let selectedAirlineIdx = 0;  // index into AY_AIRLINES for the earnings panel
let forecastLines    = [];   // [{ id, airline, dep, arr, cls, tpPerFlight, times }]
let forecastCounter  = 0;

function initFinnairSim() {
  const card = document.getElementById('ay-sim-card');
  if (!card) return;

  let openPickerId = null;  // which sim-row airline dropdown is open

  // ── Airline logo strip (the "dropdown trigger") ───────────────────────────
  function renderLogoStrip() {
    const strip = document.getElementById('sim-airline-logo-strip');
    if (!strip) return;
    strip.innerHTML = AY_AIRLINES.map((a, i) => {
      const url = simLogoUrl(a.code);
      const sel = i === selectedAirlineIdx ? ' sim-logo-btn--sel' : '';
      return `<button type="button" class="sim-logo-btn${sel}" data-action="select-airline" data-idx="${i}" title="${a.name}">
        ${url
          ? `<img class="sim-logo-btn-img" src="${url}" alt="${a.code}">`
          : `<span class="sim-logo-chip">${a.code}</span>`}
      </button>`;
    }).join('');
  }

  // ── Earning table panel for selected airline ──────────────────────────────
  function renderEarningsPanel() {
    const panel = document.getElementById('sim-airline-panel');
    if (!panel) return;
    const a = AY_AIRLINES[selectedAirlineIdx];
    const url = simLogoUrl(a.code);
    const tierPctLabel = a.tierMult === 1 ? '100%' : `${Math.round(a.tierMult * 100)}%`;
    panel.innerHTML = `
      <div class="sim-panel-header">
        <div class="sim-panel-logo-wrap">
          ${url ? `<img class="sim-panel-logo" src="${url}" alt="${a.code}">` : `<span class="sim-logo-chip sim-logo-chip--lg">${a.code}</span>`}
        </div>
        <div class="sim-panel-tier-badge${a.tierMult > 1 ? ' sim-panel-tier-badge--hi' : ''}">${tierPctLabel}</div>
      </div>
      <table class="sim-earn-table">
        <thead>
          <tr>
            <th>Cabin</th>
            <th>Booking classes</th>
            <th>Multiplier</th>
          </tr>
        </thead>
        <tbody>
          ${a.classes.map(row => `
            <tr>
              <td>${row.cabin}</td>
              <td class="sim-earn-codes">${row.codes.join(', ')}</td>
              <td class="sim-earn-pct">${Math.round(row.pct * 100)}%</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
    panel.hidden = false;
  }

  // ── Sim row rendering (innerHTML only, no listeners here) ─────────────────
  function renderRows() {
    const container = document.getElementById('sim-rows');
    if (!container) return;
    // Airline is always the one selected in the earnings panel above
    const al  = AY_AIRLINES[selectedAirlineIdx] || AY_AIRLINES[0];
    const url = simLogoUrl(al.code);

    container.innerHTML = simRows.map(row => {
      // Sync row airline to selected airline
      row.airline = al.code;
      return `<div class="sim-flight-card" data-id="${row.id}">
        <button class="sim-del-btn sim-del-btn--card" data-action="delete-row" data-id="${row.id}" title="Remove">×</button>

        <div class="sim-flight-logo-wrap">
          ${url ? `<img class="sim-flight-logo" src="${url}" alt="${al.code}">` : `<span class="sim-logo-chip sim-logo-chip--lg">${al.code}</span>`}
        </div>

        <div class="sim-flight-field">
          <label class="sim-field-label">Booking class</label>
          <input class="sim-input sim-class-lg" type="text" maxlength="1" placeholder="Y"
            value="${row.cls}" data-field="cls" data-id="${row.id}">
        </div>

        <div class="sim-flight-field">
          <label class="sim-field-label">From</label>
          <input class="sim-input sim-iata-lg" type="text" maxlength="3" placeholder="ZRH"
            value="${row.dep}" data-field="dep" data-id="${row.id}">
        </div>

        <div class="sim-flight-field">
          <label class="sim-field-label">To</label>
          <input class="sim-input sim-iata-lg" type="text" maxlength="3" placeholder="LHR"
            value="${row.arr}" data-field="arr" data-id="${row.id}">
        </div>

        <div class="sim-flight-field">
          <label class="sim-field-label">Distance</label>
          <div class="sim-dist-val" id="sim-dist-${row.id}">—</div>
        </div>

        <div class="sim-flight-result">
          <span class="sim-result-label">Tier points / flight</span>
          <span class="sim-result-val" id="sim-tp-${row.id}">—</span>
        </div>

        <div class="sim-flight-field sim-flight-times">
          <label class="sim-field-label">Number of flights</label>
          <input class="sim-input sim-times-lg" type="number" min="1" step="1"
            value="${row.times}" data-field="times" data-id="${row.id}">
        </div>

        <div class="sim-flight-result sim-flight-result--total">
          <span class="sim-result-label">Total tier points</span>
          <span class="sim-result-val sim-result-val--total" id="sim-total-${row.id}">—</span>
        </div>

        <button type="button" class="sim-add-forecast-btn" data-action="add-forecast" data-id="${row.id}">
          + Add to forecast
        </button>
      </div>`;
    }).join('');
    recalcSim();
  }

  function fullRender() {
    renderLogoStrip();
    renderEarningsPanel();
    renderRows();
    renderForecast();
  }

  // ── Single delegated click handler on the card ────────────────────────────
  card.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el) {
      // Click outside any picker → close
      if (openPickerId !== null) { openPickerId = null; renderRows(); }
      return;
    }
    const action = el.dataset.action;

    if (action === 'select-airline') {
      selectedAirlineIdx = Number(el.dataset.idx);
      renderLogoStrip();
      renderEarningsPanel();
      renderRows();
      return;
    }
    if (action === 'delete-row') {
      const id = Number(el.dataset.id);
      simRows = simRows.filter(r => r.id !== id);
      if (openPickerId === id) openPickerId = null;
      if (simRows.length === 0) simRows.push({ id: ++simCounter, airline: AY_AIRLINES[selectedAirlineIdx]?.code || 'BA', dep: '', arr: '', cls: 'Y', times: 1 });
      renderRows();
      return;
    }

    if (action === 'add-forecast') {
      const id  = Number(el.dataset.id);
      const row = simRows.find(r => r.id === id);
      if (!row || !row.dep || !row.arr || row.dep.length < 3 || row.arr.length < 3) return;
      const a = store.airports.get(row.dep), b = store.airports.get(row.arr);
      if (!a || !b) return;
      const airline   = AY_AIRLINES.find(x => x.code === row.airline) || AY_AIRLINES[0];
      const classMap  = buildClassMap(airline);
      const classPct  = classMap[row.cls.toUpperCase()] ?? 1.00;
      const distMi    = haversineKm(a.lat, a.lon, b.lat, b.lon) * 0.621371;
      const tpPerFlight = Math.round(distMi * classPct * airline.tierMult);
      if (forecastLines.length >= 20) return;
      forecastLines.push({
        id: ++forecastCounter,
        airline: row.airline,
        dep: row.dep,
        arr: row.arr,
        cls: row.cls,
        tpPerFlight,
        times: row.times,
      });
      renderForecast();
      updateSimSummary();
      return;
    }

    if (action === 'delete-forecast') {
      const id = Number(el.dataset.id);
      forecastLines = forecastLines.filter(f => f.id !== id);
      renderForecast();
      updateSimSummary();
      return;
    }
  });

  // Input changes (delegated on card)
  card.addEventListener('input', e => {
    const el = e.target;
    if (!el.dataset.field) return;
    const id  = Number(el.dataset.id);
    const row = simRows.find(r => r.id === id);
    if (!row) return;
    const f = el.dataset.field;
    if (f === 'dep')   { row.dep = el.value.trim().toUpperCase(); el.value = row.dep; }
    if (f === 'arr')   { row.arr = el.value.trim().toUpperCase(); el.value = row.arr; }
    if (f === 'cls')   { row.cls = el.value.trim().toUpperCase(); el.value = row.cls; }
    if (f === 'times') { row.times = Math.max(1, parseInt(el.value, 10) || 1); }
    recalcSim();
  });

  // Add-row button
  document.getElementById('sim-add-row').addEventListener('click', () => {
    simRows.push({ id: ++simCounter, airline: 'BA', dep: '', arr: '', cls: 'Y', times: 1 });
    renderRows();
  });

  // Re-render when logos arrive or flight data loads
  window.addEventListener('flightlog:logo-changed', fullRender);
  onChange(evt => {
    if (!evt) return;
    if (evt.type === 'data:loaded') { fullRender(); updateSimSummary(); }
    if (evt.type === 'data:changed' || evt.type === 'program:changed') updateSimSummary();
  });

  // Seed one row and do initial render
  simRows.push({ id: ++simCounter, airline: 'BA', dep: '', arr: '', cls: 'Y', times: 1 });
  fullRender();
  if (store.ready) updateSimSummary();
}

// ── Forecast table render ────────────────────────────────────────────────────
function renderForecast() {
  const container = document.getElementById('sim-forecast-table');
  if (!container) return;
  if (forecastLines.length === 0) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = `
    <div class="sim-forecast-wrap">
      <div class="sim-forecast-head">
        <span class="sfc-col-al">Airline</span>
        <span class="sfc-col-route">Route</span>
        <span class="sfc-col-cls">Cls</span>
        <span class="sfc-col-tp">TP/flight</span>
        <span class="sfc-col-times">×</span>
        <span class="sfc-col-total">Total TP</span>
        <span class="sfc-col-del"></span>
      </div>
      ${forecastLines.map(f => {
        const total = f.tpPerFlight * f.times;
        const url   = simLogoUrl(f.airline);
        const logoHtml = url
          ? `<img class="sfc-logo" src="${url}" alt="${f.airline}">`
          : `<span class="sim-logo-chip">${f.airline}</span>`;
        return `<div class="sim-forecast-row" data-id="${f.id}">
          <span class="sfc-col-al">${logoHtml}</span>
          <span class="sfc-col-route">${f.dep}–${f.arr}</span>
          <input class="sfc-input sfc-col-cls" type="text" maxlength="1"
            value="${f.cls}" data-ffield="cls" data-id="${f.id}">
          <span class="sfc-col-tp sfc-val" id="sfc-tp-${f.id}">${f.tpPerFlight.toLocaleString()}</span>
          <input class="sfc-input sfc-col-times" type="number" min="1" step="1"
            value="${f.times}" data-ffield="times" data-id="${f.id}">
          <span class="sfc-col-total sfc-val sfc-val--total" id="sfc-total-${f.id}">${total.toLocaleString()}</span>
          <button class="sim-del-btn" data-action="delete-forecast" data-id="${f.id}" title="Remove">×</button>
        </div>`;
      }).join('')}
    </div>`;

  // Wire inline edits for forecast rows
  container.querySelectorAll('[data-ffield]').forEach(el => {
    el.addEventListener('input', e => {
      const fid  = Number(e.target.dataset.id);
      const ff   = e.target.dataset.ffield;
      const line = forecastLines.find(x => x.id === fid);
      if (!line) return;
      if (ff === 'times') {
        line.times = Math.max(1, parseInt(e.target.value, 10) || 1);
      } else if (ff === 'cls') {
        line.cls = e.target.value.trim().toUpperCase();
        e.target.value = line.cls;
        // Recalc tpPerFlight for new class
        const airline  = AY_AIRLINES.find(x => x.code === line.airline) || AY_AIRLINES[0];
        const classMap = buildClassMap(airline);
        const dep = store.airports.get(line.dep), arr = store.airports.get(line.arr);
        if (dep && arr) {
          const distMi = haversineKm(dep.lat, dep.lon, arr.lat, arr.lon) * 0.621371;
          line.tpPerFlight = Math.round(distMi * (classMap[line.cls] ?? 1.00) * airline.tierMult);
          const $tp = document.getElementById(`sfc-tp-${fid}`);
          if ($tp) $tp.textContent = line.tpPerFlight.toLocaleString();
        }
      }
      const $tot = document.getElementById(`sfc-total-${fid}`);
      if ($tot) $tot.textContent = (line.tpPerFlight * line.times).toLocaleString();
      updateSimSummary();
    });
  });
}

// ── Calculation ───────────────────────────────────────────────────────────────
function recalcSim() {
  let grand = 0;
  for (const row of simRows) {
    const $tp  = document.getElementById(`sim-tp-${row.id}`);
    const $tot = document.getElementById(`sim-total-${row.id}`);
    if (!row.dep || !row.arr || row.dep.length < 3 || row.arr.length < 3) {
      if ($tp)  $tp.textContent  = '—';
      if ($tot) $tot.textContent = '—';
      continue;
    }
    const a = store.airports.get(row.dep);
    const b = store.airports.get(row.arr);
    if (!a || !b) {
      if ($tp)  { $tp.textContent = '?'; $tp.title = 'Airport not found'; }
      if ($tot) $tot.textContent = '—';
      continue;
    }
    const airline     = AY_AIRLINES.find(x => x.code === row.airline) || AY_AIRLINES[0];
    const classMap    = buildClassMap(airline);
    const classPct    = classMap[row.cls.toUpperCase()] ?? 1.00;
    const distMi      = haversineKm(a.lat, a.lon, b.lat, b.lon) * 0.621371;
    const tpPerTrip   = Math.round(distMi * classPct * airline.tierMult);
    const tpTotal     = tpPerTrip * row.times;
    grand += tpTotal;
    const $dist = document.getElementById(`sim-dist-${row.id}`);
    if ($dist) $dist.textContent = Math.round(distMi).toLocaleString() + ' mi';
    if ($tp)   $tp.textContent   = tpPerTrip.toLocaleString();
    if ($tot)  $tot.textContent  = tpTotal.toLocaleString();
  }
  const $g = document.getElementById('sim-grand-total');
  if ($g) $g.textContent = grand.toLocaleString();
  updateSimSummary(grand);
}

function updateSimSummary(simulatedExtra) {
  const prog = PROGRAMS.find(p => p.id === 'ay');
  if (!prog) return;
  const current = computeBalance(prog, computeWindow(prog, new Date())).total;

  if (simulatedExtra === undefined) {
    // Sum only the committed forecast lines
    simulatedExtra = forecastLines.reduce((sum, f) => sum + f.tpPerFlight * f.times, 0);
  }

  const projected = current + simulatedExtra;
  const needed    = Math.max(0, SIM_TARGET - projected);
  const $cur  = document.getElementById('sim-current');
  const $proj = document.getElementById('sim-projected');
  const $need = document.getElementById('sim-needed');
  if ($cur)  $cur.textContent  = current.toLocaleString();
  if ($proj) { $proj.textContent = projected.toLocaleString(); $proj.dataset.tone = projected >= SIM_TARGET ? 'good' : projected >= SIM_TARGET * 0.75 ? 'warn' : 'bad'; }
  if ($need) { $need.textContent = needed > 0 ? needed.toLocaleString() : '✓ Done'; $need.dataset.tone = needed === 0 ? 'good' : ''; }
}

// Haversine (also defined in data.js but we need it here without importing to avoid issues)
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// ============================================================
// Adjustment modal — manual correction + qualification start date
// ============================================================
function openRolloverModal(programId) {
  const program = PROGRAMS.find(p => p.id === programId);
  if (!program) return;
  const adj = store.programAdjustments?.get(programId) || {};
  const currentCorrection = Number.isFinite(adj.manual_correction) ? adj.manual_correction : 0;
  const currentStart = adj.qualification_start || '';

  const wrap = document.createElement('div');
  wrap.className = 'modal';
  wrap.innerHTML = `
    <div class="modal-card rollover-modal">
      <header class="modal-head">
        <h2>Adjustments — ${program.name}</h2>
        <button class="ghost icon-only" id="ro-close" aria-label="Close">×</button>
      </header>
      <div class="modal-body">
        <div class="field">
          <label>Manual balance correction</label>
          <input type="number" id="ro-correction" step="1" value="${currentCorrection}" autocomplete="off">
          <p class="hint-text">Added to the total. Use a negative number to subtract (e.g. to remove an unexplained "gift" from the balance).</p>
        </div>

        <div class="field">
          <label>Annual reset date <span class="hint">(optional)</span></label>
          <input type="date" id="ro-start" value="${currentStart}" autocomplete="off">
          <p class="hint-text">The day each year when the program year resets. Pick any date with the right month/day — the year part is auto-rolled. Leave empty to use the calendar year (Jan 1).</p>
          <button type="button" class="ghost small" id="ro-start-clear">Clear date</button>
        </div>

        <p class="error-msg" id="ro-error"></p>
      </div>
      <footer class="modal-foot">
        <span></span>
        <div class="foot-right">
          <button class="ghost" id="ro-cancel">Cancel</button>
          <button class="primary" id="ro-save">Save</button>
        </div>
      </footer>
    </div>
  `;
  document.body.appendChild(wrap);

  const close = () => wrap.remove();
  const $correction = wrap.querySelector('#ro-correction');
  const $start = wrap.querySelector('#ro-start');
  setTimeout(() => { $correction.focus(); $correction.select(); }, 0);

  wrap.querySelector('#ro-close').addEventListener('click', close);
  wrap.querySelector('#ro-cancel').addEventListener('click', close);
  wrap.querySelector('#ro-start-clear').addEventListener('click', () => { $start.value = ''; });
  wrap.addEventListener('click', e => { if (e.target === wrap) close(); });

  const save = async () => {
    const $err = wrap.querySelector('#ro-error');
    $err.textContent = '';
    const cVal = $correction.value.trim();
    if (cVal === '' || isNaN(Number(cVal))) {
      $err.textContent = 'Manual correction must be a number (negative is allowed).';
      return;
    }
    const startVal = $start.value || null;
    const $save = wrap.querySelector('#ro-save');
    $save.disabled = true;
    try {
      await setProgramAdjustment(programId, {
        manual_correction: Number(cVal),
        qualification_start: startVal,
      });
      close();
    } catch (e) {
      $err.textContent = 'Save failed: ' + (e.message || e);
      $save.disabled = false;
    }
  };

  wrap.querySelector('#ro-save').addEventListener('click', save);
  $correction.addEventListener('keydown', e => {
    if (e.key === 'Enter') save();
    if (e.key === 'Escape') close();
  });
  $start.addEventListener('keydown', e => {
    if (e.key === 'Enter') save();
    if (e.key === 'Escape') close();
  });
}
