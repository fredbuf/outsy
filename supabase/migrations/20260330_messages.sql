-- Migration: messages
-- Run this in the Supabase SQL editor.
-- Stores 1:1 direct messages between users.
-- Conversations are derived by grouping on the (sender_id, recipient_id) pair.

create table if not exists messages (
  id            uuid        primary key default gen_random_uuid(),
  sender_id     uuid        not null references profiles(id) on delete cascade,
  recipient_id  uuid        not null references profiles(id) on delete cascade,
  body          text        not null,
  created_at    timestamptz not null default now(),

  constraint messages_no_self check (sender_id != recipient_id),
  constraint messages_body    check (length(trim(body)) > 0 and length(body) <= 2000)
);

-- Fast lookup for inbox / conversation queries
create index if not exists messages_sender_idx    on messages (sender_id,    created_at desc);
create index if not exists messages_recipient_idx on messages (recipient_id, created_at desc);
