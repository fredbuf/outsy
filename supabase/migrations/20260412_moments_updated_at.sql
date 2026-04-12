-- Add updated_at column to moments so we can track and display edits.
ALTER TABLE public.moments
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT NULL;
