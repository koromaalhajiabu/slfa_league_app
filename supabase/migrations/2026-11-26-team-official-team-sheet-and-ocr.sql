-- Team Official role, electronic team sheets, and OCR metadata for private referee/commissioner evidence.
begin;

-- Permit the dedicated club-scoped Team Official role without reviving CLUB_ADMIN.
alter table public.user_profiles drop constraint if exists user_profiles_system_role_check;
alter table public.user_profiles
  add constraint user_profiles_system_role_check
  check (system_role = any (array[
    'DEVELOPER','SUPER_ADMIN','TEAM_OFFICIAL','REFEREE',
    'MEDIA_OFFICER','DISCIPLINARY_OFFICER','NONE'
  ]::text[]));

-- Existing structured team-sheet table becomes the official submission register.
alter table public.match_team_sheets
  add column if not exists reference_code text not null
    default ('SLFA-TS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  add column if not exists status text not null default 'SUBMITTED',
  add column if not exists reviewed_by uuid references public.user_profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_notes text,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists match_team_sheets_reference_code_uidx
  on public.match_team_sheets(reference_code);
alter table public.match_team_sheets
  drop constraint if exists match_team_sheets_status_check;
alter table public.match_team_sheets
  add constraint match_team_sheets_status_check
  check (status in ('SUBMITTED','APPROVED','RETURNED'));

-- OCR output is machine-generated and always requires human verification.
alter table public.referee_match_record_submissions
  add column if not exists ocr_text text,
  add column if not exists ocr_status text not null default 'NOT_RUN',
  add column if not exists ocr_confidence numeric(5,2),
  add column if not exists ocr_processed_at timestamptz;
alter table public.referee_match_record_submissions
  drop constraint if exists referee_match_record_ocr_status_check;
alter table public.referee_match_record_submissions
  add constraint referee_match_record_ocr_status_check
  check (ocr_status in ('NOT_RUN','COMPLETE','NEEDS_REVIEW','FAILED'));

alter table public.match_commissioner_reports
  add column if not exists ocr_text text,
  add column if not exists ocr_status text not null default 'NOT_RUN',
  add column if not exists ocr_confidence numeric(5,2),
  add column if not exists ocr_processed_at timestamptz;
alter table public.match_commissioner_reports
  drop constraint if exists match_commissioner_reports_ocr_status_check;
alter table public.match_commissioner_reports
  add constraint match_commissioner_reports_ocr_status_check
  check (ocr_status in ('NOT_RUN','COMPLETE','NEEDS_REVIEW','FAILED'));

-- Developer-only assignment of a new TEAM_OFFICIAL role.
create or replace function public.set_user_role(p_user uuid, p_role text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_previous text; v_email text;
begin
  if auth.uid() is null or public.app_role() <> 'DEVELOPER' then
    raise exception 'Only the Developer can assign roles.';
  end if;
  if p_user = auth.uid() then raise exception 'You cannot change your own role.'; end if;
  if p_role not in ('SUPER_ADMIN','REFEREE','MEDIA_OFFICER','DISCIPLINARY_OFFICER','MATCH_COMMISSIONER','TEAM_OFFICIAL') then
    raise exception 'Invalid role.';
  end if;
  select system_role,email into v_previous,v_email
  from public.user_profiles where id=p_user for update;
  if not found then raise exception 'Account not found.'; end if;
  if upper(v_previous)='DEVELOPER' then raise exception 'Developer accounts cannot be changed here.'; end if;
  update public.user_profiles
  set system_role = case when p_role='MATCH_COMMISSIONER' then 'REFEREE' else p_role end,
      official_title = case when p_role='MATCH_COMMISSIONER' then 'Match Commissioner' else null end,
      club_id = case when p_role='TEAM_OFFICIAL' then null else null end
  where id=p_user;
  insert into public.role_change_log(user_id,user_email,previous_role,new_role,reason,changed_by)
  values(p_user,v_email,v_previous,p_role,'Developer role update',auth.uid());
  return 'Role updated. Assign this Team Official to a club before they can submit team sheets.';
end;
$$;

create or replace function public.set_user_role(p_user uuid, p_role text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare t public.user_profiles%rowtype; v_role text := p_role; v_title text := null;
begin
  if public.app_role() <> 'DEVELOPER' then raise exception 'Only the Technical Director can assign roles.'; end if;
  if p_reason is null or length(btrim(p_reason)) < 5 then raise exception 'Give a reason of at least 5 characters. It is kept in the log.'; end if;
  if p_role='MATCH_COMMISSIONER' then v_role:='REFEREE'; v_title:='Match Commissioner'; end if;
  if p_role not in ('SUPER_ADMIN','REFEREE','MEDIA_OFFICER','DISCIPLINARY_OFFICER','MATCH_COMMISSIONER','TEAM_OFFICIAL') then
    raise exception 'That role cannot be assigned here.';
  end if;
  if p_user=auth.uid() then raise exception 'You cannot change your own role.'; end if;
  select * into t from public.user_profiles where id=p_user for update;
  if not found then raise exception 'Account not found.'; end if;
  if upper(t.system_role)='DEVELOPER' then raise exception 'The Technical Director role cannot be changed here.'; end if;
  update public.user_profiles
  set system_role=v_role, official_title=v_title,
      club_id=case when v_role='TEAM_OFFICIAL' then null else null end,
      status='Active'
  where id=p_user;
  insert into public.role_change_log(user_id,user_email,previous_role,new_role,reason,changed_by)
  values(p_user,t.email,coalesce(t.official_title,t.system_role),coalesce(v_title,v_role),btrim(p_reason),auth.uid());
end;
$$;

create or replace function public.set_team_official_club(p_user uuid,p_club uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_old uuid; v_email text; v_club_name text;
begin
  if auth.uid() is null or public.app_role() <> 'DEVELOPER' then
    raise exception 'Only the Developer can assign a Team Official to a club.';
  end if;
  if p_user=auth.uid() then raise exception 'You cannot assign your own account as a Team Official.'; end if;
  select club_id,email into v_old,v_email
  from public.user_profiles
  where id=p_user and system_role='TEAM_OFFICIAL'
  for update;
  if not found then raise exception 'The selected account is not a Team Official.'; end if;
  if p_club is not null then
    select club_name into v_club_name from public.league_clubs where id=p_club and is_active=true;
    if not found then raise exception 'The selected club is not active.'; end if;
  else
    v_club_name := 'Unassigned';
  end if;
  update public.user_profiles set club_id=p_club where id=p_user;
  insert into public.role_change_log(user_id,user_email,previous_role,new_role,reason,changed_by)
  values(p_user,v_email,'TEAM_OFFICIAL','TEAM_OFFICIAL','Club assignment: '||v_club_name,auth.uid());
  return 'Team Official club assignment saved.';
end;
$$;

revoke all on function public.set_team_official_club(uuid,uuid) from public,anon;
grant execute on function public.set_team_official_club(uuid,uuid) to authenticated;
revoke all on function public.set_user_role(uuid,text) from public,anon;
grant execute on function public.set_user_role(uuid,text) to authenticated;
revoke all on function public.set_user_role(uuid,text,text) from public,anon;
grant execute on function public.set_user_role(uuid,text,text) to authenticated;

-- Team sheet reads are restricted to the team, assigned match officials and Super Admin.
drop policy if exists "team sheets read signed in" on public.match_team_sheets;
drop policy if exists match_team_sheets_team_scope_read on public.match_team_sheets;
create policy match_team_sheets_team_scope_read
on public.match_team_sheets for select to authenticated
using (
  (select public.app_role())='SUPER_ADMIN'
  or exists (
    select 1 from public.user_profiles p
    where p.id=(select auth.uid())
      and p.system_role='TEAM_OFFICIAL'
      and p.status='Active'
      and p.club_id=match_team_sheets.club_id
  )
  or exists (
    select 1 from public.match_referee_assignments a
    where a.match_id=match_team_sheets.match_id
      and a.referee_user_id=(select auth.uid())
      and a.assignment_status='ACTIVE'
      and a.official_role in ('MAIN','ASSISTANT','MATCH_COMMISSIONER')
  )
);

drop policy if exists match_team_sheets_superadmin_update on public.match_team_sheets;
create policy match_team_sheets_superadmin_update
on public.match_team_sheets for update to authenticated
using ((select public.app_role())='SUPER_ADMIN')
with check ((select public.app_role())='SUPER_ADMIN');

grant select,update on public.match_team_sheets to authenticated;
revoke insert,delete on public.match_team_sheets from authenticated;

-- Submission happens through one checked database operation; the RPC updates both
-- the submission register and the lineup rows atomically.
create or replace function public.submit_match_team_sheet(
  p_match_id bigint,
  p_starting_player_ids bigint[],
  p_substitute_player_ids bigint[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_club uuid;
  v_match public.matches%rowtype;
  v_sheet_id bigint;
  v_season bigint;
  v_all bigint[];
  v_count integer;
  v_reference text;
begin
  if v_uid is null then raise exception 'Sign in to submit a team sheet.'; end if;
  select club_id into v_club
  from public.user_profiles
  where id=v_uid and system_role='TEAM_OFFICIAL' and status='Active';
  if not found or v_club is null then raise exception 'This account is not assigned to an active club.'; end if;

  select * into v_match from public.matches where id=p_match_id for update;
  if not found then raise exception 'Fixture not found.'; end if;
  if v_club is distinct from v_match.home_club_id and v_club is distinct from v_match.away_club_id then
    raise exception 'You can only submit a team sheet for your assigned club in its own fixture.';
  end if;
  if v_match.match_status not in ('SCHEDULED','RESCHEDULED') then
    raise exception 'Team sheets can only be submitted for scheduled or rescheduled fixtures.';
  end if;
  if now() >= coalesce(v_match.new_match_date,v_match.match_date)-interval '20 minutes' then
    raise exception 'The team-sheet deadline has passed. Submissions close 20 minutes before kick-off.';
  end if;

  p_starting_player_ids := coalesce(p_starting_player_ids,'{}'::bigint[]);
  p_substitute_player_ids := coalesce(p_substitute_player_ids,'{}'::bigint[]);
  if cardinality(p_starting_player_ids) <> 11 then
    raise exception 'Select exactly 11 starting players.';
  end if;
  if cardinality(p_substitute_player_ids) > 9 then
    raise exception 'A maximum of 9 substitutes can be listed.';
  end if;
  v_all := p_starting_player_ids || p_substitute_player_ids;
  if cardinality(v_all) <> (select count(distinct x) from unnest(v_all) x) then
    raise exception 'A player cannot be selected more than once.';
  end if;

  v_season := coalesce(v_match.season_id,(select s.id from public.seasons s where s.is_current=true order by s.id desc limit 1));
  if v_season is null then raise exception 'A current competition season must be configured before submitting team sheets.'; end if;
  select count(*) into v_count
  from public.club_squad cs
  where cs.id=any(v_all)
    and cs.club_id=v_club
    and cs.status='Active'
    and cs.registration_status='Approved'
    and cs.season_id=v_season;
  if v_count <> cardinality(v_all) then
    raise exception 'Every selected player must be an active, approved player registered to your club for this season.';
  end if;

  insert into public.match_team_sheets
    (match_id,club_id,starting_player_ids,substitute_player_ids,submitted_by,submitted_at,status,updated_at)
  values
    (p_match_id,v_club,p_starting_player_ids,p_substitute_player_ids,v_uid,now(),'SUBMITTED',now())
  on conflict (match_id,club_id) do update
    set starting_player_ids=excluded.starting_player_ids,
        substitute_player_ids=excluded.substitute_player_ids,
        submitted_by=excluded.submitted_by,
        submitted_at=now(),
        status='SUBMITTED',
        reviewed_by=null,
        reviewed_at=null,
        review_notes=null,
        updated_at=now()
    where public.match_team_sheets.status <> 'APPROVED'
  returning id,reference_code into v_sheet_id,v_reference;
  if v_sheet_id is null then
    raise exception 'This team sheet has already been approved and locked. Contact the Super Admin for changes.';
  end if;

  delete from public.match_lineups
  where match_id=p_match_id and club_id=v_club;
  insert into public.match_lineups(match_id,club_id,player_id,is_starter,submitted_by,submitted_at)
    select p_match_id,v_club,x,true,v_uid,now() from unnest(p_starting_player_ids) x
    union all
    select p_match_id,v_club,x,false,v_uid,now() from unnest(p_substitute_player_ids) x;

  return jsonb_build_object('id',v_sheet_id,'reference_code',v_reference,'status','SUBMITTED');
end;
$$;

revoke all on function public.submit_match_team_sheet(bigint,bigint[],bigint[]) from public,anon;
grant execute on function public.submit_match_team_sheet(bigint,bigint[],bigint[]) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='match_team_sheets'
  ) then
    alter publication supabase_realtime add table public.match_team_sheets;
  end if;
end
$$;

commit;