-- Explicitly keep Match Commissioner accounts outside referee-only write paths.
-- The helper is invoker-rights and reads only the current user's own profile.
create or replace function public.is_match_commissioner_user()
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1 from public.user_profiles p
    where p.id = auth.uid()
      and p.system_role = 'REFEREE'
      and lower(coalesce(p.official_title,'')) = 'match commissioner'
      and lower(coalesce(p.status,'')) = 'active'
  );
$$;
revoke all on function public.is_match_commissioner_user() from public, anon;
grant execute on function public.is_match_commissioner_user() to authenticated;

drop policy if exists mc_block_match_events_insert on public.match_events;
create policy mc_block_match_events_insert on public.match_events
as restrictive for insert to authenticated
with check (not public.is_match_commissioner_user());

drop policy if exists mc_block_match_events_update on public.match_events;
create policy mc_block_match_events_update on public.match_events
as restrictive for update to authenticated
using (not public.is_match_commissioner_user())
with check (not public.is_match_commissioner_user());

drop policy if exists mc_block_match_events_delete on public.match_events;
create policy mc_block_match_events_delete on public.match_events
as restrictive for delete to authenticated
using (not public.is_match_commissioner_user());

drop policy if exists mc_block_match_update on public.matches;
create policy mc_block_match_update on public.matches
as restrictive for update to authenticated
using (not public.is_match_commissioner_user())
with check (not public.is_match_commissioner_user());

drop policy if exists mc_block_results_insert on public.match_results;
create policy mc_block_results_insert on public.match_results
as restrictive for insert to authenticated
with check (not public.is_match_commissioner_user());

drop policy if exists mc_block_results_update on public.match_results;
create policy mc_block_results_update on public.match_results
as restrictive for update to authenticated
using (not public.is_match_commissioner_user())
with check (not public.is_match_commissioner_user());

drop policy if exists mc_block_motm_insert on public.man_of_the_match;
create policy mc_block_motm_insert on public.man_of_the_match
as restrictive for insert to authenticated
with check (not public.is_match_commissioner_user());

drop policy if exists mc_block_motm_update on public.man_of_the_match;
create policy mc_block_motm_update on public.man_of_the_match
as restrictive for update to authenticated
using (not public.is_match_commissioner_user())
with check (not public.is_match_commissioner_user());

drop policy if exists mc_block_motm_delete on public.man_of_the_match;
create policy mc_block_motm_delete on public.man_of_the_match
as restrictive for delete to authenticated
using (not public.is_match_commissioner_user());

create or replace function public.referee_submit_final(p_match_id bigint, p_home integer, p_away integer)
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare m public.matches%rowtype;
begin
  if app_role() = 'REFEREE' and public.is_match_commissioner_user() then
    raise exception 'Match Commissioners cannot submit or confirm final scores.';
  end if;
  if app_role() not in ('REFEREE','DEVELOPER') then raise exception 'Only a referee can submit a final score.'; end if;
  if p_home is null or p_away is null or p_home < 0 or p_away < 0 then raise exception 'Enter both scores as zero or more.'; end if;
  if app_role() <> 'DEVELOPER' and not exists (
    select 1 from public.match_referee_assignments a
    where a.referee_user_id = auth.uid() and a.match_id = p_match_id
      and a.assignment_status = 'ACTIVE' and a.official_role = 'MAIN'
  ) then raise exception 'You are not the main referee for this match.'; end if;
  select * into m from public.matches where id = p_match_id;
  if not found then raise exception 'Match not found.'; end if;
  if exists (select 1 from public.match_results r where r.match_id = p_match_id::text and r.status = 'CONFIRMED') then
    raise exception 'This match already has a confirmed score. Use Change result to correct it.';
  end if;
  perform public.apply_match_scores(p_match_id, p_home, p_away);
  insert into public.match_results (match_id, home_team, away_team, home_goals, away_goals, status, recorded_by, confirmed_by, confirmed_at)
  values (p_match_id::text, m.home_team, m.away_team, p_home, p_away, 'CONFIRMED', auth.uid()::text, auth.uid(), now())
  on conflict (match_id) do update set home_goals = excluded.home_goals, away_goals = excluded.away_goals,
    status = 'CONFIRMED', recorded_by = excluded.recorded_by, confirmed_by = excluded.confirmed_by,
    confirmed_at = now(), updated_at = now();
  update public.matches set match_status = 'FT', match_minute = null where id = p_match_id;
end
$function$;

