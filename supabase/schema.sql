-- ShopTalk schema. Run in the Supabase SQL editor.

create table if not exists facilities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  join_code text unique not null,
  admin_user_id uuid references auth.users(id) not null,
  default_language text default 'en',
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
  transcript text default '',
  title_es text default '',
  description_es text default '',
  transcript_es text default '',
  translation_status text default 'ready' check (translation_status in ('pending','ready','failed')),
  translation_claimed_at timestamptz,
  english_hash text default '',
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

create index if not exists idx_sops_facility on sops(facility_id);
create index if not exists idx_steps_sop on steps(sop_id);
create index if not exists idx_substeps_step on substeps(step_id);
create index if not exists idx_conversations_user on conversations(user_id);
create index if not exists idx_messages_conversation on messages(conversation_id);
create index if not exists idx_operator_profiles_facility on operator_profiles(facility_id);
create index if not exists idx_flags_facility on flags(facility_id);
create index if not exists idx_stations_facility on stations(facility_id);
