"""
One-time import: 83 historic (pre-2012) flights from Sheet1 of Flights.xlsx.

PREREQUISITES:
  1. Run sql/02_historic_flights.sql in Supabase SQL Editor first.
  2. Verify all referenced IATA codes exist in your airports table — this script
     will tell you which (if any) are missing and abort.

USAGE:
  export SUPABASE_URL="https://YOUR-PROJECT.supabase.co"
  export SUPABASE_SERVICE_ROLE_KEY="sb_secret_..."
  python3 scripts/import_historic_flights.py path/to/Flights.xlsx
"""
import os, sys, json, math, uuid
from urllib.request import Request, urlopen
from urllib.error import HTTPError
import pandas as pd

URL = os.environ.get('SUPABASE_URL', '').rstrip('/')
KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')

if not URL or not KEY:
    sys.exit("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars first.")

if len(sys.argv) < 2:
    sys.exit("Usage: import_historic_flights.py <path-to-Flights.xlsx>")
xlsx_path = sys.argv[1]

# ---------- Read & clean Sheet1 ----------
df = pd.read_excel(xlsx_path, sheet_name='Sheet1')
df = df[~(df['Date'].isna() & df['To'].isna())].copy()
df = df[~(df['From'].astype(str) == '0')].copy()

# Fix the one typo (PMI → Frau should be PMI → FRA)
df.loc[df['To'] == 'Frau', 'To'] = 'FRA'

# Cabin merge (same map as clean_flights.py)
CABIN_MAP = {
    'Eco': 'Economy', 'Eco ': 'Economy', 'Economy': 'Economy',
    'Business': 'Business', 'Business ': 'Business',
    'First': 'First', 'Premium Eco': 'Premium Economy',
    'Premium Economy': 'Premium Economy', 'Premium': 'Business',
}

# ---------- Fetch existing airports for validation + distance ----------
def http_get(path):
    req = Request(f"{URL}/rest/v1/{path}", headers={
        'apikey': KEY, 'Authorization': f'Bearer {KEY}',
    })
    with urlopen(req, timeout=60) as r:
        return json.loads(r.read())

print("Fetching airports for validation…")
airports_list = http_get("airports?select=iata,lat,lon&limit=10000")
airport_by_iata = {a['iata']: a for a in airports_list}
print(f"  {len(airport_by_iata)} airports in DB.")

# Validate every IATA used
needed = set()
for col in ['From', 'To']:
    needed |= set(df[col].dropna().astype(str).str.strip())
missing = sorted(needed - set(airport_by_iata.keys()))
if missing:
    print()
    print("⚠  The following IATA codes are referenced in Sheet1 but NOT in")
    print("   your airports table. Add them via Manage Airports first, then")
    print("   re-run this script.")
    for code in missing:
        print(f"     {code}")
    sys.exit(1)

# ---------- Build rows ----------
def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    lat1, lat2 = math.radians(lat1), math.radians(lat2)
    dlat = lat2 - lat1
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin(dlon/2)**2
    return 2 * R * math.asin(math.sqrt(a))

# Aircraft ICAO → canonical full name (only for the codes that appear here
# AND have an unambiguous canonical name in aircraft.js). Anything else is
# stored as-is — the front-end will display it directly.
ICAO_TO_FULL = {
    'A320': 'Airbus A320',
    'CRJ2': 'Canadair CRJ-200',
    'FK50': 'Fokker F-50',
    # The pre-2012 fleet has many old types (B722, B742, DC10 etc.) that
    # aren't in aircraft.js. Storing the ICAO code as-is is fine — display
    # falls back to the raw string.
}

records = []
for _, row in df.iterrows():
    from_iata = str(row['From']).strip()
    to_iata = str(row['To']).strip()
    a, b = airport_by_iata[from_iata], airport_by_iata[to_iata]
    km = round(haversine_km(a['lat'], a['lon'], b['lat'], b['lon']), 1)

    cabin_raw = row['Cabin']
    cabin = CABIN_MAP.get(str(cabin_raw).strip()) if pd.notna(cabin_raw) else None

    eqp_raw = row['EQP']
    aircraft = None
    if pd.notna(eqp_raw):
        s = str(eqp_raw).strip()
        aircraft = ICAO_TO_FULL.get(s, s)

    records.append({
        'id': str(uuid.uuid4()),
        'date': None,
        'is_historic': True,
        'from_iata': from_iata,
        'to_iata': to_iata,
        'airline': str(row['Airline']).strip() if pd.notna(row['Airline']) else None,
        'aircraft': aircraft,
        'cabin': cabin,
        'tier_miles': None,
        'distance_km': km,
        'distance_mi': round(km * 0.621371, 1),
    })

print(f"\nPrepared {len(records)} historic flights for upload.")

# ---------- Upload ----------
def post_batch(rows):
    body = json.dumps(rows).encode('utf-8')
    req = Request(f"{URL}/rest/v1/flights", data=body, method='POST', headers={
        'apikey': KEY, 'Authorization': f'Bearer {KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
    })
    try:
        with urlopen(req, timeout=60) as r:
            r.read()
    except HTTPError as e:
        print(f"\n✗ HTTP {e.code}: {e.read().decode()[:500]}")
        sys.exit(1)

BATCH = 100
for i in range(0, len(records), BATCH):
    post_batch(records[i:i+BATCH])
    print(f"  ✓ uploaded {min(i+BATCH, len(records))}/{len(records)}")

print("\n✅ Done. Reload the site to see the historic flights.")
