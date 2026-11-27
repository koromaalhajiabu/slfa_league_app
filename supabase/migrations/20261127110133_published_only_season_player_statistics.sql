CREATE OR REPLACE FUNCTION public.season_player_stats(p_season_id bigint)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
SELECT jsonb_build_object(
 'scorers', coalesce((
   SELECT jsonb_agg(
     jsonb_build_object('player', g.player, 'club', g.club, 'goals', g.goals)
     ORDER BY g.goals DESC, g.player
   )
   FROM (
     SELECT
       trim(e.player_name) AS player,
       (array_agg(trim(e.team_name) ORDER BY e.created_at DESC))[1] AS club,
       count(*)::integer AS goals
     FROM public.match_events e
     JOIN public.matches m ON m.id = e.match_id
     WHERE e.event_type = 'GOAL'
       AND e.published_at IS NOT NULL
       AND nullif(trim(e.player_name), '') IS NOT NULL
       AND public.match_season(m.season_id, m.match_date) = p_season_id
     GROUP BY trim(e.player_name)
     ORDER BY count(*) DESC
     LIMIT 200
   ) g
 ), '[]'::jsonb),
 'assists', coalesce((
   SELECT jsonb_agg(
     jsonb_build_object('player', a.player, 'club', a.club, 'assists', a.assists)
     ORDER BY a.assists DESC, a.player
   )
   FROM (
     SELECT
       trim(e.assist_player_name) AS player,
       (array_agg(trim(e.team_name) ORDER BY e.created_at DESC))[1] AS club,
       count(*)::integer AS assists
     FROM public.match_events e
     JOIN public.matches m ON m.id = e.match_id
     WHERE e.event_type = 'GOAL'
       AND e.published_at IS NOT NULL
       AND nullif(trim(e.assist_player_name), '') IS NOT NULL
       AND public.match_season(m.season_id, m.match_date) = p_season_id
     GROUP BY trim(e.assist_player_name)
     ORDER BY count(*) DESC
     LIMIT 200
   ) a
 ), '[]'::jsonb)
);
$function$;
