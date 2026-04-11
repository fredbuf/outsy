-- Migration: survey/poll support for Moments
-- Run this in the Supabase SQL editor.

-- Flag + question stored on the moment itself (null = not a survey)
alter table public.moments
  add column if not exists survey_question text default null;

-- One row per survey option
create table if not exists public.survey_options (
  id          uuid      primary key default gen_random_uuid(),
  moment_id   uuid      not null references public.moments(id) on delete cascade,
  position    smallint  not null,
  text        text      not null,
  constraint survey_options_text_length check (char_length(text) between 1 and 200)
);

create index if not exists survey_options_moment_idx
  on public.survey_options (moment_id, position);

-- One vote per user per survey; unique constraint enables change-vote semantics
create table if not exists public.survey_votes (
  id          uuid        primary key default gen_random_uuid(),
  moment_id   uuid        not null references public.moments(id) on delete cascade,
  option_id   uuid        not null references public.survey_options(id) on delete cascade,
  user_id     uuid        not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  constraint survey_votes_unique_user_moment unique (moment_id, user_id)
);

create index if not exists survey_votes_option_idx
  on public.survey_votes (option_id);

-- RLS: public read (surveys are on private events, event-level access gates them)
alter table public.survey_options enable row level security;
alter table public.survey_votes   enable row level security;

create policy if not exists "survey_options_read"
  on public.survey_options for select using (true);

create policy if not exists "survey_votes_read"
  on public.survey_votes for select using (true);

-- Insert/delete via API routes that use service role key (bypasses RLS)
