-- Migration: move RSVPs from guest-name model to user-based model.
-- Run once in the Supabase SQL editor before deploying.
--
-- Existing rows: clean break — all guest-name RSVPs are deleted.
-- There is no meaningful way to map anonymous guest names to user accounts.

-- 1. Delete all legacy guest-name-based RSVP rows.
DELETE FROM rsvps;

-- 2. Relax NOT NULL on guest-name columns (no longer required).
ALTER TABLE rsvps ALTER COLUMN guest_name         DROP NOT NULL;
ALTER TABLE rsvps ALTER COLUMN guest_name_normalized DROP NOT NULL;

-- 3. Drop old dedup constraint (was keyed on guest_name_normalized).
ALTER TABLE rsvps
  DROP CONSTRAINT IF EXISTS rsvps_event_id_guest_name_normalized_key;

-- 4. Add user_id — FK to profiles, cascade delete when user is removed.
ALTER TABLE rsvps
  ADD COLUMN IF NOT EXISTS user_id uuid
    REFERENCES profiles(id) ON DELETE CASCADE;

-- 5. Make user_id NOT NULL (safe: table is empty after step 1).
ALTER TABLE rsvps ALTER COLUMN user_id SET NOT NULL;

-- 6. One RSVP per user per event.
ALTER TABLE rsvps
  ADD CONSTRAINT rsvps_event_id_user_id_key
  UNIQUE (event_id, user_id);

-- 7. Index for "all RSVPs by this user" queries (profile page, etc.).
CREATE INDEX IF NOT EXISTS rsvps_user_id_idx ON rsvps (user_id);
