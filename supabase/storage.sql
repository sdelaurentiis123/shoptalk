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
