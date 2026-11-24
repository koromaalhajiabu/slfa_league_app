-- Applied in Supabase as migration 20261124075648_final_role_boundaries_and_player_column_grants.
-- This migration narrows Developer access to technical administration and protects
-- referee-only match results, disciplinary records, media publication, match reports,
-- match events, and private player identifiers.

CREATE OR REPLACE FUNCTION public.admin_activity_audit_feed(p_days integer DEFAULT 90, p_limit integer DEFAULT 200)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare result jsonb;
begin
  if public.app_role() is distinct from 'SUPER_ADMIN' then
    raise exception 'Only a Super Admin can read the activity audit.';
  end if;
  p_days := least(greatest(coalesce(p_days,90),1),730);
  p_limit := least(greatest(coalesce(p_limit,200),1),500);
  if to_regclass('public.slfa_activity_audit') is null then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'at',a.occurred_at,
    'area','Record activity · '||a.table_name,
    'actor',coalesce(nullif(p.full_name,''),nullif(p.email,''),a.actor_role,'Unknown'),
    'action',a.operation,
    'summary',coalesce('Record '||a.row_id,'Record change'),
    'reason',null
  ) order by a.occurred_at desc),'[]'::jsonb)
  into result
  from (
    select * from public.slfa_activity_audit
    where occurred_at >= now()-make_interval(days=>p_days)
    order by occurred_at desc limit p_limit
  ) a
  left join public.user_profiles p on p.id=a.actor_id;
  return result;
end $function$
;

CREATE OR REPLACE FUNCTION public.admin_audit_feed(p_days integer DEFAULT 90, p_limit integer DEFAULT 200)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare result jsonb;
begin
  if app_role() <> 'SUPER_ADMIN' then
    raise exception 'Only a Super Admin can read the audit log.';
  end if;
  p_days := least(greatest(coalesce(p_days, 90), 1), 730);
  p_limit := least(greatest(coalesce(p_limit, 200), 1), 500);

  with feed as (
    select m.occurred_at as at, 'Match records' as area, coalesce(m.actor_name, 'Unknown') as actor,
           m.action as action, coalesce(m.table_name, '') || coalesce(' · match ' || m.match_id, '') as summary, m.reason as reason
      from public.match_audit_log m
     where m.occurred_at >= now() - make_interval(days => p_days)
    union all
    select r.changed_at, 'Match results', coalesce(u.full_name, 'Unknown'), r.action,
           'Match ' || r.match_id || ': ' || coalesce(r.old_home::text, '–') || '–' || coalesce(r.old_away::text, '–')
             || ' to ' || coalesce(r.new_home::text, '–') || '–' || coalesce(r.new_away::text, '–'), r.reason
      from public.match_result_changes r left join public.user_profiles u on u.id = r.changed_by
     where r.changed_at >= now() - make_interval(days => p_days)
    union all
    select s.changed_at, 'Account status', coalesce(u.full_name, 'Unknown'), 'Status changed',
           coalesce(s.user_email, '') || ': ' || coalesce(s.previous_status, '–') || ' to ' || coalesce(s.new_status, '–'), s.reason
      from public.account_status_log s left join public.user_profiles u on u.id = s.changed_by
     where s.changed_at >= now() - make_interval(days => p_days)
    union all
    select c.changed_at, 'Staff roles', coalesce(u.full_name, 'Unknown'), 'Role changed',
           coalesce(c.user_email, '') || ': ' || coalesce(c.previous_role, '–') || ' to ' || coalesce(c.new_role, '–'), c.reason
      from public.role_change_log c left join public.user_profiles u on u.id = c.changed_by
     where c.changed_at >= now() - make_interval(days => p_days)
    union all
    select p.changed_at, 'League pause', coalesce(u.full_name, 'Unknown'), case when p.paused then 'Paused' else 'Resumed' end,
           'League operations', p.reason
      from public.system_pause_log p left join public.user_profiles u on u.id = p.changed_by
     where p.changed_at >= now() - make_interval(days => p_days)
    union all
    select k.removed_at, 'Account clean-up', coalesce(u.full_name, 'Unknown'), 'Account removed',
           coalesce(k.removed_email, '') || coalesce(' (' || k.removed_full_name || ')', ''), k.reason
      from public.account_cleanup_log k left join public.user_profiles u on u.id = k.removed_by
     where k.removed_at >= now() - make_interval(days => p_days)
    union all
    select v.occurred_at, 'League verification', coalesce(u.full_name, 'Unknown'), 'Status changed',
           coalesce(v.old_status, '–') || ' to ' || coalesce(v.new_status, '–'), v.notes
      from public.league_verification_audit v left join public.user_profiles u on u.id = v.actor_id
     where v.occurred_at >= now() - make_interval(days => p_days)
    union all
    select a.created_at, 'Club profile changes', coalesce(u.full_name, 'Unknown'), a.action,
           'Club profile request ' || coalesce(a.request_id::text, ''), null
      from public.club_profile_change_audit a left join public.user_profiles u on u.id = a.actor_id
     where a.created_at >= now() - make_interval(days => p_days)
    union all
    select e.created_at, 'Downloads', coalesce(u.full_name, 'Unknown'), 'Downloaded',
           e.export_name, null
      from public.export_audit e left join public.user_profiles u on u.id = e.user_id
     where e.created_at >= now() - make_interval(days => p_days)
  )
  select coalesce(jsonb_agg(jsonb_build_object('at', at, 'area', area, 'actor', actor, 'action', action,
           'summary', summary, 'reason', reason) order by at desc), '[]'::jsonb)
    into result
    from (select * from feed order by at desc limit p_limit) f;
  return result;