create or replace function public.change_match_result(p_match_id bigint, p_home integer, p_away integer, p_reason text)
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare v_role text := app_role(); v_uid uuid := auth.uid(); r public.match_results%rowtype;
begin
  if v_role = 'REFEREE' and public.is_match_commissioner_user() then
    raise exception 'Match Commissioners cannot change confirmed match results.';
  end if;
  if v_role not in ('SUPER_ADMIN', 'REFEREE') then raise exception 'Only the Super Admin or match referee can change a result.'; end if;
  if v_role = 'REFEREE' and not exists (select 1 from public.match_referee_assignments a
    where a.referee_user_id = v_uid and a.match_id = p_match_id and a.assignment_status = 'ACTIVE' and a.official_role = 'MAIN') then
    raise exception 'You are not the main referee for this match.';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'Give a reason of at least 5 characters.'; end if;
  if p_home is null or p_away is null or p_home < 0 or p_away < 0 or p_home > 30 or p_away > 30 then raise exception 'Enter valid scores between 0 and 30.'; end if;
  select * into r from public.match_results where match_id = p_match_id::text;
  if not found or r.status <> 'CONFIRMED' then raise exception 'This match has no confirmed result to change.'; end if;
  perform public.apply_match_scores(p_match_id, p_home, p_away);
  update public.match_results set home_goals = p_home, away_goals = p_away, confirmed_by = v_uid,
    confirmed_at = now(), updated_at = now(), change_reason = p_reason where id = r.id;
  insert into public.match_result_changes (match_id, action, old_home, old_away, new_home, new_away, reason, changed_by, changed_by_role)
  values (p_match_id, 'CHANGED', r.home_goals, r.away_goals, p_home, p_away, p_reason, v_uid, v_role);
end
$function$;

create or replace function public.reverse_match_result(p_match_id bigint, p_reason text)
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare v_role text := app_role(); v_uid uuid := auth.uid(); r public.match_results%rowtype;
begin
  if v_role = 'REFEREE' and public.is_match_commissioner_user() then
    raise exception 'Match Commissioners cannot reverse confirmed match results.';
  end if;
  if v_role not in ('SUPER_ADMIN', 'REFEREE') then raise exception 'Only the Super Admin or match referee can reverse a result.'; end if;
  if v_role = 'REFEREE' and not exists (select 1 from public.match_referee_assignments a
    where a.referee_user_id = v_uid and a.match_id = p_match_id and a.assignment_status = 'ACTIVE' and a.official_role = 'MAIN') then
    raise exception 'You are not the main referee for this match.';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'Give a reason of at least 5 characters.'; end if;
  select * into r from public.match_results where match_id = p_match_id::text;
  if not found or r.status <> 'CONFIRMED' then raise exception 'This match has no confirmed result to reverse.'; end if;
  perform public.apply_match_scores(p_match_id, null, null);
  update public.match_results set status = 'REJECTED', updated_at = now(), change_reason = p_reason where id = r.id;
  update public.matches set match_status = 'HT', match_minute = 45 where id = p_match_id;
  insert into public.match_result_changes (match_id, action, old_home, old_away, new_home, new_away, reason, changed_by, changed_by_role)
  values (p_match_id, 'REVERSED', r.home_goals, r.away_goals, null, null, p_reason, v_uid, v_role);
end
$function$;

create or replace function public.reverse_match_event(p_event_id bigint, p_reason text)
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare e public.match_events%rowtype; v_name text; v_role text;
begin
  if public.is_match_commissioner_user() then raise exception 'Match Commissioners cannot reverse referee match events.'; end if;
  if p_reason is null or length(btrim(p_reason)) < 5 then raise exception 'Give a reason of at least 5 characters. It is kept in the log.'; end if;
  select * into e from public.match_events where id = p_event_id;
  if not found then raise exception 'Event not found.'; end if;
  if app_role() in ('SUPER_ADMIN','DEVELOPER') then null;
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
$function$;

create or replace function public.set_match_motm(p_match_id bigint, p_player_id bigint)
returns void language plpgsql security definer set search_path to 'public'
as $function$
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
  elsif v_role not in ('SUPER_ADMIN','DEVELOPER') then
    raise exception 'Only the match referee or a Super Admin can choose the Man of the Match.';
  end if;
  if p_player_id is null then
    update public.matches set motm_player_id=null,motm_name=null,motm_jersey_number=null,change_reason='Man of the Match cleared'
    where id=p_match_id; return;
  end if;
  select * into s from public.club_squad where id=p_player_id;
  if not found then raise exception 'Player not found.'; end if;
  if not exists (select 1 from public.league_clubs lc where lc.id=s.club_id and lc.club_name in (m.home_team,m.away_team)) then
    raise exception 'That player is not in either club for this match.';
  end if;
  update public.matches set motm_player_id=s.id,motm_name=s.player_name,motm_jersey_number=s.jersey_number,
    change_reason='Man of the Match: ' || s.player_name where id=p_match_id;
end
$function$;

notify pgrst, 'reload schema';
