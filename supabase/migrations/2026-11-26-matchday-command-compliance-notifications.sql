-- Matchday Command & Compliance Engine: private, recipient-scoped in-app alerts.
begin;

create table if not exists public.match_ops_notifications (
  id uuid primary key default gen_random_uuid(),
  match_id bigint not null references public.matches(id) on delete cascade,
  recipient_user_id uuid not null references public.user_profiles(id) on delete cascade,
  alert_type text not null check (alert_type in (
    'TEAM_SHEET_DUE','TEAM_SHEET_RETURNED','TEAM_SHEET_REVIEW',
    'REFEREE_REPORT_OVERDUE','REFEREE_REPORT_RETURNED','REFEREE_REPORT_REVIEW',
    'COMMISSIONER_REPORT_OVERDUE','COMMISSIONER_REPORT_REVIEW','RESULT_DISCREPANCY'
  )),
  title text not null,
  body text not null,
  action_url text not null default 'super-admin.html',
  dedupe_key text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists match_ops_notifications_recipient_created_idx
  on public.match_ops_notifications(recipient_user_id,created_at desc);
create index if not exists match_ops_notifications_match_created_idx
  on public.match_ops_notifications(match_id,created_at desc);
create index if not exists match_ops_notifications_unread_idx
  on public.match_ops_notifications(recipient_user_id,created_at desc) where read_at is null;

alter table public.match_ops_notifications enable row level security;
revoke all on public.match_ops_notifications from public,anon,authenticated;
grant select on public.match_ops_notifications to authenticated;
grant update(read_at) on public.match_ops_notifications to authenticated;

drop policy if exists match_ops_notifications_read_own on public.match_ops_notifications;
create policy match_ops_notifications_read_own on public.match_ops_notifications
  for select to authenticated using (recipient_user_id=(select auth.uid()));
drop policy if exists match_ops_notifications_mark_own on public.match_ops_notifications;
create policy match_ops_notifications_mark_own on public.match_ops_notifications
  for update to authenticated using (recipient_user_id=(select auth.uid()))
  with check (recipient_user_id=(select auth.uid()));

create or replace function public.generate_match_ops_notifications()
returns integer language plpgsql security definer set search_path=''
as $$
declare v_total integer:=0; v_rows integer:=0;
begin
  -- Team Official reminders: assigned club only, with the 20-minute cutoff preserved.
  insert into public.match_ops_notifications(match_id,recipient_user_id,alert_type,title,body,action_url,dedupe_key,metadata)
  select m.id,p.id,
    case when s.id is null then 'TEAM_SHEET_DUE' else 'TEAM_SHEET_RETURNED' end,
    case when s.id is null then 'Team sheet deadline approaching' else 'Team sheet returned for correction' end,
    case when s.id is null then 'Submit your club team sheet for '||coalesce(m.home_team,'Home')||' vs '||coalesce(m.away_team,'Away')||' before the 20-minute deadline.'
      else 'Your '||c.club_name||' team sheet was returned. Review the correction note and resubmit.' end,
    'team-official.html',
    case when s.id is null then 'team-sheet-due:'||m.id::text||':'||p.id::text
      else 'team-sheet-returned:'||s.id::text||':'||coalesce(s.updated_at::text,'')||':'||p.id::text end,
    jsonb_build_object('club_id',p.club_id,'sheet_id',s.id)
  from public.matches m
  join public.user_profiles p on p.system_role='TEAM_OFFICIAL' and lower(coalesce(p.status,''))='active'
    and p.club_id in (m.home_club_id,m.away_club_id)
  join public.league_clubs c on c.id=p.club_id
  left join lateral (select x.id,x.status,x.updated_at from public.match_team_sheets x
    where x.match_id=m.id and x.club_id=p.club_id order by x.updated_at desc limit 1) s on true
  where m.match_status in ('SCHEDULED','RESCHEDULED')
    and coalesce(m.new_match_date,m.match_date)>now()+interval '20 minutes'
    and coalesce(m.new_match_date,m.match_date)<=now()+interval '24 hours'
    and (s.id is null or s.status='RETURNED')
  on conflict(dedupe_key) do nothing;
  get diagnostics v_rows=row_count; v_total:=v_total+v_rows;

  -- Assigned Main/Assistant Referees: an absent or returned photographed match record.
  insert into public.match_ops_notifications(match_id,recipient_user_id,alert_type,title,body,action_url,dedupe_key,metadata)
  select m.id,p.id,
    case when r.id is null then 'REFEREE_REPORT_OVERDUE' else 'REFEREE_REPORT_RETURNED' end,
    case when r.id is null then 'Referee match record outstanding' else 'Referee match record returned' end,
    case when r.id is null then 'Your assigned '||lower(a.official_role)||' match record is outstanding for '||coalesce(m.home_team,'Home')||' vs '||coalesce(m.away_team,'Away')||'.'
      else 'Your photographed match record for '||coalesce(m.home_team,'Home')||' vs '||coalesce(m.away_team,'Away')||' was returned. Review the correction note and resubmit.' end,
    'referee.html',
    case when r.id is null then 'referee-report-overdue:'||m.id::text||':'||a.official_role||':'||p.id::text
      else 'referee-report-returned:'||r.id::text||':'||coalesce(r.updated_at::text,'')||':'||p.id::text end,
    jsonb_build_object('record_id',r.id,'official_role',a.official_role)
  from public.matches m
  join public.match_referee_assignments a on a.match_id=m.id and a.assignment_status='ACTIVE'
    and a.official_role in ('MAIN','ASSISTANT')
  join public.user_profiles p on p.id=a.referee_user_id and p.system_role='REFEREE' and lower(coalesce(p.status,''))='active'
  left join lateral (select x.id,x.status,x.updated_at from public.referee_match_record_submissions x
    where x.match_id=m.id and x.submitted_by=p.id and x.official_role=a.official_role and x.report_type='MATCH_RECORD'
    order by x.created_at desc limit 1) r on true
  where coalesce(m.new_match_date,m.match_date)<=now()-interval '90 minutes'
    and m.match_status not in ('CANCELLED','POSTPONED','ABANDONED','VOID')
    and (r.id is null or r.status in ('DRAFT','RETURNED'))
  on conflict(dedupe_key) do nothing;
  get diagnostics v_rows=row_count; v_total:=v_total+v_rows;

  -- Assigned Match Commissioners: report still missing or saved as draft.
  insert into public.match_ops_notifications(match_id,recipient_user_id,alert_type,title,body,action_url,dedupe_key,metadata)
  select m.id,p.id,
    case when r.id is null then 'COMMISSIONER_REPORT_OVERDUE' else 'COMMISSIONER_REPORT_REVIEW' end,
    case when r.id is null then 'Match Commissioner report outstanding' else 'Commissioner report needs submission' end,
    case when r.id is null then 'Your Match Commissioner report is outstanding for '||coalesce(m.home_team,'Home')||' vs '||coalesce(m.away_team,'Away')||'.'
      else 'Your Match Commissioner report for '||coalesce(m.home_team,'Home')||' vs '||coalesce(m.away_team,'Away')||' is still a draft and must be submitted.' end,
    'referee.html',
    case when r.id is null then 'commissioner-report-overdue:'||m.id::text||':'||p.id::text
      else 'commissioner-report-draft:'||r.id::text||':'||coalesce(r.updated_at::text,'')||':'||p.id::text end,
    jsonb_build_object('report_id',r.id)
  from public.matches m
  join public.match_referee_assignments a on a.match_id=m.id and a.assignment_status='ACTIVE' and a.official_role='MATCH_COMMISSIONER'
  join public.user_profiles p on p.id=a.referee_user_id and p.system_role='REFEREE'
    and lower(coalesce(p.official_title,''))='match commissioner' and lower(coalesce(p.status,''))='active'
  left join lateral (select x.id,x.report_status,x.updated_at from public.match_commissioner_reports x
    where x.match_id=m.id and x.commissioner_user_id=p.id order by x.updated_at desc limit 1) r on true
  where coalesce(m.new_match_date,m.match_date)<=now()-interval '90 minutes'
    and m.match_status not in ('CANCELLED','POSTPONED','ABANDONED','VOID')
    and (r.id is null or r.report_status='DRAFT')
  on conflict(dedupe_key) do nothing;
  get diagnostics v_rows=row_count; v_total:=v_total+v_rows;

  -- Super Admin: submitted team sheets awaiting approval.
  insert into public.match_ops_notifications(match_id,recipient_user_id,alert_type,title,body,action_url,dedupe_key,metadata)
  select s.match_id,p.id,'TEAM_SHEET_REVIEW','Team sheet awaiting Super Admin approval',
    'A team sheet for '||coalesce(c.club_name,'a club')||' in '||coalesce(m.home_team,'Home')||' vs '||coalesce(m.away_team,'Away')||' is waiting for review.',
    'super-admin.html','team-sheet-review:'||s.id::text||':'||coalesce(s.updated_at::text,'')||':'||p.id::text,
    jsonb_build_object('sheet_id',s.id,'club_id',s.club_id)
  from public.match_team_sheets s
  join public.matches m on m.id=s.match_id
  join public.league_clubs c on c.id=s.club_id
  join public.user_profiles p on p.system_role='SUPER_ADMIN' and lower(coalesce(p.status,''))='active'
  where s.status='SUBMITTED'
  on conflict(dedupe_key) do nothing;
  get diagnostics v_rows=row_count; v_total:=v_total+v_rows;

  -- Super Admin: referee photographed records awaiting review.
  insert into public.match_ops_notifications(match_id,recipient_user_id,alert_type,title,body,action_url,dedupe_key,metadata)
  select r.match_id,p.id,'REFEREE_REPORT_REVIEW','Referee match record awaiting review',
    'A photographed '||lower(r.official_role)||' match record for '||coalesce(m.home_team,'Home')||' vs '||coalesce(m.away_team,'Away')||' is waiting for OCR verification and review.',
    'super-admin.html','referee-record-review:'||r.id::text||':'||coalesce(r.updated_at::text,'')||':'||p.id::text,
    jsonb_build_object('record_id',r.id,'reference_code',r.reference_code)
  from public.referee_match_record_submissions r
  join public.matches m on m.id=r.match_id
  join public.user_profiles p on p.system_role='SUPER_ADMIN' and lower(coalesce(p.status,''))='active'
  where r.status in ('SUBMITTED','UNDER_REVIEW')
  on conflict(dedupe_key) do nothing;
  get diagnostics v_rows=row_count; v_total:=v_total+v_rows;

  -- Super Admin: submitted Commissioner reports awaiting review.
  insert into public.match_ops_notifications(match_id,recipient_user_id,alert_type,title,body,action_url,dedupe_key,metadata)
  select r.match_id,p.id,'COMMISSIONER_REPORT_REVIEW','Match Commissioner report awaiting review',
    'A Match Commissioner report for '||coalesce(m.home_team,'Home')||' vs '||coalesce(m.away_team,'Away')||' is waiting for review.',
    'super-admin.html','commissioner-report-review:'||r.id::text||':'||coalesce(r.updated_at::text,'')||':'||p.id::text,
    jsonb_build_object('report_id',r.id)
  from public.match_commissioner_reports r
  join public.matches m on m.id=r.match_id
  join public.user_profiles p on p.system_role='SUPER_ADMIN' and lower(coalesce(p.status,''))='active'
  where r.report_status='SUBMITTED'
  on conflict(dedupe_key) do nothing;
  get diagnostics v_rows=row_count; v_total:=v_total+v_rows;

  -- Score differences are review alerts only; the official score is never changed here.
  insert into public.match_ops_notifications(match_id,recipient_user_id,alert_type,title,body,action_url,dedupe_key,metadata)
  select m.id,p.id,'RESULT_DISCREPANCY','Referee score differs from official fixture score',
    'The Main Referee photographed record for '||coalesce(m.home_team,'Home')||' vs '||coalesce(m.away_team,'Away')
      ||' records '||r.observed_home_score||'–'||r.observed_away_score||', while the official fixture score is '
      ||m.home_score||'–'||m.away_score||'. Inspect the original record before action.',
    'super-admin.html','score-discrepancy:'||r.id::text||':'||p.id::text,
    jsonb_build_object('record_id',r.id,'official_home_score',m.home_score,'official_away_score',m.away_score,
      'record_home_score',r.observed_home_score,'record_away_score',r.observed_away_score)
  from public.matches m
  join lateral (
    select x.id,x.observed_home_score,x.observed_away_score
    from public.referee_match_record_submissions x
    join public.match_referee_assignments a on a.match_id=x.match_id and a.referee_user_id=x.submitted_by
      and a.official_role='MAIN' and a.assignment_status='ACTIVE'
    where x.match_id=m.id and x.official_role='MAIN' and x.report_type='MATCH_RECORD'
      and x.status in ('SUBMITTED','UNDER_REVIEW','ACKNOWLEDGED')
    order by x.created_at desc limit 1
  ) r on true
  join public.user_profiles p on p.system_role='SUPER_ADMIN' and lower(coalesce(p.status,''))='active'
  where m.home_score is not null and m.away_score is not null
    and (r.observed_home_score is distinct from m.home_score or r.observed_away_score is distinct from m.away_score)
  on conflict(dedupe_key) do nothing;
  get diagnostics v_rows=row_count; v_total:=v_total+v_rows;
  return v_total;
end;
$$;

revoke all on function public.generate_match_ops_notifications() from public,anon,authenticated;

do $$
declare v_job_id bigint;
begin
  for v_job_id in select jobid from cron.job where jobname='slfa-match-operations-compliance'
  loop perform cron.unschedule(v_job_id); end loop;
  perform cron.schedule('slfa-match-operations-compliance','*/15 * * * *','select public.generate_match_ops_notifications();');
end;
$$;

notify pgrst,'reload schema';
commit;
