-- Migration: grant authenticated users the same public-read access as anon
-- Root cause: EventsList.tsx uses supabaseBrowser() (respects RLS).
-- After sign-in the Supabase client switches to the `authenticated` role.
-- If existing policies only cover `anon`, authenticated users see 0 rows.
--
-- Run once in the Supabase SQL editor.
-- Safe to re-run (CREATE POLICY IF NOT EXISTS).

-- ── events ────────────────────────────────────────────────────────────────
-- Allow authenticated users to read public, approved, scheduled+announced events.
-- (Mirrors whatever anon policy exists.)
-- NOTE: if you need to re-run this after running rls_allow_announced_events.sql,
-- that migration already handles the correct state — this CREATE IF NOT EXISTS
-- will no-op because the policy already exists.
CREATE POLICY IF NOT EXISTS "events: authenticated public read"
  ON events
  FOR SELECT
  TO authenticated
  USING (
    is_approved  = true
    AND is_rejected = false
    AND status      IN ('scheduled', 'announced')
    AND visibility  = 'public'
  );

-- ── venues ────────────────────────────────────────────────────────────────
-- Venues are referenced via a join in the events query.
-- All venue rows are safe to expose to authenticated users.
CREATE POLICY IF NOT EXISTS "venues: authenticated read"
  ON venues
  FOR SELECT
  TO authenticated
  USING (true);

-- ── rsvps ─────────────────────────────────────────────────────────────────
-- EventsList.tsx fetches going-counts client-side via supabaseBrowser().
-- Authenticated users need SELECT on rsvps to see those counts.
CREATE POLICY IF NOT EXISTS "rsvps: authenticated read"
  ON rsvps
  FOR SELECT
  TO authenticated
  USING (true);
