-- Migration: create rsvps table
-- Run once in the Supabase SQL editor before deploying.

CREATE TABLE IF NOT EXISTS rsvps (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   uuid        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  guest_name text        NOT NULL,
  response   text        NOT NULL CHECK (response IN ('going', 'maybe', 'cant_go')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rsvps_event_id_idx ON rsvps (event_id);
