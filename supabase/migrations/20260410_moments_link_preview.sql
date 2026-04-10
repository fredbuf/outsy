-- Migration: moments link preview metadata
-- Run this in the Supabase SQL editor after 20260410_moments_link_image.sql

alter table public.moments
  add column if not exists link_title        text default null,
  add column if not exists link_description  text default null,
  add column if not exists link_image_url    text default null,
  add column if not exists link_site_name    text default null;
