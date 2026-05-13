-- Add bio and social link columns to user profiles.
-- All columns are nullable; existing rows unaffected.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bio           text,
  ADD COLUMN IF NOT EXISTS website_url   text,
  ADD COLUMN IF NOT EXISTS instagram_url text,
  ADD COLUMN IF NOT EXISTS tiktok_url    text,
  ADD COLUMN IF NOT EXISTS youtube_url   text;
