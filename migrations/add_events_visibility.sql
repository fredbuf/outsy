-- Migration: add visibility column to events
-- Run once in the Supabase SQL editor before deploying.
-- Safe to re-run (idempotent).

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'private', 'unlisted'));

-- Backfill: all existing rows are public
UPDATE events SET visibility = 'public' WHERE visibility IS NULL;

-- Index to keep the public-feed query fast
CREATE INDEX IF NOT EXISTS events_visibility_idx ON events (visibility);
