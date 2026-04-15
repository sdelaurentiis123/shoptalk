-- Raise the per-file size cap on the sop-files bucket and allow admins to write
-- directly (browser-to-Storage uploads) under their own facility folder.

update storage.buckets
set
  file_size_limit = 2147483648,  -- 2GB, matches Gemini File API cap
  allowed_mime_types = array[
    'video/mp4','video/quicktime','video/webm','video/x-m4v',
    'application/pdf',
    'image/png','image/jpeg','image/webp'
  ]
where id = 'sop-files';

-- Replace the old service-only policy with an admin-scoped one.
drop policy if exists sop_files_service_only on storage.objects;
drop policy if exists sop_files_admin_insert on storage.objects;
drop policy if exists sop_files_admin_update on storage.objects;
drop policy if exists sop_files_admin_delete on storage.objects;

-- Admins can write objects under <their_facility_id>/*
create policy sop_files_admin_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'sop-files'
    and (storage.foldername(name))[1] in (
      select id::text from facilities where admin_user_id = auth.uid()
    )
  );

create policy sop_files_admin_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'sop-files'
    and (storage.foldername(name))[1] in (
      select id::text from facilities where admin_user_id = auth.uid()
    )
  );

create policy sop_files_admin_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'sop-files'
    and (storage.foldername(name))[1] in (
      select id::text from facilities where admin_user_id = auth.uid()
    )
  );

-- Reads happen server-side via service role + signed URLs; no read policy needed.
