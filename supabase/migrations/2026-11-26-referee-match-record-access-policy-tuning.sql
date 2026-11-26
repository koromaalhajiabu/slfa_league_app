-- Consolidate referee match-record UPDATE policies and use init-plan auth checks.
begin;

drop policy if exists referee_match_records_select_own_or_superadmin on public.referee_match_record_submissions;
create policy referee_match_records_select_own_or_superadmin
on public.referee_match_record_submissions
for select to authenticated
using (
  submitted_by = (select auth.uid())
  or (select public.app_role()) = 'SUPER_ADMIN'
);

drop policy if exists referee_match_records_insert_assigned_referee on public.referee_match_record_submissions;
create policy referee_match_records_insert_assigned_referee
on public.referee_match_record_submissions
for insert to authenticated
with check (
  submitted_by = (select auth.uid())
  and status = 'DRAFT'
  and exists (
    select 1 from public.user_profiles p
    where p.id = (select auth.uid())
      and p.system_role = 'REFEREE'
      and p.status = 'Active'
  )
  and exists (
    select 1 from public.match_referee_assignments a
    where a.match_id = referee_match_record_submissions.match_id
      and a.referee_user_id = (select auth.uid())
      and a.assignment_status = 'ACTIVE'
      and a.official_role = referee_match_record_submissions.official_role
      and a.official_role in ('MAIN','ASSISTANT')
  )
);

drop policy if exists referee_match_records_update_own_draft on public.referee_match_record_submissions;
drop policy if exists referee_match_records_superadmin_review on public.referee_match_record_submissions;
create policy referee_match_records_update_own_or_superadmin
on public.referee_match_record_submissions
for update to authenticated
using (
  (select public.app_role()) = 'SUPER_ADMIN'
  or (submitted_by = (select auth.uid()) and status = 'DRAFT')
)
with check (
  (select public.app_role()) = 'SUPER_ADMIN'
  or (
    submitted_by = (select auth.uid())
    and status in ('DRAFT','SUBMITTED')
    and exists (
      select 1 from public.user_profiles p
      where p.id = (select auth.uid())
        and p.system_role = 'REFEREE'
        and p.status = 'Active'
    )
    and exists (
      select 1 from public.match_referee_assignments a
      where a.match_id = referee_match_record_submissions.match_id
        and a.referee_user_id = (select auth.uid())
        and a.assignment_status = 'ACTIVE'
        and a.official_role = referee_match_record_submissions.official_role
        and a.official_role in ('MAIN','ASSISTANT')
    )
  )
);

drop policy if exists referee_match_records_delete_own_draft on public.referee_match_record_submissions;
create policy referee_match_records_delete_own_draft
on public.referee_match_record_submissions
for delete to authenticated
using (
  submitted_by = (select auth.uid())
  and status = 'DRAFT'
);

drop policy if exists referee_match_record_images_upload_draft on storage.objects;
create policy referee_match_record_images_upload_draft
on storage.objects for insert to authenticated
with check (
  bucket_id = 'referee-match-records'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.referee_match_record_submissions s
    where s.id::text = (storage.foldername(name))[3]
      and s.match_id::text = (storage.foldername(name))[2]
      and s.submitted_by = (select auth.uid())
      and s.status = 'DRAFT'
  )
);

drop policy if exists referee_match_record_images_read_private on storage.objects;
create policy referee_match_record_images_read_private
on storage.objects for select to authenticated
using (
  bucket_id = 'referee-match-records'
  and (
    (select public.app_role()) = 'SUPER_ADMIN'
    or exists (
      select 1 from public.referee_match_record_submissions s
      where s.id::text = (storage.foldername(name))[3]
        and s.match_id::text = (storage.foldername(name))[2]
        and s.submitted_by = (select auth.uid())
    )
  )
);

drop policy if exists referee_match_record_images_delete_own_draft on storage.objects;
create policy referee_match_record_images_delete_own_draft
on storage.objects for delete to authenticated
using (
  bucket_id = 'referee-match-records'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.referee_match_record_submissions s
    where s.id::text = (storage.foldername(name))[3]
      and s.match_id::text = (storage.foldername(name))[2]
      and s.submitted_by = (select auth.uid())
      and s.status = 'DRAFT'
  )
);

commit;