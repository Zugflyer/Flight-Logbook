# Flight Log — Phase 1

A private flight-tracking site. Personal-use only. Cross-device via Supabase.

## What's in this Phase 1 deliverable

- ✅ Cleaned dataset (`data/flights.json`) — 2,505 flights, all decisions applied
- ✅ Airport lookup (`data/airports.json`) — 194 airports with IATA, ICAO, lat/lon
- ✅ Supabase schema (`sql/schema.sql`) — tables, RLS, triggers
- ✅ Migration script (`scripts/migrate_to_supabase.py`) — one-time data upload
- ✅ App skeleton — `index.html`, dark editorial styles, tab shell
- ✅ Working data layer — `js/data.js` connects to Supabase, fetches data,
    exposes a store + CRUD for the rest of the app to consume
- ✅ Auth — magic-link sign in via email
- ✅ Settings — distance unit toggle (km/mi), persisted in localStorage
- ⏳ The actual tab contents (Map, Stats, Timeline, Log, Status) — Phase 2

When you load the site after migration, you'll see a placeholder for each tab,
plus a small data preview in the Log tab confirming data loaded correctly.

---

## Setup checklist

### 1. Create Supabase tables

In your Supabase dashboard:

1. Open **SQL Editor → New Query**
2. Paste the contents of `sql/schema.sql` and click **Run**

This creates `airports` and `flights` tables with proper indexes,
triggers, and Row Level Security (only authenticated users can access data).

### 2. Migrate your data

From your local machine (one time only):

```bash
export SUPABASE_URL="https://YOUR-PROJECT.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="eyJ..."   # get from Project Settings → API
python3 scripts/migrate_to_supabase.py
```

You should see:
```
Uploading airports…
  ✓ airports: 194/194
Uploading flights…
  ✓ flights: 500/2505
  ✓ flights: 1000/2505
  …
✅ Migration complete: 194 airports, 2505 flights.
```

⚠️ The **service role key** has full access — only use it for this script,
never put it in the browser app.

### 3. Configure the web app

Edit `js/config.js`:

```js
export const SUPABASE_URL  = 'https://YOUR-PROJECT.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJ...';   // anon key, NOT service role
```

The **anon key** is safe to expose in the browser — RLS prevents anyone
from reading data without authentication.

### 4. Allow magic-link redirects

In Supabase: **Authentication → URL Configuration**, add your site URLs to
"Redirect URLs":
- `http://localhost:8000/*` (for local testing)
- `https://your-deployed-site.com/*` (once you deploy)

### 5. Test locally

From the project root:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/`. Click **Sign in**, enter your email,
check inbox for the magic link, click it. You should see the banner say
"Loaded 2505 flights and 194 airports."

### 6. Deploy

When ready, push this folder to a host. All work the same way:

- **Netlify**: drag-and-drop the folder onto netlify.com → done
- **Vercel**: `vercel deploy` from the project root
- **GitHub Pages**: push to a repo, enable Pages on the main branch

After deploying, update Supabase **Redirect URLs** with the production URL.

---

## File layout

```
flight-log/
├── index.html
├── css/styles.css
├── js/
│   ├── config.js          ← EDIT THIS: Supabase URL + anon key
│   ├── data.js            ← Supabase client, store, CRUD, distance calc
│   └── app.js             ← Tabs, auth modal, settings, preview
├── data/
│   ├── flights.json       ← Cleaned source data (uploaded once via migrate script)
│   └── airports.json      ← Airport lookup (uploaded once)
├── sql/schema.sql         ← Run in Supabase SQL Editor
└── scripts/
    ├── build_airports_final.py
    ├── clean_flights.py
    └── migrate_to_supabase.py
```

---

## Phase 2 plan

Once Phase 1 is verified working, we'll build tabs in this order
(your call which to prioritize):

1. **Flight Log** — sortable filterable table, edit & add modal
2. **Map** — Leaflet world map, great-circle routes, airport markers
3. **Stats** — totals, top N, cabin breakdown, unique countries
4. **Timeline** — flights per year/month, trend lines
5. **Status** — data hooks for FFP tier-mile tracking (you build the UI)

Each tab will be a self-contained module under `js/`, consuming the data
already loaded by `data.js`. Adding a tab won't touch the others.
