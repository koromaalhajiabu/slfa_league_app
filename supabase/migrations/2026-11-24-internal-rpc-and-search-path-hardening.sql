-- Keep trigger/helper functions internal and pin helper search paths.
-- Trigger invocation is unaffected by revoking direct RPC EXECUTE access.

REVOKE EXECUTE ON FUNCTION public.auto_refresh_marampa_womens_standings() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.capture_slfa_activity_audit() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.club_alert_on_card() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.club_alert_on_goal() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.club_alert_on_match_status() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_system_pause() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_match_data_recalculate_clean_sheets() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_slfa_owner_account() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_slfa_owner_privacy_request() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_alert_team_sheet() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_league_alert_kickoff() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_league_alert_news() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_league_alert_result() FROM PUBLIC, anon, authenticated;

-- Maintenance entry points are reserved for database owners and scheduled jobs.
REVOKE EXECUTE ON FUNCTION public.queue_kickoff_reminders() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalculate_clean_sheets() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_marampa_womens_standings() FROM PUBLIC, anon, authenticated;

-- Analytics summary is a staff-only endpoint; its function body still checks Developer/Super Admin.
REVOKE EXECUTE ON FUNCTION public.analytics_summary(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.analytics_summary(integer) TO authenticated;

ALTER FUNCTION public.match_season(bigint, timestamptz) SET search_path TO public, pg_catalog;
ALTER FUNCTION public.league_club_name(bigint, text) SET search_path TO public, pg_catalog;
ALTER FUNCTION public.refresh_league_standings(bigint) SET search_path TO public, pg_catalog;
