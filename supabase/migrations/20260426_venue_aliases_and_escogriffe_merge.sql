-- =============================================================================
-- Migration: venue_aliases table + L'Escogriffe duplicate merge
-- Date: 2026-04-26
--
-- Part 1 — Merge the two L'Escogriffe venue rows:
--     WEAK  b98a89ee-d2d0-441b-9b8f-64aef9175af4  "L'Escogriffe Bar"
--     KEEP  c4587509-279a-4853-bbb5-29b4571987cb  "l'Escogriffe Bar Spectacle"
--
--   Steps:
--     a. Verify both rows exist (will error if either UUID is missing)
--     b. Re-point all events from the weak venue to the canonical venue
--     c. Delete the weak venue  ← must happen before rename to release the unique key
--     d. Rename the canonical venue to the agreed display name
--
-- Part 2 — Create venue_aliases table
-- Part 3 — Insert known aliases for the canonical Escogriffe venue
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- SAFETY CHECKS — will abort the transaction if either UUID is missing
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM venues WHERE id = 'b98a89ee-d2d0-441b-9b8f-64aef9175af4'
  ) THEN
    RAISE EXCEPTION 'Weak venue b98a89ee not found — aborting merge';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM venues WHERE id = 'c4587509-279a-4853-bbb5-29b4571987cb'
  ) THEN
    RAISE EXCEPTION 'Canonical venue c4587509 not found — aborting merge';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- PRE-MERGE VERIFICATION (inspect before committing)
-- ─────────────────────────────────────────────────────────────────────────────

-- How many events currently point to each venue?
SELECT
  v.id,
  v.name,
  v.address_line1,
  v.lat,
  v.lng,
  COUNT(e.id) AS event_count
FROM venues v
LEFT JOIN events e ON e.venue_id = v.id
WHERE v.id IN (
  'b98a89ee-d2d0-441b-9b8f-64aef9175af4',
  'c4587509-279a-4853-bbb5-29b4571987cb'
)
GROUP BY v.id, v.name, v.address_line1, v.lat, v.lng
ORDER BY v.name;

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 1a — Re-point events from weak venue → canonical venue
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE events
SET venue_id = 'c4587509-279a-4853-bbb5-29b4571987cb'
WHERE venue_id = 'b98a89ee-d2d0-441b-9b8f-64aef9175af4';

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 1b — Delete weak venue BEFORE renaming the canonical one.
--
-- ORDER MATTERS: the weak venue currently holds name_normalized = 'l'escogriffe bar'
-- (matching the target name of the canonical rename below).  Deleting it first
-- releases that value from the UNIQUE(name_normalized, city_normalized) constraint,
-- so the rename in Part 1c cannot collide.
-- ─────────────────────────────────────────────────────────────────────────────

DELETE FROM venues
WHERE id = 'b98a89ee-d2d0-441b-9b8f-64aef9175af4';

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 1c — Rename canonical venue to agreed display name
--           and update name_normalized to match.
--           Safe now that the weak row is gone.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE venues
SET
  name            = 'L''Escogriffe Bar',
  name_normalized = lower(trim(unaccent('L''Escogriffe Bar')))
WHERE id = 'c4587509-279a-4853-bbb5-29b4571987cb';

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 2 — Create venue_aliases table
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS venue_aliases (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id        UUID        NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  alias           TEXT        NOT NULL,
  alias_normalized TEXT       NOT NULL,
  city_normalized TEXT        NOT NULL,
  source          TEXT,       -- ingestion source that uses this name variant
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (alias_normalized, city_normalized)
);

-- Index for the lookup path upsertVenue() will use in a future Phase 3 step:
-- SELECT venue_id FROM venue_aliases WHERE alias_normalized = $1 AND city_normalized = $2
CREATE INDEX IF NOT EXISTS venue_aliases_lookup_idx
  ON venue_aliases (alias_normalized, city_normalized);

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 3 — Insert known aliases for the canonical Escogriffe venue
-- ─────────────────────────────────────────────────────────────────────────────

-- All four aliases resolve to the same canonical venue_id.
-- ON CONFLICT DO NOTHING makes this re-runnable.

INSERT INTO venue_aliases (venue_id, alias, alias_normalized, city_normalized, source)
VALUES
  (
    'c4587509-279a-4853-bbb5-29b4571987cb',
    'L''Escogriffe Bar',
    lower(trim(unaccent('L''Escogriffe Bar'))),
    lower(trim(unaccent('Montréal'))),
    'canonical'
  ),
  (
    'c4587509-279a-4853-bbb5-29b4571987cb',
    'l''Escogriffe Bar Spectacle',
    lower(trim(unaccent('l''Escogriffe Bar Spectacle'))),
    lower(trim(unaccent('Montréal'))),
    'ticketmaster'
  ),
  (
    'c4587509-279a-4853-bbb5-29b4571987cb',
    'L''Escogriffe Bar & Spectacle',
    lower(trim(unaccent('L''Escogriffe Bar & Spectacle'))),
    lower(trim(unaccent('Montréal'))),
    'manual'
  ),
  (
    'c4587509-279a-4853-bbb5-29b4571987cb',
    'Escogriffe',
    lower(trim(unaccent('Escogriffe'))),
    lower(trim(unaccent('Montréal'))),
    'manual'
  )
ON CONFLICT (alias_normalized, city_normalized) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- POST-MERGE VERIFICATION
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Confirm canonical venue exists with correct name, and event count is correct
SELECT
  v.id,
  v.name,
  v.name_normalized,
  v.address_line1,
  v.lat,
  v.lng,
  COUNT(e.id) AS event_count
FROM venues v
LEFT JOIN events e ON e.venue_id = v.id
WHERE v.id = 'c4587509-279a-4853-bbb5-29b4571987cb'
GROUP BY v.id, v.name, v.name_normalized, v.address_line1, v.lat, v.lng;

-- 2. Confirm weak venue is gone
SELECT COUNT(*) AS should_be_zero
FROM venues
WHERE id = 'b98a89ee-d2d0-441b-9b8f-64aef9175af4';

-- 3. Confirm no events still reference the deleted venue
SELECT COUNT(*) AS should_be_zero
FROM events
WHERE venue_id = 'b98a89ee-d2d0-441b-9b8f-64aef9175af4';

-- 4. Confirm all four aliases exist and resolve to the canonical venue
SELECT
  va.alias,
  va.alias_normalized,
  va.source,
  v.name  AS canonical_name,
  v.id    AS canonical_venue_id
FROM venue_aliases va
JOIN venues v ON v.id = va.venue_id
WHERE va.venue_id = 'c4587509-279a-4853-bbb5-29b4571987cb'
ORDER BY va.source, va.alias;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- RESOLUTION QUERY — run any time to check whether a name variant resolves
-- to a canonical venue (this is the query Phase 3 will add to upsertVenue)
-- ─────────────────────────────────────────────────────────────────────────────

-- Replace the literals below with any variant to test resolution:
SELECT
  va.alias,
  v.id    AS canonical_venue_id,
  v.name  AS canonical_name,
  v.address_line1,
  v.lat,
  v.lng
FROM venue_aliases va
JOIN venues v ON v.id = va.venue_id
WHERE va.alias_normalized = lower(trim(unaccent('l''Escogriffe Bar Spectacle')))
  AND va.city_normalized  = lower(trim(unaccent('Montréal')));