end
$function$
;

CREATE OR REPLACE FUNCTION public.admin_player_reports()
 RETURNS TABLE(id uuid, player_name text, club_id uuid, category text, description text, status text, club_response text, created_at timestamp with time zone, shared_at timestamp with time zone, club_responded_at timestamp with time zone, closed_at timestamp with time zone, outcome text, admin_notes text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if app_role() <> 'SUPER_ADMIN' then
    raise exception 'Only the Super Admin or Developer can review player reports.';
  end if;
  return query
    select r.id, r.player_name, r.club_id, r.category, r.description, r.status, r.club_response,
      r.created_at, r.shared_at, r.club_responded_at, r.closed_at, r.outcome, r.admin_notes
    from player_reports r
    order by r.created_at desc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_season(p_name text, p_start date, p_end date)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare new_id bigint;
begin
  if app_role() <> 'SUPER_ADMIN' then
    raise exception 'Only a Super Admin can add a season.';
  end if;
  if char_length(trim(coalesce(p_name, ''))) not between 4 and 20 then
    raise exception 'Enter a season name such as 2025/26.';
  end if;
  if p_start is null or p_end is null or p_end < p_start then
    raise exception 'Check the season dates.';
  end if;
  insert into public.seasons (name, start_date, end_date, is_current)
    values (trim(p_name), p_start, p_end, false)
    returning id into new_id;
  return new_id;
end
$function$
;

CREATE OR REPLACE FUNCTION public.disciplinary_decide(p_player_id bigint, p_action text, p_amount numeric, p_reason text, p_matches integer, p_match_id bigint, p_publish boolean)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id bigint;
begin
  if app_role() not in ('DISCIPLINARY_OFFICER','SUPER_ADMIN') then raise exception 'Only disciplinary officers can record decisions.'; end if;
  if p_action not in ('FINE','PROTEST','BAN','RULING','NOTE') then raise exception 'Unknown decision type.'; end if;
  if p_reason is null or length(btrim(p_reason)) < 5 then raise exception 'Give a reason of at least 5 characters.'; end if;
  if p_action = 'FINE' and (p_amount is null or p_amount <= 0) then raise exception 'Enter the fine amount.'; end if;
  if p_action = 'BAN' and (p_matches is null or p_matches < 1) then raise exception 'Enter how many matches the ban lasts.'; end if;
  if not exists (select 1 from public.club_squad where id = p_player_id) then raise exception 'Player not found.'; end if;
  insert into public.disciplinary_actions (player_id, action_type, amount, reason, match_id, published)
  values (p_player_id, p_action, case when p_action = 'FINE' then p_amount else null end, btrim(p_reason), p_match_id, coalesce(p_publish, true))
  returning id into v_id;
  if p_action = 'BAN' then
    insert into public.suspensions (player_id, reason, matches_total) values (p_player_id, 'OFFICIAL_RULING', p_matches);
  end if;
  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.export_data(p_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  result jsonb := '{}'::jsonb;
  piece jsonb;
  tbl text;
  backup_tables text[] := array[
    'account_cleanup_log','account_status_log','app_settings','application_control','clean_sheets','club_alerts',
    'club_announcements','club_profile_change_audit','club_profile_change_requests','club_registration_applications',
    'club_squad','competition_rules','disciplinary_actions','disciplinary_rules','email_outbox','fan_reports',
    'fm_activity','fm_admins','fm_events','fm_fixtures','fm_leagues','fm_players','fm_system','fm_teams',
    'league_alerts','league_board_members','league_clubs','league_role_responsibilities','league_standings',
    'league_verification_audit','league_verification_requests','leagues','man_of_the_match','match_audit_log',
    'match_comments','match_disputes','match_events','match_lineups','match_predictions','match_referee_assignments',
    'match_result_changes','match_results','match_team_sheets','matches','media_posts','motm_awards','my_favorite_clubs',
    'player_registration_history','player_reports','player_suspension_flags',
    'player_transfer_requests','poll_options','poll_votes','polls','public_squad_photos','referee_offline_submissions',
    'role_access_requests','role_change_log','role_invitations','seasons','squad_transfers','suspension_rules',
    'suspensions','system_pause','system_pause_log','top_assists','top_scorers','user_favorite_clubs','user_profiles'
  ];
begin
  if app_role() <> 'SUPER_ADMIN' then
    raise exception 'Only the Super Admin can download data';
  end if;

  insert into public.export_audit (user_id, export_name) values (auth.uid(), p_name);

  if p_name = 'matches' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.match_date), '[]'::jsonb) into result from (
      select id, match_date, venue, home_team, away_team, home_score, away_score, match_status from public.matches
    ) x;
  elsif p_name = 'standings' then
    select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into result from public.league_standings x;
  elsif p_name = 'suspensions' then
    select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into result from (
      select s.id, sq.player_name, lc.club_name, s.reason, s.matches_total, s.matches_served,
             (s.matches_total - s.matches_served) as matches_left, s.status, s.created_at
      from public.suspensions s
      left join public.club_squad sq on sq.id = s.player_id
      left join public.league_clubs lc on lc.id = sq.club_id
    ) x;
  elsif p_name = 'full_backup' then
    foreach tbl in array backup_tables loop
      execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t', tbl) into piece;
      result := result || jsonb_build_object(tbl, piece);
    end loop;
    result := jsonb_build_object('exported_at', now(), 'tables', result);
  else
    raise exception 'Unknown export';
  end if;
  return result;
