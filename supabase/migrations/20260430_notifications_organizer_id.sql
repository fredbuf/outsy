-- Add organizer_id to notifications for organizer-scoped activity.
-- Existing rows (organizer_id IS NULL) remain personal notifications — unaffected.

alter table notifications
  add column organizer_id uuid references organizers(id) on delete cascade;

create index notifications_org_idx
  on notifications (organizer_id, created_at desc)
  where organizer_id is not null;
