-- ============================================================================
-- 06 — Eurostar trips
--
-- Parallel to `flights` but for Eurostar rail trips. Kept in a separate table
-- so flight stats / map / status calculations don't accidentally include
-- ground travel.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.eurostar_trips (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date          DATE NOT NULL,
  from_station  TEXT NOT NULL,
  to_station    TEXT NOT NULL,
  points        INTEGER,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS eurostar_trips_date_idx
  ON public.eurostar_trips (date DESC);

ALTER TABLE public.eurostar_trips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon read eurostar_trips" ON public.eurostar_trips;
CREATE POLICY "anon read eurostar_trips"
  ON public.eurostar_trips FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "auth write eurostar_trips" ON public.eurostar_trips;
CREATE POLICY "auth write eurostar_trips"
  ON public.eurostar_trips FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ---- Seed the 19 trips listed in chat ----
INSERT INTO public.eurostar_trips (date, from_station, to_station, points) VALUES
  ('2025-10-20', 'Paris',  'London', 325),
  ('2025-11-02', 'Paris',  'London', 415),
  ('2025-11-04', 'London', 'Paris',  325),
  ('2025-11-12', 'London', 'Paris',  396),
  ('2025-11-20', 'London', 'Paris',  373),
  ('2025-12-07', 'Paris',  'London', 285),
  ('2025-12-08', 'London', 'Paris',  325),
  ('2025-12-10', 'Paris',  'London', 350),
  ('2025-12-15', 'Paris',  'London', 375),
  ('2025-12-15', 'London', 'Paris',  325),
  ('2026-01-12', 'Paris',  'London', 415),
  ('2026-01-26', 'Paris',  'London', 285),
  ('2026-01-27', 'London', 'Paris',  325),
  ('2026-02-05', 'London', 'Paris',  316),
  ('2026-03-05', 'London', 'Paris',  400),
  ('2026-03-15', 'Paris',  'London', 391),
  ('2026-04-01', 'Paris',  'London', 350),
  ('2026-04-02', 'London', 'Paris',  350),
  ('2026-04-09', 'London', 'Paris',  333);
