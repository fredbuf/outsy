-- Notifications table
-- Stores user-facing notifications. Designed to be extensible (no type constraint).
-- V1 types: friend_request_received, friend_request_accepted
-- Future types: event_invite, event_update, etc. — add without migration changes.

create table if not exists notifications (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references profiles(id) on delete cascade,
  type        text        not null,
  actor_id    uuid        references profiles(id) on delete set null,
  entity_id   uuid,
  metadata    jsonb       not null default '{}',
  read        boolean     not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists notifications_user_idx    on notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx  on notifications (user_id, read) where (not read);
