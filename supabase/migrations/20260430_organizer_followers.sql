-- Migration: organizer_followers
-- Users can follow organizer profiles.

create table if not exists organizer_followers (
  organizer_id  uuid        not null references organizers(id) on delete cascade,
  user_id       uuid        not null references profiles(id)   on delete cascade,
  created_at    timestamptz not null default now(),

  primary key (organizer_id, user_id)
);

create index if not exists organizer_followers_organizer_idx on organizer_followers (organizer_id);
create index if not exists organizer_followers_user_idx      on organizer_followers (user_id);

-- RLS
alter table organizer_followers enable row level security;

-- Anyone can read (needed for public follower counts)
create policy "organizer_followers_read"
  on organizer_followers for select
  using (true);

-- Users can only insert their own follow row
create policy "organizer_followers_insert"
  on organizer_followers for insert
  with check (auth.uid() = user_id);

-- Users can only delete their own follow row
create policy "organizer_followers_delete"
  on organizer_followers for delete
  using (auth.uid() = user_id);
