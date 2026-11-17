-- SLFA: restrict knockout cup bracket management to SUPER_ADMIN.
-- This preserves the existing cup workflow and public read policy.
-- Apply this migration in the Supabase SQL Editor for the live database.

create or replace function public.admin_save_cup_tie(
  p_id bigint,
  p_competition_id bigint,
  p_season_id bigint,
  p_match_id bigint,
  p_round_name text,
  p_tie_number integer,
  p_next_tie_id bigint default null,
  p_next_slot text default null
) returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id bigint;
  v_match public.matches%rowtype;
  v_comp_type text;
begin
  if public.app_role() is distinct from 'SUPER_ADMIN' then
    raise exception 'Only a Super Admin can manage cup brackets.' using errcode = '42501';
  end if;

  if length(trim(coalesce(p_round_name,''))) not between 2 and 60
     or p_tie_number is null or p_tie_number < 1 then
    raise exception 'Enter a round name and a tie number greater than zero.';
  end if;

  if (p_next_tie_id is null) <> (p_next_slot is null)
     or (p_next_slot is not null and p_next_slot not in ('HOME','AWAY')) then
    raise exception 'Choose both the next tie and its HOME/AWAY slot, or leave both empty.';
  end if;

  select competition_type into v_comp_type
  from public.leagues
  where id = p_competition_id and is_active = true;

  if v_comp_type is distinct from 'CUP' then
    raise exception 'Choose an active CUP competition.';
  end if;

  select * into v_match from public.matches where id = p_match_id;
  if not found or v_match.league_id is distinct from p_competition_id then
    raise exception 'The selected match must belong to this cup competition.';
  end if;

  if p_season_id is not null and v_match.season_id is distinct from p_season_id then
    raise exception 'The selected match does not belong to the chosen season.';
  end if;

  if p_next_tie_id is not null and not exists (
    select 1
    from public.cup_ties t
    where t.id = p_next_tie_id
      and t.competition_id = p_competition_id
      and t.season_id is not distinct from p_season_id
      and (p_id is null or t.id <> p_id)
  ) then
    raise exception 'The next tie must belong to the same cup and season.';
  end if;

  if p_id is null then
    insert into public.cup_ties(
      competition_id, season_id, match_id, round_name, tie_number, next_tie_id, next_slot
    )
    values (
      p_competition_id, p_season_id, p_match_id, trim(p_round_name),
      p_tie_number, p_next_tie_id, p_next_slot
    )
    returning id into v_id;
  else
    update public.cup_ties
    set competition_id = p_competition_id,
        season_id = p_season_id,
        match_id = p_match_id,
        round_name = trim(p_round_name),
        tie_number = p_tie_number,
        next_tie_id = p_next_tie_id,
        next_slot = p_next_slot,
        updated_at = now()
    where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Cup tie not found.';
    end if;
  end if;

  return v_id;
end
$$;

create or replace function public.admin_advance_cup_tie(
  p_tie_id bigint,
  p_winner_team text
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  t public.cup_ties%rowtype;
  m public.matches%rowtype;
  next_match public.matches%rowtype;
  v_winner text;
begin
  if public.app_role() is distinct from 'SUPER_ADMIN' then
    raise exception 'Only a Super Admin can advance cup ties.' using errcode = '42501';
  end if;

  select * into t from public.cup_ties where id = p_tie_id for update;
  if not found then
    raise exception 'Cup tie not found.';
  end if;

  select * into m from public.matches where id = t.match_id;
  if not found or m.home_score is null or m.away_score is null then
    raise exception 'The match must have a recorded final score before advancing.';
  end if;

  v_winner := trim(coalesce(p_winner_team,''));
  if v_winner not in (m.home_team, m.away_team) then
    raise exception 'Winner must be one of the two teams in this tie.';
  end if;

  if t.next_tie_id is null then
    update public.cup_ties
    set winner_team = v_winner, advanced_at = now(), updated_at = now()
    where id = t.id;
    return v_winner;
  end if;

  select * into next_match
  from public.matches
  where id = (select match_id from public.cup_ties where id = t.next_tie_id)
  for update;

  if not found then
    raise exception 'The next round fixture is missing.';
  end if;

  if t.next_slot = 'HOME' then
    update public.matches set home_team = v_winner where id = next_match.id;
  else
    update public.matches set away_team = v_winner where id = next_match.id;
  end if;

  update public.cup_ties
  set winner_team = v_winner, advanced_at = now(), updated_at = now()
  where id = t.id;

  return v_winner;
end
$$;

-- Keep the same authenticated RPC entry points; role checks above enforce SUPER_ADMIN only.
revoke all on function public.admin_save_cup_tie(bigint,bigint,bigint,bigint,text,integer,bigint,text) from public, anon;
revoke all on function public.admin_advance_cup_tie(bigint,text) from public, anon;
grant execute on function public.admin_save_cup_tie(bigint,bigint,bigint,bigint,text,integer,bigint,text) to authenticated;
grant execute on function public.admin_advance_cup_tie(bigint,text) to authenticated;

notify pgrst, 'reload schema';
