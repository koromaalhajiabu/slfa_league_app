-- SLFA League App security verification report.
-- READ-ONLY: run after the security-hardening migrations.
-- Export the result sets and review them before any live-data pilot.

-- 1. Row-level security on operational and identity tables.
select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as force_rls,
       pg_get_userbyid(c.relowner) as owner
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relkind in ('r','p')
  and c.relname = any(array[
    'user_profiles','role_invitations','role_change_log','application_control','system_pause',
    'league_clubs','leagues','matches','match_events','match_lineups','match_results',
    'match_referee_assignments','club_squad','squad_transfers','media_posts',
    'club_announcements','disciplinary_actions','suspensions','polls','poll_options',
    'club_profile_change_requests','club_profile_change_audit','finance_transactions',
    'club_registration_applications','league_verification_requests','role_access_requests',
    'staff_registry','staff_departments','league_board_members','app_settings'
  ])
order by c.relname;

-- 2. RLS policies. Review that writes are role- and club-scoped, not merely authenticated.
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname='public'
  and tablename = any(array[
    'user_profiles','role_invitations','role_change_log','application_control','system_pause',
    'league_clubs','leagues','matches','match_events','match_lineups','match_results',
    'match_referee_assignments','club_squad','squad_transfers','media_posts',
    'club_announcements','disciplinary_actions','suspensions','polls','poll_options',
    'club_profile_change_requests','club_profile_change_audit','finance_transactions',
    'club_registration_applications','league_verification_requests','role_access_requests',
    'staff_registry','staff_departments','league_board_members','app_settings'
  ])
order by tablename, policyname;

-- 3. Client grants on the main data tables.
select c.relname as object_name,
       case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as grantee,
       a.privilege_type,
       a.is_grantable
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
where n.nspname='public'
  and c.relname = any(array[
    'user_profiles','role_invitations','matches','match_events','match_lineups',
    'match_results','match_referee_assignments','club_squad','squad_transfers',
    'media_posts','disciplinary_actions','suspensions','application_control','system_pause'
  ])
  and (a.grantee=0 or a.grantee in (select oid from pg_roles where rolname in ('anon','authenticated','service_role')))
order by c.relname, grantee, a.privilege_type;

-- 4. Sensitive RPC signatures, SECURITY DEFINER status, search_path, and client EXECUTE rights.
select p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef as security_definer,
       p.proconfig as function_settings,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_can_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_can_execute,
       has_function_privilege('service_role',p.oid,'EXECUTE') as service_role_can_execute
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname = any(array[
    'app_role','invite_user','set_user_role','set_account_status','delete_user_account',
    'set_application_freeze','set_system_pause','set_user_club','submit_club_profile_change',
    'review_club_profile_change','record_match_result','approve_match_result',
    'referee_submit_final','reverse_match_event','set_match_motm'
  ])
order by p.proname, arguments;

-- 5. Confirm the server-side control triggers exist on real tables.
select c.relname as table_name,
       t.tgname as trigger_name,
       pg_get_triggerdef(t.oid,true) as trigger_definition,
       t.tgenabled as enabled_state
from pg_trigger t
join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and t.tgname='enforce_slfa_application_controls'
  and not t.tgisinternal
order by c.relname;

-- 6. Control state and offline idempotency column.
select id, app_frozen, changed_at from public.application_control where id=1;
select id, paused, changed_at from public.system_pause where id=1;
select table_name, column_name, data_type
from information_schema.columns
where table_schema='public' and table_name='match_events' and column_name='client_event_id';

-- 7. Storage policies for the Developer profile-photo bucket.
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname='storage' and tablename='objects'
order by policyname;

-- 8. Confirm the application-control read policies are public, but writes are not granted directly.
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname='public' and tablename in ('application_control','system_pause')
order by tablename, policyname;
