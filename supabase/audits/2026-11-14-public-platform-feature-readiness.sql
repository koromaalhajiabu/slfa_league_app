-- SLFA League App: read-only public platform feature readiness audit
-- Run in Supabase SQL Editor. This script does not modify data or schema.
-- It checks whether the database objects required by the existing public features exist.

WITH expected(kind, object_name) AS (
  VALUES
    ('TABLE','matches'),
    ('TABLE','match_events'),
    ('TABLE','match_lineups'),
    ('TABLE','league_clubs'),
    ('TABLE','league_standings'),
    ('TABLE','leagues'),
    ('TABLE','seasons'),
    ('TABLE','club_squad'),
    ('TABLE','top_scorers'),
    ('TABLE','top_assists'),
    ('TABLE','clean_sheets'),
    ('TABLE','motm_awards'),
    ('TABLE','media_posts'),
    ('TABLE','user_favorite_clubs'),
    ('TABLE','push_subscriptions'),
    ('TABLE','league_alerts'),
    ('TABLE','match_comments'),
    ('TABLE','fan_reports'),
    ('TABLE','app_events'),
    ('TABLE','audit_logs'),
    ('TABLE','referee_offline_submissions'),
    ('FUNCTION','submit_match_comment'),
    ('FUNCTION','submit_fan_report'),
    ('FUNCTION','set_push_clubs'),
    ('FUNCTION','log_app_event'),
    ('FUNCTION','analytics_summary'),
    ('FUNCTION','season_table'),
    ('FUNCTION','create_season'),
    ('FUNCTION','set_current_season'),
    ('FUNCTION','queue_kickoff_reminders')
),
checked AS (
  SELECT
    e.kind,
    e.object_name,
    CASE
      WHEN e.kind = 'TABLE' THEN to_regclass('public.' || e.object_name) IS NOT NULL
      ELSE EXISTS (
        SELECT 1
        FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = e.object_name
      )
    END AS exists_now
  FROM expected e
)
SELECT
  kind,
  object_name,
  CASE WHEN exists_now THEN 'PRESENT' ELSE 'MISSING' END AS status
FROM checked
ORDER BY kind, object_name;

-- Separate read-only check: scheduled jobs, if pg_cron is installed.
SELECT
  CASE WHEN to_regclass('cron.job') IS NULL
    THEN 'pg_cron not installed or cron.job is not accessible'
    ELSE 'pg_cron catalog exists; inspect scheduled jobs in Supabase Dashboard'
  END AS cron_status;
