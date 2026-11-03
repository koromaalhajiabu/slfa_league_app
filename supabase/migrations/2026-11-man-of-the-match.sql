-- Man of the Match: the assigned referee (or Super Admin) picks the player after the match.
alter table public.matches add column if not exists motm_player_id bigint references public.club_squad(id) on delete set null;

create or replace function public.set_match_motm(p_match_id bigint, p_player_id bigint)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  m public.matches%rowtype;
  s public.club_squad%rowtype;
  v_role text := coalesce(app_role(), '');
begin
  select * into m from public.matches where id = p_match_id;
  if not found then raise exception 'Match not found.'; end if;

  if v_role = 'REFEREE' then
    if not exists (select 1 from public.match_referee_assignments a
      where a.referee_user_id = auth.uid() and a.match_id = p_match_id
        and a.assignment_status = 'ACTIVE' and a.official_role = 'MAIN') then
      raise exception 'You are not the official for this match.';
    end if;
  elsif v_role not in ('SUPER_ADMIN', 'DEVELOPER') then
    raise exception 'Only the match referee or a Super Admin can choose the Man of the Match.';
  end if;

  if p_player_id is null then
    update public.matches set motm_player_id = null, motm_name = null, motm_jersey_number = null,
      change_reason = 'Man of the Match cleared'
    where id = p_match_id;
    return;
  end if;

  select * into s from public.club_squad where id = p_player_id;
  if not found then raise exception 'Player not found.'; end if;
  if not exists (select 1 from public.league_clubs lc
    where lc.id = s.club_id and lc.club_name in (m.home_team, m.away_team)) then
    raise exception 'That player is not in either club for this match.';
  end if;

  update public.matches set motm_player_id = s.id, motm_name = s.player_name, motm_jersey_number = s.jersey_number,
    change_reason = 'Man of the Match: ' || s.player_name
  where id = p_match_id;
end $$;

revoke all on function public.set_match_motm(bigint, bigint) from public, anon;
grant execute on function public.set_match_motm(bigint, bigint) to authenticated;

-- Public tally of awards per player, for the Players tab
create or replace view public.motm_awards as
select s.id as player_id, s.player_name as player, lc.club_name as club, s.jersey_number, s.photo_url,
       count(*)::int as awards
from public.matches m
join public.club_squad s on s.id = m.motm_player_id
join public.league_clubs lc on lc.id = s.club_id
where m.motm_player_id is not null
group by s.id, s.player_name, lc.club_name, s.jersey_number, s.photo_url;

grant select on public.motm_awards to anon, authenticated;
