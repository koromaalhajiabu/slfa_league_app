-- Remove Developer access to Digital Publications Management.
-- Media Officers author their own unpublished documents; Super Admins review and manage all records.
drop policy if exists slfa_publications_author_and_reviewer_delete on public.slfa_publications;
create policy slfa_publications_author_and_reviewer_delete
on public.slfa_publications
for delete to authenticated
using (
  app_role() = 'SUPER_ADMIN'
  or (
    app_role() = 'MEDIA_OFFICER'
    and created_by = auth.uid()
    and status in ('DRAFT', 'RETURNED', 'REJECTED')
  )
);

drop policy if exists slfa_publications_author_and_reviewer_update on public.slfa_publications;
create policy slfa_publications_author_and_reviewer_update
on public.slfa_publications
for update to authenticated
using (
  (
    app_role() = 'MEDIA_OFFICER'
    and created_by = auth.uid()
    and status in ('DRAFT', 'RETURNED')
  )
  or (
    app_role() = 'SUPER_ADMIN'
    and created_by <> auth.uid()
  )
)
with check (
  (
    app_role() = 'MEDIA_OFFICER'
    and created_by = auth.uid()
    and status in ('DRAFT', 'SUBMITTED')
  )
  or (
    app_role() = 'SUPER_ADMIN'
    and created_by <> auth.uid()
  )
);

drop policy if exists slfa_publications_staff_insert on public.slfa_publications;
create policy slfa_publications_staff_insert
on public.slfa_publications
for insert to authenticated
with check (
  app_role() in ('MEDIA_OFFICER', 'SUPER_ADMIN')
  and created_by = auth.uid()
  and status in ('DRAFT', 'SUBMITTED')
);

drop policy if exists slfa_publications_staff_read on public.slfa_publications;
create policy slfa_publications_staff_read
on public.slfa_publications
for select to authenticated
using (
  status = 'PUBLISHED'
  or app_role() = 'SUPER_ADMIN'
  or (
    app_role() = 'MEDIA_OFFICER'
    and created_by = auth.uid()
  )
);

drop policy if exists slfa_publications_storage_delete on storage.objects;
create policy slfa_publications_storage_delete
on storage.objects
for delete to authenticated
using (
  bucket_id = 'slfa-publications'
  and (
    app_role() = 'SUPER_ADMIN'
    or (
      app_role() = 'MEDIA_OFFICER'
      and (storage.foldername(name))[1] = auth.uid()::text
      and not exists (
        select 1
        from public.slfa_publications p
        where p.storage_path = objects.name
          and p.status in ('PUBLISHED', 'ARCHIVED')
      )
    )
  )
);

drop policy if exists slfa_publications_storage_insert on storage.objects;
create policy slfa_publications_storage_insert
on storage.objects
for insert to authenticated
with check (
  bucket_id = 'slfa-publications'
  and (storage.foldername(name))[1] = auth.uid()::text
  and app_role() in ('MEDIA_OFFICER', 'SUPER_ADMIN')
  and storage.extension(name) = 'pdf'
);

drop policy if exists slfa_publications_storage_read on storage.objects;
create policy slfa_publications_storage_read
on storage.objects
for select to anon, authenticated
using (
  bucket_id = 'slfa-publications'
  and (
    exists (
      select 1
      from public.slfa_publications p
      where p.storage_path = objects.name
        and p.status = 'PUBLISHED'
    )
    or (
      auth.uid() is not null
      and (
        app_role() = 'SUPER_ADMIN'
        or (
          app_role() = 'MEDIA_OFFICER'
          and (storage.foldername(name))[1] = auth.uid()::text
        )
      )
    )
  )
);
