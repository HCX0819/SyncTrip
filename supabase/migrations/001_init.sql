-- Supabase Schema for TripYaay (PRD v1.0)

-- Profiles
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  display_name text,
  avatar_url text,
  email text,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;
drop policy if exists "Public profiles are viewable by everyone" on public.profiles;
create policy "Public profiles are viewable by everyone" on public.profiles for select using (true);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile" on public.profiles for update using (auth.uid() = id);

-- Trigger to auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Trips
create table if not exists public.trips (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  destination text not null,
  start_date date,
  end_date date,
  cover_url text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now() not null
);

-- Trip Members
do $$ begin
  create type member_role as enum ('owner', 'member');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.trip_members (
  id uuid default gen_random_uuid() primary key,
  trip_id uuid references public.trips(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  role member_role default 'member' not null,
  joined_at timestamptz default now() not null,
  unique (trip_id, user_id)
);

-- Saved Places
do $$ begin
  create type place_category as enum ('stay', 'eat', 'do', 'other');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.saved_places (
  id uuid default gen_random_uuid() primary key,
  trip_id uuid references public.trips(id) on delete cascade not null,
  added_by uuid references auth.users(id) on delete set null,
  title text not null,
  category place_category default 'do' not null,
  source_url text,
  photo_url text,
  note text,
  latitude numeric,
  longitude numeric,
  address text,
  created_at timestamptz default now() not null
);

-- Votes
do $$ begin
  create type vote_value as enum ('yaay', 'naay');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.votes (
  id uuid default gen_random_uuid() primary key,
  place_id uuid references public.saved_places(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  value vote_value not null,
  unique (place_id, user_id)
);

-- Itinerary Items
create table if not exists public.itinerary_items (
  id uuid default gen_random_uuid() primary key,
  trip_id uuid references public.trips(id) on delete cascade not null,
  place_id uuid references public.saved_places(id) on delete cascade not null,
  day_index integer not null default 1,
  sort_order integer not null default 1
);

-- Foreign keys to profiles for clean joins
alter table public.trip_members
  drop constraint if exists trip_members_user_id_profiles_fkey,
  add constraint trip_members_user_id_profiles_fkey foreign key (user_id) references public.profiles(id) on delete cascade;

alter table public.saved_places
  drop constraint if exists saved_places_added_by_profiles_fkey,
  add constraint saved_places_added_by_profiles_fkey foreign key (added_by) references public.profiles(id) on delete set null;

-- Row-Level Security (RLS)
alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.saved_places enable row level security;
alter table public.votes enable row level security;
alter table public.itinerary_items enable row level security;

-- Trips policies
drop policy if exists "Trip members can read trips" on public.trips;
create policy "Trip members can read trips" on public.trips
  for select using (
    exists (
      select 1 from public.trip_members
      where trip_members.trip_id = trips.id
      and trip_members.user_id = auth.uid()
    )
    or created_by = auth.uid()
  );

drop policy if exists "Users can create trips" on public.trips;
create policy "Users can create trips" on public.trips
  for insert with check (auth.uid() = created_by);

drop policy if exists "Trip owners can update trips" on public.trips;
create policy "Trip owners can update trips" on public.trips
  for update using (
    exists (
      select 1 from public.trip_members
      where trip_members.trip_id = trips.id
      and trip_members.user_id = auth.uid()
      and trip_members.role = 'owner'
    )
  );

-- Trip members policies
drop policy if exists "Members can view membership" on public.trip_members;
create policy "Members can view membership" on public.trip_members
  for select using (
    exists (
      select 1 from public.trip_members tm
      where tm.trip_id = trip_members.trip_id
      and tm.user_id = auth.uid()
    )
  );

drop policy if exists "Authenticated users can join trips" on public.trip_members;
create policy "Authenticated users can join trips" on public.trip_members
  for insert with check (auth.uid() = user_id);

-- Saved places policies
drop policy if exists "Trip members can view saved places" on public.saved_places;
create policy "Trip members can view saved places" on public.saved_places
  for select using (
    exists (
      select 1 from public.trip_members
      where trip_members.trip_id = saved_places.trip_id
      and trip_members.user_id = auth.uid()
    )
  );

drop policy if exists "Trip members can add saved places" on public.saved_places;
create policy "Trip members can add saved places" on public.saved_places
  for insert with check (
    exists (
      select 1 from public.trip_members
      where trip_members.trip_id = saved_places.trip_id
      and trip_members.user_id = auth.uid()
    )
  );

-- Votes policies
drop policy if exists "Trip members can view votes" on public.votes;
create policy "Trip members can view votes" on public.votes
  for select using (
    exists (
      select 1 from public.saved_places
      join public.trip_members on trip_members.trip_id = saved_places.trip_id
      where saved_places.id = votes.place_id
      and trip_members.user_id = auth.uid()
    )
  );

drop policy if exists "Users can upsert their own vote" on public.votes;
create policy "Users can upsert their own vote" on public.votes
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update their own vote" on public.votes;
create policy "Users can update their own vote" on public.votes
  for update using (auth.uid() = user_id);

drop policy if exists "Users can delete their own vote" on public.votes;
create policy "Users can delete their own vote" on public.votes
  for delete using (auth.uid() = user_id);

-- Itinerary items policies
drop policy if exists "Trip members can view itinerary" on public.itinerary_items;
create policy "Trip members can view itinerary" on public.itinerary_items
  for select using (
    exists (
      select 1 from public.trip_members
      where trip_members.trip_id = itinerary_items.trip_id
      and trip_members.user_id = auth.uid()
    )
  );

drop policy if exists "Trip members can modify itinerary" on public.itinerary_items;
create policy "Trip members can modify itinerary" on public.itinerary_items
  for all using (
    exists (
      select 1 from public.trip_members
      where trip_members.trip_id = itinerary_items.trip_id
      and trip_members.user_id = auth.uid()
    )
  );

-- Storage bucket for photos
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

drop policy if exists "Public photos access" on storage.objects;
create policy "Public photos access" on storage.objects
  for select using (bucket_id = 'photos');

drop policy if exists "Authenticated users can upload photos" on storage.objects;
create policy "Authenticated users can upload photos" on storage.objects
  for insert with check (bucket_id = 'photos' and auth.role() = 'authenticated');
