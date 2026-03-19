-- Migration: add dedup + updated_at to rsvps
-- Run once in the Supabase SQL editor before deploying.
-- Safe to re-run (idempotent).

-- 1. Add guest_name_normalized column
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS guest_name_normalized text;

-- 2. Backfill existing rows
UPDATE rsvps SET guest_name_normalized = lower(trim(guest_name)) WHERE guest_name_normalized IS NULL;

-- 3. Make non-nullable
ALTER TABLE rsvps ALTER COLUMN guest_name_normalized SET NOT NULL;

-- 4. Add updated_at column (defaults to created_at for existing rows)
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS updated_at timestamptz;
UPDATE rsvps SET updated_at = created_at WHERE updated_at IS NULL;
ALTER TABLE rsvps ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE rsvps ALTER COLUMN updated_at SET DEFAULT now();

-- 5. Unique constraint — dedup guard for upsert
ALTER TABLE rsvps
  ADD CONSTRAINT IF NOT EXISTS rsvps_event_id_guest_name_normalized_key
  UNIQUE (event_id, guest_name_normalized);
