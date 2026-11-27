-- Preserve the source season table and reset the club's live standing when a movement is applied.
create or replace function public.admin_apply_league_movement(p_movement_id bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_move public.league_movement_records%rowtype;
  v_source public.league_division_settings%rowtype;
  v_target public.league_division_settings%rowtype;
  v_club_name text;
  v_position integer;
  v_club_count integer;
  v_current_rows integer;
  v_archived_rows integer;
begin
  if public.app_role() <> 'SUPER_ADMIN' then raise exception 'Only the Super Admin can apply a club movement.'; end if;
  select * into v_move from public.league_movement_records where id = p_movement_id for update;
  if not found then raise exception 'The movement record does not exist.'; end if;
  if v_move.decision_status <> 'APPROVED' then raise exception 'Only an approved movement can be applied.'; end if;
  select * into v_source from public.league_division_settings where league_id = v_move.from_league_id and season_id = v_move.season_id;
  if not found then raise exception 'The source competition has no division settings for this season.'; end if;
  select * into v_target from public.league_division_settings where league_id = v_move.to_league_id and season_id = v_move.season_id;
  if not found then raise exception 'The destination competition has no division settings for this season.'; end if;
  if v_source.pyramid_group <> v_target.pyramid_group then raise exception 'A club cannot move between different competition pyramids.'; end if;
  if not exists (select 1 from public.leagues where id = v_move.to_league_id and is_active = true) then
    raise exception 'The destination competition is not published and active.';
  end if;
  select club_name into v_club_name from public.league_clubs
   where id = v_move.club_id and league_id = v_move.from_league_id and is_active = true;
  if not found then raise exception 'The club is not currently active in the selected source competition.'; end if;
  select pos into v_position from public.league_standings
   where league_id = v_move.from_league_id and lower(trim(club)) = lower(trim(v_club_name)) limit 1;
  select count(*) into v_club_count from public.league_clubs where league_id = v_move.from_league_id and is_active = true;
  if v_move.movement_type in ('PROMOTION','RELEGATION','PLAYOFF') and v_position is null then
    raise exception 'The club has no published source-competition position. Confirm the table before moving the club.';
  end if;
  if v_move.movement_type = 'PROMOTION' then
    if v_target.tier_rank >= v_source.tier_rank then raise exception 'Promotion must move the club to a higher division tier.'; end if;
    if v_source.promotion_spots < 1 or v_position > v_source.promotion_spots then raise exception 'The club is outside the configured automatic promotion places.'; end if;
  elsif v_move.movement_type = 'RELEGATION' then
    if v_target.tier_rank <= v_source.tier_rank then raise exception 'Relegation must move the club to a lower division tier.'; end if;
    if v_source.relegation_spots < 1 or v_position <= v_club_count - v_source.relegation_spots then raise exception 'The club is outside the configured automatic relegation places.'; end if;
  elsif v_move.movement_type = 'PLAYOFF' then
    if abs(v_target.tier_rank - v_source.tier_rank) <> 1 then raise exception 'A division playoff must connect adjacent tiers.'; end if;
    if v_target.tier_rank < v_source.tier_rank then
      if not v_source.promotion_playoff or v_position <= v_source.promotion_spots or v_position > v_source.promotion_spots + v_source.playoff_spots then
        raise exception 'The club is outside the configured promotion playoff places.';
      end if;
    else
      if not v_source.relegation_playoff or v_position <= v_club_count - v_source.relegation_spots - v_source.playoff_spots or v_position > v_club_count - v_source.relegation_spots then
        raise exception 'The club is outside the configured relegation playoff places.';
      end if;
    end if;
  end if;
  select count(*) into v_current_rows from public.league_standings where league_id = v_move.from_league_id;
  select count(*) into v_archived_rows from public.season_standings where season_id = v_move.season_id and league_id = v_move.from_league_id;
  if v_current_rows > 0 and v_archived_rows = 0 then
    insert into public.season_standings (season_id,league_id,pos,club,mp,w,d,l,gf,ga,pts)
    select v_move.season_id,league_id,pos,club,mp,w,d,l,gf,ga,pts from public.league_standings where league_id = v_move.from_league_id;
  elsif v_archived_rows > 0 and v_archived_rows <> v_current_rows then
    raise exception 'The source season archive is incomplete. Complete the official season archive before applying this movement.';
  end if;
  update public.league_standings set league_id = v_move.to_league_id, pos = null,
    mp = 0, w = 0, d = 0, l = 0, gf = 0, ga = 0, pts = 0, updated_at = now()
   where league_id = v_move.from_league_id and lower(trim(club)) = lower(trim(v_club_name));
  update public.league_clubs set league_id = v_move.to_league_id
   where id = v_move.club_id and league_id = v_move.from_league_id;
  update public.league_movement_records set decision_status = 'APPLIED', applied_at = now() where id = p_movement_id;
  return p_movement_id;
end;
$$;
revoke all on function public.admin_apply_league_movement(bigint) from public;
revoke all on function public.admin_apply_league_movement(bigint) from anon;
grant execute on function public.admin_apply_league_movement(bigint) to authenticated;
