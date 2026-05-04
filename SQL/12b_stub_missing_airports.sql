-- ============================================================================
-- 12b — Stub airports needed for the historic flight import
--
-- Several historic / closed airports referenced in the pre-2012 flights
-- aren't in the current IATA bulk load (Berlin Tempelhof/Tegel/Schönefeld,
-- Svalbard, Mönchengladbach, Komodo, Saint Martin, Benbecula, Kiel,
-- Barra, Saint Barthélemy, Kangerlussuaq).
--
-- Inserted as bare IATA-only rows; user fills in city/country/coords
-- later via the Manage Airports UI. ON CONFLICT DO NOTHING so re-running
-- is safe.
-- ============================================================================

INSERT INTO public.airports (iata) VALUES
  ('THF'),
  ('TXL'),
  ('SXF'),
  ('LYR'),
  ('MGL'),
  ('LBJ'),
  ('SFG'),
  ('BEB'),
  ('KEL'),
  ('BRR'),
  ('SBH'),
  ('SFJ')
ON CONFLICT (iata) DO NOTHING;
