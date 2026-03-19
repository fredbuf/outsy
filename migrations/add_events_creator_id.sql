-- Migration: add creator_id to events
-- Links manually submitted events to the creating user's profile.
-- Imported events (Ticketmaster, Eventbrite, venue ingestors) stay NULL.
-- Run once in the Supabase SQL editor. Safe to re-run (idempotent).

-- 1. Add column (nullable so existing rows are unaffected)
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS creator_id uuid
    REFERENCES profiles(id) ON DELETE SET NULL;

-- 2. Index for future profile-page / host queries
CREATE INDEX IF NOT EXISTS events_creator_id_idx ON events (creator_id)
  WHERE creator_id IS NOT NULL;
