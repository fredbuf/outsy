-- =============================================================================
-- Migration: global_handles_phase1
-- Creates a global handle namespace shared across users and organizers.
--
-- Phase 1 scope:
--   - Creates the handles table
--   - Backfills users from profiles.username (already in correct format)
--   - Backfills organizers from a handle derived from name (NOT from slug)
--     e.g. "Two Door Cinema Club" → "twodoorcinemaclub"
--   - Seeds reserved / fraud-prevention handles
--   - Enables RLS: public read, no direct client writes
--
-- Does NOT:
--   - Remove or alter profiles.username or organizers.slug
--   - Change any routes or URLs
--   - Add handle-change UI or API
-- =============================================================================

BEGIN;

-- ── 0. Extensions ─────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS unaccent;


-- ── 1. Name-to-handle helper ──────────────────────────────────────────────────
-- Converts a display name to a lowercase social handle candidate.
-- Strips everything that is not a–z or 0–9 (no hyphens, no spaces, no dots).
-- Truncates to 30 characters.
-- Returns NULL when the result is shorter than 3 characters.
-- Examples:
--   "Two Door Cinema Club" → "twodoorcinemaclub"
--   "M Telus"              → "mtelus"
--   "Ève & Co."            → "eveco"
--   "AB"                   → NULL  (too short)

