-- ============================================================================
-- 03 — Lock down RLS to "anonymous reads, authenticated writes only"
--
-- Run AFTER you've created your user account in Supabase Dashboard:
--   Authentication → Users → Add user → "Create new user"
--   (Use your real email and a strong password.)
--
-- This replaces the existing wide-open policies. After this script:
--   • Anyone can SELECT (so the page loads for visitors and for you when
--     you arrive before logging in)
--   • Only logged-in users can INSERT / UPDATE / DELETE
--
-- Run once in Supabase SQL Editor.
-- ============================================================================

-- ---- flights ----
DROP POLICY IF EXISTS "open access flights" ON public.flights;

CREATE POLICY "anon read flights"
  ON public.flights FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "auth write flights"
  ON public.flights FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ---- airports ----
DROP POLICY IF EXISTS "open access airports" ON public.airports;

CREATE POLICY "anon read airports"
  ON public.airports FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "auth write airports"
  ON public.airports FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ---- airline_logos ----
DROP POLICY IF EXISTS "open access airline_logos" ON public.airline_logos;

CREATE POLICY "anon read airline_logos"
  ON public.airline_logos FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "auth write airline_logos"
  ON public.airline_logos FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ---- Storage bucket policies (airline-logos bucket) ----
-- Read is public (the bucket is configured public), but the storage.objects
-- table also needs RLS for uploads. Allow authenticated users to upload/replace
-- files in the airline-logos bucket.

DROP POLICY IF EXISTS "anon read logos" ON storage.objects;
CREATE POLICY "anon read logos"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'airline-logos');

DROP POLICY IF EXISTS "auth write logos" ON storage.objects;
CREATE POLICY "auth write logos"
  ON storage.objects FOR ALL
  TO authenticated
  USING (bucket_id = 'airline-logos')
  WITH CHECK (bucket_id = 'airline-logos');
