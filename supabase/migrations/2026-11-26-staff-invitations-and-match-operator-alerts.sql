-- SLFA staff invitation lifecycle and Match Data Operator alerts.
-- Applied to the live project on 2026-11-26. This file records the final idempotent
-- schema/function state so the deployed database is reproducible from source.

alter table public.role_invitations
  add column if not exists email_delivery_status text not null default 'NOT_SENT',
  add column if not exists email_sent_at timestamptz,
  add column if not exists email_delivery_error text,
  add column if not exists email_attempts integer not null default 0,
  add column if not exists invitation_status text not null default 'PENDING',
  add column if not exists account_created_at timestamptz,
  add column if not exists accepted_at timestamptz;

alter table public.role_invitations
  drop constraint if exists role_invitations_email_delivery_status_check,
  drop constraint if exists role_invitations_email_attempts_check,
  drop constraint if exists role_invitations_invitation_status_check;

alter table public.role_invitations
  add constraint role_invitations_email_delivery_status_check
    check (email_delivery_status in ('NOT_SENT','SENT','FAILED')),
  add constraint role_invitations_email_attempts_check
    check (email_attempts >= 0),
  add constraint role_invitations_invitation_status_check
    check (invitation_status in ('PENDING','ACCOUNT_CREATED','ACCEPTED','CANCELLED'));

create index if not exists role_invitations_pending_email_idx
  on public.role_invitations (invited_at desc)
  where invitation_status in ('PENDING','ACCOUNT_CREATED');

drop policy if exists superadmin_read_match_data_operator_profiles on public.user_profiles;
create policy superadmin_read_match_data_operator_profiles
  on public.user_profiles for select to authenticated
  using (app_role() = 'SUPER_ADMIN' and system_role = 'MATCH_DATA_OPERATOR');

drop policy if exists superadmin_read_team_official_profiles on public.user_profiles;
create policy superadmin_read_team_official_profiles
  on public.user_profiles for select to authenticated
  using (app_role() = 'SUPER_ADMIN' and system_role = 'TEAM_OFFICIAL');

