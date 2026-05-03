// ============================================================================
// Flight Log — data layer (password-gate version, no magic links)
// ============================================================================

import { SUPABASE_URL, SUPABASE_ANON_KEY, APP_PASSWORD } from './config.js';
import { loadLogos } from './logos.js';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const LOCK_KEY = 'flightlog.unlocked.v1';

// ----------- Store -----------
const listeners = new Set();
export const store = {
  unlocked: false,
  flights: [],
  airports: new Map(),
  ready: false,
};
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(evt) { for (const fn of listeners) fn(evt); }

// ----------- Password gate -----------
export function isUnlocked() {
  return localStorage.getItem(LOCK_KEY) === '1';
}
export function tryUnlock(pw) {
  if (!APP_PASSWORD || pw === APP_PASSWORD) {
    localStorage.setItem(LOCK_KEY, '1');
    store.unlocked = true;
    return true;
  }
  return false;
}
export function lock() {
  localStorage.removeItem(LOCK_KEY);
  store.unlocked = false;
  store.flights = [];
  store.airports = new Map();
  store.ready = false;
  emit({ type: 'auth:locked' });
}

// ----------- Data loading (paginated) -----------
async function fetchAll(table, orderCol = null) {
  const PAGE = 1000;
  let from = 0, all = [];
  while (true) {
    let q = sb.from(table).select('*').range(from, from + PAGE - 1);
    if (orderCol) q = q.order(orderCol, { ascending: true });
    const { data, error } = await q;
    if (error) throw error;
    all = all.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

export async function loadAll() {
  if (!store.unlocked) return;
  const [flights, airports] = await Promise.all([
    fetchAll('flights', 'date'),
    fetchAll('airports'),
    loadLogos(),  // load airline logos in parallel
  ]);
  store.flights = flights;
  store.airports = new Map(airports.map(a => [a.iata, a]));
  store.ready = true;
  emit({ type: 'data:loaded', counts: { flights: store.flights.length, airports: store.airports.size } });
}

// ----------- CRUD -----------
export async function addFlight(flight) {
  const row = computeDistance(flight);
  const { data, error } = await sb.from('flights').insert(row).select().single();
  if (error) throw error;
  store.flights.push(data);
  store.flights.sort((a, b) => a.date.localeCompare(b.date));
  emit({ type: 'data:changed', kind: 'add', row: data });
  return data;
}

export async function updateFlight(id, patch) {
  if (patch.from_iata || patch.to_iata) {
    const current = store.flights.find(f => f.id === id);
    const merged = { ...current, ...patch };
    Object.assign(patch, computeDistance(merged, true));
  }
  const { data, error } = await sb.from('flights').update(patch).eq('id', id).select().single();
  if (error) throw error;
  const idx = store.flights.findIndex(f => f.id === id);
  if (idx >= 0) store.flights[idx] = data;
  emit({ type: 'data:changed', kind: 'update', row: data });
  return data;
}

export async function deleteFlight(id) {
  const { error } = await sb.from('flights').delete().eq('id', id);
  if (error) throw error;
  store.flights = store.flights.filter(f => f.id !== id);
  emit({ type: 'data:changed', kind: 'delete', id });
}

// ----------- Airport CRUD -----------
export async function addAirport(airport) {
  // airport must have: iata, name, city, country, lat, lon, optionally icao
  const { data, error } = await sb.from('airports').insert(airport).select().single();
  if (error) throw error;
  store.airports.set(data.iata, data);
  emit({ type: 'airports:changed', kind: 'add', row: data });
  return data;
}

export async function updateAirport(iata, patch) {
  const { data, error } = await sb.from('airports').update(patch).eq('iata', iata).select().single();
  if (error) throw error;
  // If the IATA changed, the old key needs deleting (rare — usually you just edit name/city/coords)
  if (patch.iata && patch.iata !== iata) {
    store.airports.delete(iata);
  }
  store.airports.set(data.iata, data);
  emit({ type: 'airports:changed', kind: 'update', row: data });
  return data;
}

export async function deleteAirport(iata) {
  const { error } = await sb.from('airports').delete().eq('iata', iata);
  if (error) throw error;
  store.airports.delete(iata);
  emit({ type: 'airports:changed', kind: 'delete', iata });
}

// ----------- Distance -----------
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
function computeDistance(flight, picksOnly = false) {
  const a = store.airports.get(flight.from_iata);
  const b = store.airports.get(flight.to_iata);
  if (!a || !b) return picksOnly ? {} : flight;
  const km = +haversineKm(a.lat, a.lon, b.lat, b.lon).toFixed(1);
  const mi = +(km * 0.621371).toFixed(1);
  return picksOnly ? { distance_km: km, distance_mi: mi } : { ...flight, distance_km: km, distance_mi: mi };
}

// ----------- Autocomplete -----------
export function uniqueAirlines() {
  const set = new Set();
  for (const f of store.flights) if (f.airline) set.add(f.airline);
  return [...set].sort();
}
export function uniqueAircraft() {
  const set = new Set();
  for (const f of store.flights) if (f.aircraft) set.add(f.aircraft);
  return [...set].sort();
}
export function searchAirports(query) {
  if (!query) return [];
  const q = query.toLowerCase().trim();
  const out = [];
  for (const a of store.airports.values()) {
    if (
      a.iata.toLowerCase().includes(q) ||
      a.city.toLowerCase().includes(q) ||
      (a.name || '').toLowerCase().includes(q)
    ) out.push(a);
    if (out.length >= 30) break;
  }
  out.sort((a, b) => {
    const aExact = a.iata.toLowerCase() === q ? 0 : 1;
    const bExact = b.iata.toLowerCase() === q ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;
    const aCity = a.city.toLowerCase().startsWith(q) ? 0 : 1;
    const bCity = b.city.toLowerCase().startsWith(q) ? 0 : 1;
    if (aCity !== bCity) return aCity - bCity;
    return a.city.localeCompare(b.city);
  });
  return out.slice(0, 10);
}

// ----------- Bootstrap -----------
(async function init() {
  if (isUnlocked()) {
    store.unlocked = true;
    await loadAll();
  }
  emit({ type: 'init:done', unlocked: store.unlocked });
})();
