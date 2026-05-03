// ============================================================================
// Flight Log — Map tab
//
// World map with great-circle routes, airport markers, and filter bar.
// Visual style matches the rest of the site (Outlook blue, light theme).
// ============================================================================

import { store, onChange, isHistoric } from './data.js';
import { getLogoUrl } from './logos.js';

const CABINS = ['Economy', 'Premium Economy', 'Business', 'First'];

let panel = null;
let map = null;
let routesLayer = null;
let airportsLayer = null;
let initialized = false;

const filters = {
  search: '',
  year: 'all',
  airline: 'all',
  cabin: 'all',
  endpoint: 'all',  // optional From/To airport filter
};

let selectedAirport = null;  // IATA of currently selected airport (click to drill into connections)

export function initMap() {
  panel = document.querySelector('.panel[data-panel="map"]');
  panel.innerHTML = `
    <div class="map-root">
      <header class="map-header">
        <div class="map-titleblock">
          <h2>Map</h2>
          <p class="map-summary" id="map-summary">—</p>
        </div>
      </header>

      <div class="map-filters">
        <input type="search" id="mf-search" placeholder="Search city, IATA, airline…">
        <select id="mf-year"><option value="all">All years</option></select>
        <select id="mf-airline"><option value="all">All airlines</option></select>
        <select id="mf-cabin">
          <option value="all">All cabins</option>
          ${CABINS.map(c => `<option value="${c}">${c}</option>`).join('')}
        </select>
        <select id="mf-endpoint"><option value="all">All airports</option></select>
        <button class="ghost small" id="mf-clear">Clear</button>
      </div>

      <div class="map-canvas" id="map-canvas"></div>
    </div>
  `;

  wireFilters();

  // Tab activation: lazily create the map only once the panel is shown,
  // because Leaflet needs visible DOM dimensions.
  const observer = new MutationObserver(() => {
    if (panel.classList.contains('active') && !initialized) {
      ensureMap();
    } else if (panel.classList.contains('active') && map) {
      // Existing map — recompute size in case it was hidden during a resize
      setTimeout(() => map.invalidateSize(), 0);
    }
  });
  observer.observe(panel, { attributes: true, attributeFilter: ['class'] });

  onChange(evt => {
    if (!evt || typeof evt !== 'object') return;
    if (evt.type === 'data:loaded' || evt.type === 'data:changed' || evt.type === 'airports:changed') {
      populateFilterOptions();
      if (initialized) render();
    }
  });

  if (panel.classList.contains('active') && store.ready) {
    ensureMap();
  }
}

