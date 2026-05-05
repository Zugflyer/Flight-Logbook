// ============================================================================
// Flight Log — data layer (real Supabase auth)
// ============================================================================

import { sb } from './sb.js';
import { loadLogos } from './logos.js';

export { sb };  // re-export so other modules can keep importing from data.js

// ----------- Store -----------
const listeners = new Set();
export const store = {
  unlocked: false,
  flights: [],
  airports: new Map(),
  ready: false,
  user: null,
  programAdjustments: new Map(),
  trainTrips: [],
  aircraftTypes: new Map(),       // full_name → icao
};
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(evt) { for (const fn of listeners) fn(evt); }

// ----------- Historic flight helpers -----------
export function isHistoric(f) {
  return f.is_historic === true || (f.is_historic == null && f.date == null);
}
export function flightDateCompare(a, b) {
  const ah = isHistoric(a), bh = isHistoric(b);
  if (ah && bh) return 0;
  if (ah) return -1;
  if (bh) return 1;
  return a.date.localeCompare(b.date);
}

// ----------- Auth -----------
export async function isUnlocked() {
  const { data } = await sb.auth.getSession();
  return !!data.session;
}

/** Sign in with email + password. Returns { ok: true } or { ok: false, error }. */
export async function signIn(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: error.message };
  store.unlocked = true;
  store.user = { id: data.user.id, email: data.user.email };
  return { ok: true };
}

export async function signOut() {
  await sb.auth.signOut();
  store.unlocked = false;
  store.user = null;
  store.flights = [];
  store.airports = new Map();
  store.programAdjustments = new Map();
  store.trainTrips = [];
  store.aircraftTypes = new Map();
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
  const [flights, airports, adjustments, trainTrips, aircraftTypes] = await Promise.all([
    fetchAll('flights', 'date'),
    fetchAll('airports'),
    fetchAll('program_adjustments'),
    fetchAll('train_trips', 'date'),
    fetchAll('aircraft_types'),
    loadLogos(),
  ]);
  flights.sort(flightDateCompare);
  store.flights = flights;
  store.airports = new Map(airports.map(a => [a.iata, a]));
  store.programAdjustments = new Map(adjustments.map(r => [r.program_id, r]));
  trainTrips.sort((a, b) => b.date.localeCompare(a.date));
  store.trainTrips = trainTrips;
  store.aircraftTypes = new Map(aircraftTypes.map(r => [r.full_name, r.icao]));
  store.ready = true;
  emit({ type: 'data:loaded', counts: { flights: store.flights.length, airports: store.airports.size } });
}

