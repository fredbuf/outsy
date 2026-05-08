-- Add dedicated custom_image_url column for organizer logos.
-- This is the Outsy-owned field; image_url is kept for backwards-compat
-- but no longer used as the primary display source.

ALTER TABLE organizers ADD COLUMN IF NOT EXISTS custom_image_url TEXT;

-- Backfill: if the existing image_url is a Supabase Storage URL (i.e. it
-- was already uploaded through Outsy's upload flow), copy it across.
-- External URLs imported from third-party sources are intentionally left out.
UPDATE organizers
SET custom_image_url = image_url
WHERE image_url IS NOT NULL
  AND custom_image_url IS NULL
  AND image_url LIKE '%supabase.co/storage/%';
