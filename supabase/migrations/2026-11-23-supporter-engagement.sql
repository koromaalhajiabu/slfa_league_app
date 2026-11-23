-- SLFA Supporter Engagement Centre
-- Fans can follow players and request one-hour reminders for individual matches.
-- Existing club favourites, polls, official media posts and push alerts remain unchanged.

create table if not exists public.user_favorite_players (
  user_id uuid not null references auth.users(id) on delete cascade,
  player_id bigint not null references public.club_squad(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, player_id)
);

alter table public.user_favorite_players enable row level security;

drop policy if exists "supporters read own favourite players" on public.user_favorite_players;
drop policy if exists "supporters add own favourite players" on public.user_favorite_players;
drop policy if exists "supporters remove own favourite players" on public.user_favorite_players;

create policy "supporters read own favourite players"
  on public.user_favorite_players for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "supporters add own favourite players"
  on public.user_favorite_players for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "supporters remove own favourite players"
  on public.user_favorite_players for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, delete on public.user_favorite_players to authenticated;

alter table public.league_alerts
  add column if not exists target_endpoints text[];

create table if not exists public.push_match_reminders (
  endpoint text not null references public.push_subscriptions(endpoint) on delete cascade,
  match_id bigint not null references public.matches(id) on delete cascade,
  remind_at timestamptz not null,
  queued_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (endpoint, match_id)
);

alter table public.push_match_reminders enable row level security;
revoke all on public.push_match_reminders from anon, authenticated;

create or replace function public.set_push_match_reminder(
  p_endpoint text,
  p_match_id bigint,
  p_enabled boolean
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_match public.matches%rowtype;
begin
  if p_endpoint is null or pg_catalog.length(p_endpoint) < 20 then
    raise exception 'A valid device subscription is required.';
  end if;

  if not exists (
    select 1 from public.push_subscriptions s where s.endpoint = p_endpoint
  ) then
    raise exception 'This device is not subscribed to alerts. Turn on Get alerts first.';
  end if;

  if coalesce(p_enabled, false) is false then
    delete from public.push_match_reminders
      where endpoint = p_endpoint and match_id = p_match_id;
    return 'Match reminder removed.';
  end if;

  select m.* into v_match
    from public.matches m
   where m.id = p_match_id
     and m.match_status in ('SCHEDULED', 'RESCHEDULED');

  if not found then
    raise exception 'This match is no longer available for reminders.';
  end if;

  if v_match.match_date is null or v_match.match_date <= pg_catalog.now() + interval '65 minutes' then
    raise exception 'A reminder can only be set more than 65 minutes before kick-off.';
  end if;

  insert into public.push_match_reminders (endpoint, match_id, remind_at, queued_at)
  values (p_endpoint, p_match_id, v_match.match_date - interval '1 hour', null)
  on conflict (endpoint, match_id)
  do update set remind_at = excluded.remind_at, queued_at = null;

  return 'Your one-hour match reminder is set.';
end
$function$;

revoke all on function public.set_push_match_reminder(text, bigint, boolean) from public, anon, authenticated;
grant execute on function public.set_push_match_reminder(text, bigint, boolean) to anon, authenticated;

create or replace function public.queue_selected_match_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_count integer := 0;
begin
  with due as materialized (
    select r.endpoint, r.match_id, m.home_team, m.away_team, m.venue
      from public.push_match_reminders r
      join public.matches m on m.id = r.match_id
     where r.queued_at is null
       and r.remind_at <= pg_catalog.now()
       and m.match_status in ('SCHEDULED', 'RESCHEDULED')
       and m.match_date > pg_catalog.now() + interval '1 minute'
     for update of r skip locked
  ),
  grouped as (
    select d.match_id,
           pg_catalog.max(d.home_team) as home_team,
           pg_catalog.max(d.away_team) as away_team,
           pg_catalog.max(d.venue) as venue,
           pg_catalog.array_agg(distinct d.endpoint) as endpoints
      from due d
     group by d.match_id
  ),
  queued as (
    insert into public.league_alerts (title, body, url, club_names, target_endpoints)
    select 'Your match starts in one hour',
           g.home_team || ' v ' || g.away_team || coalesce(' · ' || g.venue, ''),
           '/?match=' || g.match_id::text,
           null,
           g.endpoints
      from grouped g
    returning id
  ),
  marked as (
    update public.push_match_reminders r
       set queued_at = pg_catalog.now()
      from due d
     where r.endpoint = d.endpoint and r.match_id = d.match_id
    returning r.match_id
  )
  select pg_catalog.count(*)::integer into v_count from queued;

  return v_count;
end
$function$;

revoke all on function public.queue_selected_match_reminders() from public, anon, authenticated;

create or replace function public.sync_push_match_reminders()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.match_status in ('SCHEDULED', 'RESCHEDULED') and new.match_date is not null then
    update public.push_match_reminders
       set remind_at = new.match_date - interval '1 hour',
           queued_at = null
     where match_id = new.id;
  else
    delete from public.push_match_reminders where match_id = new.id;
  end if;
  return new;
end
$function$;

revoke all on function public.sync_push_match_reminders() from public, anon, authenticated;

drop trigger if exists trg_sync_push_match_reminders on public.matches;
create trigger trg_sync_push_match_reminders
  after update of match_date, match_status on public.matches
  for each row execute function public.sync_push_match_reminders();

do $block$
begin
  if not exists (
    select 1 from cron.job where jobname = 'selected-match-reminders'
  ) then
    perform cron.schedule(
      'selected-match-reminders',
      '*/5 * * * *',
      'select public.queue_selected_match_reminders()'
    );
  end if;
end
$block$;
