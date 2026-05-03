// ============================================================================
// Flight Log — Status tab
//
// Three-column layout (Air France / Finnair / Swiss). Each column has:
//   1. Alliance badge at the top
//   2. Tier-point progress bar (segmented for Air France: 0→900→1850)
//   3. Calendar-pace bar — white = year progress, blue inside = tier-point
//      progress vs target, percentage at the right = pace ratio.
// ============================================================================

import { store, onChange, isHistoric, setProgramRollover } from './data.js';

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
    accent: '#002157',                       // Air France navy
    accentSoft: '#e6ecf5',
    targets: [900, 1850],
    airlines: ['AF', 'KL'],
    rolloverEnabled: true,                   // shows "+" button by the top target
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
    extendedScale: 80000,                    // visual axis extends past target
    airlines: ['BA', 'IB', 'AY', 'AA', 'CX', 'AT', 'JL'],
  },
  {
    id: 'lx',
    name: 'Swiss',
    alliance: 'Star Alliance',
    allianceLogo: 'assets/logos/staralliance.png',
    airlineLogo: 'assets/logos/swiss.png',
    accent: '#cc0000',                       // Swiss red
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
                ${p.rolloverEnabled ? `
                  <button class="rollover-btn" data-program="${p.id}" aria-label="Set rollover miles" title="Set rollover miles">+</button>
                ` : ''}
              </div>
              <div class="tp-bar" id="tp-bar-${p.id}"></div>
              <div class="tp-axis" id="tp-axis-${p.id}"></div>
              <div class="tp-rollover-note" id="tp-rollover-${p.id}"></div>
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
  const year = now.getFullYear();
  const yearProgress = computeYearProgress(now);

  for (const p of PROGRAMS) {
    const balance = computeBalance(p, year);
    renderTierBar(p, balance);
    renderPaceBar(p, balance, yearProgress);

    const $year = document.getElementById(`status-year-${p.id}`);
    if ($year) $year.textContent = year;

    const $note = document.getElementById(`tp-rollover-${p.id}`);
    if ($note && p.rolloverEnabled) {
      const rollover = store.programAdjustments?.get(p.id)?.rollover || 0;
      $note.textContent = rollover > 0 ? `Includes ${fmt(rollover)} rollover miles` : '';
    }
  }
}

// ---------- Balance ----------
function computeBalance(program, year) {
  const allowed = new Set(program.airlines.map(a => a.toUpperCase()));
  let sum = 0;
  for (const f of store.flights) {
    if (isHistoric(f) || !f.date) continue;
    if (f.date.slice(0, 4) !== String(year)) continue;
    if (!f.airline) continue;
    if (!allowed.has(f.airline.toUpperCase())) continue;
    if (f.tier_miles == null) continue;
    sum += Number(f.tier_miles) || 0;
  }
  // Add any rollover miles configured for this program
  const adj = store.programAdjustments?.get(program.id);
  if (adj && Number.isFinite(adj.rollover)) {
    sum += adj.rollover;
  }
  return sum;
}

// ---------- Year fraction ----------
// Day-precision: Jan 1 = 0, Dec 31 = ~1 (roughly day-of-year / days-in-year).
function computeYearProgress(now) {
  const start = new Date(now.getFullYear(), 0, 1);
  const end = new Date(now.getFullYear() + 1, 0, 1);
  return (now - start) / (end - start);
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
// Year-pace bar (bottom)
// ============================================================
function renderPaceBar(program, balance, yearProgress) {
  const $bar = document.getElementById(`pace-bar-${program.id}`);
  if (!$bar) return;

  // The "tier-points-as-fraction-of-target" — for Air France, pace measures
  // against the FINAL target (1850).
  const finalTarget = program.targets[program.targets.length - 1];
  const tpFraction = clamp(balance / finalTarget, 0, Infinity);  // can exceed 1.0
  const yearPct = (yearProgress * 100).toFixed(2);
  // Inside the white year-fill, the blue tp-fill is sized as a fraction of
  // the WHOLE bar (not of the year fill), so it can extend beyond the year
  // fill if you're ahead of schedule.
  const tpPct = clamp(tpFraction * 100, 0, 100).toFixed(2);

  // Pace ratio: tp progress / year progress. >100% = ahead, <100% = behind.
  let paceRatio;
  if (yearProgress <= 0) {
    paceRatio = tpFraction > 0 ? Infinity : 1;
  } else {
    paceRatio = tpFraction / yearProgress;
  }
  const pacePct = isFinite(paceRatio) ? Math.round(paceRatio * 100) : '∞';

  $bar.querySelector('.pace-year-fill').style.width = `${yearPct}%`;
  $bar.querySelector('.pace-tp-fill').style.width = `${tpPct}%`;

  const $pct = $bar.querySelector('.pace-pct');
  $pct.textContent = `${pacePct}%`;
  // Color the pct text by whether on/off pace
  if (typeof paceRatio === 'number') {
    if (paceRatio >= 1) $pct.dataset.tone = 'good';
    else if (paceRatio >= 0.75) $pct.dataset.tone = 'warn';
    else $pct.dataset.tone = 'bad';
  } else {
    $pct.dataset.tone = 'good';
  }
}

// ============================================================
// Helpers
// ============================================================
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function fmt(n) { return Number(n).toLocaleString(); }
function slug(s) { return String(s).toLowerCase().replace(/\s+/g, '-'); }

// ============================================================
// Rollover modal
// ============================================================
function openRolloverModal(programId) {
  const program = PROGRAMS.find(p => p.id === programId);
  if (!program) return;
  const current = store.programAdjustments?.get(programId)?.rollover || 0;

  const wrap = document.createElement('div');
  wrap.className = 'modal';
  wrap.innerHTML = `
    <div class="modal-card rollover-modal">
      <header class="modal-head">
        <h2>Rollover miles — ${program.name}</h2>
        <button class="ghost icon-only" id="ro-close" aria-label="Close">×</button>
      </header>
      <div class="modal-body">
        <p class="muted">
          Rollover miles are added to the current year balance — useful for
          programs that carry forward unspent tier points from the previous
          year. Set to 0 to remove.
        </p>
        <div class="field">
          <label>Rollover miles</label>
          <input type="number" id="ro-input" min="0" step="1" value="${current}" autocomplete="off">
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
  const $input = wrap.querySelector('#ro-input');
  setTimeout(() => { $input.focus(); $input.select(); }, 0);

  wrap.querySelector('#ro-close').addEventListener('click', close);
  wrap.querySelector('#ro-cancel').addEventListener('click', close);
  wrap.addEventListener('click', e => { if (e.target === wrap) close(); });

  const save = async () => {
    const $err = wrap.querySelector('#ro-error');
    $err.textContent = '';
    const value = $input.value.trim();
    if (value === '' || isNaN(Number(value)) || Number(value) < 0) {
      $err.textContent = 'Enter a non-negative number.';
      return;
    }
    const $save = wrap.querySelector('#ro-save');
    $save.disabled = true;
    try {
      await setProgramRollover(programId, Number(value));
      close();
    } catch (e) {
      $err.textContent = 'Save failed: ' + (e.message || e);
      $save.disabled = false;
    }
  };

  wrap.querySelector('#ro-save').addEventListener('click', save);
  $input.addEventListener('keydown', e => {
    if (e.key === 'Enter') save();
    if (e.key === 'Escape') close();
  });
}
