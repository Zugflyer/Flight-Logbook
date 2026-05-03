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


function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function fmt(n) { return Number(n).toLocaleString(); }
function slug(s) { return String(s).toLowerCase().replace(/\s+/g, '-'); }

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
