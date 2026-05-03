-- ============================================================================
-- 05 — Generalize program_adjustments
--
-- Changes:
--   • Rename `rollover` → `manual_correction` (clearer; can be negative)
--   • Add `qualification_start` (DATE, nullable) — when set, only flights on
--     or after this date count toward the program; the qualification window
--     is start..start+364 days. NULL means use calendar year as before.
-- ============================================================================

-- Rename rollover → manual_correction
ALTER TABLE public.program_adjustments
  RENAME COLUMN rollover TO manual_correction;

-- Allow negatives (default already 0 — keep)
-- The column was INTEGER with a NOT NULL DEFAULT 0; nothing to change.

-- New optional date column
ALTER TABLE public.program_adjustments
  ADD COLUMN IF NOT EXISTS qualification_start DATE;
