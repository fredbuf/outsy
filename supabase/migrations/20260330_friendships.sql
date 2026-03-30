-- Migration: friendships
-- Run this in the Supabase SQL editor.
-- Stores friend relationships between users (request → accepted flow).

create table if not exists friendships (
  id            uuid        primary key default gen_random_uuid(),
  requester_id  uuid        not null references profiles(id) on delete cascade,
  recipient_id  uuid        not null references profiles(id) on delete cascade,
  status        text        not null default 'pending',
  created_at    timestamptz not null default now(),

  -- Prevent a user from sending duplicate requests to the same person
  constraint friendships_unique_pair unique (requester_id, recipient_id),
  -- Prevent self-friend requests
  constraint friendships_no_self check (requester_id != recipient_id),
  -- Only valid status values
  constraint friendships_status check (status in ('pending', 'accepted', 'declined'))
);

-- Fast lookup of all friendships for a given user (both directions)
create index if not exists friendships_requester_idx on friendships (requester_id);
create index if not exists friendships_recipient_idx on friendships (recipient_id);
