// ============================================================================
// Aircraft display mapping
// ----------------------------------------------------------------------------
// Reads from store.aircraftTypes (a Map populated by data.js's loadAll). The
// shape is { full_name → icao }, e.g. "Airbus A321neo" → "A21N".
//
// All lookup functions are sync — they assume the store has been loaded
// before the Log/Stats panels render. If the store is empty (loadAll hasn't
// finished yet), `aircraftCode` falls back to showing the raw value.
// ============================================================================

import { store } from './data.js';

/**
 * Convert a stored aircraft string to its short display code.
 * Falls back to the original string (truncated) if no mapping exists.
 */
export function aircraftCode(name) {
  if (!name) return '';
  const trimmed = String(name).trim();
  const map = store.aircraftTypes;
  if (map && map.has(trimmed)) return map.get(trimmed);
  // Unknown type — show truncated full name so user can still spot it
  return trimmed.length > 10 ? trimmed.slice(0, 10) + '…' : trimmed;
}

/** Whether a given full aircraft name has a mapping. */
export function hasIcaoMapping(name) {
  const map = store.aircraftTypes;
  return !!(map && map.has(String(name).trim()));
}

/** All known full aircraft names, for autocomplete sources. */
export function knownAircraft() {
  const map = store.aircraftTypes;
  return map ? [...map.keys()] : [];
}

/** All known ICAO codes (deduped, sorted), for autocomplete sources. */
export function knownIcaoCodes() {
  const map = store.aircraftTypes;
  if (!map) return [];
  return [...new Set(map.values())].sort();
}

/**
 * Reverse lookup: given an ICAO code, find the canonical full aircraft name.
 * Returns null if no match. Some ICAO codes map to multiple full names; the
 * preference list below picks the cleanest variant.
 */
const REVERSE_PREFERENCE = [
  'Airbus A321neo',
  'Airbus A320neo',
  'Boeing 737-800',
  'Boeing 737 MAX 8',
  'Boeing 777-200ER',
  'Airbus A320',
  'Airbus A321',
  'Airbus A350-900',
  'Boeing 767-300',
  'Boeing 757-200',
];

export function fullNameFromIcao(icao) {
  if (!icao) return null;
  const code = String(icao).toUpperCase().trim();
  const map = store.aircraftTypes;
  if (!map) return null;
  // First pass: preferred names
  for (const pref of REVERSE_PREFERENCE) {
    if (map.get(pref) === code) return pref;
  }
  // Fallback: any match
  for (const [name, c] of map.entries()) {
    if (c === code) return name;
  }
  return null;
}

/** Membership check — true if the ICAO code is mapped from anything. */
export function isKnownIcao(code) {
  const map = store.aircraftTypes;
  if (!map) return false;
  const upper = String(code).toUpperCase().trim();
  for (const c of map.values()) {
    if (c === upper) return true;
  }
  return false;
}
