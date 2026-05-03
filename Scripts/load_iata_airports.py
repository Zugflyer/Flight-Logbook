"""
Bulk-load the IATA-only airport dataset into Supabase, PRESERVING any rows
that already exist (manual entries, customized cities, bush strips, etc.).

PREREQUISITES:
  1. Run sql/03_rls_lockdown.sql first (and create your user account).
  2. You must use the SERVICE ROLE key — anon key won't have write access
     after the lockdown. The service role bypasses RLS for this one-off job.

USAGE:
  export SUPABASE_URL="https://hgnemihlqicszoxrijqb.supabase.co"
  export SUPABASE_SERVICE_ROLE_KEY="sb_secret_..."
  python3 scripts/load_iata_airports.py

What it does:
  • Fetches the current airports table from Supabase
  • Loads the airportsdata IATA dataset (~7,900 airports)
  • For each IATA in the dataset NOT already in your table → inserts it
  • Existing rows are left untouched (your manual edits are safe)

Safe to re-run: it will simply find that all rows already exist and do nothing.
"""
import os, sys, json
from urllib.request import Request, urlopen
from urllib.error import HTTPError
import airportsdata

URL = os.environ.get('SUPABASE_URL', '').rstrip('/')
KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
if not URL or not KEY:
    sys.exit("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars first.")

HDRS = {
    'apikey': KEY,
    'Authorization': f'Bearer {KEY}',
    'Content-Type': 'application/json',
}

# ---------- Fetch existing airport IATAs ----------
print("Fetching existing airports…")
existing_iatas = set()
page = 0
PAGE = 1000
while True:
    req = Request(
        f"{URL}/rest/v1/airports?select=iata&limit={PAGE}&offset={page * PAGE}",
        headers=HDRS,
    )
    with urlopen(req, timeout=60) as r:
        rows = json.loads(r.read())
    existing_iatas.update(row['iata'] for row in rows)
    if len(rows) < PAGE:
        break
    page += 1
print(f"  {len(existing_iatas)} airports already in DB.")

# ---------- Load IATA dataset ----------
print("\nLoading IATA airport database…")
iata_db = airportsdata.load('IATA')
print(f"  {len(iata_db)} airports in dataset.")

# ---------- Build rows to insert ----------
to_insert = []
for code, info in iata_db.items():
    if code in existing_iatas:
        continue  # preserve existing row
    # Skip rows with no usable name/coords
    if not info.get('name') or info.get('lat') is None or info.get('lon') is None:
        continue
    to_insert.append({
        'iata': code,
        'icao': info.get('icao') or None,
        'name': info['name'],
        'city': info.get('city') or info['name'],
        'country': info.get('country') or '',
        'lat': info['lat'],
        'lon': info['lon'],
        # Use city as display_name for global airports (matches the convention
        # used in your original migrate_to_supabase.py)
        'display_name': info.get('city') or info['name'],
    })

print(f"\nWill insert {len(to_insert)} new airports.")
print(f"Will preserve {len(existing_iatas)} existing rows untouched.")

if not to_insert:
    print("\n✅ Nothing to do — all IATA airports already in table.")
    sys.exit(0)

# ---------- Insert in batches ----------
def post_batch(rows):
    body = json.dumps(rows).encode('utf-8')
    req = Request(
        f"{URL}/rest/v1/airports",
        data=body, method='POST',
        headers={**HDRS, 'Prefer': 'return=minimal'},
    )
    try:
        with urlopen(req, timeout=120) as r:
            r.read()
    except HTTPError as e:
        msg = e.read().decode()[:500]
        print(f"\n✗ HTTP {e.code}: {msg}")
        sys.exit(1)

BATCH = 500
for i in range(0, len(to_insert), BATCH):
    chunk = to_insert[i:i+BATCH]
    post_batch(chunk)
    print(f"  ✓ {min(i+BATCH, len(to_insert))}/{len(to_insert)}")

print(f"\n✅ Inserted {len(to_insert)} airports. Total table size: ~{len(existing_iatas) + len(to_insert)}.")
