-- Developer is a technical platform role, not a league media reviewer or player-photo uploader.
-- Retain Super Admin and Media Officer workflows; remove Developer permissions for these operations.
begin;

drop policy if exists media_posts_officer_delete on public.media_posts;
create policy media_posts_officer_delete on public.media_posts
  for delete to authenticated
  using (app_role() = 'MEDIA_OFFICER' and created_by = (select auth.uid()) and status in ('DRAFT','RETURNED','REJECTED'));

drop policy if exists media_posts_officer_insert on public.media_posts;
create policy media_posts_officer_insert on public.media_posts
  for insert to authenticated
  with check (app_role() = 'MEDIA_OFFICER' and created_by = (select auth.uid()) and status in ('DRAFT','SUBMITTED'));

drop policy if exists media_posts_officer_update on public.media_posts;
create policy media_posts_officer_update on public.media_posts
  for update to authenticated
  using (app_role() = 'MEDIA_OFFICER' and created_by = (select auth.uid()) and status <> 'PUBLISHED')
  with check (app_role() = 'MEDIA_OFFICER' and created_by = (select auth.uid()) and status in ('DRAFT','SUBMITTED','RETURNED','REJECTED'));

drop policy if exists media_posts_superadmin_review on public.media_posts;
create policy media_posts_superadmin_review on public.media_posts
  for update to authenticated
  using (app_role() = 'SUPER_ADMIN')
  with check (app_role() = 'SUPER_ADMIN' and status in ('DRAFT','SUBMITTED','RETURNED','PUBLISHED','REJECTED'));

drop policy if exists media_posts_team_read on public.media_posts;
create policy media_posts_team_read on public.media_posts
  for select to authenticated
  using (app_role() in ('MEDIA_OFFICER','SUPER_ADMIN'));

drop policy if exists slfa_media_delete_admin on storage.objects;
create policy slfa_media_delete_admin on storage.objects
  for delete to authenticated
  using (bucket_id = 'slfa-media' and app_role() = 'SUPER_ADMIN');

drop policy if exists slfa_media_publish_insert on storage.objects;
create policy slfa_media_publish_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'slfa-media' and (storage.foldername(name))[1] = (select auth.uid())::text and app_role() = 'SUPER_ADMIN');

drop policy if exists slfa_staging_delete_own_or_reviewer on storage.objects;
create policy slfa_staging_delete_own_or_reviewer on storage.objects
  for delete to authenticated
  using (bucket_id = 'slfa-media-staging' and (((storage.foldername(name))[1] = (select auth.uid())::text and app_role() = 'MEDIA_OFFICER') or app_role() = 'SUPER_ADMIN'));

drop policy if exists slfa_staging_read_own_or_reviewer on storage.objects;
create policy slfa_staging_read_own_or_reviewer on storage.objects
  for select to authenticated
  using (bucket_id = 'slfa-media-staging' and (((storage.foldername(name))[1] = (select auth.uid())::text and app_role() = 'MEDIA_OFFICER') or app_role() = 'SUPER_ADMIN'));

drop policy if exists slfa_staging_upload_own on storage.objects;
create policy slfa_staging_upload_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'slfa-media-staging' and (storage.foldername(name))[1] = (select auth.uid())::text and app_role() in ('MEDIA_OFFICER','SUPER_ADMIN'));

-- Restrict squad photo writes in member-photos to Super Admin or the player's own Club Admin.
drop policy if exists "LRPL member photos insert allowed roles" on storage.objects;
create policy "LRPL member photos insert allowed roles" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'member-photos' and exists (
    select 1 from public.user_profiles p
    where p.id = auth.uid() and coalesce(p.status,'Active') <> 'Suspended'
      and (p.system_role = 'SUPER_ADMIN' or
        (p.system_role = 'CLUB_ADMIN' and p.club_id is not null
         and (storage.foldername(name))[1] = 'squad'
         and (storage.foldername(name))[2] = auth.uid()::text))
  ));

drop policy if exists "LRPL member photos insert role guard" on storage.objects;
create policy "LRPL member photos insert role guard" on storage.objects
  for insert to authenticated
  with check (bucket_id <> 'member-photos' or exists (
    select 1 from public.user_profiles p
    where p.id = auth.uid() and coalesce(p.status,'Active') <> 'Suspended'
      and (p.system_role = 'SUPER_ADMIN' or
        (p.system_role = 'CLUB_ADMIN' and p.club_id is not null
         and (storage.foldername(name))[1] = 'squad'
         and (storage.foldername(name))[2] = auth.uid()::text))
  ));

drop policy if exists "LRPL member photos update allowed roles" on storage.objects;
create policy "LRPL member photos update allowed roles" on storage.objects
  for update to authenticated
  using (bucket_id = 'member-photos' and exists (
    select 1 from public.user_profiles p
    where p.id = auth.uid() and coalesce(p.status,'Active') <> 'Suspended'
      and (p.system_role = 'SUPER_ADMIN' or
        (p.system_role = 'CLUB_ADMIN' and p.club_id is not null
         and (storage.foldername(name))[1] = 'squad'
         and (storage.foldername(name))[2] = auth.uid()::text))
  ))
  with check (bucket_id = 'member-photos' and exists (
    select 1 from public.user_profiles p
    where p.id = auth.uid() and coalesce(p.status,'Active') <> 'Suspended'
      and (p.system_role = 'SUPER_ADMIN' or
        (p.system_role = 'CLUB_ADMIN' and p.club_id is not null
         and (storage.foldername(name))[1] = 'squad'
         and (storage.foldername(name))[2] = auth.uid()::text))
  ));

