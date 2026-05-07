-- Migration: organizer_members pending invite support
-- Run this in Supabase SQL Editor before deploying the invite-acceptance flow.
--
-- If organizer_members.status is a TEXT column, "pending" already works — this
-- migration is a no-op.  If it is a Postgres ENUM, the ALTER TYPE below adds
-- the new value safely.

DO $$
BEGIN
  -- Add 'pending' to the enum if a type named organizer_member_status exists.
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'organizer_member_status') THEN
    ALTER TYPE organizer_member_status ADD VALUE IF NOT EXISTS 'pending';
  END IF;
END;
$$;

-- (Optional) index speeds up the activity-route lookup and the respond route.
CREATE INDEX IF NOT EXISTS organizer_members_user_pending_idx
  ON organizer_members (user_id, organizer_id)
  WHERE status = 'pending';
