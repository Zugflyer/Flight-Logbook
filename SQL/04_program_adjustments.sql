-- ============================================================================
-- 04 — Per-program adjustments (rollover miles, etc.)
--
-- One row per status program. Currently only Air France uses `rollover`,
-- but the schema is generic so we can add other programs or other adjustment
-- types later without another migration.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.program_adjustments (
  program_id  TEXT PRIMARY KEY,
  rollover    INTEGER NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.program_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon read program_adjustments" ON public.program_adjustments;
CREATE POLICY "anon read program_adjustments"
  ON public.program_adjustments FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "auth write program_adjustments" ON public.program_adjustments;
CREATE POLICY "auth write program_adjustments"
  ON public.program_adjustments FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Seed the three programs so the upsert path always has a row to update.
INSERT INTO public.program_adjustments (program_id, rollover) VALUES
  ('af', 0), ('ay', 0), ('lx', 0)
ON CONFLICT (program_id) DO NOTHING;
