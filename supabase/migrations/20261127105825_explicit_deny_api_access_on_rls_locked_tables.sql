-- Make intentional API denial explicit on RLS-protected internal/retired tables.
-- These tables had RLS enabled, no policies, and no table privileges for anon/authenticated.
-- Restrictive false policies preserve default denial if a future permissive policy is added.
-- Privileged backend/service operations are unaffected; no records are modified.
do $$
declare
  v_table text;
  v_tables text[] := array[
    'account_status_log','club_alerts','club_profile_change_audit','club_profile_change_requests',
    'club_registration_applications','cup_ties','developer_account_sessions','email_outbox',
    'fan_reports','fm_activity','fm_admins','fm_events','fm_fixtures','fm_leagues','fm_players',
    'fm_system','fm_teams','league_alert_deliveries','league_alerts','league_board_members',
    'league_role_responsibilities','league_verification_audit','league_verification_requests',
    'match_comments','match_predictions','player_registration_history','player_reports',
    'player_transfer_requests','poll_options','poll_votes','polls','push_match_reminders',
    'push_vapid_keys','referee_offline_submissions','slfa_activity_audit','slfa_test_accounts',
    'slfa_test_activity','slfa_test_records','squad_transfers','system_pause','system_pause_log'
  ];
  v_oid oid;
  v_policy_count integer;
begin
  foreach v_table in array v_tables loop
    select c.oid into v_oid
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = v_table
      and c.relkind = 'r'
      and c.relrowsecurity;

    if v_oid is null then
      raise exception 'Expected RLS-enabled table public.% was not found; aborting.', v_table;
    end if;

    select count(*) into v_policy_count
    from pg_policy
    where polrelid = v_oid;

    if v_policy_count <> 0 then
      raise exception 'Table public.% no longer has zero policies; review it manually.', v_table;
    end if;

    if has_table_privilege('anon', v_oid, 'SELECT')
       or has_table_privilege('anon', v_oid, 'INSERT')
       or has_table_privilege('anon', v_oid, 'UPDATE')
       or has_table_privilege('anon', v_oid, 'DELETE')
       or has_table_privilege('authenticated', v_oid, 'SELECT')
       or has_table_privilege('authenticated', v_oid, 'INSERT')
       or has_table_privilege('authenticated', v_oid, 'UPDATE')
       or has_table_privilege('authenticated', v_oid, 'DELETE') then
      raise exception 'Table public.% has client grants; stop for a specific access review.', v_table;
    end if;

    execute format(
      'create policy %I on public.%I as restrictive for all to anon, authenticated using (false) with check (false)',
      'deny_api_roles_' || v_table,
      v_table
    );
  end loop;
end
$$;
