-- Serialize fixture imports by competition, season, home/away club and Freetown match date.
-- This is a no-op when the same advisory lock is already present.
do $migration$
declare
  v_definition text;
  v_anchor text := '    if exists (' || chr(10) || '      select 1' || chr(10) || '        from public.matches m';
  v_lock text := '    perform pg_advisory_xact_lock(hashtextextended(v_key, 0));' || chr(10) || chr(10);
begin
  v_definition := pg_get_functiondef('public.admin_import_fixtures(jsonb)'::regprocedure);
  if position('pg_advisory_xact_lock(hashtextextended(v_key, 0))' in v_definition)>0 then
    return;
  end if;
  if position(v_anchor in v_definition)=0 then
    raise exception 'Fixture duplicate-check insertion point not found; no function changed.';
  end if;
  v_definition := replace(v_definition,v_anchor,v_lock || v_anchor);
  execute v_definition;
end
$migration$;
