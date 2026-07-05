-- ── organizer_follows ──────────────────────────────────────────────────────────
-- Tracks organizer-to-organizer following relationships.
-- Distinct from organizer_followers (personal user → organizer).

CREATE TABLE IF NOT EXISTS organizer_follows (
  follower_organizer_id UUID NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
  followed_organizer_id UUID NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (follower_organizer_id, followed_organizer_id),

  -- Prevent self-follow at the DB level.
  CONSTRAINT organizer_follows_no_self_follow
    CHECK (follower_organizer_id <> followed_organizer_id)
);

CREATE INDEX IF NOT EXISTS organizer_follows_follower_idx
  ON organizer_follows (follower_organizer_id);

CREATE INDEX IF NOT EXISTS organizer_follows_followed_idx
  ON organizer_follows (followed_organizer_id);

-- ── RLS ────────────────────────────────────────────────────────────────────────

ALTER TABLE organizer_follows ENABLE ROW LEVEL SECURITY;

-- Public read — follower/following counts are visible to everyone.
DROP POLICY IF EXISTS "organizer_follows_public_read" ON organizer_follows;
CREATE POLICY "organizer_follows_public_read"
  ON organizer_follows FOR SELECT
  USING (true);

-- No direct client INSERT — all writes go through server API (service role bypasses RLS).
DROP POLICY IF EXISTS "organizer_follows_no_client_insert" ON organizer_follows;
CREATE POLICY "organizer_follows_no_client_insert"
  ON organizer_follows FOR INSERT
  WITH CHECK (false);

-- No direct client UPDATE.
DROP POLICY IF EXISTS "organizer_follows_no_client_update" ON organizer_follows;
CREATE POLICY "organizer_follows_no_client_update"
  ON organizer_follows FOR UPDATE
  USING (false);

-- No direct client DELETE.
DROP POLICY IF EXISTS "organizer_follows_no_client_delete" ON organizer_follows;
CREATE POLICY "organizer_follows_no_client_delete"
  ON organizer_follows FOR DELETE
  USING (false);
