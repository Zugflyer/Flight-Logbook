-- ============================================================================
-- Historic flights migration
--
-- Adds support for "Pre-2012" flights with no date. These show on the map
-- and in the log filter, but are excluded from all statistics.
--
-- Run once in your Supabase SQL Editor.
-- ============================================================================

-- 1. Make date nullable
ALTER TABLE public.flights ALTER COLUMN date DROP NOT NULL;

-- 2. Add the historic flag
ALTER TABLE public.flights
  ADD COLUMN IF NOT EXISTS is_historic BOOLEAN NOT NULL DEFAULT false;

-- 3. Constraint: historic ⟺ no date. Either everything is dated, or it's
-- explicitly marked historic. Prevents accidental NULL dates on real flights.
ALTER TABLE public.flights
  DROP CONSTRAINT IF EXISTS flights_historic_date_check;
ALTER TABLE public.flights
  ADD CONSTRAINT flights_historic_date_check
  CHECK ( (is_historic = true AND date IS NULL)
       OR (is_historic = false AND date IS NOT NULL) );

-- 4. Helpful index for the common query "exclude historics, order by date".
-- Partial index keeps it small; only indexes the rows we sort/filter on.
CREATE INDEX IF NOT EXISTS flights_dated_idx
  ON public.flights (date DESC)
  WHERE is_historic = false;
