-- SLFA League App: read-only pre-production access review.
-- Run only in the Supabase SQL Editor or another trusted administrative session.
-- This script contains SELECT statements only. It does not change policies, grants or data.

-- 1. Exposed public tables: RLS status, policy counts and direct client grants.
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  count(p.oid) as policy_count,
  has_table_privilege('anon', c.oid, 'SELECT') as anon_select,
  has_table_privilege('anon', c.oid, 'INSERT') as anon_insert,
  has_table_privilege('anon', c.oid, 'UPDATE') as anon_update,
  has_table_privilege('anon', c.oid, 'DELETE') as anon_delete,
  has_table_privilege('authenticated', c.oid, 'SELECT') as authenticated_select,
  has_table_privilege('authenticated', c.oid, 'INSERT') as authenticated_insert,
  has_table_privilege('authenticated', c.oid, 'UPDATE') as authenticated_update,
  has_table_privilege('authenticated', c.oid, 'DELETE') as authenticated_delete
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public' and c.relkind = 'r'
group by c.oid, c.relname, c.relrowsecurity
order by c.relname;

-- 2. SECURITY DEFINER functions callable by client roles.
-- Review the function body and intended audience before changing EXECUTE grants.
select
  p.oid::regprocedure as function_signature,
  pg_get_userbyid(p.proowner) as function_owner,
  p.prosecdef as security_definer,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
  coalesce(array_to_string(p.proconfig, ', '), '(no function-level settings)') as function_settings
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
  and (
    has_function_privilege('anon', p.oid, 'EXECUTE')
    or has_function_privilege('authenticated', p.oid, 'EXECUTE')
  )
order by p.proname, p.oid::regprocedure::text;

-- 3. Views in the exposed schema. Check security_invoker settings before public access.
select
  c.relname as view_name,
  coalesce(c.reloptions, array[]::text[]) as view_options,
  has_table_privilege('anon', c.oid, 'SELECT') as anon_select,
  has_table_privilege('authenticated', c.oid, 'SELECT') as authenticated_select
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('v', 'm')
order by c.relname;

-- 4. Storage bucket visibility. Public buckets should contain only intentionally public assets.
select id, name, public
from storage.buckets
order by name;

-- 5. Current application data footprint for match operations.
select 'matches' as table_name, count(*) as row_count from public.matches
union all select 'match_team_sheets', count(*) from public.match_team_sheets
union all select 'referee_match_record_submissions', count(*) from public.referee_match_record_submissions
union all select 'match_commissioner_reports', count(*) from public.match_commissioner_reports
union all select 'slfa_integrity_alerts', count(*) from public.slfa_integrity_alerts
union all select 'slfa_integrity_alert_history', count(*) from public.slfa_integrity_alert_history;
