-- ShopTalk schema. Run in the Supabase SQL editor.

create extension if not exists citext;

create table if not exists facilities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  join_code text unique not null,
  default_language text default 'en',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists facility_members (
  facility_id uuid references facilities(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  role text not null check (role in ('owner', 'admin')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  primary key (facility_id, user_id)
);

create table if not exists facility_invites (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid references facilities(id) on delete cascade not null,
  email citext not null,
  role text not null default 'admin' check (role in ('owner', 'admin')),
  token text unique not null,
  invited_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz default now()
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
  transcript text default '',
  title_es text default '',
  description_es text default '',
  transcript_es text default '',
  translation_status text default 'ready' check (translation_status in ('pending','ready','failed')),
  translation_claimed_at timestamptz,
  english_hash text default '',
  edit_lock_by uuid references auth.users(id) on delete set null,
  edit_lock_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists steps (
  id uuid primary key default gen_random_uuid(),
  sop_id uuid references sops(id) on delete cascade not null,
  sort_order integer not null,
  title text not null,
  description text default '',
  title_es text default '',
  description_es text default '',
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
  text_es text default '',
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

create table if not exists work_sessions (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid references facilities(id) on delete cascade not null,
  station_id uuid references stations(id) on delete set null,
  title text not null default '',
  summary text default '',
  file_path text,
  file_url text,
  total_seconds integer default 0,
  processing_status text default 'pending'
    check (processing_status in ('pending','processing','summarizing','ready','failed')),
  processing_error text,
  raw_transcript jsonb default '[]',
  notes jsonb default '{}',
  edit_lock_by uuid references auth.users(id) on delete set null,
  edit_lock_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists session_topics (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references work_sessions(id) on delete cascade not null,
  sort_order integer not null,
  title text not null,
  description text default '',
  start_sec integer,
  end_sec integer
);

create table if not exists session_key_points (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references work_sessions(id) on delete cascade not null,
  sort_order integer not null,
  text text not null,
  type text default 'technique'
    check (type in ('technique','safety','quality','tool','other')),
  time_sec integer
);

create table if not exists processing_chunks (
  id uuid primary key default gen_random_uuid(),
  parent_type text not null check (parent_type in ('sop', 'session')),
  parent_id uuid not null,
  chunk_index integer not null,
  start_sec integer not null,
  duration_sec integer not null,
  file_path text,
  transcript jsonb,
  status text default 'pending'
    check (status in ('pending', 'processing', 'done', 'failed')),
  error text,
  created_at timestamptz default now(),
  unique (parent_id, chunk_index)
);

create index if not exists idx_work_sessions_facility on work_sessions(facility_id);
create index if not exists idx_session_topics_session on session_topics(session_id);
create index if not exists idx_session_key_points_session on session_key_points(session_id);
create index if not exists idx_processing_chunks_parent on processing_chunks(parent_id);
create index if not exists idx_facility_members_user on facility_members(user_id);
create index if not exists idx_facility_invites_token on facility_invites(token);
create index if not exists idx_facility_invites_email on facility_invites(email);
create index if not exists idx_sops_facility on sops(facility_id);
create index if not exists idx_steps_sop on steps(sop_id);
create index if not exists idx_substeps_step on substeps(step_id);
create index if not exists idx_conversations_user on conversations(user_id);
create index if not exists idx_messages_conversation on messages(conversation_id);
create index if not exists idx_operator_profiles_facility on operator_profiles(facility_id);
create index if not exists idx_flags_facility on flags(facility_id);
create index if not exists idx_stations_facility on stations(facility_id);
