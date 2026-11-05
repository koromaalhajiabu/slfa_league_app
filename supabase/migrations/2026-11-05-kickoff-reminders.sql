-- One-hour kick-off reminders, sent through the existing league alert queue.
-- Runs every five minutes; a match is reminded once (kickoff_reminder_sent_at).
-- Subscribers receive it only if they follow one of the two clubs (see send-league-alerts).

alter table public.matches add column if not exists kickoff_reminder_sent_at timestamptz;

create or replace function public.queue_kickoff_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  with due as (
    update public.matches m
       set kickoff_reminder_sent_at = now()
     where m.match_status in ('SCHEDULED', 'RESCHEDULED')
       and m.kickoff_reminder_sent_at is null
       and m.match_date between now() + interval '55 minutes' and now() + interval '65 minutes'
    returning m.home_team, m.away_team, m.venue
  ), ins as (
    insert into public.league_alerts (title, body, url, club_names)
    select 'Kick-off in one hour',
           home_team || ' v ' || away_team || coalesce(' · ' || venue, ''),
           '/',
           array[home_team, away_team]
    from due
    returning 1
  )
  select count(*) into n from ins;
  return n;
end $$;

revoke execute on function public.queue_kickoff_reminders() from anon, authenticated;

-- Schedule: switched on by SLFA on 2026-11-05 for all subscribers (pg_cron job "kickoff-reminders", every five minutes).
-- Subscribers who have not chosen clubs also receive these reminders.
-- To switch off:
--   select cron.unschedule('kickoff-reminders');
