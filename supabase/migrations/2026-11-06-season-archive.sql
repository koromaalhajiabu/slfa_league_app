-- Season archive. Past seasons keep their matches and can be viewed publicly.
-- Only the current season updates the live league table (league_standings).

-- The season a match belongs to. Matches saved before seasons were used have no season_id,
-- so they count toward the season their date falls in. No match data is changed.
create or replace function public.match_season(p_season_id bigint, p_date timestamptz)
returns bigint
language sql
stable
as $$
  select coalesce(p_season_id, (
    select s.id from public.seasons s
     where (p_date at time zone 'Africa/Freetown')::date between s.start_date and s.end_date
     order by s.start_date desc limit 1))
$$;

-- Shared club-name rules (Marampa Women's league aliases), used by the live table and past tables.
create or replace function public.league_club_name(p_league_id bigint, p_name text)
returns text
language sql
immutable
as $$
  select case
    when p_league_id = 2 and lower(trim(p_name)) = 'koya queens' then 'Koya Queens FC'
    when p_league_id = 2 and lower(trim(p_name)) = 'kahunla queens' then 'Kahunla Queens FC'
    when p_league_id = 2 and lower(trim(p_name)) = 'ram kamara' then 'RAM Kamara FC'
    when p_league_id = 2 and lower(trim(p_name)) = 'sierra leone police female fc' then 'Sierra Leone Police Female'
    else trim(p_name)
  end
$$;

-- Live table: counts only matches in the current season.
create or replace function public.refresh_league_standings(p_league_id bigint)
returns void
language plpgsql
as $$
BEGIN

    WITH completed_matches AS (
        SELECT
            public.league_club_name(p_league_id, home_team) AS home_club,
            public.league_club_name(p_league_id, away_team) AS away_club,
            home_score,
            away_score

        FROM public.matches
        WHERE league_id = p_league_id
          AND public.match_season(season_id, match_date) IS NOT DISTINCT FROM (SELECT id FROM public.seasons WHERE is_current LIMIT 1)
          AND upper(trim(match_status)) = 'FT'
          AND home_score IS NOT NULL
          AND away_score IS NOT NULL
    ),

    club_results AS (
        SELECT
            home_club AS club,
            1 AS played,
            CASE WHEN home_score > away_score THEN 1 ELSE 0 END AS won,
            CASE WHEN home_score = away_score THEN 1 ELSE 0 END AS drawn,
            CASE WHEN home_score < away_score THEN 1 ELSE 0 END AS lost,
            home_score AS gf,
            away_score AS ga
        FROM completed_matches

        UNION ALL

        SELECT
            away_club AS club,
            1 AS played,
            CASE WHEN away_score > home_score THEN 1 ELSE 0 END AS won,
            CASE WHEN away_score = home_score THEN 1 ELSE 0 END AS drawn,
            CASE WHEN away_score < home_score THEN 1 ELSE 0 END AS lost,
            away_score AS gf,
            home_score AS ga
        FROM completed_matches
    ),

    totals AS (
        SELECT
            club,
            SUM(played)::integer AS mp,
            SUM(won)::integer AS w,
            SUM(drawn)::integer AS d,
            SUM(lost)::integer AS l,
            SUM(gf)::integer AS gf,
            SUM(ga)::integer AS ga,
            (SUM(won) * 3 + SUM(drawn))::integer AS pts
        FROM club_results
        GROUP BY club
    ),

    ranked AS (
        SELECT
            s.id,
            COALESCE(t.mp, 0) AS mp,
            COALESCE(t.w, 0) AS w,
            COALESCE(t.d, 0) AS d,
            COALESCE(t.l, 0) AS l,
            COALESCE(t.gf, 0) AS gf,
            COALESCE(t.ga, 0) AS ga,
            COALESCE(t.pts, 0) AS pts,

            ROW_NUMBER() OVER (
                ORDER BY
                    COALESCE(t.pts, 0) DESC,
                    COALESCE(t.gf, 0) - COALESCE(t.ga, 0) DESC,
                    COALESCE(t.gf, 0) DESC,
                    s.club ASC
            )::integer AS pos

        FROM public.league_standings s
        LEFT JOIN totals t
            ON lower(trim(s.club)) = lower(trim(t.club))
        WHERE s.league_id = p_league_id
    )

    UPDATE public.league_standings s
    SET
        pos = r.pos,
        mp = r.mp,
        w = r.w,
        d = r.d,
        l = r.l,
        gf = r.gf,
        ga = r.ga,
        pts = r.pts,
        updated_at = now()
    FROM ranked r
    WHERE s.id = r.id;

END;
$$;

-- Scores a match. Only the current season rewrites the live table.
create or replace function public.apply_match_scores(p_match_id bigint, p_home integer, p_away integer)
returns void
language plpgsql
as $$
declare v_season bigint; v_league bigint; r_win int; r_draw int; r_loss int;
begin
  perform set_config('app.score_write', 'on', true);
  update public.matches set home_score = p_home, away_score = p_away where id = p_match_id;
  if not found then raise exception 'Match not found.'; end if;

  select public.match_season(season_id, match_date), league_id into v_season, v_league from public.matches where id = p_match_id;
  if not exists (select 1 from public.seasons where id = v_season and is_current) then
    return;
  end if;

  select points_win, points_draw, points_loss into r_win, r_draw, r_loss
    from public.competition_rules where season_id = v_season limit 1;
  r_win := coalesce(r_win, 3); r_draw := coalesce(r_draw, 1); r_loss := coalesce(r_loss, 0);

  delete from public.league_standings where league_id is not distinct from v_league;
  insert into public.league_standings (club, pos, mp, w, d, l, gf, ga, pts, updated_at, league_id)
  select club, row_number() over (order by pts desc, (gf - ga) desc, gf desc, club) as pos,
         mp, w, d, l, gf, ga, pts, now(), v_league
  from (
    select club,
      count(*) as mp,
      sum(case when gf > ga then 1 else 0 end) as w,
      sum(case when gf = ga then 1 else 0 end) as d,
      sum(case when gf < ga then 1 else 0 end) as l,
      sum(gf) as gf, sum(ga) as ga,
      sum(case when gf > ga then r_win when gf = ga then r_draw else r_loss end) as pts
    from (
      select home_team as club, home_score as gf, away_score as ga from public.matches
        where public.match_season(season_id, match_date) = v_season and league_id is not distinct from v_league and home_score is not null and away_score is not null
      union all
      select away_team, away_score, home_score from public.matches
        where public.match_season(season_id, match_date) = v_season and league_id is not distinct from v_league and home_score is not null and away_score is not null
    ) t group by club
  ) s;
end
$$;

-- Points table for any season and league, read-only. Used for past seasons.
create or replace function public.season_table(p_season_id bigint, p_league_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare r_win int; r_draw int; r_loss int; result jsonb;
begin
  select points_win, points_draw, points_loss into r_win, r_draw, r_loss
    from public.competition_rules where season_id = p_season_id limit 1;
  r_win := coalesce(r_win, 3); r_draw := coalesce(r_draw, 1); r_loss := coalesce(r_loss, 0);

  with games as (
    select public.league_club_name(p_league_id, home_team) as club, home_score as gf, away_score as ga
      from public.matches
     where public.match_season(season_id, match_date) = p_season_id and league_id is not distinct from p_league_id
       and upper(trim(match_status)) = 'FT' and home_score is not null and away_score is not null
    union all
    select public.league_club_name(p_league_id, away_team), away_score, home_score
      from public.matches
     where public.match_season(season_id, match_date) = p_season_id and league_id is not distinct from p_league_id
       and upper(trim(match_status)) = 'FT' and home_score is not null and away_score is not null
  ), t as (
    select club,
      count(*)::int as mp,
      (count(*) filter (where gf > ga))::int as w,
      (count(*) filter (where gf = ga))::int as d,
      (count(*) filter (where gf < ga))::int as l,
      sum(gf)::int as gf,
      sum(ga)::int as ga,
      (count(*) filter (where gf > ga) * r_win + count(*) filter (where gf = ga) * r_draw + count(*) filter (where gf < ga) * r_loss)::int as pts
    from games group by club
  ), ranked as (
    select row_number() over (order by t.pts desc, t.gf - t.ga desc, t.gf desc, t.club)::int as pos,
           t.club, t.mp, t.w, t.d, t.l, t.gf, t.ga, t.pts
      from t
  )
  select coalesce(jsonb_agg(jsonb_build_object('pos', pos, 'club', club, 'mp', mp, 'w', w, 'd', d, 'l', l,
           'gf', gf, 'ga', ga, 'pts', pts, 'league_id', p_league_id) order by pos), '[]'::jsonb)
    into result from ranked;
  return result;
end
$$;

-- Super Admin: add a season (not current until chosen).
create or replace function public.create_season(p_name text, p_start date, p_end date)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare new_id bigint;
begin
  if app_role() is distinct from 'SUPER_ADMIN' then
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
$$;

-- Super Admin: make one season the current one, then refresh the live tables from it.
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
end
$$;

revoke all on function public.create_season(text, date, date) from public;
revoke all on function public.set_current_season(bigint) from public;
revoke all on function public.season_table(bigint, bigint) from public;
grant execute on function public.create_season(text, date, date) to authenticated;
grant execute on function public.set_current_season(bigint) to authenticated;
grant execute on function public.season_table(bigint, bigint) to anon, authenticated;
