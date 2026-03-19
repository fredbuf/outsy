-- Migration: add name_normalized + unique constraint to venues
-- Run once in the Supabase SQL editor before deploying the updated ingestion-shared.ts.
-- Safe to re-run (all steps are idempotent).

-- 1. unaccent extension (already enabled in Supabase by default)
CREATE EXTENSION IF NOT EXISTS unaccent;

-- 2. Add name_normalized column (noop if already present)
ALTER TABLE venues ADD COLUMN IF NOT EXISTS name_normalized text;

-- 3. Backfill from existing rows using the same normalization as the app
--    (NFD diacritic-stripping ≈ unaccent, then lower + trim)
UPDATE venues
SET name_normalized = lower(trim(unaccent(name)))
WHERE name_normalized IS NULL;

-- 4. Make column non-nullable now that every row is filled
ALTER TABLE venues ALTER COLUMN name_normalized SET NOT NULL;

-- 5. Unique constraint — this is the dedup guard; future upserts hit ON CONFLICT here
ALTER TABLE venues
  ADD CONSTRAINT IF NOT EXISTS venues_name_normalized_city_normalized_key
  UNIQUE (name_normalized, city_normalized);

-- ── Repair null venue_id events ─────────────────────────────────────────────

-- New City Gas events
UPDATE events e
SET venue_id = v.id
FROM venues v
WHERE e.source      = 'venue_newcitygas'
  AND e.venue_id    IS NULL
  AND v.name_normalized  = lower(trim(unaccent('New City Gas')))
  AND v.city_normalized  = lower(trim(unaccent('Montréal')));

-- Espace SAT events
UPDATE events e
SET venue_id = v.id
FROM venues v
WHERE e.source      = 'venue_sat'
  AND e.venue_id    IS NULL
  AND v.name_normalized  = lower(trim(unaccent('Espace SAT')))
  AND v.city_normalized  = lower(trim(unaccent('Montréal')));
