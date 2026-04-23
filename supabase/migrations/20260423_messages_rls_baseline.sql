-- Migration: messages defensive baseline
-- Adds deleted_at column and enables RLS on the messages table.
-- All existing server routes use supabaseServer() (service role) and are unaffected.
-- This is defense-in-depth: blocks any future direct client access that bypasses server routes.
--
-- Intentionally omits UPDATE and DELETE policies.
-- Mutations (edit body, soft delete, mark read) go through server routes only.

-- ── Schema ────────────────────────────────────────────────────────────────────

-- Soft-delete timestamp. NULL = not deleted. Set by server route, never by client.
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

-- Sparse index: only indexes rows that are actually deleted, keeping it cheap.
CREATE INDEX IF NOT EXISTS messages_deleted_at_idx
  ON messages (deleted_at)
  WHERE deleted_at IS NOT NULL;

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- SELECT: sender and recipient can both read all messages in their conversation,
-- including soft-deleted rows (deleted_at IS NOT NULL).
-- The frontend is responsible for rendering "message deleted" when deleted_at is set.
-- No anon policy → anonymous users have zero row access.
DROP POLICY IF EXISTS "messages: select as participant" ON messages;
CREATE POLICY "messages: select as participant"
  ON messages
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = sender_id
    OR auth.uid() = recipient_id
  );

-- INSERT: authenticated users may only insert rows where they are the sender.
-- Prevents spoofing another user's sender_id via a direct client insert.
DROP POLICY IF EXISTS "messages: insert as sender" ON messages;
CREATE POLICY "messages: insert as sender"
  ON messages
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = sender_id);

-- No UPDATE policy → direct client UPDATE is blocked by default-deny.
-- The existing read_at update in messages/[userId]/route.ts uses supabaseServer()
-- (service role) and is unaffected by this.

-- No DELETE policy → direct client hard-delete is blocked by default-deny.
-- Soft delete (setting deleted_at) will also go through a server route.
