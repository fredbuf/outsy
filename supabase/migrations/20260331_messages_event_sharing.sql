-- Migration: add event sharing to messages
-- Adds a nullable event_id foreign key to messages.
-- When set, the message represents a shared event; body holds the event title
-- as a fallback preview (for conversation lists / notifications).
-- Existing text messages are unaffected — body stays NOT NULL.

alter table messages
  add column if not exists event_id uuid references events(id) on delete set null;

create index if not exists messages_event_id_idx
  on messages (event_id)
  where event_id is not null;