// ============================================================
// Map setup
// ============================================================
function ensureMap() {
  if (initialized) return;
  initialized = true;

  // Leaflet map with a clean, light tile layer (CartoDB Positron)
  map = L.map('map-canvas', {
    center: [25, 10],
    zoom: 2,
    minZoom: 2,
    maxZoom: 8,
    worldCopyJump: true,
    zoomControl: true,
    attributionControl: true,
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap &copy; CartoDB',
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(map);

  routesLayer = L.layerGroup().addTo(map);
  airportsLayer = L.layerGroup().addTo(map);

  // Click background to clear selection. Leaflet bubbles marker clicks up to
  // the map, so we have to filter: only treat this as a "background" click
  // when the original DOM target is the tile pane itself, not a marker/path.
  map.on('click', (e) => {
    const t = e.originalEvent?.target;
    if (t && (t.closest('.leaflet-marker-icon') || t.closest('path') || t.closest('.leaflet-popup'))) {
      return;  // click was on a marker, route, or popup — ignore
    }
    if (selectedAirport) {
      selectedAirport = null;
      closeConnectionsPopup();
      render();
    }
  });

  // Bind popupclose ONCE here, not inside openConnectionsPopup. The previous
  // version added a new listener every time a popup opened — and worse, the
  // Leaflet auto-close that fires when you open a new popup over an existing
  // one would trigger a render that immediately undid the selection, making
  // clicks appear to do nothing. We also gate on `userClosed` so we don't
  // recurse when render() itself opens a new popup.
  map.on('popupclose', (e) => {
    // Only react if THIS popup is the connections popup we tracked.
    if (e.popup !== openPopup) return;
    openPopup = null;
    // Don't clear selection — render() drives popup lifecycle, not the user
    // closing the popup. If the user hits the × button on the popup we DO
    // want to clear; we detect that via a flag set in closeConnectionsPopup.
    if (userClosingPopup) {
      userClosingPopup = false;
      if (selectedAirport) {
        selectedAirport = null;
        render();
      }
    }
  });

  populateFilterOptions();
  render();
}

// ============================================================
// Filters
// ============================================================
function wireFilters() {
  const $search = document.getElementById('mf-search');
  const $year = document.getElementById('mf-year');
  const $airline = document.getElementById('mf-airline');
  const $cabin = document.getElementById('mf-cabin');
  const $endpoint = document.getElementById('mf-endpoint');
  const $clear = document.getElementById('mf-clear');

  const onFilterChange = () => {
    if (selectedAirport) {
      selectedAirport = null;
      closeConnectionsPopup();
    }
    render();
  };

  let searchDebounce;
  $search.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => { filters.search = $search.value.trim(); onFilterChange(); }, 120);
  });
  $year.addEventListener('change', () => { filters.year = $year.value; onFilterChange(); });
  $airline.addEventListener('change', () => { filters.airline = $airline.value; onFilterChange(); });
  $cabin.addEventListener('change', () => { filters.cabin = $cabin.value; onFilterChange(); });
  $endpoint.addEventListener('change', () => { filters.endpoint = $endpoint.value; onFilterChange(); });
  $clear.addEventListener('click', () => {
    filters.search = ''; filters.year = 'all'; filters.airline = 'all';
    filters.cabin = 'all'; filters.endpoint = 'all';
    $search.value = ''; $year.value = 'all'; $airline.value = 'all';
    $cabin.value = 'all'; $endpoint.value = 'all';
    onFilterChange();
  });
}

function populateFilterOptions() {
  if (!store.ready) return;
  const flights = store.flights || [];

  const years = [...new Set(flights.filter(f => !isHistoric(f) && f.date).map(f => f.date.slice(0, 4)))].sort().reverse();
  const hasHistoric = flights.some(isHistoric);
  const $year = document.getElementById('mf-year');
  $year.innerHTML = '<option value="all">All years</option>' +
    years.map(y => `<option value="${y}">${y}</option>`).join('') +
    (hasHistoric ? '<option value="historic">Pre-2012</option>' : '');
  $year.value = filters.year;

  const airlines = [...new Set(flights.map(f => f.airline).filter(Boolean))].sort();
  const $airline = document.getElementById('mf-airline');
  $airline.innerHTML = '<option value="all">All airlines</option>' +
    airlines.map(a => `<option value="${a}">${a}</option>`).join('');
  $airline.value = filters.airline;

  // Endpoint: any IATA appearing in flights, sorted by frequency
  const apCount = new Map();
  for (const f of flights) {
    if (f.from_iata) apCount.set(f.from_iata, (apCount.get(f.from_iata) || 0) + 1);
    if (f.to_iata) apCount.set(f.to_iata, (apCount.get(f.to_iata) || 0) + 1);
  }
  const sortedEndpoints = [...apCount.entries()].sort((a, b) => b[1] - a[1]);
  const $endpoint = document.getElementById('mf-endpoint');
  $endpoint.innerHTML = '<option value="all">All airports</option>' +
    sortedEndpoints.map(([iata, n]) => {
      const a = store.airports.get(iata);
      const label = a ? `${a.city} (${iata})` : iata;
      return `<option value="${iata}">${escapeHtml(label)} — ${n}</option>`;
    }).join('');
  $endpoint.value = filters.endpoint;
}

