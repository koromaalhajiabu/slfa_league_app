-- Validate live events submitted by Match Data Operators against the
-- approved team line-ups for the assigned fixture. Referee event-entry
-- behavior is unchanged by this operator-specific trigger.

create or replace function public.validate_match_data_operator_event()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_match public.matches%rowtype;
  v_team_club uuid;
  v_player_id bigint;
  v_related_player_id bigint;
begin
  if public.app_role() is distinct from 'MATCH_DATA_OPERATOR' then
    return new;
  end if;

  if coalesce(btrim(new.match_id),'') !~ '^[0-9]+$' then
    raise exception 'The Data Operator event must reference a valid SLFA fixture.';
  end if;

  select * into v_match
    from public.matches
   where id = new.match_id::bigint;
  if not found then
    raise exception 'The selected fixture could not be found.';
  end if;

  if v_match.match_status not in ('LIVE','HT','FT') then
    raise exception 'Match events can only be recorded while the fixture is live, at half-time, or when syncing its completed offline record.';
  end if;

  if v_match.home_club_id is null or v_match.away_club_id is null then
    raise exception 'This fixture is not linked to both registered clubs. Ask the Super Admin to correct its fixture records.';
  end if;

  if lower(btrim(new.team_name)) = lower(btrim(v_match.home_team)) then
    v_team_club := v_match.home_club_id;
  elsif lower(btrim(new.team_name)) = lower(btrim(v_match.away_team)) then
    v_team_club := v_match.away_club_id;
  else
    raise exception 'Choose either the home or away team recorded for this fixture.';
  end if;

  select cs.id into v_player_id
    from public.match_lineups ml
    join public.club_squad cs on cs.id = ml.player_id
   where ml.match_id = v_match.id
     and ml.club_id = v_team_club
     and lower(btrim(cs.player_name)) = lower(btrim(new.player_name))
     and cs.status = 'Active'
     and cs.registration_status = 'Approved'
     and cs.season_id = v_match.season_id
   limit 1;
  if v_player_id is null then
    raise exception 'The selected player is not in this club’s approved team sheet for the fixture.';
  end if;

  if new.event_type = 'SUB' then
    if coalesce(btrim(new.player_off_name),'') = '' then
      raise exception 'A substitution must identify the player leaving the pitch.';
    end if;
    if lower(btrim(new.player_off_name)) = lower(btrim(new.player_name)) then
      raise exception 'The player coming on and the player leaving must be different.';
    end if;

    select cs.id into v_related_player_id
      from public.match_lineups ml
      join public.club_squad cs on cs.id = ml.player_id
     where ml.match_id = v_match.id
       and ml.club_id = v_team_club
       and lower(btrim(cs.player_name)) = lower(btrim(new.player_off_name))
       and cs.status = 'Active'
       and cs.registration_status = 'Approved'
       and cs.season_id = v_match.season_id
     limit 1;
    if v_related_player_id is null then
      raise exception 'The player leaving the pitch is not on this club’s approved match team sheet.';
    end if;
  elsif coalesce(btrim(new.player_off_name),'') <> '' then
    raise exception 'Only a substitution event can include a player leaving the pitch.';
  end if;

  if new.event_type = 'GOAL' and coalesce(btrim(new.assist_player_name),'') <> '' then
    if lower(btrim(new.assist_player_name)) = lower(btrim(new.player_name)) then
      raise exception 'The goal scorer cannot be listed as their own assist provider.';
    end if;

    select cs.id into v_related_player_id
      from public.match_lineups ml
      join public.club_squad cs on cs.id = ml.player_id
     where ml.match_id = v_match.id
       and ml.club_id = v_team_club
       and lower(btrim(cs.player_name)) = lower(btrim(new.assist_player_name))
       and cs.status = 'Active'
       and cs.registration_status = 'Approved'
       and cs.season_id = v_match.season_id
     limit 1;
    if v_related_player_id is null then
      raise exception 'The assist provider must be a player on the same club’s approved match team sheet.';
    end if;
  elsif new.event_type <> 'GOAL' and coalesce(btrim(new.assist_player_name),'') <> '' then
    raise exception 'Only a goal event can include an assist provider.';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_validate_match_data_operator_event on public.match_events;
create trigger trg_validate_match_data_operator_event
before insert on public.match_events
for each row
execute function public.validate_match_data_operator_event();

revoke all on function public.validate_match_data_operator_event() from public;
revoke all on function public.validate_match_data_operator_event() from anon;
revoke all on function public.validate_match_data_operator_event() from authenticated;

comment on function public.validate_match_data_operator_event() is
  'Server-side event integrity guard for Match Data Operators: validates fixture teams, approved match-lineup membership, assists and substitutions.';
