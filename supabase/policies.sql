-- Row-Level Security for ShopTalk. Apply after schema.sql.

alter table facilities enable row level security;
alter table facility_members enable row level security;
alter table facility_invites enable row level security;
alter table platform_admins enable row level security;
alter table stations enable row level security;
alter table sops enable row level security;
alter table steps enable row level security;
alter table substeps enable row level security;
alter table operator_profiles enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table flags enable row level security;

-- ───────── Helper functions ─────────

create or replace function public.is_platform_admin() returns boolean
  language sql stable security definer as $$
    select exists(select 1 from platform_admins where user_id = auth.uid())
  $$;

create or replace function public.is_facility_admin(fid uuid) returns boolean
  language sql stable security definer as $$
    select public.is_platform_admin() or exists(
      select 1 from facility_members
      where facility_id = fid and user_id = auth.uid()
    )
  $$;

create or replace function public.is_facility_owner(fid uuid) returns boolean
  language sql stable security definer as $$
    select public.is_platform_admin() or exists(
      select 1 from facility_members
      where facility_id = fid and user_id = auth.uid() and role = 'owner'
    )
  $$;

-- Any facility the caller has access to: admin via membership, operator via profile,
-- or any facility when caller is a platform admin.
create or replace function public.my_facility_ids() returns setof uuid
  language sql stable security definer as $$
    select id from facilities where public.is_platform_admin()
    union
    select facility_id from facility_members where user_id = auth.uid()
    union
    select facility_id from operator_profiles where user_id = auth.uid()
  $$;

create or replace function public.my_admin_facility_ids() returns setof uuid
  language sql stable security definer as $$
    select id from facilities where public.is_platform_admin()
    union
    select facility_id from facility_members where user_id = auth.uid()
  $$;

-- ───────── Platform admins ─────────
drop policy if exists platform_admins_self_read on platform_admins;
create policy platform_admins_self_read on platform_admins for select
  using (user_id = auth.uid() or public.is_platform_admin());

-- ───────── Facilities ─────────
drop policy if exists facilities_member_read on facilities;
create policy facilities_member_read on facilities for select
  using (id in (select public.my_facility_ids()));

drop policy if exists facilities_owner_write on facilities;
create policy facilities_owner_write on facilities for update
  using (public.is_facility_owner(id))
  with check (public.is_facility_owner(id));

drop policy if exists facilities_owner_delete on facilities;
create policy facilities_owner_delete on facilities for delete
  using (public.is_facility_owner(id));

-- Facility inserts happen server-side via the service role; no insert policy needed.

-- ───────── Facility members ─────────
drop policy if exists fm_self_read on facility_members;
create policy fm_self_read on facility_members for select
  using (user_id = auth.uid() or public.is_facility_admin(facility_id));

drop policy if exists fm_owner_write on facility_members;
create policy fm_owner_write on facility_members for all
  using (public.is_facility_owner(facility_id))
  with check (public.is_facility_owner(facility_id));

-- ───────── Facility invites ─────────
drop policy if exists fi_owner_all on facility_invites;
create policy fi_owner_all on facility_invites for all
  using (public.is_facility_owner(facility_id))
  with check (public.is_facility_owner(facility_id));

-- ───────── Stations ─────────
drop policy if exists stations_read on stations;
create policy stations_read on stations for select
  using (facility_id in (select public.my_facility_ids()));
drop policy if exists stations_admin_write on stations;
create policy stations_admin_write on stations for all
  using (public.is_facility_admin(facility_id))
  with check (public.is_facility_admin(facility_id));

-- ───────── SOPs ─────────
drop policy if exists sops_read on sops;
create policy sops_read on sops for select
  using (facility_id in (select public.my_facility_ids()));
drop policy if exists sops_admin_write on sops;
create policy sops_admin_write on sops for all
  using (public.is_facility_admin(facility_id))
  with check (public.is_facility_admin(facility_id));

-- ───────── Steps ─────────
drop policy if exists steps_read on steps;
create policy steps_read on steps for select
  using (sop_id in (select id from sops where facility_id in (select public.my_facility_ids())));
drop policy if exists steps_admin_write on steps;
create policy steps_admin_write on steps for all
  using (sop_id in (select id from sops where public.is_facility_admin(facility_id)))
  with check (sop_id in (select id from sops where public.is_facility_admin(facility_id)));

-- ───────── Substeps ─────────
drop policy if exists substeps_read on substeps;
create policy substeps_read on substeps for select
  using (step_id in (select id from steps where sop_id in (select id from sops where facility_id in (select public.my_facility_ids()))));
drop policy if exists substeps_admin_write on substeps;
create policy substeps_admin_write on substeps for all
  using (step_id in (select id from steps where sop_id in (select id from sops where public.is_facility_admin(facility_id))))
  with check (step_id in (select id from steps where sop_id in (select id from sops where public.is_facility_admin(facility_id))));

-- ───────── Operator profiles ─────────
drop policy if exists op_self on operator_profiles;
create policy op_self on operator_profiles for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
drop policy if exists op_admin_read on operator_profiles;
create policy op_admin_read on operator_profiles for select
  using (public.is_facility_admin(facility_id));

-- ───────── Conversations ─────────
drop policy if exists conv_self on conversations;
create policy conv_self on conversations for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ───────── Messages ─────────
drop policy if exists msg_self on messages;
create policy msg_self on messages for all
  using (conversation_id in (select id from conversations where user_id = auth.uid()))
  with check (conversation_id in (select id from conversations where user_id = auth.uid()));

-- ───────── Flags ─────────
drop policy if exists flags_member_insert on flags;
create policy flags_member_insert on flags for insert
  with check (facility_id in (select public.my_facility_ids()));
drop policy if exists flags_admin_read on flags;
create policy flags_admin_read on flags for select
  using (public.is_facility_admin(facility_id));
drop policy if exists flags_creator_read on flags;
create policy flags_creator_read on flags for select
  using (user_id = auth.uid());
drop policy if exists flags_admin_update on flags;
create policy flags_admin_update on flags for update
  using (public.is_facility_admin(facility_id))
  with check (public.is_facility_admin(facility_id));

-- ───────── Storage ─────────
insert into storage.buckets (id, name, public)
values ('sop-files', 'sop-files', false)
on conflict (id) do nothing;

drop policy if exists sop_files_service_only on storage.objects;
create policy sop_files_service_only on storage.objects for all
  to authenticated
  using (bucket_id = 'sop-files' and false)
  with check (bucket_id = 'sop-files' and false);
