-- ── Migration: organizer social links + handle cooldown ──────────────────────
--
-- Additive only. Safe to run on a live database.
--
-- 1. handles.changed_at  — tracks owner-initiated handle changes for cooldown
-- 2. organizers.tiktok_url
-- 3. organizers.youtube_url

BEGIN;

-- 1. Handle cooldown column
-- NULL = never changed by the owner (set at backfill/creation by admin migration).
-- Set to now() on every owner-initiated change via the API.
ALTER TABLE handles
  ADD COLUMN IF NOT EXISTS changed_at timestamptz NULL;

-- 2. New social link columns on organizers
ALTER TABLE organizers
  ADD COLUMN IF NOT EXISTS tiktok_url  text NULL,
  ADD COLUMN IF NOT EXISTS youtube_url text NULL;

COMMIT;
