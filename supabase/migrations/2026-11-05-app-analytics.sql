-- Privacy-light usage counts. Each row is only an event name and a time:
-- no names, no device or voter identifiers, no IP addresses are stored.

create table if not exists public.app_events (
  id bigint generated always as identity primary key,
  event_name text not null,
  created_at timestamptz not null default now()
);

alter table public.app_events enable row level security;

drop policy if exists "app events staff read" on public.app_events;
create policy "app events staff read" on public.app_events
  for select to authenticated
  using (app_role() = any (array['SUPER_ADMIN', 'DEVELOPER']));
-- No insert/update/delete policies: rows are written only by log_app_event.

create or replace function public.log_app_event(p_event text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Ignore anything outside the fixed list, so the table cannot be used to store free text.
  if p_event not in (
    'app_open', 'tab_matches', 'tab_table', 'tab_teams', 'tab_players', 'tab_news', 'tab_videos', 'tab_predict',
    'language_en', 'language_fr', 'language_kri', 'theme_light', 'theme_dark',
    'favourite_club', 'match_details', 'prediction', 'fan_comment', 'fan_report'
  ) then
    return;
  end if;
  -- Simple abuse guard: cap writes across the whole app per minute.
  if (select count(*) from public.app_events where created_at > now() - interval '1 minute') > 600 then
    return;
  end if;
  insert into public.app_events (event_name) values (p_event);
end $$;

create or replace function public.analytics_summary(p_days integer default 30)
returns table (day date, event_name text, total bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if app_role() is distinct from 'SUPER_ADMIN' and app_role() is distinct from 'DEVELOPER' then
    raise exception 'Not allowed to view usage counts';
  end if;
  return query
    select (e.created_at at time zone 'UTC')::date as day, e.event_name, count(*)::bigint as total
    from public.app_events e
    where e.created_at > now() - make_interval(days => greatest(1, least(p_days, 365)))
    group by 1, 2
    order by 1 desc, 3 desc;
end $$;

grant execute on function public.log_app_event(text) to anon, authenticated;
grant execute on function public.analytics_summary(integer) to authenticated;
revoke execute on function public.analytics_summary(integer) from anon;