drop policy if exists "LRPL member photos update role guard" on storage.objects;
create policy "LRPL member photos update role guard" on storage.objects
  for update to authenticated
  using (bucket_id <> 'member-photos' or exists (
    select 1 from public.user_profiles p
    where p.id = auth.uid() and coalesce(p.status,'Active') <> 'Suspended'
      and (p.system_role = 'SUPER_ADMIN' or
        (p.system_role = 'CLUB_ADMIN' and p.club_id is not null
         and (storage.foldername(name))[1] = 'squad'
         and (storage.foldername(name))[2] = auth.uid()::text))
  ))
  with check (bucket_id <> 'member-photos' or exists (
    select 1 from public.user_profiles p
    where p.id = auth.uid() and coalesce(p.status,'Active') <> 'Suspended'
      and (p.system_role = 'SUPER_ADMIN' or
        (p.system_role = 'CLUB_ADMIN' and p.club_id is not null
         and (storage.foldername(name))[1] = 'squad'
         and (storage.foldername(name))[2] = auth.uid()::text))
  ));

drop policy if exists "LRPL member photos delete allowed roles" on storage.objects;
create policy "LRPL member photos delete allowed roles" on storage.objects
  for delete to authenticated
  using (bucket_id = 'member-photos' and exists (
    select 1 from public.user_profiles p
    where p.id = auth.uid() and coalesce(p.status,'Active') <> 'Suspended'
      and (p.system_role = 'SUPER_ADMIN' or
        (p.system_role = 'CLUB_ADMIN' and p.club_id is not null
         and (storage.foldername(name))[1] = 'squad'
         and (storage.foldername(name))[2] = auth.uid()::text))
  ));

drop policy if exists "LRPL member photos delete role guard" on storage.objects;
create policy "LRPL member photos delete role guard" on storage.objects
  for delete to authenticated
  using (bucket_id <> 'member-photos' or exists (
    select 1 from public.user_profiles p
    where p.id = auth.uid() and coalesce(p.status,'Active') <> 'Suspended'
      and (p.system_role = 'SUPER_ADMIN' or
        (p.system_role = 'CLUB_ADMIN' and p.club_id is not null
         and (storage.foldername(name))[1] = 'squad'
         and (storage.foldername(name))[2] = auth.uid()::text))
  ));

-- Preserve Developer staff/profile photo permissions, but remove Developer access to squad files.
drop policy if exists "photos insert" on storage.objects;
create policy "photos insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'member-photos' and (
    (name like 'staff/%' and app_role() in ('DEVELOPER','SUPER_ADMIN'))
    or (name like 'squad/%' and app_role() = 'SUPER_ADMIN')
    or (name like ('squad/' || auth.uid()::text || '/%') and app_role() = 'CLUB_ADMIN')
    or (name like ('profiles/' || auth.uid()::text || '/%') and app_role() in ('DEVELOPER','SUPER_ADMIN','CLUB_ADMIN','REFEREE'))
    or (name like 'profiles/%' and app_role() = 'DEVELOPER')
  ));

drop policy if exists "photos delete" on storage.objects;
create policy "photos delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'member-photos' and (
    (name like 'staff/%' and app_role() in ('DEVELOPER','SUPER_ADMIN'))
    or (name like 'squad/%' and app_role() = 'SUPER_ADMIN')
    or (name like ('squad/' || auth.uid()::text || '/%') and app_role() = 'CLUB_ADMIN')
    or (name like ('profiles/' || auth.uid()::text || '/%') and app_role() in ('DEVELOPER','SUPER_ADMIN','CLUB_ADMIN','REFEREE'))
    or (name like 'profiles/%' and app_role() = 'DEVELOPER')
  ));

drop policy if exists "player photos: staff write" on storage.objects;
create policy "player photos: staff write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'player-photos' and (
    app_role() = 'SUPER_ADMIN'
    or (app_role() = 'CLUB_ADMIN' and (storage.foldername(name))[1] = (
      select (user_profiles.club_id)::text from public.user_profiles where user_profiles.id = auth.uid()
    ))
  ));

drop policy if exists "player photos: staff update" on storage.objects;
create policy "player photos: staff update" on storage.objects
  for update to authenticated
  using (bucket_id = 'player-photos' and (
    app_role() = 'SUPER_ADMIN'
    or (app_role() = 'CLUB_ADMIN' and (storage.foldername(name))[1] = (
      select (user_profiles.club_id)::text from public.user_profiles where user_profiles.id = auth.uid()
    ))
  ))
  with check (bucket_id = 'player-photos' and (
    app_role() = 'SUPER_ADMIN'
    or (app_role() = 'CLUB_ADMIN' and (storage.foldername(name))[1] = (
      select (user_profiles.club_id)::text from public.user_profiles where user_profiles.id = auth.uid()
    ))
  ));

commit;
notify pgrst, 'reload schema';