end $function$
;

CREATE OR REPLACE FUNCTION public.guard_media_post_publication()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role text;
BEGIN
  -- Permit trusted backend/service-role maintenance. Anonymous and normal
  -- authenticated sessions must pass the user_profiles role check.
  IF coalesce(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF upper(coalesce(NEW.status::text, '')) = 'PUBLISHED' THEN
    SELECT upper(coalesce(system_role, ''))
      INTO v_role
      FROM public.user_profiles
     WHERE id = auth.uid()
       AND lower(coalesce(status, '')) = 'active';

    IF coalesce(v_role, '') <> 'SUPER_ADMIN' THEN
      RAISE EXCEPTION 'Only an active Super Admin or Developer can publish league news. Submit the post for approval.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.match_audit_entries(p_match_id text DEFAULT NULL::text, p_limit integer DEFAULT 300)
 RETURNS TABLE(id bigint, occurred_at timestamp with time zone, actor_name text, actor_role text, table_name text, action text, record_id text, match_id text, reason text, old_data jsonb, new_data jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if app_role() <> 'SUPER_ADMIN' then
    raise exception 'Only the Super Admin and Developer can view the match audit trail.';
  end if;
  return query
    select l.id, l.occurred_at, l.actor_name, l.actor_role, l.table_name, l.action, l.record_id, l.match_id, l.reason, l.old_data, l.new_data
    from public.match_audit_log l
    where p_match_id is null or l.match_id = p_match_id
    order by l.occurred_at desc, l.id desc
    limit least(greatest(p_limit, 1), 1000);
end $function$
;

CREATE OR REPLACE FUNCTION public.match_audit_trail(p_match_id text DEFAULT NULL::text, p_limit integer DEFAULT 300)
 RETURNS TABLE(occurred_at timestamp with time zone, actor_name text, actor_role text, table_name text, action text, record_id text, match_id text, reason text, old_data jsonb, new_data jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if app_role() <> 'SUPER_ADMIN' then
    raise exception 'Only the Super Admin and Developer can view the match audit trail.';
  end if;
  return query
    select l.occurred_at, l.actor_name, l.actor_role, l.table_name, l.action, l.record_id, l.match_id, l.reason, l.old_data, l.new_data
    from public.match_audit_log l
    where p_match_id is null or l.match_id = p_match_id
    order by l.occurred_at desc, l.id desc
    limit least(greatest(p_limit, 1), 1000);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.overturn_suspension(p_id bigint, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare s public.suspensions%rowtype;
begin
  if app_role() not in ('DISCIPLINARY_OFFICER','SUPER_ADMIN') then raise exception 'Only disciplinary officers can overturn a suspension.'; end if;
  if p_reason is null or length(btrim(p_reason)) < 5 then raise exception 'Give a reason of at least 5 characters.'; end if;
  select * into s from public.suspensions where id = p_id;
  if not found or s.status <> 'ACTIVE' then raise exception 'This suspension is not active.'; end if;
  update public.suspensions set status = 'OVERTURNED' where id = p_id;
  insert into public.disciplinary_actions (player_id, action_type, reason, published)
  values (s.player_id, 'RULING', 'Suspension overturned: ' || btrim(p_reason), true);
end $function$
;

CREATE OR REPLACE FUNCTION public.reverse_audit_change(p_audit_id bigint, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  e public.match_audit_log%rowtype;
  cur jsonb;
  cols text;
begin
  if public.app_role() <> 'SUPER_ADMIN' then
    raise exception 'Only the Super Admin can reverse a change.';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 5 then
    raise exception 'Give a reason for reversing this change. It is kept in the audit trail.';
  end if;

  select * into e from public.match_audit_log where id = p_audit_id;
  if not found then raise exception 'That audit entry was not found.'; end if;
  if e.action <> 'UPDATE' then
    raise exception 'Only a changed record can be reversed here.';
  end if;
  if e.table_name not in ('matches', 'match_results', 'match_events', 'man_of_the_match', 'match_referee_assignments') then
    raise exception 'This kind of record cannot be reversed here.';
  end if;

  execute format('select to_jsonb(t) - ''change_reason'' from public.%I t where t.id::text = $1', e.table_name)
    into cur using e.record_id;
  if cur is null then raise exception 'The record no longer exists.'; end if;
  if cur is distinct from (e.new_data - 'change_reason') then
    raise exception 'This record has changed since this entry. Reverse the later change first.';
  end if;

  select string_agg(format('%I = s.%I', c.column_name, c.column_name), ', ') into cols
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = e.table_name
    and c.column_name not in ('id', 'change_reason');

  execute format(
    'update public.%I as t set %s, change_reason = $2 from jsonb_populate_record(null::public.%I, $1) as s where t.id::text = $3',
    e.table_name, cols, e.table_name)
    using (e.old_data - 'change_reason'), p_reason, e.record_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.reverse_match_event(p_event_id bigint, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare e public.match_events%rowtype; v_name text; v_role text;
begin
  if public.is_match_commissioner_user() then raise exception 'Match Commissioners cannot reverse referee match events.'; end if;
  if p_reason is null or length(btrim(p_reason)) < 5 then
    raise exception 'Give a reason of at least 5 characters. It is kept in the log.';
  end if;
  select * into e from public.match_events where id = p_event_id;
  if not found then raise exception 'Event not found.'; end if;
  if app_role() = 'SUPER_ADMIN' then null;
  elsif app_role() = 'REFEREE' and exists (
    select 1 from public.match_referee_assignments a
    where a.referee_user_id = auth.uid() and a.match_id::text = e.match_id
      and a.assignment_status = 'ACTIVE' and a.official_role = 'MAIN'
  ) then null;
  else raise exception 'You cannot reverse this event.'; end if;
  select full_name, system_role into v_name, v_role from public.user_profiles where id = auth.uid();
  insert into public.match_audit_log (actor_id, actor_name, actor_role, table_name, record_id, match_id, action, reason, old_data)
  values (auth.uid(), v_name, v_role, 'match_events', e.id::text, e.match_id, 'REVERSED', btrim(p_reason), to_jsonb(e));
  delete from public.match_events where id = p_event_id;
end
$function$
;

CREATE OR REPLACE FUNCTION public.review_media_post(p_id uuid, p_approve boolean, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if app_role() <> 'SUPER_ADMIN' then raise exception 'Only the Super Admin can review media posts.'; end if;
  if p_approve then
    update public.media_posts
       set status = 'PUBLISHED', published_at = now(), reviewed_by = auth.uid(), reviewed_at = now(), review_note = null, updated_at = now()
     where id = p_id and status = 'SUBMITTED';
  else
    if nullif(btrim(coalesce(p_note, '')), '') is null then raise exception 'Give the reason for returning the post.'; end if;
    update public.media_posts
       set status = 'RETURNED', review_note = btrim(p_note), reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
     where id = p_id and status = 'SUBMITTED';
  end if;
  if not found then raise exception 'This post is not awaiting approval.'; end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_account_status(p_user uuid, p_status text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
v_email text;
v_role text;
BEGIN
IF auth.uid() IS NULL OR app_role() <> 'DEVELOPER' THEN
RAISE EXCEPTION 'Only the Developer can manage account status.';
END IF;

IF p_user = auth.uid() THEN
RAISE EXCEPTION 'You cannot suspend your own account.';
END IF;

IF p_status NOT IN ('Active', 'Suspended') THEN
RAISE EXCEPTION 'Invalid account status.';
END IF;

SELECT email, system_role
INTO v_email, v_role
FROM public.user_profiles
WHERE id = p_user
FOR UPDATE;

IF NOT FOUND THEN
RAISE EXCEPTION 'Account not found.';
END IF;

IF upper(v_role) = 'DEVELOPER' THEN
RAISE EXCEPTION 'Developer accounts cannot be suspended here.';
END IF;

UPDATE public.user_profiles
SET status = p_status
WHERE id = p_user;

INSERT INTO public.role_change_log
(user_id, user_email, previous_role, new_role, reason, changed_by)
VALUES
(p_user, v_email, v_role, v_role || ' / ' || p_status,
'Developer account status update', auth.uid());

RETURN 'Account status updated.';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_account_status(p_user uuid, p_status text, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  caller_role text;
  target public.user_profiles%rowtype;
begin
  caller_role := public.app_role();
  if caller_role <> 'DEVELOPER' then
    raise exception 'Only the Developer or Super Admin can change account status.';
  end if;
  if p_status not in ('Active', 'Suspended') then
    raise exception 'Status must be Active or Suspended.';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 5 then
    raise exception 'Give a reason of at least 5 characters. It is kept in the log.';
  end if;
  if p_user = auth.uid() then
    raise exception 'You cannot change your own account status.';
  end if;

  select * into target from public.user_profiles where id = p_user;
  if not found then
    raise exception 'Account not found.';
  end if;
  if target.system_role = 'DEVELOPER' then
    raise exception 'The Developer account cannot be suspended.';
  end if;
  if caller_role = 'SUPER_ADMIN' and target.system_role = 'SUPER_ADMIN' then
    raise exception 'A Super Admin cannot change another Super Admin.';
  end if;

  update public.user_profiles set status = p_status where id = p_user;

  insert into public.account_status_log (user_id, user_email, previous_status, new_status, reason, changed_by)
  values (p_user, target.email, target.status, p_status, btrim(p_reason), auth.uid());
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_current_season(p_season_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare lg record;
begin
  if app_role() <> 'SUPER_ADMIN' then
    raise exception 'Only a Super Admin can change the current season.';
  end if;
  if not exists (select 1 from public.seasons where id = p_season_id) then
    raise exception 'That season does not exist.';
  end if;
  update public.seasons set is_current = false where is_current;
  update public.seasons set is_current = true where id = p_season_id;
  for lg in select id from public.leagues loop
    perform public.refresh_league_standings(lg.id);
  end loop;
  perform public.recalculate_match_scorers();
end
$function$
;

CREATE OR REPLACE FUNCTION public.set_match_goalkeepers(p_match_id bigint, p_home_gk text, p_away_gk text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare m record; v_uid uuid := auth.uid();
begin
  if not (
    app_role() = 'SUPER_ADMIN' or
    (app_role() = 'REFEREE' and exists (
      select 1 from public.match_referee_assignments a
      where a.referee_user_id = v_uid and a.match_id = p_match_id
        and a.assignment_status = 'ACTIVE' and a.official_role = 'MAIN'))
  ) then
    raise exception 'Only the Super Admin or this match''s assigned referee can set the starting goalkeepers.';
  end if;

  select id, home_team, away_team into m from public.matches where id = p_match_id;
  if not found then raise exception 'Match not found.'; end if;

  if nullif(trim(coalesce(p_home_gk, '')), '') is not null then
    insert into public.match_goalkeepers (match_id, team_name, player_name, set_by)
    values (p_match_id, m.home_team, trim(p_home_gk), v_uid)
    on conflict (match_id, team_name) do update set player_name = excluded.player_name, set_by = excluded.set_by, set_at = now();
  end if;
  if nullif(trim(coalesce(p_away_gk, '')), '') is not null then
    insert into public.match_goalkeepers (match_id, team_name, player_name, set_by)
    values (p_match_id, m.away_team, trim(p_away_gk), v_uid)
    on conflict (match_id, team_name) do update set player_name = excluded.player_name, set_by = excluded.set_by, set_at = now();
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_match_motm(p_match_id bigint, p_player_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare m public.matches%rowtype; s public.club_squad%rowtype; v_role text := coalesce(app_role(), '');
begin
  if public.is_match_commissioner_user() then raise exception 'Match Commissioners cannot select Man of the Match.'; end if;
  select * into m from public.matches where id = p_match_id;
  if not found then raise exception 'Match not found.'; end if;
  if v_role = 'REFEREE' then
    if not exists (select 1 from public.match_referee_assignments a where a.referee_user_id = auth.uid()
      and a.match_id = p_match_id and a.assignment_status = 'ACTIVE' and a.official_role = 'MAIN') then
      raise exception 'You are not the main referee for this match.';
    end if;
  elsif v_role <> 'SUPER_ADMIN' then
    raise exception 'Only the match referee or a Super Admin can choose the Man of the Match.';
  end if;
  if p_player_id is null then
    update public.matches set motm_player_id=null, motm_name=null, motm_jersey_number=null, motm_photo_url=null,
      change_reason='Man of the Match cleared'
    where id=p_match_id; return;
  end if;
  select * into s from public.club_squad where id=p_player_id;
  if not found then raise exception 'Player not found.'; end if;
  if not exists (select 1 from public.league_clubs lc where lc.id=s.club_id and lc.club_name in (m.home_team,m.away_team)) then
    raise exception 'That player is not in either club for this match.';
  end if;
  update public.matches set motm_player_id=s.id, motm_name=s.player_name, motm_jersey_number=s.jersey_number,
    motm_photo_url=s.photo_url, change_reason='Man of the Match: ' || s.player_name where id=p_match_id;
end
$function$
;

CREATE OR REPLACE FUNCTION public.set_media_team_role(p_user uuid, p_team_role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if app_role() <> 'SUPER_ADMIN' then raise exception 'Only the Super Admin can set media team roles.'; end if;
  if p_team_role is not null and p_team_role not in ('MEDIA_LEAD','MEDIA_OFFICER','MEDIA_PHOTOGRAPHER') then
    raise exception 'Unknown media team role.';
  end if;
  update public.user_profiles set media_team_role = p_team_role
   where id = p_user and system_role = 'MEDIA_OFFICER';
  if not found then raise exception 'Give this person the Media Officer account role first.'; end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.submit_media_post(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_team text;
begin
  if app_role() <> 'MEDIA_OFFICER' then raise exception 'Only media team members can submit posts.'; end if;
  select media_team_role into v_team from public.user_profiles where id = auth.uid();
  update public.media_posts
     set status = 'SUBMITTED', submitted_at = now(), review_note = null, updated_at = now()
   where id = p_id and status in ('DRAFT','RETURNED')
     and (created_by = auth.uid() or v_team = 'MEDIA_LEAD');
  if not found then raise exception 'This post cannot be submitted. It is already submitted, or it is not in your team.'; end if;
end;
$function$
;

-- Match events: public viewers see published events only.
drop policy if exists "public read" on public.match_events;
drop policy if exists "staff read all events" on public.match_events;
drop policy if exists "events insert" on public.match_events;
drop policy if exists "events delete" on public.match_events;

create policy "Super Admin reads all match events"
on public.match_events for select to authenticated
using (public.app_role() = 'SUPER_ADMIN');

create policy "Assigned referees read match events"
on public.match_events for select to authenticated
using (
  public.app_role() = 'REFEREE'
  and not public.is_match_commissioner_user()
  and exists (
    select 1 from public.match_referee_assignments ra
    where ra.referee_user_id = auth.uid()
      and ra.assignment_status = 'ACTIVE'
      and ra.match_id::text = match_events.match_id
  )
);

create policy "Assigned referees insert match events"
on public.match_events for insert to authenticated
with check (
  public.app_role() = 'REFEREE'
  and not public.is_match_commissioner_user()
  and exists (
    select 1 from public.match_referee_assignments ra
    where ra.referee_user_id = auth.uid()
      and ra.assignment_status = 'ACTIVE'
      and ra.official_role in ('MAIN','ASSISTANT')
      and ra.match_id::text = match_events.match_id
  )
);

-- Match Commissioner reports remain assigned to their Commissioner and Super Admin oversight.
drop policy if exists mc_reports_admin_update on public.match_commissioner_reports;
create policy mc_reports_admin_update
on public.match_commissioner_reports for update to authenticated
using (public.app_role() = 'SUPER_ADMIN')
with check (public.app_role() = 'SUPER_ADMIN');

drop policy if exists mc_reports_select_own_or_admin on public.match_commissioner_reports;
create policy mc_reports_select_own_or_admin
on public.match_commissioner_reports for select to authenticated
using (commissioner_user_id = auth.uid() or public.app_role() = 'SUPER_ADMIN');

-- Disciplinary details are limited to the authorised tribunal and Super Admin.
drop policy if exists "published actions public read" on public.disciplinary_actions;
create policy "published actions public read"
on public.disciplinary_actions for select to anon, authenticated
using (published or public.app_role() in ('DISCIPLINARY_OFFICER','SUPER_ADMIN'));

drop policy if exists "suspensions public read" on public.suspensions;
create policy "suspensions public read"
on public.suspensions for select to anon, authenticated
using (status = 'ACTIVE' or public.app_role() in ('DISCIPLINARY_OFFICER','SUPER_ADMIN'));

-- Match disputes are not part of the agreed product scope.
drop policy if exists "dispute read league" on public.match_disputes;
drop policy if exists "dispute read own club" on public.match_disputes;
revoke all on table public.match_disputes from public, anon, authenticated;
revoke all on function public.decide_match_dispute(bigint, text, text) from public, anon, authenticated;

-- Retire unused player-review and legacy referee-result endpoints.
revoke all on function public.admin_player_reports() from public, anon, authenticated;
revoke all on function public.referee_submit_match_result(bigint, integer, integer) from public, anon, authenticated;
revoke all on function public.set_global_system_pause(boolean, text) from public, anon, authenticated;

-- Match audit tools and media team role helper have no Developer-facing UI.
revoke all on function public.set_media_team_role(uuid, text) from public, anon, authenticated;
revoke all on function public.match_audit_entries(text, integer) from public, anon, authenticated;
revoke all on function public.match_audit_trail(text, integer) from public, anon, authenticated;
revoke all on function public.reverse_audit_change(bigint, text) from public, anon, authenticated;

-- Public and signed-in clients receive only roster fields used by the public football pages.
revoke select on table public.club_squad from anon, authenticated;
revoke select (player_nin, date_of_birth, fifa_connect_id, nationality, created_by, created_at)
on table public.club_squad from anon, authenticated;
grant select (id, player_name, position, status, photo_url, club_id, jersey_number, season_id, registration_status)
on table public.club_squad to anon, authenticated;

-- Privileged staff RPCs must not be callable by anonymous users.
revoke all on function public.admin_audit_feed(integer, integer) from public, anon;
grant execute on function public.admin_audit_feed(integer, integer) to authenticated;
revoke all on function public.admin_activity_audit_feed(integer, integer) from public, anon;
grant execute on function public.admin_activity_audit_feed(integer, integer) to authenticated;
revoke all on function public.admin_player_reports() from public, anon;
grant execute on function public.admin_player_reports() to authenticated;
revoke all on function public.create_season(text, date, date) from public, anon;
grant execute on function public.create_season(text, date, date) to authenticated;
revoke all on function public.disciplinary_decide(bigint, text, numeric, text, integer, bigint, boolean) from public, anon;
grant execute on function public.disciplinary_decide(bigint, text, numeric, text, integer, bigint, boolean) to authenticated;
revoke all on function public.export_data(text) from public, anon;
grant execute on function public.export_data(text) to authenticated;
revoke all on function public.overturn_suspension(bigint, text) from public, anon;
grant execute on function public.overturn_suspension(bigint, text) to authenticated;
revoke all on function public.reverse_match_event(bigint, text) from public, anon;
grant execute on function public.reverse_match_event(bigint, text) to authenticated;
revoke all on function public.review_media_post(uuid, boolean, text) from public, anon;
grant execute on function public.review_media_post(uuid, boolean, text) to authenticated;
revoke all on function public.set_current_season(bigint) from public, anon;
grant execute on function public.set_current_season(bigint) to authenticated;
revoke all on function public.set_match_goalkeepers(bigint, text, text) from public, anon;
grant execute on function public.set_match_goalkeepers(bigint, text, text) to authenticated;
revoke all on function public.set_match_motm(bigint, bigint) from public, anon;
grant execute on function public.set_match_motm(bigint, bigint) to authenticated;
revoke all on function public.submit_media_post(uuid) from public, anon;
grant execute on function public.submit_media_post(uuid) to authenticated;
revoke all on function public.set_account_status(uuid, text, text) from public, anon;
grant execute on function public.set_account_status(uuid, text, text) to authenticated;

