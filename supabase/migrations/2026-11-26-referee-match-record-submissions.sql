-- Referee photographed match-record submissions and Super Admin review inbox.
-- Files are private; only the submitting referee and Super Admin can read them.
begin;

create table if not exists public.referee_match_record_submissions (
  id uuid primary key default gen_random_uuid(),
  reference_code text not null unique default (
    'SLFA-MR-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))
  ),
  match_id bigint not null references public.matches(id) on delete restrict,
  submitted_by uuid not null references public.user_profiles(id) on delete restrict,
  official_role text not null check (official_role in ('MAIN','ASSISTANT')),
  report_type text not null default 'MATCH_RECORD'
    check (report_type in ('MATCH_RECORD','INCIDENT_REPORT','SUPPORTING_EVIDENCE')),
  observed_home_score integer check (observed_home_score is null or observed_home_score between 0 and 99),
  observed_away_score integer check (observed_away_score is null or observed_away_score between 0 and 99),
  match_minute integer check (match_minute is null or match_minute between 0 and 150),
  incident_flag boolean not null default false,
  incident_details text,
  referee_notes text,
  image_paths text[] not null default '{}',
  status text not null default 'DRAFT'
    check (status in ('DRAFT','SUBMITTED','UNDER_REVIEW','ACKNOWLEDGED','RETURNED')),
  submitted_at timestamptz,
  reviewed_by uuid references public.user_profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint referee_match_record_score_pair check (
    (observed_home_score is null and observed_away_score is null)
    or (observed_home_score is not null and observed_away_score is not null)
  ),
  constraint referee_match_record_images_count check (cardinality(image_paths) <= 6)
);

create index if not exists referee_match_record_inbox_idx
  on public.referee_match_record_submissions (status, submitted_at desc);
create index if not exists referee_match_record_match_idx
  on public.referee_match_record_submissions (match_id, created_at desc);
create index if not exists referee_match_record_submitter_idx
  on public.referee_match_record_submissions (submitted_by, created_at desc);

alter table public.referee_match_record_submissions enable row level security;
revoke all on public.referee_match_record_submissions from public, anon;
grant select, insert, update, delete on public.referee_match_record_submissions to authenticated;

drop policy if exists referee_match_records_select_own_or_superadmin
  on public.referee_match_record_submissions;
create policy referee_match_records_select_own_or_superadmin
on public.referee_match_record_submissions
for select to authenticated
using (submitted_by = auth.uid() or public.app_role() = 'SUPER_ADMIN');

drop policy if exists referee_match_records_insert_assigned_referee
  on public.referee_match_record_submissions;
create policy referee_match_records_insert_assigned_referee
on public.referee_match_record_submissions
for insert to authenticated
with check (
  submitted_by = auth.uid()
  and status = 'DRAFT'
  and exists (
    select 1 from public.user_profiles p
    where p.id = auth.uid()
      and p.system_role = 'REFEREE'
      and p.status = 'Active'
  )
  and exists (
    select 1 from public.match_referee_assignments a
    where a.match_id = referee_match_record_submissions.match_id
      and a.referee_user_id = auth.uid()
      and a.assignment_status = 'ACTIVE'
      and a.official_role = referee_match_record_submissions.official_role
      and a.official_role in ('MAIN','ASSISTANT')
  )
);

drop policy if exists referee_match_records_update_own_draft
  on public.referee_match_record_submissions;
create policy referee_match_records_update_own_draft
on public.referee_match_record_submissions
for update to authenticated
using (
  submitted_by = auth.uid()
  and status = 'DRAFT'
)
with check (
  submitted_by = auth.uid()
  and status in ('DRAFT','SUBMITTED')
  and exists (
    select 1 from public.user_profiles p
    where p.id = auth.uid()
      and p.system_role = 'REFEREE'
      and p.status = 'Active'
  )
  and exists (
    select 1 from public.match_referee_assignments a
    where a.match_id = referee_match_record_submissions.match_id
      and a.referee_user_id = auth.uid()
      and a.assignment_status = 'ACTIVE'
      and a.official_role = referee_match_record_submissions.official_role
      and a.official_role in ('MAIN','ASSISTANT')
  )
);

drop policy if exists referee_match_records_superadmin_review
  on public.referee_match_record_submissions;
create policy referee_match_records_superadmin_review
on public.referee_match_record_submissions
for update to authenticated
using (public.app_role() = 'SUPER_ADMIN')
with check (public.app_role() = 'SUPER_ADMIN');

drop policy if exists referee_match_records_delete_own_draft
  on public.referee_match_record_submissions;
create policy referee_match_records_delete_own_draft
on public.referee_match_record_submissions
for delete to authenticated
using (submitted_by = auth.uid() and status = 'DRAFT');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'referee-match-records',
  'referee-match-records',
  false,
  10485760,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists referee_match_record_images_upload_draft
  on storage.objects;
create policy referee_match_record_images_upload_draft
on storage.objects
for insert to authenticated
with check (
  bucket_id = 'referee-match-records'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1 from public.referee_match_record_submissions s
    where s.id::text = (storage.foldername(name))[3]
      and s.match_id::text = (storage.foldername(name))[2]
      and s.submitted_by = auth.uid()
      and s.status = 'DRAFT'
  )
);

drop policy if exists referee_match_record_images_read_private
  on storage.objects;
create policy referee_match_record_images_read_private
on storage.objects
for select to authenticated
using (
  bucket_id = 'referee-match-records'
  and (
    public.app_role() = 'SUPER_ADMIN'
    or exists (
      select 1 from public.referee_match_record_submissions s
      where s.id::text = (storage.foldername(name))[3]
        and s.match_id::text = (storage.foldername(name))[2]
        and s.submitted_by = auth.uid()
    )
  )
);

drop policy if exists referee_match_record_images_delete_own_draft
  on storage.objects;
create policy referee_match_record_images_delete_own_draft
on storage.objects
for delete to authenticated
using (
  bucket_id = 'referee-match-records'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1 from public.referee_match_record_submissions s
    where s.id::text = (storage.foldername(name))[3]
      and s.match_id::text = (storage.foldername(name))[2]
      and s.submitted_by = auth.uid()
      and s.status = 'DRAFT'
  )
);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'referee_match_record_submissions'
  ) then
    alter publication supabase_realtime
      add table public.referee_match_record_submissions;
  end if;
end
$$;

comment on table public.referee_match_record_submissions is
  'Private referee match-record submissions with photographed sheets; visible to submitter and SLFA Super Admin only. Submissions do not alter public match results.';

commit;
