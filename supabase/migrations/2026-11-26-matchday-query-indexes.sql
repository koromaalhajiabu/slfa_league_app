-- Index the highest-traffic matchday access paths:
-- club fixture lookups, assigned staff queues, live event timelines,
-- approved line-up reads, and pending staff invitations.

create index if not exists matches_home_club_status_date_idx
  on public.matches (home_club_id, match_status, match_date)
  where home_club_id is not null;

create index if not exists matches_away_club_status_date_idx
  on public.matches (away_club_id, match_status, match_date)
  where away_club_id is not null;

create index if not exists matches_season_league_date_idx
  on public.matches (season_id, league_id, match_date desc);

create index if not exists match_referee_assignments_staff_status_role_idx
  on public.match_referee_assignments (referee_user_id, assignment_status, official_role, assigned_at desc);

create index if not exists match_events_fixture_timeline_idx
  on public.match_events (match_id, minute, recorded_at);

create index if not exists match_lineups_fixture_club_player_idx
  on public.match_lineups (match_id, club_id, player_id);

create index if not exists club_squad_approved_club_season_jersey_idx
  on public.club_squad (club_id, season_id, jersey_number)
  where status = 'Active' and registration_status = 'Approved';

create index if not exists user_profiles_staff_role_status_name_idx
  on public.user_profiles (system_role, status, full_name);

drop index if exists public.role_invitations_pending_email_idx;
create index role_invitations_pending_email_idx
  on public.role_invitations (invited_at desc)
  where invitation_status in ('PENDING','ACCOUNT_CREATED');
