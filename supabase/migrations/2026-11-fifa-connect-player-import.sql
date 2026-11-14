-- SLFA League App: authorized FIFA Connect player import
-- Additive migration. Does not replace FIFA Connect or change existing player IDs.
alter table public.club_squad
  add column if not exists fifa_connect_id text,
  add column if not exists nationality text;

create unique index if not exists club_squad_fifa_connect_season_uidx
  on public.club_squad (fifa_connect_id, season_id)
  where fifa_connect_id is not null and btrim(fifa_connect_id) <> '';

create table if not exists public.player_import_batches (
  id uuid primary key default gen_random_uuid(),
  imported_by uuid not null references auth.users(id),
  imported_at timestamptz not null default now(),
  source_label text,
  competition_count integer not null default 0,
  row_count integer not null default 0,
  inserted_count integer not null default 0,
  updated_count integer not null default 0
);

alter table public.player_import_batches enable row level security;
drop policy if exists player_import_batches_admin_read on public.player_import_batches;
create policy player_import_batches_admin_read
  on public.player_import_batches for select to authenticated
  using (public.app_role() in ('SUPER_ADMIN', 'DEVELOPER'));

revoke all on public.player_import_batches from anon, authenticated;
grant select on public.player_import_batches to authenticated;

create or replace function public.import_fifa_connect_players(
  p_rows jsonb,
  p_source_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text := coalesce(public.app_role(), '');
  v_profile_status text;
  v_row jsonb;
  v_league_name text;
  v_club_name text;
  v_player_name text;
  v_fifa_id text;
  v_nin text;
  v_dob date;
  v_nationality text;
  v_position text;
  v_jersey integer;
  v_photo text;
  v_league_id public.leagues.id%type;
  v_club_id public.league_clubs.id%type;
  v_season_id public.seasons.id%type;
  v_existing_id public.club_squad.id%type;
  v_existing_club_id public.club_squad.club_id%type;
  v_match_count integer := 0;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_rows integer := 0;
  v_competitions integer := 0;
  v_batch_id uuid;
begin
  if v_uid is null or v_role not in ('SUPER_ADMIN', 'DEVELOPER') then
    raise exception 'Only an authenticated Super Admin can import FIFA Connect player records';
  end if;

  select lower(coalesce(status, '')) into v_profile_status
  from public.user_profiles where id = v_uid;
  if v_profile_status is distinct from 'active' then
    raise exception 'Your SLFA account is not active';
  end if;

  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'The import payload must be a JSON array of player records';
  end if;
  if jsonb_array_length(p_rows) = 0 then
    raise exception 'The import file contains no player rows';
  end if;
  if jsonb_array_length(p_rows) > 5000 then
    raise exception 'Import limit is 5,000 player records per batch';
  end if;

  select id into v_season_id from public.seasons where is_current = true
  order by id desc limit 1;
  if v_season_id is null then
    raise exception 'No current season is configured. Set the current season before importing players.';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_rows := v_rows + 1;
    v_league_name := nullif(btrim(v_row->>'league'), '');
    v_club_name := nullif(btrim(v_row->>'club'), '');
    v_player_name := nullif(btrim(v_row->>'player_name'), '');
    v_fifa_id := nullif(btrim(v_row->>'fifa_connect_id'), '');
    v_nin := nullif(btrim(v_row->>'player_nin'), '');
    v_nationality := nullif(btrim(v_row->>'nationality'), '');
    v_position := nullif(btrim(v_row->>'position'), '');
    v_photo := nullif(btrim(v_row->>'photo_url'), '');
    v_dob := nullif(btrim(v_row->>'date_of_birth'), '')::date;
    v_jersey := nullif(btrim(v_row->>'jersey_number'), '')::integer;

    if v_league_name is null or v_club_name is null or v_player_name is null or v_fifa_id is null or v_nin is null or nullif(btrim(v_row->>'date_of_birth'), '') is null then
      raise exception 'Row % is missing League, Club, Player Name, FIFA ID, National ID or Date of Birth', v_rows;
    end if;

    select id into v_league_id from public.leagues
      where lower(btrim(name)) = lower(v_league_name) and is_active = true
      limit 1;
    if v_league_id is null then
      raise exception 'Row %: active competition "%" was not found', v_rows, v_league_name;
    end if;

    select id into v_club_id from public.league_clubs
      where league_id = v_league_id and lower(btrim(club_name)) = lower(v_club_name)
      limit 1;
    if v_club_id is null then
      raise exception 'Row %: club "%" was not found under "%"', v_rows, v_club_name, v_league_name;
    end if;

    -- Match an existing app record by FIFA ID or National ID so earlier club-entered
    -- records are enriched instead of duplicated.
    select count(distinct id) into v_match_count
      from public.club_squad
      where season_id = v_season_id
        and (fifa_connect_id = v_fifa_id or player_nin = v_nin);
    if v_match_count > 1 then
      raise exception 'Row %: FIFA ID % and National ID % point to different existing player records. Resolve the duplicate first.', v_rows, v_fifa_id, v_nin;
    end if;

    select id, club_id into v_existing_id, v_existing_club_id
      from public.club_squad
      where season_id = v_season_id
        and (fifa_connect_id = v_fifa_id or player_nin = v_nin)
      limit 1;

    if v_existing_id is not null then
      if v_existing_club_id is distinct from v_club_id then
        raise exception 'Row %: FIFA ID % already belongs to another club this season. Process a verified transfer separately.', v_rows, v_fifa_id;
      end if;
      update public.club_squad set
        player_name = v_player_name,
        player_nin = v_nin,
        fifa_connect_id = v_fifa_id,
        date_of_birth = coalesce(v_dob, date_of_birth),
        nationality = coalesce(v_nationality, nationality),
        position = coalesce(v_position, position),
        jersey_number = coalesce(v_jersey, jersey_number),
        photo_url = coalesce(v_photo, photo_url),
        status = 'Active',
        registration_status = 'Approved'
      where id = v_existing_id;
      v_updated := v_updated + 1;
    else
      insert into public.club_squad (
        player_name, player_nin, fifa_connect_id, date_of_birth, nationality, position,
        jersey_number, photo_url, status, registration_status,
        club_id, created_by, season_id
      ) values (
        v_player_name, v_nin, v_fifa_id, v_dob, v_nationality, v_position,
        v_jersey, v_photo, 'Active', 'Approved',
        v_club_id, v_uid, v_season_id
      );
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  select count(distinct lower(btrim(value->>'league'))) into v_competitions
  from jsonb_array_elements(p_rows);

  insert into public.player_import_batches (
    imported_by, source_label, competition_count, row_count, inserted_count, updated_count
  ) values (
    v_uid, left(coalesce(p_source_label, 'FIFA Connect export'), 240),
    v_competitions, v_rows, v_inserted, v_updated
  ) returning id into v_batch_id;

  return jsonb_build_object(
    'batch_id', v_batch_id,
    'rows_processed', v_rows,
    'inserted', v_inserted,
    'updated', v_updated,
    'competitions', v_competitions
  );
end;
$$;

revoke all on function public.import_fifa_connect_players(jsonb, text) from public, anon;
grant execute on function public.import_fifa_connect_players(jsonb, text) to authenticated;