function applyFilters() {
  let rows = store.flights || [];
  if (filters.year === 'historic') {
    rows = rows.filter(isHistoric);
  } else if (filters.year !== 'all') {
    rows = rows.filter(f => !isHistoric(f) && f.date && f.date.startsWith(filters.year));
  }
  if (filters.airline !== 'all') rows = rows.filter(f => f.airline === filters.airline);
  if (filters.cabin !== 'all') rows = rows.filter(f => f.cabin === filters.cabin);
  if (filters.endpoint !== 'all') {
    rows = rows.filter(f => f.from_iata === filters.endpoint || f.to_iata === filters.endpoint);
  }
  if (filters.search) {
    const q = filters.search.toLowerCase();
    rows = rows.filter(f => {
      const fromA = store.airports.get(f.from_iata);
      const toA = store.airports.get(f.to_iata);
      return (
        f.from_iata?.toLowerCase().includes(q) ||
        f.to_iata?.toLowerCase().includes(q) ||
        f.airline?.toLowerCase().includes(q) ||
        fromA?.city.toLowerCase().includes(q) ||
        toA?.city.toLowerCase().includes(q) ||
        fromA?.country.toLowerCase().includes(q) ||
        toA?.country.toLowerCase().includes(q)
      );
    });
  }
  return rows;
}

