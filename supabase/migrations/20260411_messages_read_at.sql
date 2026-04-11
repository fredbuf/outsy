-- Migration: add read_at to messages for proper per-message read tracking.
-- Replaces the fragile "last message is from the other person" proxy.
-- read_at = null  → message is unread by the recipient
-- read_at = <ts>  → message was read at that timestamp

alter table public.messages
  add column if not exists read_at timestamptz default null;

-- Index speeds up "unread count" queries (filter on recipient + null read_at)
create index if not exists messages_unread_idx
  on public.messages (recipient_id, read_at)
  where read_at is null;
