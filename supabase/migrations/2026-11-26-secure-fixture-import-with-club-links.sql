-- Secure, atomic fixture import. It links each row to its active home/away club IDs.
-- A transaction-scoped advisory lock prevents two concurrent imports from creating the
-- same club-vs-club fixture on the same local calendar date.

CREATE OR REPLACE FUNCTION public.admin_import_fixtures(p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_profile_status text;
  v_row jsonb;
  v_season_id bigint;
  v_league_id bigint;
  v_home_club_id uuid;
  v_away_club_id uuid;
  v_home_name text;
  v_away_name text;
  v_home_input text;
  v_away_input text;
  v_venue text;
  v_match_date timestamptz;
  v_key text;
  v_seen text[] := array[]::text[];
  v_inserted integer := 0;
begin
  if v_uid is null or public.app_role() is distinct from 'SUPER_ADMIN' then
    raise exception 'Only an authenticated Super Admin can import fixtures.';
  end if;

  select lower(coalesce(status,''))
    into v_profile_status
    from public.user_profiles
   where id=v_uid;
  if v_profile_status is distinct from 'active' then
    raise exception 'Your SLFA account is not active.';
  end if;

  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'The fixture import must be a JSON array.';
  end if;
  if jsonb_array_length(p_rows)=0 then
    raise exception 'The fixture import contains no rows.';
  end if;
  if jsonb_array_length(p_rows)>1000 then
    raise exception 'The fixture import limit is 1,000 rows per batch.';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    if jsonb_typeof(v_row) is distinct from 'object' then
      raise exception 'Every fixture row must be a JSON object.';
    end if;

    begin
      v_season_id := nullif(btrim(v_row->>'season_id'),'')::bigint;
      v_league_id := nullif(btrim(v_row->>'league_id'),'')::bigint;
      v_home_club_id := nullif(btrim(v_row->>'home_club_id'),'')::uuid;
      v_away_club_id := nullif(btrim(v_row->>'away_club_id'),'')::uuid;
      v_match_date := nullif(btrim(v_row->>'match_date'),'')::timestamptz;
    exception when others then
      raise exception 'A fixture row contains an invalid season, competition, club ID or kick-off timestamp.';
    end;

    v_home_input := nullif(btrim(v_row->>'home_team'),'');
    v_away_input := nullif(btrim(v_row->>'away_team'),'');
    v_venue := nullif(btrim(v_row->>'venue'),'');

    if v_season_id is null or v_league_id is null or
       v_home_club_id is null or v_away_club_id is null or
       v_match_date is null or v_home_input is null or v_away_input is null then
      raise exception 'Every fixture needs a season, competition, two clubs, both team names and a kick-off date/time.';
    end if;
    if v_home_club_id=v_away_club_id then
      raise exception 'A club cannot play itself.';
    end if;
    if v_venue is not null and char_length(v_venue)>250 then
      raise exception 'Venue names cannot exceed 250 characters.';
    end if;

    if not exists (select 1 from public.seasons s where s.id=v_season_id) then
      raise exception 'A selected season does not exist.';
    end if;
    if not exists (select 1 from public.leagues l where l.id=v_league_id and l.is_active=true) then
      raise exception 'A selected competition does not exist or is inactive.';
    end if;

    select c.club_name into v_home_name
      from public.league_clubs c
     where c.id=v_home_club_id
       and c.league_id=v_league_id
       and c.is_active=true;
    if not found then
      raise exception 'The home club is inactive or does not belong to the selected competition.';
    end if;

    select c.club_name into v_away_name
      from public.league_clubs c
     where c.id=v_away_club_id
       and c.league_id=v_league_id
       and c.is_active=true;
    if not found then
      raise exception 'The away club is inactive or does not belong to the selected competition.';
    end if;

    if lower(v_home_input)<>lower(v_home_name) or lower(v_away_input)<>lower(v_away_name) then
      raise exception 'A team name does not match its selected club record. Recheck the CSV or fixture form.';
    end if;

    v_key := v_season_id::text || ':' || v_league_id::text || ':' ||
             v_home_club_id::text || ':' || v_away_club_id::text || ':' ||
             ((v_match_date at time zone 'Africa/Freetown')::date)::text;
    if v_key=any(v_seen) then
      raise exception 'The import contains the same fixture more than once.';
    end if;
    v_seen := array_append(v_seen,v_key);

    perform pg_advisory_xact_lock(hashtextextended(v_key, 0));

    if exists (
      select 1
        from public.matches m
       where m.season_id=v_season_id
         and m.league_id=v_league_id
         and (m.match_date at time zone 'Africa/Freetown')::date =
             (v_match_date at time zone 'Africa/Freetown')::date
         and (
           (m.home_club_id=v_home_club_id and m.away_club_id=v_away_club_id)
           or (
             m.home_club_id is null and m.away_club_id is null
             and lower(btrim(coalesce(m.home_team,'')))=lower(v_home_name)
             and lower(btrim(coalesce(m.away_team,'')))=lower(v_away_name)
           )
         )
    ) then
      raise exception 'A fixture already exists for % v % on %.',
        v_home_name,v_away_name,(v_match_date at time zone 'Africa/Freetown')::date;
    end if;

    insert into public.matches(
      home_team,away_team,home_club_id,away_club_id,
      match_date,venue,season_id,league_id,
      home_score,away_score,match_status
    )
    values(
      v_home_name,v_away_name,v_home_club_id,v_away_club_id,
      v_match_date,v_venue,v_season_id,v_league_id,
      null,null,'SCHEDULED'
    );

    v_inserted := v_inserted+1;
  end loop;

  return jsonb_build_object(
    'inserted',v_inserted,
    'rows_processed',v_inserted,
    'status','SUCCESS'
  );
end;
$function$


revoke all on function public.admin_import_fixtures(jsonb) from public;
revoke all on function public.admin_import_fixtures(jsonb) from anon;
grant execute on function public.admin_import_fixtures(jsonb) to authenticated;

comment on function public.admin_import_fixtures(jsonb) is
  'Atomically imports scheduled fixtures after validating active competition, season, club ownership and duplicate match records. Stores home_club_id and away_club_id for club portals and team sheets.';
