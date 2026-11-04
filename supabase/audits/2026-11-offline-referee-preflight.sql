-- Run this preflight before 2026-11-offline-referee-results.sql.
-- Read-only: confirms the exact matches.id type and existing referee final-score RPC signature.

select table_name, column_name, data_type, udt_name, is_nullable
from information_schema.columns
where table_schema='public'
  and ((table_name='matches' and column_name='id')
    or (table_name='match_results' and column_name in ('match_id','id')))
order by table_name, ordinal_position;

select p.proname,
       pg_get_function_identity_arguments(p.oid) as arguments,
       pg_get_function_result(p.oid) as result_type,
       p.prosecdef as security_definer,
       p.proconfig as function_settings
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname='referee_submit_final';

select to_regclass('public.referee_offline_submissions') as offline_submission_table,
       to_regprocedure('public.enforce_slfa_application_controls()') as maintenance_trigger_function;
