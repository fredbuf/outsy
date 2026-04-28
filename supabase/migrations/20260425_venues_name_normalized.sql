-- =============================================================================
-- Migration: ensure venues name_normalized + unique constraint
-- Date: 2026-04-25
--
-- This migration brings the state established by the manually-applied
-- migrations/add_venues_name_normalized.sql into the Supabase CLI-tracked
-- history so that supabase db reset / db push works on a fresh database.
--
-- Every statement is idempotent — safe to run against a database that already
-- has these objects (the original production database).
-- =============================================================================

-- 1. unaccent extension (enabled by default on Supabase; IF NOT EXISTS is safe)
CREATE EXTENSION IF NOT EXISTS unaccent;

-- 2. Add name_normalized column (noop if already present)
ALTER TABLE venues ADD COLUMN IF NOT EXISTS name_normalized text;

-- 3. Add city_normalized column (noop if already present)
ALTER TABLE venues ADD COLUMN IF NOT EXISTS city_normalized text;

-- 4. Backfill name_normalized for any rows that still have NULL
UPDATE venues
SET name_normalized = lower(trim(unaccent(name)))
WHERE name_normalized IS NULL;

-- 5. Backfill city_normalized for any rows that still have NULL
UPDATE venues
SET city_normalized = lower(trim(unaccent(city)))
WHERE city_normalized IS NULL;

-- 6. Make columns non-nullable once every row is filled
--    DO blocks avoid errors if the constraint is already set.
DO $$
BEGIN
  ALTER TABLE venues ALTER COLUMN name_normalized SET NOT NULL;
EXCEPTION
  WHEN others THEN NULL; -- already NOT NULL
END $$;

DO $$
BEGIN
  ALTER TABLE venues ALTER COLUMN city_normalized SET NOT NULL;
EXCEPTION
  WHEN others THEN NULL; -- already NOT NULL
END $$;

-- 7. Unique constraint — the dedup guard for upsertVenue()
ALTER TABLE venues
  ADD CONSTRAINT IF NOT EXISTS venues_name_normalized_city_normalized_key
  UNIQUE (name_normalized, city_normalized);

-- 8. Repair any events whose venue_id is null due to ingestion gaps
--    (same repair logic as the original manual migration)

UPDATE events e
SET venue_id = v.id
FROM venues v
WHERE e.source          = 'venue_newcitygas'
  AND e.venue_id        IS NULL
  AND v.name_normalized = lower(trim(unaccent('New City Gas')))
  AND v.city_normalized = lower(trim(unaccent('Montréal')));

UPDATE events e
SET venue_id = v.id
FROM venues v
WHERE e.source          = 'venue_sat'
  AND e.venue_id        IS NULL
  AND v.name_normalized = lower(trim(unaccent('Espace SAT')))
  AND v.city_normalized = lower(trim(unaccent('Montréal')));
