-- Goals and assists per season. The live top scorers and playmakers count only the current season.

create or replace function public.recalculate_match_scorers()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  drop table if exists _sc_photos;
  create temp table _sc_photos as
    select lower(trim(player)) as lp, photo_url
    from public.top_scorers where photo_url is not null;

  drop table if exists _as_photos;
  create temp table _as_photos as
    select lower(trim(player)) as lp, photo_url
    from public.top_assists where photo_url is not null;

  delete from public.top_scorers;
  insert into public.top_scorers (player, club, goals, photo_url, updated_at)
  select g.player, g.club, g.goals, (select p.photo_url from _sc_photos p where p.lp = lower(g.player) limit 1), now()
  from (
    select trim(e.player_name) as player,
           (array_agg(trim(e.team_name) order by e.created_at desc))[1] as club,
           count(*)::integer as goals
    from public.match_events e
    join public.matches m on m.id::text = e.match_id
    where e.event_type = 'GOAL' and nullif(trim(e.player_name), '') is not null
      and public.match_season(m.season_id, m.match_date) is not distinct from (select id from public.seasons where is_current limit 1)
    group by trim(e.player_name)
  ) g;

  delete from public.top_assists;
  insert into public.top_assists (player, club, assists, photo_url, updated_at)
  select a.player, a.club, a.assists, (select p.photo_url from _as_photos p where p.lp = lower(a.player) limit 1), now()
  from (
    select trim(e.assist_player_name) as player,
           (array_agg(trim(e.team_name) order by e.created_at desc))[1] as club,
           count(*)::integer as assists
    from public.match_events e
    join public.matches m on m.id::text = e.match_id
    where e.event_type = 'GOAL' and nullif(trim(e.assist_player_name), '') is not null
      and public.match_season(m.season_id, m.match_date) is not distinct from (select id from public.seasons where is_current limit 1)
    group by trim(e.assist_player_name)
  ) a;

  drop table if exists _sc_photos;
  drop table if exists _as_photos;
end
$$;

-- Goals and assists for any season, read-only, for the fan pages.
create or replace function public.season_player_stats(p_season_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'scorers', coalesce((
      select jsonb_agg(jsonb_build_object('player', g.player, 'club', g.club, 'goals', g.goals) order by g.goals desc, g.player)
      from (
        select trim(e.player_name) as player,
               (array_agg(trim(e.team_name) order by e.created_at desc))[1] as club,
               count(*)::integer as goals
        from public.match_events e
        join public.matches m on m.id::text = e.match_id
        where e.event_type = 'GOAL' and nullif(trim(e.player_name), '') is not null
          and public.match_season(m.season_id, m.match_date) = p_season_id
        group by trim(e.player_name)
        order by count(*) desc
        limit 200
      ) g), '[]'::jsonb),
    'assists', coalesce((
      select jsonb_agg(jsonb_build_object('player', a.player, 'club', a.club, 'assists', a.assists) order by a.assists desc, a.player)
      from (
        select trim(e.assist_player_name) as player,
               (array_agg(trim(e.team_name) order by e.created_at desc))[1] as club,
               count(*)::integer as assists
        from public.match_events e
        join public.matches m on m.id::text = e.match_id
        where e.event_type = 'GOAL' and nullif(trim(e.assist_player_name), '') is not null
          and public.match_season(m.season_id, m.match_date) = p_season_id
        group by trim(e.assist_player_name)
        order by count(*) desc
        limit 200
      ) a), '[]'::jsonb)
  )
$$;

-- Changing the current season also refreshes the live scorers and playmakers.
create or replace function public.set_current_season(p_season_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare lg record;
begin
  if app_role() is distinct from 'SUPER_ADMIN' then
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
$$;

revoke all on function public.season_player_stats(bigint) from public;
grant execute on function public.season_player_stats(bigint) to anon, authenticated;
grant execute on function public.set_current_season(bigint) to authenticated;
