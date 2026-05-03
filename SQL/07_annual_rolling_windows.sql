-- ============================================================================
-- 07 — Annual-rolling qualification windows
--
-- Re-interprets `qualification_start`: only the month/day part is used; the
-- year is computed dynamically as "the most recent past occurrence of that
-- month-day". So Oct 1, 2025 means "the program year that resets every Oct 1".
--
-- This lets every program (airlines + Eurostar) follow its own annual cycle
-- without manual yearly maintenance.
-- ============================================================================

-- Add a row for Eurostar so we can store its anchor date alongside the FFPs.
-- The program_id 'es' is purely an internal key; the UI on the Eurostar page
-- reads/writes this row directly.
INSERT INTO public.program_adjustments (program_id, manual_correction, qualification_start)
VALUES ('es', 0, '2025-10-01')
ON CONFLICT (program_id) DO NOTHING;

-- Pre-seed sensible defaults for the airline FFPs if they're not yet set.
-- Only updates rows where qualification_start is NULL — won't overwrite any
-- start date you've already configured manually.
UPDATE public.program_adjustments SET qualification_start = '2026-01-01'
  WHERE program_id = 'af' AND qualification_start IS NULL;

UPDATE public.program_adjustments SET qualification_start = '2026-02-01'
  WHERE program_id = 'ay' AND qualification_start IS NULL;

UPDATE public.program_adjustments SET qualification_start = '2026-01-01'
  WHERE program_id = 'lx' AND qualification_start IS NULL;
