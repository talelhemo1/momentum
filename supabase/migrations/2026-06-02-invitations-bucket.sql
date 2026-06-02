-- R159 — public storage bucket for couples' own designed invitation
-- images. The host uploads the image they designed elsewhere; its
-- public URL is embedded in every invite link and shown at the top of
-- the guest's RSVP page. Guests are unauthenticated, so the bucket must
-- be public-read. Idempotent — safe to re-run.

insert into storage.buckets (id, name, public)
values ('invitations', 'invitations', true)
on conflict (id) do nothing;

-- Public read so the anonymous RSVP page <img> renders without a signed URL.
drop policy if exists "invitations public read" on storage.objects;
create policy "invitations public read" on storage.objects
  for select using (bucket_id = 'invitations');

-- Authenticated hosts upload their own invitation. The first path
-- segment must equal their auth.uid() so one host can't overwrite
-- another's file (same convention as the vendor-reviews bucket).
drop policy if exists "invitations owner insert" on storage.objects;
create policy "invitations owner insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'invitations'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "invitations owner update" on storage.objects;
create policy "invitations owner update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'invitations'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "invitations owner delete" on storage.objects;
create policy "invitations owner delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'invitations'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