CREATE OR REPLACE FUNCTION public.invite_user(p_email text, p_role text, p_club uuid, p_full_name text, p_photo_url text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_email text := lower(btrim(coalesce(p_email,'')));
  v_name text := btrim(coalesce(p_full_name,''));
  v_id uuid;
  v_role text := p_role;
  v_title text := null;
  v_club_name text;
begin
  if public.app_role() is distinct from 'DEVELOPER' then
    raise exception 'Only the Developer can assign roles.';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    raise exception 'Enter a valid email address.';
  end if;
  if v_name='' then raise exception 'Enter the full name.'; end if;
  if p_role not in ('SUPER_ADMIN','REFEREE','MATCH_COMMISSIONER','TEAM_OFFICIAL','MATCH_DATA_OPERATOR','MEDIA_OFFICER','DISCIPLINARY_OFFICER') then
    raise exception 'That role cannot be assigned here.';
  end if;

  if p_role='MATCH_COMMISSIONER' then
    v_role:='REFEREE';
    v_title:='Match Commissioner';
  elsif p_role='MATCH_DATA_OPERATOR' then
    v_title:='Match Data Operator';
  end if;

  if p_role='TEAM_OFFICIAL' then
    if p_club is null then raise exception 'Choose the club this Team Official represents.'; end if;
    select club_name into v_club_name
      from public.league_clubs
     where id=p_club and is_active=true;
    if not found then raise exception 'Choose an active club.'; end if;
  elsif p_club is not null then
    raise exception 'Only a Team Official invitation can include a club assignment.';
  end if;

  select id into v_id
    from public.user_profiles
   where lower(email)=v_email;

  if v_id is not null then
    if v_id=auth.uid() then raise exception 'You cannot change your own role.'; end if;
    perform public.set_user_role(v_id,p_role);
    update public.user_profiles
       set full_name=v_name,
           photo_url=coalesce(p_photo_url,photo_url),
           club_id=p_club,
           official_title=v_title
     where id=v_id;
    return case
      when p_role='TEAM_OFFICIAL' then
        'Team Official saved and assigned to '||v_club_name||'. The account can now submit this club team sheets.'
      when p_role='MATCH_DATA_OPERATOR' then
        'Match Data Operator role saved. The Super Admin must appoint this person to fixtures.'
      else
        'Role and profile saved. The account already exists, so the role applies now.'
    end;
  end if;

  insert into public.role_invitations(
    email,system_role,club_id,invited_by,official_title,full_name,photo_url,
    invitation_status,account_created_at,email_delivery_status,email_sent_at,email_delivery_error,email_attempts,invited_at
  )
  values(
    v_email,v_role,p_club,auth.uid(),v_title,v_name,p_photo_url,
    'PENDING',null,'NOT_SENT',null,null,0,now()
  )
  on conflict(email) do update set
    system_role=excluded.system_role,
    club_id=excluded.club_id,
    invited_by=excluded.invited_by,
    official_title=excluded.official_title,
    full_name=excluded.full_name,
    photo_url=coalesce(excluded.photo_url,public.role_invitations.photo_url),
    invitation_status='PENDING',
    account_created_at=null,
    accepted_at=null,
    email_delivery_status='NOT_SENT',
    email_sent_at=null,
    email_delivery_error=null,
    email_attempts=0,
    invited_at=now();

  return case
    when p_role='TEAM_OFFICIAL' then
      'Invitation saved for '||v_club_name||'. An invitation email will be sent; the person must accept it and set a password.'
    when p_role='MATCH_DATA_OPERATOR' then
      'Invitation saved. An invitation email will be sent; after registration the Super Admin must appoint this person to fixtures.'
    when p_role='MATCH_COMMISSIONER' then
      'Match Commissioner invitation saved. After registration, the Super Admin must appoint this person to fixtures.'
    else
      'Invitation saved. An invitation email will be sent; the role will activate after acceptance.'
  end;
end;
$function$


CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  inv public.role_invitations%rowtype;
  prev text;
begin
  insert into public.user_profiles (
    id,email,full_name,status,terms_accepted_at,terms_version
  )
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'full_name',''),
    'Pending',
    case when coalesce(new.raw_user_meta_data ->> 'terms_version','') <> '' then now() end,
    nullif(new.raw_user_meta_data ->> 'terms_version','')
  )
  on conflict (id) do nothing;

  select *
    into inv
    from public.role_invitations
   where email=lower(new.email)
     and invitation_status='PENDING'
   for update;

  if found then
    select system_role into prev
      from public.user_profiles where id=new.id;

    update public.user_profiles
       set system_role=inv.system_role,
           official_title=inv.official_title,
           club_id=inv.club_id,
           full_name=coalesce(nullif(inv.full_name,''),full_name),
           photo_url=coalesce(inv.photo_url,photo_url),
           status='Active'
     where id=new.id;

    insert into public.role_change_log(
      user_id,user_email,previous_role,new_role,reason,changed_by
    )
    values(
      new.id,lower(new.email),prev,
      coalesce(inv.official_title,inv.system_role),
      'Role assigned on account creation',inv.invited_by
    );

    update public.role_invitations
       set invitation_status='ACCOUNT_CREATED',
           account_created_at=now(),
           email_delivery_error=null
     where email=lower(new.email);
  end if;

  return new;
end
$function$


