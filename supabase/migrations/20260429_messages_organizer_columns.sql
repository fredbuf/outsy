-- Organizer messaging support
-- Adds sender_organizer_id and recipient_organizer_id to messages.
-- recipient_id is made nullable so a message can target an organizer
-- instead of a user.  PostgreSQL evaluates CHECK constraints as
-- "satisfied" when the expression is NULL, so the existing
-- messages_no_self check (sender_id != recipient_id) still works
-- correctly when recipient_id IS NULL.

alter table messages
  add column sender_organizer_id    uuid references organizers(id) on delete set null,
  add column recipient_organizer_id uuid references organizers(id) on delete set null;

alter table messages alter column recipient_id drop not null;

create index messages_recipient_org_idx
  on messages (recipient_organizer_id, created_at desc)
  where recipient_organizer_id is not null;

create index messages_sender_org_idx
  on messages (sender_organizer_id, created_at desc)
  where sender_organizer_id is not null;
