-- Wipe the legacy Supabase Storage bucket + any SOPs that point at it.
-- Run AFTER switching to R2. Irreversible for any orphan SOPs.

delete from substeps where step_id in (
  select id from steps where sop_id in (
    select id from sops where file_path is not null and file_path ~ '^[a-f0-9-]{36}/'
  )
);
delete from steps where sop_id in (
  select id from sops where file_path is not null and file_path ~ '^[a-f0-9-]{36}/'
);
delete from sops where file_path is not null and file_path ~ '^[a-f0-9-]{36}/';

delete from storage.objects where bucket_id = 'sop-files';
delete from storage.buckets where id = 'sop-files';
