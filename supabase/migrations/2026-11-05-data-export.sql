-- Super Admin downloads. Every export is checked by the database and written to export_audit.
-- Push subscriptions and the push server keys are never exported.

create table if not exists public.export_audit (
  id bigint generated always as identity primary key,
  user_id uuid default auth.uid(),
  export_name text not null,
  created_at timestamptz not null default now()
);
alter table public.export_audit enable row level security;
drop policy if exists "export audit super admin read" on public.export_audit;
create policy "export audit super admin read" on public.export_audit
  for select to authenticated using (app_role() = 'SUPER_ADMIN');

create or replace function public.export_data(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb := '{}'::jsonb;
  piece jsonb;
  tbl text;
  backup_tables text[] := array[
    'account_cleanup_log','account_status_log','app_settings','application_control','clean_sheets','club_alerts',
    'club_announcements','club_profile_change_audit','club_profile_change_requests','club_registration_applications',
    'club_squad','competition_rules','disciplinary_actions','disciplinary_rules','email_outbox','fan_reports',
    'fm_activity','fm_admins','fm_events','fm_fixtures','fm_leagues','fm_players','fm_system','fm_teams',
    'league_alerts','league_board_members','league_clubs','league_role_responsibilities','league_standings',
    'league_verification_audit','league_verification_requests','leagues','man_of_the_match','match_audit_log',
    'match_comments','match_disputes','match_events','match_lineups','match_predictions','match_referee_assignments',
    'match_result_changes','match_results','match_team_sheets','matches','media_posts','motm_awards','my_favorite_clubs',
    'player_registration_history','player_reports','player_suspension_flags',
    'player_transfer_requests','poll_options','poll_votes','polls','public_squad_photos','referee_offline_submissions',
    'role_access_requests','role_change_log','role_invitations','seasons','squad_transfers','suspension_rules',
    'suspensions','system_pause','system_pause_log','top_assists','top_scorers','user_favorite_clubs','user_profiles'
  ];
begin
  if app_role() is distinct from 'SUPER_ADMIN' then
    raise exception 'Only the Super Admin can download data';
  end if;

  insert into public.export_audit (user_id, export_name) values (auth.uid(), p_name);

  if p_name = 'matches' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.match_date), '[]'::jsonb) into result from (
      select id, match_date, venue, home_team, away_team, home_score, away_score, match_status from public.matches
    ) x;
  elsif p_name = 'standings' then
    select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into result from public.league_standings x;
  elsif p_name = 'suspensions' then
    select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into result from (
      select s.id, sq.player_name, lc.club_name, s.reason, s.matches_total, s.matches_served,
             (s.matches_total - s.matches_served) as matches_left, s.status, s.created_at
      from public.suspensions s
      left join public.club_squad sq on sq.id = s.player_id
      left join public.league_clubs lc on lc.id = sq.club_id
    ) x;
  elsif p_name = 'full_backup' then
    foreach tbl in array backup_tables loop
      execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t', tbl) into piece;
      result := result || jsonb_build_object(tbl, piece);
    end loop;
    result := jsonb_build_object('exported_at', now(), 'tables', result);
  else
    raise exception 'Unknown export';
  end if;
  return result;
end $$;

revoke execute on function public.export_data(text) from anon;
grant execute on function public.export_data(text) to authenticated;
