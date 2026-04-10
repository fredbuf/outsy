-- Migration: moments link and image support
-- Run this in the Supabase SQL editor.

alter table moments
  add column if not exists link_url   text    default null,
  add column if not exists image_url  text    default null;
