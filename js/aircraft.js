// ============================================================================
// Aircraft display mapping
// ----------------------------------------------------------------------------
// Maps the free-text "aircraft" field stored in Supabase to the short
// display code shown in the Flight Log table.
//
// The codes are mostly ICAO Doc 8643 type designators, with a few non-standard
// variants for winglets and B737 sub-models per user preference.
// ----------------------------------------------------------------------------

const AIRCRAFT_MAP = {
  'Airbus A320':           'A320',
  'Airbus A319':           'A319',
  'Airbus A220-300':       'A223',
  'Embraer ERJ-190':       'E190',
  'Airbus A321':           'A321',
  'Airbus A330-300':       'A333',
  'Airbus A318':           'A318',
  'Boeing 777-300ER':      'B77W',
  'Avro ARJ':              'RJ85',
  'Boeing 777-200ER':      'B772',
  'Airbus A330-200':       'A332',
  'Airbus A380-800':       'A388',
  'Airbus A220-100':       'A221',
  'Boeing 737-800':        'B738',
  'Airbus A340-600':       'A346',
  'Airbus A340-300':       'A343',
  'Canadair CRJ-900':      'CRJ9',
  'Boeing 737-700WL':      'B73G',
  'Boeing 747-400':        'B744',
  'Boeing 747-8i':         'B748',
  'Embraer ERJ-195':       'E195',
  'Embraer ERJ-175':       'E175',
  'Airbus A350-900':       'A359',
  'Boeing 787-8':          'B788',
  'Boeing 737-800WL':      'B73H',
  'Boeing 737-300':        'B733',
  'Fokker F-100':          'F100',
  'Boeing 777-200LR':      'B77L',
  'Boeing 777-200':        'B772',
  'Dash 8-300':            'DH8C',
  'Beechcraft':            'BE20',
  'Boeing 737-800W':       'B73H',
  'ATR 72':                'AT72',
  'Boeing 767-300':        'B763',
  'Boeing 787-9':          'B789',
  'Britten Norman Islander': 'BN2P',
  'Twin Otter':            'DHC6',
  'Airbus A340-500':       'A345',
  'Boeing 757-200':        'B752',
  'Embraer ERJ-170':       'E170',
  'Dash 8-100':            'DH8A',
  'Airbus A350-1000':      'A35K',
  'Cessna C208':           'C208',
  'Saab 340':              'SF34',
  'Boeing 757-200WL':      'B75W',
  'Embraer ERJ-145':       'E145',
  'Boeing 737-500':        'B735',
  'Boeing 767-400':        'B764',
  'Fokker F-50':           'FK50',
  'Boeing 737-900ERWL':    'B73J',
  'Pilatus PC-12':         'PC12',
  'Canadair CRJ-200':      'CRJ2',
  'Dash 8-400':            'DH8D',
  'Embraer E-Jet2':        'E290',
  'Boeing 737 MAX 8':      'B38M',
  'Boeing 787-10':         'B78X',
  'Boeing 737-400':        'B734',
  'Fokker F-70':           'FK70',
  'Boeing 767-300WL':      'B76W',
  'Canadair CRJ-700':      'CRJ7',
  'Saab 2000':             'SB20',
  'Canadair CRJ-1000':     'CRJX',
  'Boeing 737-MAX8':       'B38M',
  'Airbus A320neo':        'A20N',
  'Boeing 737-800S':       'B73H',
  'Boeing 737-MAX9':       'B39M',
  'Embraer ERJ-290':       'E290',
  'Aribus A321':           'A321',  // typo in source data
  'Airbus A350':           'A359',
};

/**
 * Convert a stored aircraft string to its short display code.
 * Falls back to the original string (truncated) if no mapping exists.
 */
export function aircraftCode(name) {
  if (!name) return '';
  const trimmed = String(name).trim();
  if (AIRCRAFT_MAP[trimmed]) return AIRCRAFT_MAP[trimmed];
  // Unknown type — show truncated full name so user can still spot it
  return trimmed.length > 10 ? trimmed.slice(0, 10) + '…' : trimmed;
}

/**
 * Whether a given full aircraft name has a mapping.
 * Useful for autocomplete: showing the code next to the full name.
 */
export function hasIcaoMapping(name) {
  return !!AIRCRAFT_MAP[String(name).trim()];
}

/** All known full aircraft names, for autocomplete sources. */
export function knownAircraft() {
  return Object.keys(AIRCRAFT_MAP);
}

/** All known ICAO codes (deduped, sorted), for autocomplete sources. */
export function knownIcaoCodes() {
  return [...new Set(Object.values(AIRCRAFT_MAP))].sort();
}

/**
 * Reverse lookup: given an ICAO code, find the canonical full aircraft name.
 * Returns null if no match.
 *
 * Note: some ICAO codes map to multiple aircraft strings (e.g. B738 maps to
 * "Boeing 737-800", "Boeing 737-800WL", "Boeing 737-800W", "Boeing 737-800S").
 * We pick the most canonical / shortest variant — usually the base spelling
 * without winglet suffixes.
 */
const REVERSE_PREFERENCE = [
  // Order matters: when an ICAO maps to multiple full names, the first match
  // in this list wins. Designed to prefer the cleanest, most-current spelling.
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
  // First pass: preferred names
  for (const pref of REVERSE_PREFERENCE) {
    if (AIRCRAFT_MAP[pref] === code) return pref;
  }
  // Fallback: any match
  for (const [name, c] of Object.entries(AIRCRAFT_MAP)) {
    if (c === code) return name;
  }
  return null;
}

/** Set of all known ICAO codes (for quick membership check). */
const ICAO_SET = new Set(Object.values(AIRCRAFT_MAP));
export function isKnownIcao(code) {
  return ICAO_SET.has(String(code).toUpperCase().trim());
}
