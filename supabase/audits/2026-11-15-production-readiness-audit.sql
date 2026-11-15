-- SLFA League App — Production Readiness Audit
-- READ-ONLY: this script does not insert, update, delete, or alter application data.
-- Run in the Supabase SQL Editor using the project owner account.
-- Export each result set and review it before any live SLFA pilot.

-- 1. Critical table inventory and row-level security.
with required(table_name) as (
  values
    ('user_profiles'),('role_invitations'),('role_change_log'),
    ('application_control'),('system_pause'),('leagues'),('seasons'),
    ('league_clubs'),('league_standings'),('matches'),('match_events'),
    ('match_lineups'),('match_referee_assignments'),('match_results'),
    ('referee_offline_submissions'),('club_squad'),('disciplinary_actions'),
    ('suspensions'),('media_posts'),('fan_reports'),('match_comments'),
    ('push_subscriptions'),('cup_ties'),('slfa_activity_audit'),
    ('app_events'),('export_audit'),('privacy_requests')
)
select r.table_name,
       (c.oid is not null) as exists,
       coalesce(c.relrowsecurity,false) as rls_enabled,
       coalesce(c.relforcerowsecurity,false) as force_rls,
       case when c.oid is null then 'MISSING'
            when not c.relrowsecurity then 'RLS DISABLED'
            else 'PRESENT' end as status
from required r
left join pg_namespace n on n.nspname='public'
left join pg_class c on c.relnamespace=n.oid and c.relname=r.table_name
order by r.table_name;

-- 2. Policies on the critical tables. Inspect every write policy for role scoping.
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname='public'
  and tablename in (
    'user_profiles','role_invitations','role_change_log','application_control',
    'system_pause','leagues','seasons','league_clubs','league_standings','matches',
    'match_events','match_lineups','match_referee_assignments','match_results',
    'referee_offline_submissions','club_squad','disciplinary_actions','suspensions',
    'media_posts','fan_reports','match_comments','push_subscriptions','cup_ties',
    'slfa_activity_audit','app_events','export_audit','privacy_requests'
  )
order by tablename, policyname;

-- 3. Client grants on sensitive tables.
select c.relname as table_name,
       case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as grantee,
       a.privilege_type, a.is_grantable
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
where n.nspname='public'
  and c.relname in (
    'user_profiles','role_invitations','application_control','system_pause',
    'matches','match_events','match_lineups','match_referee_assignments',
    'match_results','referee_offline_submissions','club_squad','disciplinary_actions',
    'suspensions','media_posts','fan_reports','cup_ties','slfa_activity_audit'
  )
  and (a.grantee=0 or a.grantee in (select oid from pg_roles where rolname in ('anon','authenticated','service_role')))
order by c.relname, grantee, a.privilege_type;

-- 4. Sensitive RPC security posture: SECURITY DEFINER, search_path and execute grants.
select p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef as security_definer,
       p.proconfig as function_settings,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_can_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in (
    'app_role','invite_user','set_user_role','set_account_status','delete_user_account',
    'set_application_freeze','set_system_pause','record_match_result','approve_match_result',
    'referee_submit_final','referee_submit_final_idempotent','reverse_match_event',
    'admin_save_cup_tie','admin_advance_cup_tie','admin_activity_audit_feed',
    'analytics_summary','admin_upsert_competition','create_season','set_current_season'
  )
order by p.proname, arguments;

-- 5. Application-control and audit triggers currently installed.
select c.relname as table_name, t.tgname as trigger_name,
       t.tgenabled as enabled_state, pg_get_triggerdef(t.oid,true) as definition
from pg_trigger t
join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and not t.tgisinternal
  and (t.tgname ilike '%slfa_application_controls%' or t.tgname ilike '%activity_audit%')
order by c.relname, t.tgname;

-- 6. Global maintenance state. Expected before a normal launch: app_frozen=false and paused=false.
select id, app_frozen, changed_at from public.application_control where id=1;
select id, paused, changed_at from public.system_pause where id=1;

-- 7. Account distribution by role and status (no names or email addresses).
select upper(coalesce(system_role,'UNASSIGNED')) as system_role,
       lower(coalesce(status,'UNKNOWN')) as account_status,
       count(*) as account_count
from public.user_profiles
group by 1,2
order by 1,2;

-- 8. Retired Club Manager role check. Expected count: zero.
select count(*) as remaining_club_admin_profiles
from public.user_profiles
where upper(coalesce(system_role,''))='CLUB_ADMIN';

select count(*) as remaining_club_admin_invitations
from public.role_invitations
where upper(coalesce(system_role,''))='CLUB_ADMIN';

-- 9. Match integrity checks.
select
  count(*) filter (where upper(coalesce(match_status,''))='FT' and (home_score is null or away_score is null)) as full_time_without_scores,
  count(*) filter (where (home_score is not null or away_score is not null) and upper(coalesce(match_status,''))<>'FT') as scored_non_full_time_matches,
  count(*) filter (where league_id is null) as matches_without_competition,
  count(*) filter (where season_id is null) as matches_without_explicit_season
from public.matches;

-- 10. Duplicate-protection checks. Expected duplicate counts: zero.
select count(*) as duplicate_client_event_ids
from (
  select client_event_id from public.match_events
  where client_event_id is not null
  group by client_event_id having count(*)>1
) d;

select count(*) as duplicate_referee_submission_ids
from (
  select client_submission_id from public.referee_offline_submissions
  group by client_submission_id having count(*)>1
) d;

-- 11. Cup bracket integrity.
select
  count(*) filter (where l.id is null or upper(coalesce(l.competition_type,''))<>'CUP') as ties_without_valid_cup,
  count(*) filter (where m.id is null) as ties_without_match,
  count(*) filter (where t.next_tie_id is not null and nt.id is null) as ties_with_missing_next_tie
from public.cup_ties t
left join public.leagues l on l.id=t.competition_id
left join public.matches m on m.id=t.match_id
left join public.cup_ties nt on nt.id=t.next_tie_id;

-- 12. Season integrity and overlaps.
select s.id, s.name, s.start_date, s.end_date, s.is_current,
       (s.start_date > s.end_date) as invalid_date_range
from public.seasons s
order by s.start_date;

select count(*) as current_season_count
from public.seasons where is_current=true;

-- 13. Storage bucket configuration and storage policies.
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id in ('developer-profiles','media','news','club-logos');

select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname='storage' and tablename='objects'
order by policyname;

-- 14. Recent operational activity and audit-attribution coverage.
-- NULL actor_id / actor_role values are reported, not rewritten or guessed.
select coalesce(actor_role, '<NULL>') as actor_role,
       table_name, operation,
       count(*) as changes,
       count(*) filter (where actor_id is null) as missing_actor_id,
       count(*) filter (where actor_role is null) as missing_actor_role,
       count(distinct actor_id) as distinct_actors
from public.slfa_activity_audit
where occurred_at >= now() - interval '30 days'
group by actor_role, table_name, operation
order by changes desc, table_name;

-- 15. Recent audit samples for investigating attribution.
-- This displays UUIDs only; it does not expose account names or email addresses.
select id, actor_id, actor_role, table_name, operation, row_id, occurred_at
from public.slfa_activity_audit
where occurred_at >= now() - interval '30 days'
order by occurred_at desc
limit 100;
