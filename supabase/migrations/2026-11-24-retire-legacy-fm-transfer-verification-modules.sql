begin;
-- Preserve data while disabling database modules that are outside the SLFA
-- League App: FM manager, board directory, verification, player reports and
-- squad transfers. Their client access and RLS policies are removed.
do $$
declare
  t record;
  pol record;
  fn record;
  seqrow record;
begin
  for t in
    select n.nspname,c.relname
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r'
      and (
        c.relname like 'fm\_%' escape '\'
        or c.relname in (
          'league_board_members','league_role_responsibilities',
          'league_verification_requests','league_verification_audit',
          'player_reports','squad_transfers','club_profile_change_audit'
        )
      )
  loop
    execute format('alter table %I.%I enable row level security',t.nspname,t.relname);
    execute format('revoke all on table %I.%I from public,anon,authenticated',t.nspname,t.relname);
    for pol in select policyname from pg_policies
      where schemaname=t.nspname and tablename=t.relname
    loop
      execute format('drop policy if exists %I on %I.%I',pol.policyname,t.nspname,t.relname);
    end loop;
  end loop;
  for fn in
    select n.nspname,pr.proname,pg_get_function_identity_arguments(pr.oid) args
    from pg_proc pr join pg_namespace n on n.oid=pr.pronamespace
    where n.nspname='public' and pr.prokind='f'
      and pr.proname like 'fm\_%' escape '\'
  loop
    execute format('revoke all on function %I.%I(%s) from public,anon,authenticated',fn.nspname,fn.proname,fn.args);
  end loop;
  for seqrow in
    select n.nspname,c.relname
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='S'
      and c.relname like 'fm\_%' escape '\'
  loop
    execute format('revoke all on sequence %I.%I from public,anon,authenticated',seqrow.nspname,seqrow.relname);
  end loop;
end $$;
commit;
notify pgrst,'reload schema';
