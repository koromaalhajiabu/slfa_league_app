-- Logged result changes and reversals. Applied to the live database as "result_change_and_reversal_with_log".

-- 1. Log of every change or reversal of a result, with the reason
create table if not exists public.match_result_changes (
  id bigserial primary key,
  match_id bigint not null,
  action text not null check (action in ('CHANGED', 'REVERSED')),
  old_home int, old_away int,
  new_home int, new_away int,
  reason text not null check (char_length(trim(reason)) >= 5),
  changed_by uuid not null default auth.uid(),
  changed_by_role text not null,
  changed_at timestamptz not null default now()
);
alter table public.match_result_changes enable row level security;
drop policy if exists "staff read result changes" on public.match_result_changes;
create policy "staff read result changes" on public.match_result_changes for select to authenticated
  using (app_role() = any (array['SUPER_ADMIN'::text, 'DEVELOPER'::text, 'REFEREE'::text]));
revoke all on public.match_result_changes from anon, authenticated;
grant select on public.match_result_changes to authenticated;

-- 2. Referee submission: the score is confirmed at once; a reversed result can be submitted again
create or replace function public.referee_submit_final(p_match_id bigint, p_home integer, p_away integer)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare m public.matches%rowtype;
begin
  if app_role() <> 'REFEREE' then raise exception 'Only a referee or Match Commissioner can submit a final score.'; end if;
  if p_home is null or p_away is null or p_home < 0 or p_away < 0 then raise exception 'Enter both scores as zero or more.'; end if;
  if not exists (select 1 from public.match_referee_assignments a
    where a.referee_user_id = auth.uid() and a.match_id = p_match_id and a.assignment_status = 'ACTIVE' and a.official_role = 'MAIN') then
    raise exception 'You are not the official for this match.';
  end if;
  select * into m from public.matches where id = p_match_id;
  if not found then raise exception 'Match not found.'; end if;
  if exists (select 1 from public.match_results r where r.match_id = p_match_id::text and r.status = 'CONFIRMED') then
    raise exception 'This match already has a confirmed score. Use Change result to correct it.';
  end if;
  perform public.apply_match_scores(p_match_id, p_home, p_away);
  insert into public.match_results (match_id, home_team, away_team, home_goals, away_goals, status, recorded_by, confirmed_by, confirmed_at)
  values (p_match_id::text, m.home_team, m.away_team, p_home, p_away, 'CONFIRMED', auth.uid()::text, auth.uid(), now())
  on conflict (match_id) do update set home_goals = excluded.home_goals, away_goals = excluded.away_goals, status = 'CONFIRMED',
    recorded_by = excluded.recorded_by, confirmed_by = excluded.confirmed_by, confirmed_at = now(), updated_at = now();
  update public.matches set match_status = 'FT', match_minute = null where id = p_match_id;
end
$function$;

-- 3. Change a confirmed result, with a logged reason (referee of the match, or Super Admin)
create or replace function public.change_match_result(p_match_id bigint, p_home integer, p_away integer, p_reason text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_role text := app_role(); v_uid uuid := auth.uid(); r public.match_results%rowtype;
begin
  if v_role not in ('SUPER_ADMIN', 'REFEREE') then raise exception 'Only the Super Admin or the match referee can change a result.'; end if;
  if v_role = 'REFEREE' and not exists (select 1 from public.match_referee_assignments a
    where a.referee_user_id = v_uid and a.match_id = p_match_id and a.assignment_status = 'ACTIVE' and a.official_role = 'MAIN') then
    raise exception 'You are not the official for this match.';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'Give a reason of at least 5 characters.'; end if;
  if p_home is null or p_away is null or p_home < 0 or p_away < 0 or p_home > 30 or p_away > 30 then raise exception 'Enter valid scores between 0 and 30.'; end if;
  select * into r from public.match_results where match_id = p_match_id::text;
  if not found or r.status <> 'CONFIRMED' then raise exception 'This match has no confirmed result to change.'; end if;
  perform public.apply_match_scores(p_match_id, p_home, p_away);
  update public.match_results set home_goals = p_home, away_goals = p_away, confirmed_by = v_uid, confirmed_at = now(), updated_at = now(), change_reason = p_reason where id = r.id;
  insert into public.match_result_changes (match_id, action, old_home, old_away, new_home, new_away, reason, changed_by, changed_by_role)
  values (p_match_id, 'CHANGED', r.home_goals, r.away_goals, p_home, p_away, p_reason, v_uid, v_role);
end
$function$;

-- 4. Reverse a confirmed result, with a logged reason: the match goes back to HALF TIME and the referee can submit again
create or replace function public.reverse_match_result(p_match_id bigint, p_reason text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_role text := app_role(); v_uid uuid := auth.uid(); r public.match_results%rowtype;
begin
  if v_role not in ('SUPER_ADMIN', 'REFEREE') then raise exception 'Only the Super Admin or the match referee can reverse a result.'; end if;
  if v_role = 'REFEREE' and not exists (select 1 from public.match_referee_assignments a
    where a.referee_user_id = v_uid and a.match_id = p_match_id and a.assignment_status = 'ACTIVE' and a.official_role = 'MAIN') then
    raise exception 'You are not the official for this match.';
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

revoke all on function public.change_match_result(bigint, integer, integer, text) from public, anon;
revoke all on function public.reverse_match_result(bigint, text) from public, anon;
grant execute on function public.change_match_result(bigint, integer, integer, text) to authenticated;
grant execute on function public.reverse_match_result(bigint, text) to authenticated;

-- 5. Kick-off alert only on the first start, so reopening a match does not alert all subscribers again
create or replace function public.club_alert_on_match_status()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.match_status = 'LIVE' and old.match_status in ('SCHEDULED', 'RESCHEDULED') then
    perform public.queue_club_alert(new.home_team, new.away_team, new.id,
      'Kick-off: ' || new.home_team || ' v ' || new.away_team,
      new.home_team || ' v ' || new.away_team || ' has just kicked off.');
  elsif new.match_status = 'FT' and old.match_status is distinct from 'FT' then
    perform public.queue_club_alert(new.home_team, new.away_team, new.id,
      'Full time: ' || new.home_team || ' ' || coalesce(new.home_score, 0) || ' – ' || coalesce(new.away_score, 0) || ' ' || new.away_team,
      'Full time: ' || new.home_team || ' ' || coalesce(new.home_score, 0) || ' – ' || coalesce(new.away_score, 0) || ' ' || new.away_team || '.');
  end if;
  return new;
end
$function$;
