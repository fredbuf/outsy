-- Migration: moment comments
-- Run this in the Supabase SQL editor.
-- Stores comments on Moments (event posts).

-- Add per-moment comments toggle to the existing moments table.
alter table moments
  add column if not exists comments_enabled boolean not null default true;

create table if not exists comments (
  id          uuid        primary key default gen_random_uuid(),
  moment_id   uuid        not null references moments(id) on delete cascade,
  user_id     uuid        not null references profiles(id) on delete cascade,
  body        text        not null,
  created_at  timestamptz not null default now(),

  constraint comments_body_length check (char_length(body) between 1 and 1000)
);

-- Fast chronological lookup for a moment's comments
create index if not exists comments_moment_created_idx on comments (moment_id, created_at);