// ============================================================
// Render: routes + airport markers
// ============================================================
function render() {
  if (!map) return;
  routesLayer.clearLayers();
  airportsLayer.clearLayers();

  const flights = applyFilters();

  // Aggregate routes (undirected: ZRH↔CDG counted once) and airline-per-route
  const routeMap = new Map();   // key: "AAA|BBB" sorted -> { from, to, count, airlines: Map<code, n> }
  const apCount = new Map();    // iata -> visit count
  for (const f of flights) {
    if (!f.from_iata || !f.to_iata) continue;
    apCount.set(f.from_iata, (apCount.get(f.from_iata) || 0) + 1);
    apCount.set(f.to_iata, (apCount.get(f.to_iata) || 0) + 1);
    const [a, b] = [f.from_iata, f.to_iata].sort();
    const key = `${a}|${b}`;
    let r = routeMap.get(key);
    if (!r) {
      r = { from: a, to: b, count: 0, airlines: new Map() };
      routeMap.set(key, r);
    }
    r.count++;
    if (f.airline) {
      const code = f.airline.toUpperCase();
      r.airlines.set(code, (r.airlines.get(code) || 0) + 1);
    }
  }

  // Update summary
  const summaryEl = document.getElementById('map-summary');
  if (selectedAirport) {
    const a = store.airports.get(selectedAirport);
    summaryEl.textContent = `Showing connections for ${a?.city || selectedAirport} (${selectedAirport}). Click background to clear.`;
  } else {
    summaryEl.textContent = `${flights.length.toLocaleString()} flights · ${routeMap.size} routes · ${apCount.size} airports`;
  }

  // Determine which routes to draw + which airports to show
  const maxRouteCount = Math.max(1, ...[...routeMap.values()].map(r => r.count));
  for (const r of routeMap.values()) {
    const isConnectedToSelected = !selectedAirport || r.from === selectedAirport || r.to === selectedAirport;
    if (selectedAirport && !isConnectedToSelected) continue;  // hide unrelated routes
    const A = store.airports.get(r.from);
    const B = store.airports.get(r.to);
    if (!A || !B) continue;
    const opacity = selectedAirport
      ? Math.min(1, 0.5 + 0.5 * (r.count / maxRouteCount))   // boldened when filtering
      : 0.18 + 0.62 * (r.count / maxRouteCount);
    const arcPoints = greatCircle(A.lat, A.lon, B.lat, B.lon, 64);
    drawArc(arcPoints, opacity, r);
  }

  // Draw airport markers
  const maxApCount = Math.max(1, ...apCount.values());
  for (const [iata, n] of apCount.entries()) {
    const a = store.airports.get(iata);
    if (!a) continue;
    // When an airport is selected, dim all others that aren't connected to it
    let isHighlighted = !selectedAirport || iata === selectedAirport;
    if (selectedAirport && !isHighlighted) {
      // Check if connected to selected
      const [x, y] = [iata, selectedAirport].sort();
      isHighlighted = routeMap.has(`${x}|${y}`);
    }
    if (selectedAirport && !isHighlighted) continue;  // hide unconnected airports

    const radius = 3 + 6 * Math.sqrt(n / maxApCount);
    const isSelected = iata === selectedAirport;
    const marker = L.circleMarker([a.lat, a.lon], {
      radius: isSelected ? radius + 2 : radius,
      color: '#0078d4',
      weight: isSelected ? 2.5 : 1.5,
      fillColor: isSelected ? '#0078d4' : '#ffffff',
      fillOpacity: isSelected ? 0.9 : 0.95,
      opacity: 1,
    });
    marker.bindTooltip(
      `<div class="map-tooltip"><strong>${escapeHtml(a.city)} (${iata})</strong><br>${n} visit${n === 1 ? '' : 's'}</div>`,
      { direction: 'top', offset: [0, -2], className: 'map-tooltip-wrap' }
    );
    marker.on('click', (e) => {
      // Defense-in-depth: the background click handler above already filters
      // marker clicks via DOM target, but stopping propagation here too keeps
      // things clean and avoids any timing race.
      if (e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
      selectAirport(iata);
    });
    marker.addTo(airportsLayer);
  }

  // If an airport is selected, open its connections popup
  if (selectedAirport) {
    const a = store.airports.get(selectedAirport);
    if (a) openConnectionsPopup(selectedAirport, a, routeMap, apCount);
  }
}

// ============================================================
// Selection / connections popup
// ============================================================
function selectAirport(iata) {
  if (selectedAirport === iata) {
    selectedAirport = null;
  } else {
    selectedAirport = iata;
  }
  closeConnectionsPopup();
  // Defer to the next tick so the click event finishes propagating before
  // we destroy and rebuild all the markers in render(). Without this, the
  // marker that was just clicked gets removed from the DOM mid-handler in
  // some browsers, which can swallow the state change.
  setTimeout(render, 0);
}

let openPopup = null;
let userClosingPopup = false;
function closeConnectionsPopup() {
  if (openPopup) {
    userClosingPopup = false;  // programmatic close, not user-initiated
    map.closePopup(openPopup);
    openPopup = null;
  }
}

function openConnectionsPopup(iata, airport, routeMap, apCount) {
  // Build the per-connection rows
  const connections = [];
  for (const r of routeMap.values()) {
    if (r.from !== iata && r.to !== iata) continue;
    const otherIata = r.from === iata ? r.to : r.from;
    const otherA = store.airports.get(otherIata);
    if (!otherA) continue;
    // Sort airlines by count desc
    const airlinesSorted = [...r.airlines.entries()].sort((a, b) => b[1] - a[1]);
    connections.push({
      iata: otherIata,
      city: otherA.city,
      count: r.count,
      airlines: airlinesSorted,
    });
  }
  connections.sort((a, b) => b.count - a.count || a.city.localeCompare(b.city));

  const totalVisits = apCount.get(iata) || 0;

  // Build HTML
  const rowsHtml = connections.map(c => {
    const airlinesHtml = c.airlines.map(([code, n]) => {
      const url = getLogoUrl(code);
      const inner = url
        ? `<img class="conn-logo" src="${escapeAttr(url)}" alt="${escapeAttr(code)}">`
        : `<span class="conn-chip">${escapeHtml(code)}</span>`;
      return `<span class="conn-airline" title="${escapeAttr(code)} — ${n} flight${n===1?'':'s'}">${inner}<span class="conn-airline-count">×${n}</span></span>`;
    }).join('');
    return `
      <div class="conn-row">
        <div class="conn-dest">
          <span class="conn-city">${escapeHtml(c.city)}</span>
          <span class="conn-iata">${escapeHtml(c.iata)}</span>
        </div>
        <div class="conn-airlines">${airlinesHtml}</div>
        <div class="conn-count">${c.count}</div>
      </div>
    `;
  }).join('');

  const popupContent = `
    <div class="conn-popup">
      <header class="conn-head">
        <div>
          <div class="conn-head-title">${escapeHtml(airport.city)} <span class="conn-head-iata">(${iata})</span></div>
          <div class="conn-head-sub">${connections.length} destination${connections.length === 1 ? '' : 's'} · ${totalVisits} total visit${totalVisits === 1 ? '' : 's'}</div>
        </div>
      </header>
      <div class="conn-list">
        ${rowsHtml || '<div class="conn-empty">No connections in current filter.</div>'}
      </div>
    </div>
  `;

  openPopup = L.popup({
    maxWidth: 420,
    minWidth: 320,
    maxHeight: 360,
    autoClose: false,
    closeOnClick: false,
    closeButton: true,
    className: 'conn-popup-wrap',
  })
    .setLatLng([airport.lat, airport.lon])
    .setContent(popupContent)
    .openOn(map);

  // The popup's × button closes via Leaflet's normal close path — when that
  // happens, we want to clear the selection. We detect a user-initiated
  // close by listening for mousedown on the close button before the popup
  // close event fires, and set the flag for the global popupclose handler.
  setTimeout(() => {
    const closeBtn = document.querySelector('.leaflet-popup-close-button');
    if (closeBtn) {
      closeBtn.addEventListener('mousedown', () => { userClosingPopup = true; }, { once: true });
    }
  }, 0);
}

// Draw a great-circle arc, splitting into segments if it crosses the antimeridian
function drawArc(points, opacity, route) {
  const segments = splitAtAntimeridian(points);
  for (const seg of segments) {
    const line = L.polyline(seg, {
      color: '#0078d4',
      weight: 1.6,
      opacity,
      lineCap: 'round',
      lineJoin: 'round',
    });
    line.bindTooltip(
      `<div class="map-tooltip"><strong>${route.from} ↔ ${route.to}</strong><br>${route.count} flight${route.count === 1 ? '' : 's'}</div>`,
      { sticky: true, className: 'map-tooltip-wrap' }
    );
    line.addTo(routesLayer);
  }
}

// ============================================================
// Great-circle math
// ============================================================
// Returns N+1 points [lat, lon] along the great-circle from (lat1,lon1) to (lat2,lon2).
function greatCircle(lat1, lon1, lat2, lon2, n = 64) {
  const toRad = d => d * Math.PI / 180;
  const toDeg = r => r * 180 / Math.PI;
  const φ1 = toRad(lat1), λ1 = toRad(lon1);
  const φ2 = toRad(lat2), λ2 = toRad(lon2);
  const Δφ = φ2 - φ1, Δλ = λ2 - λ1;
  const a = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  if (c === 0) return [[lat1, lon1], [lat2, lon2]];

  const points = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const A = Math.sin((1-f)*c) / Math.sin(c);
    const B = Math.sin(f*c) / Math.sin(c);
    const x = A*Math.cos(φ1)*Math.cos(λ1) + B*Math.cos(φ2)*Math.cos(λ2);
    const y = A*Math.cos(φ1)*Math.sin(λ1) + B*Math.cos(φ2)*Math.sin(λ2);
    const z = A*Math.sin(φ1) + B*Math.sin(φ2);
    const φ = Math.atan2(z, Math.sqrt(x*x + y*y));
    const λ = Math.atan2(y, x);
    points.push([toDeg(φ), toDeg(λ)]);
  }
  return points;
}

// If a polyline crosses the ±180° meridian, split it so it doesn't draw across the whole map
function splitAtAntimeridian(points) {
  const segs = [];
  let cur = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i-1], p = points[i];
    if (Math.abs(p[1] - prev[1]) > 180) {
      segs.push(cur);
      cur = [p];
    } else {
      cur.push(p);
    }
  }
  segs.push(cur);
  return segs.filter(s => s.length >= 2);
}

// ============================================================
// Helpers
// ============================================================
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function escapeAttr(s) { return escapeHtml(s); }
