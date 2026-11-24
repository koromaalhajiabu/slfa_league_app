-- Tighten the referee-only result workflow and event write permissions.
-- Drop incorrect "block" policies: permissive RLS policies are OR-combined and
-- therefore these expressions unintentionally granted access to non-Match-Commissioners.

DROP POLICY IF EXISTS mc_block_match_update ON public.matches;
DROP POLICY IF EXISTS mc_block_results_insert ON public.match_results;
DROP POLICY IF EXISTS mc_block_results_update ON public.match_results;
DROP POLICY IF EXISTS mc_block_match_events_insert ON public.match_events;
DROP POLICY IF EXISTS mc_block_match_events_update ON public.match_events;
DROP POLICY IF EXISTS mc_block_match_events_delete ON public.match_events;
DROP POLICY IF EXISTS mc_block_motm_insert ON public.man_of_the_match;
DROP POLICY IF EXISTS mc_block_motm_update ON public.man_of_the_match;
DROP POLICY IF EXISTS mc_block_motm_delete ON public.man_of_the_match;

-- Match metadata and match clock fields remain editable according to existing RLS.
-- Score columns are not directly writable by authenticated clients.
REVOKE UPDATE ON TABLE public.matches FROM authenticated;
REVOKE UPDATE (home_score, away_score) ON TABLE public.matches FROM authenticated;
GRANT UPDATE (
  league_id, season_id, home_team, away_team, match_date, venue,
  match_status, match_minute, status_reason, status_set_at, status_set_by
) ON TABLE public.matches TO authenticated;

-- Official results may only be created or changed through the secured referee RPCs.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.match_results FROM PUBLIC, anon, authenticated;

-- On-field referees may submit events only for their active assignments.
DROP POLICY IF EXISTS "Assigned referees insert match events" ON public.match_events;
DROP POLICY IF EXISTS "referee edits own match events" ON public.match_events;
DROP POLICY IF EXISTS "referee removes own match events" ON public.match_events;

CREATE POLICY "assigned on-field referees insert own match events"
ON public.match_events FOR INSERT TO authenticated
WITH CHECK (
  public.app_role() = 'REFEREE'
  AND NOT public.is_match_commissioner_user()
  AND recorded_by = ((SELECT auth.uid())::text)
  AND EXISTS (
    SELECT 1
    FROM public.user_profiles up
    JOIN public.match_referee_assignments a ON a.referee_user_id = up.id
    WHERE up.id = (SELECT auth.uid())
      AND up.system_role = 'REFEREE'
      AND lower(coalesce(up.status, '')) = 'active'
      AND a.match_id::text = match_events.match_id
      AND a.assignment_status = 'ACTIVE'
      AND a.official_role IN ('MAIN', 'ASSISTANT')
  )
);

-- Event updates and removals use the audited reverse_match_event RPC.
REVOKE UPDATE, DELETE ON TABLE public.match_events FROM authenticated;

-- The legacy MOTM table is retained for reading, but the active application writes
-- Man of the Match through the guarded set_match_motm RPC.
DROP POLICY IF EXISTS "motm insert" ON public.man_of_the_match;
DROP POLICY IF EXISTS "motm update" ON public.man_of_the_match;
DROP POLICY IF EXISTS "motm delete" ON public.man_of_the_match;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.man_of_the_match FROM PUBLIC, anon, authenticated;

-- Keep match audit triggers satisfied whenever the protected score workflow writes a score.
CREATE OR REPLACE FUNCTION public.apply_match_scores(p_match_id bigint, p_home integer, p_away integer)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_season bigint;
  v_league bigint;
  r_win int;
  r_draw int;
  r_loss int;
  v_reason text;
begin
  perform set_config('app.score_write', 'on', true);
  v_reason := 'Score updated through the assigned-referee result workflow at '
    || to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS.US') || ' UTC';

  update public.matches
     set home_score = p_home,
         away_score = p_away,
         change_reason = v_reason
   where id = p_match_id;
  if not found then raise exception 'Match not found.'; end if;

  select public.match_season(season_id, match_date), league_id
    into v_season, v_league
  from public.matches
  where id = p_match_id;

  if not exists (select 1 from public.seasons where id = v_season and is_current) then
    return;
  end if;

  select points_win, points_draw, points_loss
    into r_win, r_draw, r_loss
  from public.competition_rules
  where season_id = v_season
  limit 1;

  r_win := coalesce(r_win, 3);
  r_draw := coalesce(r_draw, 1);
  r_loss := coalesce(r_loss, 0);

  delete from public.league_standings
  where league_id is not distinct from v_league;

  insert into public.league_standings
    (club, pos, mp, w, d, l, gf, ga, pts, updated_at, league_id)
  select
    club,
    row_number() over (order by pts desc, (gf - ga) desc, gf desc, club) as pos,
    mp, w, d, l, gf, ga, pts, now(), v_league
  from (
    select
      club,
      count(*) as mp,
      sum(case when gf > ga then 1 else 0 end) as w,
      sum(case when gf = ga then 1 else 0 end) as d,
      sum(case when gf < ga then 1 else 0 end) as l,
      sum(gf) as gf,
      sum(ga) as ga,
      sum(case when gf > ga then r_win when gf = ga then r_draw else r_loss end) as pts
    from (
      select home_team as club, home_score as gf, away_score as ga
      from public.matches
      where public.match_season(season_id, match_date) = v_season
        and league_id is not distinct from v_league
        and home_score is not null and away_score is not null
      union all
      select away_team, away_score, home_score
      from public.matches
      where public.match_season(season_id, match_date) = v_season
        and league_id is not distinct from v_league
        and home_score is not null and away_score is not null
    ) t
    group by club
  ) s;
end
$function$;

-- Preserve the provided reason on the event row before deleting it so audit triggers
-- can retain the reason. Access remains limited to Super Admin or the assigned main referee.
CREATE OR REPLACE FUNCTION public.reverse_match_event(p_event_id bigint, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  e public.match_events%rowtype;
  v_name text;
  v_role text;
begin
  if public.is_match_commissioner_user() then
    raise exception 'Match Commissioners cannot reverse referee match events.';
  end if;

  if p_reason is null or length(btrim(p_reason)) < 5 then
    raise exception 'Give a reason of at least 5 characters. It is kept in the log.';
  end if;

  select * into e
  from public.match_events
  where id = p_event_id
  for update;

  if not found then raise exception 'Event not found.'; end if;

  if public.app_role() = 'SUPER_ADMIN' then
    null;
  elsif public.app_role() = 'REFEREE' and exists (
    select 1
    from public.user_profiles up
    join public.match_referee_assignments a on a.referee_user_id = up.id
    where up.id = auth.uid()
      and up.system_role = 'REFEREE'
      and lower(coalesce(up.status, '')) = 'active'
      and a.match_id::text = e.match_id
      and a.assignment_status = 'ACTIVE'
      and a.official_role = 'MAIN'
  ) then
    null;
  else
    raise exception 'You cannot reverse this event.';
  end if;

  select full_name, system_role
    into v_name, v_role
  from public.user_profiles
  where id = auth.uid();

  insert into public.match_audit_log
    (actor_id, actor_name, actor_role, table_name, record_id, match_id, action, reason, old_data)
  values
    (auth.uid(), v_name, v_role, 'match_events', e.id::text, e.match_id, 'REVERSED', btrim(p_reason), to_jsonb(e));

  update public.match_events
     set change_reason = btrim(p_reason)
   where id = p_event_id;

  delete from public.match_events where id = p_event_id;
end
$function$;
