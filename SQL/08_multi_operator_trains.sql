-- ============================================================================
-- 08 — Multi-operator train log
--
-- Renames eurostar_trips → train_trips, adds operator column, and seeds the
-- three FFP rows in program_adjustments. TGV Lyria has no own program;
-- its trips feed into SNCF's tier point sum.
-- ============================================================================

ALTER TABLE public.eurostar_trips RENAME TO train_trips;

ALTER TABLE public.train_trips
  ADD COLUMN IF NOT EXISTS operator TEXT;

-- Backfill: all existing rows are Eurostar (that's all we had until now).
UPDATE public.train_trips SET operator = 'Eurostar' WHERE operator IS NULL;

ALTER TABLE public.train_trips
  ALTER COLUMN operator SET NOT NULL;

-- The existing index on date stays valid (renamed automatically).
-- RLS policies follow the renamed table; no changes needed there.

-- ---- Seed the new program_adjustments rows ----
-- 'es' already exists (from migration 07) with qualification_start = '2025-10-01'.
-- Add SNCF (Oct 24 anchor) and DB (no anchor — rolling 12 months handled in code).
INSERT INTO public.program_adjustments (program_id, manual_correction, qualification_start) VALUES
  ('sncf', 0, '2025-10-24'),
  ('db',   0, NULL)            -- NULL anchor signals "rolling 12 months"
ON CONFLICT (program_id) DO NOTHING;
