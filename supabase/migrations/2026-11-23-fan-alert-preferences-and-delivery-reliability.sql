-- Fan alert preferences, club-targeted fixture alerts and reliable per-device delivery.

alter table public.push_subscriptions
  add column if not exists alert_types text[] not null
  default array['FIXTURES','KICKOFF','GOALS','CARDS','FULL_TIME','NEWS','ANNOUNCEMENTS','MATCH_UPDATES']::text[];

alter table public.league_alerts
  add column if not exists alert_type text not null default 'ANNOUNCEMENTS',
  add column if not exists delivery_status text not null default 'PENDING',
  add column if not exists delivered_count integer not null default 0,
  add column if not exists failed_at timestamptz,
  add column if not exists last_attempt_at timestamptz;

update public.league_alerts
set delivery_status = case when sent_at is not null then 'SENT' else 'PENDING' end,
    alert_type = case
      when lower(btrim(title)) = 'new fixture' or lower(btrim(title)) like 'new fixture:%' then 'FIXTURES'
      when lower(btrim(title)) in ('kick-off','kickoff') then 'KICKOFF'
      when lower(btrim(title)) in ('full time','full-time') or lower(btrim(title)) like 'full time:%' then 'FULL_TIME'
      when lower(btrim(title)) = 'news' then 'NEWS'
      when lower(btrim(title)) like 'goal!%' then 'GOALS'
      when lower(btrim(title)) like '%card%' then 'CARDS'
      else 'ANNOUNCEMENTS'
    end;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='push_subscriptions_alert_types_check') then
    alter table public.push_subscriptions
      add constraint push_subscriptions_alert_types_check
      check (
        cardinality(alert_types) between 1 and 8
        and alert_types <@ array['FIXTURES','KICKOFF','GOALS','CARDS','FULL_TIME','NEWS','ANNOUNCEMENTS','MATCH_UPDATES']::text[]
      );
  end if;
  if not exists (select 1 from pg_constraint where conname='league_alerts_alert_type_check') then
    alter table public.league_alerts
      add constraint league_alerts_alert_type_check
      check (alert_type in ('FIXTURES','KICKOFF','GOALS','CARDS','FULL_TIME','NEWS','ANNOUNCEMENTS','MATCH_UPDATES'));
  end if;
  if not exists (select 1 from pg_constraint where conname='league_alerts_delivery_status_check') then
    alter table public.league_alerts
      add constraint league_alerts_delivery_status_check
      check (delivery_status in ('PENDING','SENT','NO_RECIPIENTS','FAILED'));
  end if;
end $$;

create table if not exists public.league_alert_deliveries (
  alert_id bigint not null references public.league_alerts(id) on delete cascade,
  endpoint text not null,
  outcome text not null check (outcome in ('DELIVERED','EXPIRED')),
  delivered_at timestamptz not null default now(),
  last_error text,
  primary key (alert_id, endpoint)
);

alter table public.league_alert_deliveries enable row level security;
revoke all on public.league_alert_deliveries from public, anon, authenticated;
grant all on public.league_alert_deliveries to service_role;

create index if not exists league_alerts_pending_delivery_idx
  on public.league_alerts (created_at)
  where delivery_status = 'PENDING';

create or replace function public.queue_club_alert(
  p_home text, p_away text, p_match_id bigint, p_title text, p_body text
)
returns void
language plpgsql
as $$
declare
  v_type text;
begin
  v_type := case
    when p_title ilike 'New fixture%' then 'FIXTURES'
    when p_title ilike 'GOAL!%' then 'GOALS'
    when p_title ilike '%card%' then 'CARDS'
    when p_title ilike 'Kick-off:%' then 'KICKOFF'
    when p_title ilike 'Full time:%' then 'FULL_TIME'
    else 'MATCH_UPDATES'
  end;
  insert into public.league_alerts (title, body, url, club_names, alert_type)
  values (p_title, p_body, '/', array[p_home, p_away], v_type);
end
$$;

create or replace function public.queue_league_alert(p_title text, p_body text)
returns void
language plpgsql
as $$
declare
  v_type text;
begin
  v_type := case lower(btrim(p_title))
    when 'new fixture' then 'FIXTURES'
    when 'kick-off' then 'KICKOFF'
    when 'full time' then 'FULL_TIME'
    when 'news' then 'NEWS'
    else 'ANNOUNCEMENTS'
  end;
  insert into public.league_alerts (title, body, alert_type)
  values (p_title, p_body, v_type);
end
$$;

create or replace function public.trg_league_alert_fixture()
returns trigger
language plpgsql
as $$
begin
  perform public.queue_club_alert(
    new.home_team, new.away_team, new.id,
    'New fixture: ' || new.home_team || ' v ' || new.away_team,
    new.home_team || ' v ' || new.away_team ||
      coalesce(' at ' || new.venue, '') ||
      ' on ' || to_char(new.match_date at time zone 'UTC', 'DD Mon HH24:MI') || ' UTC'
  );
  return new;
end
$$;

drop trigger if exists league_alert_kickoff on public.matches;

create or replace function public.set_push_preferences(
  p_endpoint text, p_clubs text[], p_alert_types text[]
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_types text[];
begin
  if p_endpoint is null or char_length(p_endpoint) < 20 then
    raise exception 'Subscription not found.';
  end if;
  if p_clubs is not null and cardinality(p_clubs) > 80 then
    raise exception 'Too many clubs.';
  end if;
  if p_alert_types is null or cardinality(p_alert_types) = 0 then
    raise exception 'Choose at least one alert type.';
  end if;
  if exists (
    select 1 from unnest(p_alert_types) as x(alert_type)
    where upper(btrim(x.alert_type)) not in
      ('FIXTURES','KICKOFF','GOALS','CARDS','FULL_TIME','NEWS','ANNOUNCEMENTS','MATCH_UPDATES')
  ) then
    raise exception 'One or more alert types are not supported.';
  end if;
  select array_agg(distinct upper(btrim(x.alert_type)) order by upper(btrim(x.alert_type)))
    into v_types
  from unnest(p_alert_types) as x(alert_type);
  update public.push_subscriptions
     set club_names = p_clubs, alert_types = v_types
   where endpoint = p_endpoint;
  if not found then
    raise exception 'Subscription not found.';
  end if;
end
$$;

create or replace function public.get_push_preferences(p_endpoint text)
returns table (club_names text[], alert_types text[])
language sql
security definer
set search_path = pg_catalog, public
as $$
  select s.club_names, s.alert_types
  from public.push_subscriptions s
  where s.endpoint = p_endpoint
  limit 1
$$;

revoke all on function public.set_push_preferences(text,text[],text[]) from public;
revoke all on function public.get_push_preferences(text) from public;
grant execute on function public.set_push_preferences(text,text[],text[]) to anon, authenticated;
grant execute on function public.get_push_preferences(text) to anon, authenticated;