CREATE OR REPLACE FUNCTION _handle_from_name(p_name text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  h text;
BEGIN
  h := left(
         lower(regexp_replace(unaccent(p_name), '[^a-zA-Z0-9]', '', 'g')),
         30
       );
  RETURN CASE WHEN length(h) >= 3 THEN h ELSE NULL END;
END;
$$;


-- ── 2. handles table ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS handles (
  -- The canonical global handle. Primary key enforces one owner per handle.
  handle       text        PRIMARY KEY,

  -- 'user'      → owner_id references profiles.id
  -- 'organizer' → owner_id references organizers.id
  -- 'reserved'  → handle is blocked; owner_id is the nil sentinel UUID
  owner_type   text        NOT NULL
               CHECK (owner_type IN ('user', 'organizer', 'reserved')),

  owner_id     uuid        NOT NULL,

  -- Set for reserved/blocked rows. NULL on all live user/organizer handles.
  -- Values: 'brand' (Outsy-internal words), 'fraud_prevention' (known brands)
  reserved_by  text        NULL,

  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  -- Format constraint: lowercase letters, digits, underscore only; 3–30 chars.
  -- No hyphens — matches social-platform conventions.
  CONSTRAINT handles_format CHECK (handle ~ '^[a-z0-9_]{3,30}$')
);

-- One handle per live owner (prevents a user or organizer having two handles).
-- Partial: reserved rows share the sentinel UUID and are exempt.
CREATE UNIQUE INDEX IF NOT EXISTS handles_owner_uniq
  ON handles (owner_type, owner_id)
  WHERE owner_type IN ('user', 'organizer');


-- ── 3. updated_at trigger ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION _handles_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS handles_touch_updated_at ON handles;
CREATE TRIGGER handles_touch_updated_at
  BEFORE UPDATE ON handles
  FOR EACH ROW EXECUTE FUNCTION _handles_touch_updated_at();


-- ── 4. RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE handles ENABLE ROW LEVEL SECURITY;

-- Public read: needed for availability checks and public profile resolution.
DROP POLICY IF EXISTS "handles: public read" ON handles;
CREATE POLICY "handles: public read"
  ON handles FOR SELECT
  TO anon, authenticated
  USING (true);

-- No direct client writes. All mutations go through service-role API routes.
DROP POLICY IF EXISTS "handles: no client write" ON handles;
CREATE POLICY "handles: no client write"
  ON handles FOR INSERT
  TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "handles: no client update" ON handles;
CREATE POLICY "handles: no client update"
  ON handles FOR UPDATE
  TO authenticated
  USING (false);

DROP POLICY IF EXISTS "handles: no client delete" ON handles;
CREATE POLICY "handles: no client delete"
  ON handles FOR DELETE
  TO authenticated
  USING (false);


-- ── 5. Backfill: users ────────────────────────────────────────────────────────
-- Source: profiles.username
-- Users who already have a username in the correct format are backfilled first.
-- On any collision (shouldn't happen since profiles.username is unique today,
-- but guards against a re-run), the existing row wins.

INSERT INTO handles (handle, owner_type, owner_id)
SELECT username, 'user', id
FROM profiles
WHERE username IS NOT NULL
  AND username ~ '^[a-z0-9_]{3,30}$'
ON CONFLICT DO NOTHING;


-- ── 6. Backfill: organizers ───────────────────────────────────────────────────
-- Source: organizers.name (NOT organizers.slug)
-- Handle derived by stripping all non-alphanumeric characters and lowercasing.
-- Collisions (two orgs map to the same handle, or handle taken by a user)
-- are silently skipped — those organizers start without a global handle and
-- can be assigned one manually.

INSERT INTO handles (handle, owner_type, owner_id)
SELECT _handle_from_name(name), 'organizer', id
FROM organizers
WHERE _handle_from_name(name) IS NOT NULL
ON CONFLICT DO NOTHING;


-- ── 7. Reserved handles ───────────────────────────────────────────────────────
-- Sentinel owner_id: nil UUID — exists in no real table, never returned
-- as a real owner. The reserved_by field identifies why it is blocked.
--
-- 'brand'            — Outsy product words that must never be user handles.
-- 'fraud_prevention' — Known real-world brands; reserved until a verified
--                      organizer is assigned via an admin operation.

DO $$
DECLARE
  sentinel    uuid    := '00000000-0000-0000-0000-000000000000';
  brand_names text[]  := ARRAY[
    'outsy', 'admin', 'support', 'api', 'help', 'events', 'login',
    'signup', 'org', 'profile', 'settings', 'explore', 'discover',
    'notifications', 'inbox', 'search', 'home', 'feed', 'new',
    'create', 'edit', 'delete', 'account', 'security', 'privacy',
    'terms', 'about', 'contact', 'press', 'careers', 'legal', 'app',
    'web', 'dev', 'team', 'staff', 'official', 'verified', 'system'
  ];
  fraud_names text[]  := ARRAY[
    -- Quebec / Canadian promoters and venues
    'evenko', 'mtelus', 'osheaga', 'bluesfest', 'jazzfest', 'jazzfestival',
    'tiff', 'nfb', 'nfb_onf', 'livenat', 'livenation', 'scenesalon',
    'metropolismontreal', 'newcitygas', 'muzikclub', 'stereomontreal',
    'foufounes', 'foufoueselectriques', 'belsaco', 'sallecapitole',
    'olympiamontreal', 'maisondujazz', 'montrealgazette',
    'piknikelektronik', 'piknik', 'bellcentre', 'centrebell',
    'canadiantirescentre', 'rogerscentre', 'scotiabankarena',
    -- Global ticketing / event platforms
    'ticketmaster', 'eventbrite', 'axs', 'dice', 'seetickets',
    'stubhub', 'viagogo', 'residentadvisor',
    -- Common squatting targets
    'spotify', 'apple', 'google', 'facebook', 'instagram', 'tiktok',
    'youtube', 'twitter', 'snapchat', 'netflix', 'amazon'
  ];
  h text;
BEGIN
  FOREACH h IN ARRAY brand_names LOOP
    INSERT INTO handles (handle, owner_type, owner_id, reserved_by)
    VALUES (h, 'reserved', sentinel, 'brand')
    ON CONFLICT DO NOTHING;
  END LOOP;

  FOREACH h IN ARRAY fraud_names LOOP
    INSERT INTO handles (handle, owner_type, owner_id, reserved_by)
    VALUES (h, 'reserved', sentinel, 'fraud_prevention')
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$;


-- ── 8. Post-migration report ──────────────────────────────────────────────────
-- Logs counts of skipped rows so you can identify what needs manual review.

DO $$
DECLARE
  total_handles       int;
  user_handles        int;
  org_handles         int;
  reserved_handles    int;
  skipped_users       int;
  skipped_orgs        int;
BEGIN
  SELECT count(*) INTO total_handles   FROM handles;
  SELECT count(*) INTO user_handles    FROM handles WHERE owner_type = 'user';
  SELECT count(*) INTO org_handles     FROM handles WHERE owner_type = 'organizer';
  SELECT count(*) INTO reserved_handles FROM handles WHERE owner_type = 'reserved';

  SELECT count(*) INTO skipped_users
  FROM profiles
  WHERE username IS NOT NULL
    AND username ~ '^[a-z0-9_]{3,30}$'
    AND NOT EXISTS (
      SELECT 1 FROM handles WHERE handle = profiles.username AND owner_type = 'user'
    );

  SELECT count(*) INTO skipped_orgs
  FROM organizers
  WHERE _handle_from_name(name) IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM handles WHERE handle = _handle_from_name(organizers.name) AND owner_type = 'organizer'
    );

  RAISE NOTICE '=== handles backfill complete ===';
  RAISE NOTICE 'Total rows:         %', total_handles;
  RAISE NOTICE '  user handles:     %', user_handles;
  RAISE NOTICE '  org handles:      %', org_handles;
  RAISE NOTICE '  reserved:         %', reserved_handles;
  RAISE NOTICE 'Skipped users (collision): %', skipped_users;
  RAISE NOTICE 'Skipped orgs  (collision): %', skipped_orgs;
  RAISE NOTICE '';
  RAISE NOTICE 'To inspect skipped organizers, run:';
  RAISE NOTICE '  SELECT o.id, o.name, _handle_from_name(o.name) AS candidate,';
  RAISE NOTICE '         h.owner_type, h.reserved_by';
  RAISE NOTICE '  FROM organizers o';
  RAISE NOTICE '  JOIN handles h ON h.handle = _handle_from_name(o.name)';
  RAISE NOTICE '  WHERE NOT EXISTS (';
  RAISE NOTICE '    SELECT 1 FROM handles WHERE handle = _handle_from_name(o.name)';
  RAISE NOTICE '    AND owner_type = ''organizer'' AND owner_id = o.id';
  RAISE NOTICE '  );';
END;
$$;


COMMIT;