CREATE OR REPLACE FUNCTION public.accept_staff_invitation(p_terms_version text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sign in through your staff invitation first.';
  end if;
  if p_terms_version is distinct from 'draft-2026-11' then
    raise exception 'The terms version is not recognised. Reload the invitation page.';
  end if;

  update public.user_profiles
     set terms_accepted_at = coalesce(terms_accepted_at, now()),
         terms_version = p_terms_version
   where id = v_uid
     and status = 'Active'
     and system_role <> 'NONE';

  if not found then
    raise exception 'This invitation is not active. Contact the Developer to check the role assignment.';
  end if;
  return true;
end;
$function$


revoke all on function public.accept_staff_invitation(text) from public;
revoke all on function public.accept_staff_invitation(text) from anon;
grant execute on function public.accept_staff_invitation(text) to authenticated;

CREATE OR REPLACE FUNCTION public.handle_auth_user_email_confirmed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    update public.role_invitations
       set invitation_status='ACCEPTED',
           accepted_at=now()
     where email=lower(new.email)
       and invitation_status='ACCOUNT_CREATED';
  end if;
  return new;
end
$function$


drop trigger if exists on_auth_user_email_confirmed on auth.users;
create trigger on_auth_user_email_confirmed
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.handle_auth_user_email_confirmed();

comment on column public.role_invitations.email_delivery_status is
  'Server-side Auth invitation email delivery state; never contains a secret link.';
comment on column public.role_invitations.email_delivery_error is
  'Safe delivery error for Developer troubleshooting; never stores tokens or action links.';
comment on column public.role_invitations.account_created_at is
  'Timestamp when Supabase Auth created the invited user and the role trigger assigned the stored role.';
comment on function public.accept_staff_invitation(text) is
  'Records staff acceptance of the current SLFA privacy notice and terms after invite-link sign-in.';

alter table public.match_ops_notifications
  drop constraint if exists match_ops_notifications_alert_type_check;
alter table public.match_ops_notifications
  add constraint match_ops_notifications_alert_type_check
  check (alert_type = any (array[
    'TEAM_SHEET_DUE','TEAM_SHEET_RETURNED','TEAM_SHEET_REVIEW',
    'REFEREE_REPORT_OVERDUE','REFEREE_REPORT_RETURNED','REFEREE_REPORT_REVIEW',
    'COMMISSIONER_REPORT_OVERDUE','COMMISSIONER_REPORT_REVIEW',
    'RESULT_DISCREPANCY','DATA_OPERATOR_ASSIGNMENT'
  ]));

CREATE OR REPLACE FUNCTION public.generate_match_ops_notifications()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_total integer := 0;
  v_rows integer := 0;
begin
  -- Team Officials: team sheet reminders before the 20-minute submission cutoff.
  insert into public.match_ops_notifications(
    match_id, recipient_user_id, alert_type, title, body, action_url, dedupe_key, metadata
  )
  select
    m.id, p.id,
    case when latest.id is null then 'TEAM_SHEET_DUE' else 'TEAM_SHEET_RETURNED' end,
    case when latest.id is null then 'Team sheet deadline approaching' else 'Team sheet returned for correction' end,
    case when latest.id is null
      then 'Submit your club team sheet for ' || coalesce(m.home_team,'Home') || ' vs ' || coalesce(m.away_team,'Away')
           || ' before the 20-minute deadline.'
      else 'Your ' || c.club_name || ' team sheet was returned. Review the correction note and resubmit.'
    end,
    'team-official.html',
    case when latest.id is null
      then 'team-sheet-due:' || m.id::text || ':' || p.id::text
      else 'team-sheet-returned:' || latest.id::text || ':' || coalesce(latest.updated_at::text,'') || ':' || p.id::text
    end,
    jsonb_build_object('club_id',p.club_id,'sheet_id',latest.id)
  from public.matches m
  join public.user_profiles p
    on p.system_role = 'TEAM_OFFICIAL'
   and lower(coalesce(p.status,'')) = 'active'
   and p.club_id in (m.home_club_id,m.away_club_id)
  join public.league_clubs c on c.id = p.club_id
  left join lateral (
    select s.id,s.status,s.updated_at,s.review_notes
    from public.match_team_sheets s
    where s.match_id = m.id and s.club_id = p.club_id
    order by s.updated_at desc
    limit 1
  ) latest on true
  where m.match_status in ('SCHEDULED','RESCHEDULED')
    and coalesce(m.new_match_date,m.match_date) > now() + interval '20 minutes'
    and coalesce(m.new_match_date,m.match_date) <= now() + interval '24 hours'
    and (latest.id is null or latest.status = 'RETURNED')
  on conflict (dedupe_key) do nothing;

  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  -- Referee match-record follow-up after kick-off + 90 minutes, or when returned.
  insert into public.match_ops_notifications(
    match_id,recipient_user_id,alert_type,title,body,action_url,dedupe_key,metadata
  )
  select
    m.id,p.id,
    case when latest.id is null then 'REFEREE_REPORT_OVERDUE' else 'REFEREE_REPORT_RETURNED' end,
    case when latest.id is null then 'Referee match record outstanding' else 'Referee match record returned' end,
    case when latest.id is null
      then 'Your assigned ' || lower(a.official_role) || ' match record is outstanding for '
           || coalesce(m.home_team,'Home') || ' vs ' || coalesce(m.away_team,'Away') || '.'
      else 'Your photographed match record for ' || coalesce(m.home_team,'Home') || ' vs '
           || coalesce(m.away_team,'Away') || ' was returned. Review the correction note and resubmit.'
    end,
    'referee.html',
    case when latest.id is null
      then 'referee-report-overdue:' || m.id::text || ':' || a.official_role || ':' || p.id::text
      else 'referee-report-returned:' || latest.id::text || ':' || coalesce(latest.updated_at::text,'') || ':' || p.id::text
    end,
    jsonb_build_object('record_id',latest.id,'official_role',a.official_role)
  from public.matches m
  join public.match_referee_assignments a on a.match_id = m.id
    and a.assignment_status = 'ACTIVE'
    and a.official_role in ('MAIN','ASSISTANT')
  join public.user_profiles p on p.id = a.referee_user_id
    and p.system_role = 'REFEREE'
    and lower(coalesce(p.status,'')) = 'active'
  left join lateral (
    select r.id,r.status,r.updated_at,r.review_notes
    from public.referee_match_record_submissions r
    where r.match_id = m.id and r.submitted_by = p.id and r.official_role = a.official_role
      and r.report_type = 'MATCH_RECORD'
    order by r.created_at desc
    limit 1
  ) latest on true
  where coalesce(m.new_match_date,m.match_date) <= now() - interval '90 minutes'
    and m.match_status not in ('CANCELLED','POSTPONED','ABANDONED','VOID')
    and (latest.id is null or latest.status in ('DRAFT','RETURNED'))
  on conflict (dedupe_key) do nothing;

  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  -- Match Commissioners: one assigned report per fixture.
  insert into public.match_ops_notifications(
    match_id,recipient_user_id,alert_type,title,body,action_url,dedupe_key,metadata
  )
  select
    m.id,p.id,
    case when latest.id is null then 'COMMISSIONER_REPORT_OVERDUE' else 'COMMISSIONER_REPORT_REVIEW' end,
    case when latest.id is null then 'Match Commissioner report outstanding' else 'Commissioner report needs attention' end,
    case when latest.id is null
      then 'Your Match Commissioner report is outstanding for ' || coalesce(m.home_team,'Home')
           || ' vs ' || coalesce(m.away_team,'Away') || '.'
      else 'Your Match Commissioner report for ' || coalesce(m.home_team,'Home')
           || ' vs ' || coalesce(m.away_team,'Away') || ' is still a draft and must be submitted.'
    end,
    'referee.html',
    case when latest.id is null
      then 'commissioner-report-overdue:' || m.id::text || ':' || p.id::text
      else 'commissioner-report-draft:' || latest.id::text || ':' || coalesce(latest.updated_at::text,'') || ':' || p.id::text
    end,
    jsonb_build_object('report_id',latest.id)
  from public.matches m
  join public.match_referee_assignments a on a.match_id = m.id
    and a.assignment_status = 'ACTIVE'
    and a.official_role = 'MATCH_COMMISSIONER'
  join public.user_profiles p on p.id = a.referee_user_id
    and p.system_role = 'REFEREE'
    and lower(coalesce(p.official_title,'')) = 'match commissioner'
    and lower(coalesce(p.status,'')) = 'active'
  left join lateral (
    select r.id,r.report_status,r.updated_at
    from public.match_commissioner_reports r
    where r.match_id = m.id and r.commissioner_user_id = p.id
    order by r.updated_at desc
    limit 1
  ) latest on true
  where coalesce(m.new_match_date,m.match_date) <= now() - interval '90 minutes'
    and m.match_status not in ('CANCELLED','POSTPONED','ABANDONED','VOID')
    and (latest.id is null or latest.report_status = 'DRAFT')
  on conflict (dedupe_key) do nothing;

  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;


  -- Match Data Operators: notify a newly appointed operator about their fixture.
  insert into public.match_ops_notifications(
    match_id,recipient_user_id,alert_type,title,body,action_url,dedupe_key,metadata
  )
  select
    m.id,p.id,'DATA_OPERATOR_ASSIGNMENT','You have been appointed as Live Match Data Operator',
    'You are assigned to record live events for ' || coalesce(m.home_team,'Home') || ' vs '
      || coalesce(m.away_team,'Away') || ' on '
      || to_char(coalesce(m.new_match_date,m.match_date) at time zone 'Africa/Freetown','DD Mon YYYY, HH24:MI')
      || ' Freetown time. Open your Match Data Operator workspace before kick-off.',
    'match-data-operator.html',
    'data-operator-assignment:' || a.id::text || ':' || p.id::text,
    jsonb_build_object('assignment_id',a.id,'official_role',a.official_role)
  from public.match_referee_assignments a
  join public.matches m on m.id=a.match_id
  join public.user_profiles p on p.id=a.referee_user_id
   and p.system_role='MATCH_DATA_OPERATOR'
   and lower(coalesce(p.status,''))='active'
  where a.official_role='DATA_OPERATOR'
    and a.assignment_status='ACTIVE'
    and a.assigned_at >= now() - interval '14 days'
    and m.match_status in ('SCHEDULED','RESCHEDULED','LIVE','HT')
  on conflict (dedupe_key) do nothing;

  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;
  
  -- Super Admin review queue: team sheets awaiting approval.
  insert into public.match_ops_notifications(
    match_id,recipient_user_id,alert_type,title,body,action_url,dedupe_key,metadata
  )
  select
    s.match_id,p.id,'TEAM_SHEET_REVIEW','Team sheet awaiting Super Admin approval',
    'A team sheet for ' || coalesce(c.club_name,'a club') || ' in '
      || coalesce(m.home_team,'Home') || ' vs ' || coalesce(m.away_team,'Away')
      || ' is waiting for review.',
    'super-admin.html',
    'team-sheet-review:' || s.id::text || ':' || coalesce(s.updated_at::text,'') || ':' || p.id::text,
    jsonb_build_object('sheet_id',s.id,'club_id',s.club_id)
  from public.match_team_sheets s
  join public.matches m on m.id = s.match_id
  join public.league_clubs c on c.id = s.club_id
  join public.user_profiles p on p.system_role = 'SUPER_ADMIN' and lower(coalesce(p.status,'')) = 'active'
  where s.status = 'SUBMITTED'
  on conflict (dedupe_key) do nothing;

  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  -- Super Admin review queue: photographed referee match records awaiting review.
  insert into public.match_ops_notifications(
    match_id,recipient_user_id,alert_type,title,body,action_url,dedupe_key,metadata
  )
  select
    r.match_id,p.id,'REFEREE_REPORT_REVIEW','Referee match record awaiting review',
    'A photographed ' || lower(r.official_role) || ' match record for '
      || coalesce(m.home_team,'Home') || ' vs ' || coalesce(m.away_team,'Away')
      || ' is waiting for OCR verification and review.',
    'super-admin.html',
    'referee-record-review:' || r.id::text || ':' || coalesce(r.updated_at::text,'') || ':' || p.id::text,
    jsonb_build_object('record_id',r.id,'reference_code',r.reference_code)
  from public.referee_match_record_submissions r
  join public.matches m on m.id = r.match_id
  join public.user_profiles p on p.system_role = 'SUPER_ADMIN' and lower(coalesce(p.status,'')) = 'active'
  where r.status in ('SUBMITTED','UNDER_REVIEW')
  on conflict (dedupe_key) do nothing;

  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  -- Super Admin review queue: submitted Commissioner reports.
  insert into public.match_ops_notifications(
    match_id,recipient_user_id,alert_type,title,body,action_url,dedupe_key,metadata
  )
  select
    r.match_id,p.id,'COMMISSIONER_REPORT_REVIEW','Match Commissioner report awaiting review',
    'A Match Commissioner report for ' || coalesce(m.home_team,'Home') || ' vs '
      || coalesce(m.away_team,'Away') || ' is waiting for review.',
    'super-admin.html',
    'commissioner-report-review:' || r.id::text || ':' || coalesce(r.updated_at::text,'') || ':' || p.id::text,
    jsonb_build_object('report_id',r.id)
  from public.match_commissioner_reports r
  join public.matches m on m.id = r.match_id
  join public.user_profiles p on p.system_role = 'SUPER_ADMIN' and lower(coalesce(p.status,'')) = 'active'
  where r.report_status = 'SUBMITTED'
  on conflict (dedupe_key) do nothing;

  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  -- Score discrepancy: never change the official result automatically.
  insert into public.match_ops_notifications(
    match_id,recipient_user_id,alert_type,title,body,action_url,dedupe_key,metadata
  )
  select
    m.id,p.id,'RESULT_DISCREPANCY','Referee score differs from official fixture score',
    'The latest Main Referee photographed record for ' || coalesce(m.home_team,'Home') || ' vs '
      || coalesce(m.away_team,'Away') || ' records ' || r.observed_home_score || '–'
      || r.observed_away_score || ', while the official fixture score is ' || m.home_score
      || '–' || m.away_score || '. A Super Admin must inspect the source record.',
    'super-admin.html',
    'score-discrepancy:' || r.id::text || ':' || p.id::text,
    jsonb_build_object('record_id',r.id,'official_home_score',m.home_score,'official_away_score',m.away_score,
      'record_home_score',r.observed_home_score,'record_away_score',r.observed_away_score)
  from public.matches m
  join lateral (
    select x.id,x.observed_home_score,x.observed_away_score
    from public.referee_match_record_submissions x
    join public.match_referee_assignments a on a.match_id=x.match_id
      and a.referee_user_id=x.submitted_by and a.official_role='MAIN' and a.assignment_status='ACTIVE'
    where x.match_id=m.id and x.official_role='MAIN' and x.report_type='MATCH_RECORD'
      and x.status in ('SUBMITTED','UNDER_REVIEW','ACKNOWLEDGED')
    order by x.created_at desc limit 1
  ) r on true
  join public.user_profiles p on p.system_role='SUPER_ADMIN' and lower(coalesce(p.status,''))='active'
  where m.home_score is not null and m.away_score is not null
    and (r.observed_home_score is distinct from m.home_score
      or r.observed_away_score is distinct from m.away_score)
  on conflict (dedupe_key) do nothing;

  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;
  return v_total;
end;
$function$

