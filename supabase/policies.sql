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
