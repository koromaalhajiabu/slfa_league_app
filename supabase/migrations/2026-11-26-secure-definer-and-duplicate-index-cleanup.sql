-- Reduce elevated RPC access and remove two confirmed duplicate indexes.
-- Fixture import is now SECURITY INVOKER and remains constrained by the existing
-- Super Admin-only matches INSERT RLS policy. The email-confirmation function is
-- trigger-only and no longer executable through PostgREST.

do $migration$
declare
  v_definition text;
begin
  v_definition := pg_get_functiondef('public.admin_import_fixtures(jsonb)'::regprocedure);
  if position('SECURITY DEFINER' in v_definition)=0 then
    raise exception 'Expected SECURITY DEFINER clause not found for fixture importer.';
  end if;
  v_definition := replace(v_definition,'SECURITY DEFINER','SECURITY INVOKER');
  execute v_definition;
end
$migration$;

revoke all on function public.handle_auth_user_email_confirmed() from public;
revoke all on function public.handle_auth_user_email_confirmed() from anon;
revoke all on function public.handle_auth_user_email_confirmed() from authenticated;

drop index if exists public.league_standings_club_unique_idx;
drop index if exists public.match_one_active_main_referee;
