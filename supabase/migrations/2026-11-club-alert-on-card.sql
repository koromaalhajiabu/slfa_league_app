-- Queue a league alert when a yellow or red card is published, matching the goal alert.
create or replace function public.club_alert_on_card()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare m public.matches%rowtype; label text;
begin
  if new.event_type not in ('YELLOW_CARD', 'RED_CARD') or new.published_at is null then return new; end if;
  select * into m from public.matches where id = new.match_id::bigint;
  if not found then return new; end if;
  label := case when new.event_type = 'RED_CARD' then 'Red card' else 'Yellow card' end;
  perform public.queue_club_alert(m.home_team, m.away_team, m.id,
    label || ': ' || new.team_name,
    coalesce(new.player_name, 'A player') || ' is shown a ' || lower(label) || ' (' || coalesce(new.minute::text, '?') || ''').');
  return new;
end
$function$;

drop trigger if exists trg_club_alert_card on public.match_events;
create trigger trg_club_alert_card
after insert on public.match_events
for each row execute function public.club_alert_on_card();
