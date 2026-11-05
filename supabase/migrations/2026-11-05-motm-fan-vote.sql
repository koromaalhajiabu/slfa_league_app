-- Fan vote for player of the match. Votes open after full time, and only players named in that match's lineup can be chosen.
-- Individual votes are private. Fans see only the tally, through motm_tally.
create table if not exists public.match_motm_votes (
  id bigserial primary key,
  match_id bigint not null references public.matches(id) on delete cascade,
  player_id bigint not null references public.club_squad(id) on delete cascade,
  voter_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, voter_key)
);
alter table public.match_motm_votes enable row level security;

create or replace function public.submit_motm_vote(p_match_id bigint, p_player_id bigint, p_voter_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(p_voter_key,'') = '' then
    raise exception 'Your browser could not be identified.';
  end if;
  if not exists (select 1 from public.matches m where m.id = p_match_id and m.match_status = 'FT') then
    raise exception 'Voting opens after full time.';
  end if;
  if not exists (select 1 from public.match_lineups l where l.match_id = p_match_id and l.player_id = p_player_id) then
    raise exception 'That player is not in this match line-up.';
  end if;
  insert into public.match_motm_votes (match_id, player_id, voter_key)
    values (p_match_id, p_player_id, p_voter_key)
    on conflict (match_id, voter_key) do update
      set player_id = excluded.player_id, updated_at = now();
end $$;

create or replace function public.motm_tally(p_match_id bigint)
returns table (player_id bigint, player_name text, votes bigint)
language sql
stable
security definer
set search_path = public
as $$
  select v.player_id, cs.player_name, count(*)::bigint
  from public.match_motm_votes v
  join public.club_squad cs on cs.id = v.player_id
  where v.match_id = p_match_id
  group by v.player_id, cs.player_name
  order by count(*) desc, cs.player_name
  limit 10;
$$;

revoke all on function public.submit_motm_vote(bigint, bigint, text) from public;
revoke all on function public.motm_tally(bigint) from public;
grant execute on function public.submit_motm_vote(bigint, bigint, text) to anon, authenticated;
grant execute on function public.motm_tally(bigint) to anon, authenticated;
