-- Migration: include 'announced' events in RLS read policies
-- Root cause: "events: authenticated public read" (and likely the anon equivalent)
-- had status = 'scheduled' hardcoded, silently blocking announced events at the
-- DB level for all client-side queries (supabaseBrowser respects RLS).
-- supabaseServer uses service_role → bypasses RLS → detail page was unaffected.
--
-- Run once in the Supabase SQL editor.

-- ── authenticated role ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "events: authenticated public read" ON events;

CREATE POLICY "events: authenticated public read"
  ON events
  FOR SELECT
  TO authenticated
  USING (
    is_approved  = true
    AND is_rejected = false
    AND status      IN ('scheduled', 'announced')
    AND visibility  = 'public'
  );

-- ── anon role ─────────────────────────────────────────────────────────────────
-- Drop and re-create the anon policy if it also filters on status = 'scheduled'.
-- Check the exact policy name in Supabase Dashboard → Authentication → Policies.
-- Common names: "events: anon public read", "Enable read access for all users", etc.
-- Replace the name below if yours differs.
DROP POLICY IF EXISTS "events: anon public read" ON events;

CREATE POLICY "events: anon public read"
  ON events
  FOR SELECT
  TO anon
  USING (
    is_approved  = true
    AND is_rejected = false
    AND status      IN ('scheduled', 'announced')
    AND visibility  = 'public'
  );