// ----------- CRUD: flights -----------
export async function addFlight(flight) {
  const row = computeDistance(flight);
  const { data, error } = await sb.from('flights').insert(row).select().single();
  if (error) throw error;
  store.flights.push(data);
  store.flights.sort(flightDateCompare);
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

// ----------- CRUD: airports -----------
export async function addAirport(airport) {
  const { data, error } = await sb.from('airports').insert(airport).select().single();
  if (error) throw error;
  store.airports.set(data.iata, data);
  emit({ type: 'airports:changed', kind: 'add', row: data });
  return data;
}

export async function updateAirport(iata, patch) {
  const { data, error } = await sb.from('airports').update(patch).eq('iata', iata).select().single();
  if (error) throw error;
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

// ----------- CRUD: train_trips -----------
export async function addTrainTrip(trip) {
  const { data, error } = await sb.from('train_trips').insert(trip).select().single();
  if (error) throw error;
  store.trainTrips.push(data);
  store.trainTrips.sort((a, b) => b.date.localeCompare(a.date));
  emit({ type: 'trains:changed', kind: 'add', row: data });
  return data;
}

export async function updateTrainTrip(id, patch) {
  const { data, error } = await sb.from('train_trips')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id).select().single();
  if (error) throw error;
  const idx = store.trainTrips.findIndex(t => t.id === id);
  if (idx >= 0) store.trainTrips[idx] = data;
  store.trainTrips.sort((a, b) => b.date.localeCompare(a.date));
  emit({ type: 'trains:changed', kind: 'update', row: data });
  return data;
}

export async function deleteTrainTrip(id) {
  const { error } = await sb.from('train_trips').delete().eq('id', id);
  if (error) throw error;
  store.trainTrips = store.trainTrips.filter(t => t.id !== id);
  emit({ type: 'trains:changed', kind: 'delete', id });
}

// ----------- CRUD: aircraft_types -----------
export async function addAircraftType(row) {
  const payload = {
    full_name: String(row.full_name).trim(),
    icao: String(row.icao).trim().toUpperCase(),
  };
  const { data, error } = await sb.from('aircraft_types').insert(payload).select().single();
  if (error) throw error;
  store.aircraftTypes.set(data.full_name, data.icao);
  emit({ type: 'aircraft:changed', kind: 'add', row: data });
  return data;
}

export async function updateAircraftType(originalFullName, patch) {
  const newFullName = patch.full_name !== undefined
    ? String(patch.full_name).trim()
    : originalFullName;
  const newIcao = patch.icao !== undefined
    ? String(patch.icao).trim().toUpperCase()
    : store.aircraftTypes.get(originalFullName);
  // If the primary key (full_name) changes, do a delete + insert.
  if (newFullName !== originalFullName) {
    const { error: delErr } = await sb.from('aircraft_types').delete().eq('full_name', originalFullName);
    if (delErr) throw delErr;
    const { data, error } = await sb.from('aircraft_types').insert({
      full_name: newFullName, icao: newIcao,
    }).select().single();
    if (error) throw error;
    store.aircraftTypes.delete(originalFullName);
    store.aircraftTypes.set(data.full_name, data.icao);
    emit({ type: 'aircraft:changed', kind: 'update', row: data });
    return data;
  } else {
    const { data, error } = await sb.from('aircraft_types')
      .update({ icao: newIcao, updated_at: new Date().toISOString() })
      .eq('full_name', originalFullName).select().single();
    if (error) throw error;
    store.aircraftTypes.set(data.full_name, data.icao);
    emit({ type: 'aircraft:changed', kind: 'update', row: data });
    return data;
  }
}

export async function deleteAircraftType(fullName) {
  const { error } = await sb.from('aircraft_types').delete().eq('full_name', fullName);
  if (error) throw error;
  store.aircraftTypes.delete(fullName);
  emit({ type: 'aircraft:changed', kind: 'delete', fullName });
}

// ----------- Program adjustments (manual corrections, qualification windows) -----------
/**
 * Update a program's adjustment row. Accepts a partial patch:
 *   { manual_correction?: number, qualification_start?: string|null }
 * Uses upsert so the row is created on first call.
 */
export async function setProgramAdjustment(programId, patch) {
  const payload = {
    program_id: programId,
    updated_at: new Date().toISOString(),
  };
  if (patch.manual_correction !== undefined) {
    payload.manual_correction = Math.round(Number(patch.manual_correction) || 0);
  }
  if (patch.qualification_start !== undefined) {
    // Empty string or null clears it; otherwise expect 'YYYY-MM-DD'
    payload.qualification_start = patch.qualification_start || null;
  }
  const { data, error } = await sb
    .from('program_adjustments')
    .upsert(payload, { onConflict: 'program_id' })
    .select()
    .single();
  if (error) throw error;
  store.programAdjustments.set(programId, data);
  emit({ type: 'program:changed', programId, row: data });
  return data;
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

/**
 * Search airports by IATA code, city, or name. Linear scan over the in-memory
 * Map — with ~8k airports it's well under a millisecond.
 *
 * Sorting priority: exact IATA → IATA-prefix → city-prefix → alphabetical.
 */
export function searchAirports(query) {
  if (!query) return [];
  const q = query.toLowerCase().trim();
  const candidates = [];
  for (const a of store.airports.values()) {
    const iata = a.iata.toLowerCase();
    const city = (a.city || '').toLowerCase();
    const name = (a.name || '').toLowerCase();
    if (iata.includes(q) || city.includes(q) || name.includes(q)) {
      candidates.push(a);
    }
  }
  candidates.sort((a, b) => {
    const aIata = a.iata.toLowerCase();
    const bIata = b.iata.toLowerCase();
    const aCity = (a.city || '').toLowerCase();
    const bCity = (b.city || '').toLowerCase();
    // 1. Exact IATA match wins
    const aExact = aIata === q ? 0 : 1;
    const bExact = bIata === q ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;
    // 2. IATA prefix
    const aIataPre = aIata.startsWith(q) ? 0 : 1;
    const bIataPre = bIata.startsWith(q) ? 0 : 1;
    if (aIataPre !== bIataPre) return aIataPre - bIataPre;
    // 3. City prefix
    const aCityPre = aCity.startsWith(q) ? 0 : 1;
    const bCityPre = bCity.startsWith(q) ? 0 : 1;
    if (aCityPre !== bCityPre) return aCityPre - bCityPre;
    // 4. Alphabetical by city
    return aCity.localeCompare(bCity);
  });
  return candidates.slice(0, 10);
}

// ----------- Bootstrap -----------
(async function init() {
  const { data } = await sb.auth.getSession();
  if (data.session) {
    store.unlocked = true;
    store.user = { id: data.session.user.id, email: data.session.user.email };
    try {
      await loadAll();
    } catch (e) {
      console.error('Initial load failed:', e);
    }
  }
  // Cross-tab / external sign-in/out
  sb.auth.onAuthStateChange((_evt, session) => {
    if (session && !store.unlocked) {
      store.unlocked = true;
      store.user = { id: session.user.id, email: session.user.email };
    } else if (!session && store.unlocked) {
      store.unlocked = false;
      store.user = null;
      emit({ type: 'auth:locked' });
    }
  });
  emit({ type: 'init:done', unlocked: store.unlocked });
})();
