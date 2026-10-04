-- Reserved infrastructure only. No document workflow or inferred clinical access.
-- All application identities (including admins) are denied until explicit file
-- authorization is approved and implemented in a subsequent migration.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('clinical-private', 'clinical-private', false, 5242880, array['application/pdf', 'image/png', 'image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Restrictive fences prevent another permissive Storage policy from exposing
-- this reserved bucket to application roles. service_role remains privileged.
create policy "Reserved clinical objects denied" on storage.objects
as restrictive for all to anon, authenticated
using (bucket_id <> 'clinical-private') with check (bucket_id <> 'clinical-private');
create policy "Reserved clinical bucket denied" on storage.buckets
as restrictive for all to anon, authenticated
using (id <> 'clinical-private') with check (id <> 'clinical-private');
