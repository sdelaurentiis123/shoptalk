-- ShopTalk schema. Run in the Supabase SQL editor.

create table if not exists facilities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  join_code text unique not null,
  admin_user_id uuid references auth.users(id) not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists stations (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid references facilities(id) on delete cascade not null,
  name text not null,
  sort_order integer default 0,
  created_at timestamptz default now()
);

create table if not exists sops (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid references facilities(id) on delete cascade not null,
  station_id uuid references stations(id) on delete set null,
  title text not null,
  description text default '',
  type text not null check (type in ('video', 'pdf', 'image')),
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  file_path text,
  file_url text,
  total_seconds integer default 0,
  trainer text default '',
  recorded_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists steps (
  id uuid primary key default gen_random_uuid(),
  sop_id uuid references sops(id) on delete cascade not null,
  sort_order integer not null,
  title text not null,
  description text default '',
  start_sec integer,
  end_sec integer,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists substeps (
  id uuid primary key default gen_random_uuid(),
  step_id uuid references steps(id) on delete cascade not null,
  sort_order integer not null,
  text text not null,
  time_sec integer,
  created_at timestamptz default now()
);

create table if not exists operator_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  facility_id uuid references facilities(id) on delete cascade not null,
  display_name text not null,
  language text default 'en',
  created_at timestamptz default now(),
  last_active_at timestamptz default now()
);

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  facility_id uuid references facilities(id) on delete cascade not null,
  station_id uuid references stations(id) on delete set null,
  title text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  source_sop_id uuid references sops(id) on delete set null,
  source_step text,
  created_at timestamptz default now()
);

create table if not exists flags (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid references facilities(id) on delete cascade not null,
  sop_id uuid references sops(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  text text not null,
  status text default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at timestamptz default now(),
  resolved_at timestamptz
);

create index if not exists idx_sops_facility on sops(facility_id);
create index if not exists idx_steps_sop on steps(sop_id);
create index if not exists idx_substeps_step on substeps(step_id);
create index if not exists idx_conversations_user on conversations(user_id);
create index if not exists idx_messages_conversation on messages(conversation_id);
create index if not exists idx_operator_profiles_facility on operator_profiles(facility_id);
create index if not exists idx_flags_facility on flags(facility_id);
create index if not exists idx_stations_facility on stations(facility_id);
-- Row-Level Security for ShopTalk. Apply after schema.sql.

alter table facilities enable row level security;
alter table stations enable row level security;
alter table sops enable row level security;
alter table steps enable row level security;
alter table substeps enable row level security;
alter table operator_profiles enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table flags enable row level security;

-- Helper: a caller's accessible facility IDs (as admin or operator).
create or replace function public.my_facility_ids() returns setof uuid
  language sql stable security definer as $$
    select id from facilities where admin_user_id = auth.uid()
    union
    select facility_id from operator_profiles where user_id = auth.uid()
  $$;

create or replace function public.my_admin_facility_ids() returns setof uuid
  language sql stable security definer as $$
    select id from facilities where admin_user_id = auth.uid()
  $$;

-- Facilities
drop policy if exists facilities_admin_all on facilities;
create policy facilities_admin_all on facilities for all
  using (admin_user_id = auth.uid())
  with check (admin_user_id = auth.uid());

drop policy if exists facilities_operator_read on facilities;
create policy facilities_operator_read on facilities for select
  using (id in (select facility_id from operator_profiles where user_id = auth.uid()));

-- Stations
drop policy if exists stations_read on stations;
create policy stations_read on stations for select
  using (facility_id in (select public.my_facility_ids()));
drop policy if exists stations_admin_write on stations;
create policy stations_admin_write on stations for all
  using (facility_id in (select public.my_admin_facility_ids()))
  with check (facility_id in (select public.my_admin_facility_ids()));

-- SOPs
drop policy if exists sops_read on sops;
create policy sops_read on sops for select
  using (facility_id in (select public.my_facility_ids()));
drop policy if exists sops_admin_write on sops;
create policy sops_admin_write on sops for all
  using (facility_id in (select public.my_admin_facility_ids()))
  with check (facility_id in (select public.my_admin_facility_ids()));

-- Steps
drop policy if exists steps_read on steps;
create policy steps_read on steps for select
  using (sop_id in (select id from sops where facility_id in (select public.my_facility_ids())));
drop policy if exists steps_admin_write on steps;
create policy steps_admin_write on steps for all
  using (sop_id in (select id from sops where facility_id in (select public.my_admin_facility_ids())))
  with check (sop_id in (select id from sops where facility_id in (select public.my_admin_facility_ids())));

-- Substeps
drop policy if exists substeps_read on substeps;
create policy substeps_read on substeps for select
  using (step_id in (select id from steps where sop_id in (select id from sops where facility_id in (select public.my_facility_ids()))));
drop policy if exists substeps_admin_write on substeps;
create policy substeps_admin_write on substeps for all
  using (step_id in (select id from steps where sop_id in (select id from sops where facility_id in (select public.my_admin_facility_ids()))))
  with check (step_id in (select id from steps where sop_id in (select id from sops where facility_id in (select public.my_admin_facility_ids()))));

-- Operator profiles
drop policy if exists op_self on operator_profiles;
create policy op_self on operator_profiles for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
drop policy if exists op_admin_read on operator_profiles;
create policy op_admin_read on operator_profiles for select
  using (facility_id in (select public.my_admin_facility_ids()));

-- Conversations
drop policy if exists conv_self on conversations;
create policy conv_self on conversations for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Messages
drop policy if exists msg_self on messages;
create policy msg_self on messages for all
  using (conversation_id in (select id from conversations where user_id = auth.uid()))
  with check (conversation_id in (select id from conversations where user_id = auth.uid()));

-- Flags
drop policy if exists flags_member_insert on flags;
create policy flags_member_insert on flags for insert
  with check (facility_id in (select public.my_facility_ids()));
drop policy if exists flags_admin_read on flags;
create policy flags_admin_read on flags for select
  using (facility_id in (select public.my_admin_facility_ids()));
drop policy if exists flags_creator_read on flags;
create policy flags_creator_read on flags for select
  using (user_id = auth.uid());
drop policy if exists flags_admin_update on flags;
create policy flags_admin_update on flags for update
  using (facility_id in (select public.my_admin_facility_ids()))
  with check (facility_id in (select public.my_admin_facility_ids()));
-- Run AFTER creating the "sop-files" bucket in Supabase Studio (set to Private).
-- These policies let facility members read their own files via signed URLs
-- (signed URLs bypass RLS, but the object list API does not).

insert into storage.buckets (id, name, public)
values ('sop-files', 'sop-files', false)
on conflict (id) do nothing;

-- Only the service role uploads via /api/process-upload. No public writes.
drop policy if exists sop_files_service_only on storage.objects;
create policy sop_files_service_only on storage.objects for all
  to authenticated
  using (bucket_id = 'sop-files' and false)
  with check (bucket_id = 'sop-files' and false);
