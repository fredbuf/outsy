-- Migration: ingest_runs
-- Run this in the Supabase SQL editor.
-- Records each Ticketmaster (and future) ingestion run for observability.

create table if not exists ingest_runs (
  id               uuid        primary key default gen_random_uuid(),
  source           text        not null,                         -- e.g. 'ticketmaster'
  started_at       timestamptz not null,
  finished_at      timestamptz,
  status           text        not null default 'running',       -- 'running' | 'success' | 'error'
  ingested_count   integer     not null default 0,
  skipped_count    integer     not null default 0,
  venues_upserted  integer     not null default 0,
  error_message    text,
  created_at       timestamptz not null default now()
);

-- Optional: keep only the last 90 days of runs to avoid unbounded growth.
-- comment out if you want full history.
-- create index ingest_runs_started_at_idx on ingest_runs (started_at desc);
