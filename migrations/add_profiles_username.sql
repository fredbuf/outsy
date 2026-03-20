-- Migration: add username to profiles; open public read for /u/[username] pages.
-- Run once in the Supabase SQL editor.

-- 1. Add username column (nullable — existing users keep NULL).
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS username text;

-- 2. Index for fast /u/[username] lookups (sparse — only rows with a username).
CREATE INDEX IF NOT EXISTS profiles_username_idx
  ON profiles (username)
  WHERE username IS NOT NULL;

-- 3. Check constraint: username must be lowercase-only (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_username_lowercase'
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_username_lowercase
      CHECK (username = lower(username));
  END IF;
END $$;

-- 4. Unique constraint on username (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_username_key'
  ) THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_username_key UNIQUE (username);
  END IF;
END $$;

-- 4. Open public read so /u/[username] pages can resolve profiles.
--    The original "read own" policy only allowed self-reads; replace it with a
--    public SELECT so anyone can view profile display names and avatars.
DROP POLICY IF EXISTS "profiles: read own" ON profiles;

CREATE POLICY IF NOT EXISTS "profiles: public read"
  ON profiles FOR SELECT
  TO anon, authenticated
  USING (true);
