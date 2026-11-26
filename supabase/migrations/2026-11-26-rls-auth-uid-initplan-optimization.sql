-- Rebuild public RLS policies that call auth.uid() directly.
-- Wrap auth.uid() in a scalar subselect so Postgres can evaluate the request identity
-- once per statement instead of re-evaluating it for each candidate row.
-- The policy names, commands, roles, permissive/restrictive modes, USING and WITH CHECK
-- predicates are otherwise preserved exactly.

do $migration$
declare
  p record;
  v_roles text;
  v_command text;
  v_mode text;
  v_using text;
  v_check text;
  v_sql text;
  v_changed integer := 0;
begin
  for p in
    select pol.polname, pol.polrelid, pol.polcmd, pol.polpermissive,
           pol.polroles,
           pg_get_expr(pol.polqual, pol.polrelid) as using_expr,
           pg_get_expr(pol.polwithcheck, pol.polrelid) as check_expr
      from pg_policy pol
      join pg_class cls on cls.oid = pol.polrelid
      join pg_namespace ns on ns.oid = cls.relnamespace
     where ns.nspname = 'public'
       and (
         coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') like '%auth.uid()%'
         or coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') like '%auth.uid()%'
       )
  loop
    select string_agg(
             case when x.role_oid = 0 then 'PUBLIC' else quote_ident(r.rolname) end,
             ', ' order by x.role_oid
           )
      into v_roles
      from unnest(p.polroles) as x(role_oid)
      left join pg_roles r on r.oid = x.role_oid;

    v_command := case p.polcmd
      when '*' then 'ALL'
      when 'r' then 'SELECT'
      when 'a' then 'INSERT'
      when 'w' then 'UPDATE'
      when 'd' then 'DELETE'
      else null
    end;
    if v_command is null or v_roles is null then
      raise exception 'Could not safely rebuild policy % on %.', p.polname, p.polrelid::regclass;
    end if;

    v_mode := case when p.polpermissive then 'PERMISSIVE' else 'RESTRICTIVE' end;
    v_using := case when p.using_expr is null then null
                    else replace(p.using_expr, 'auth.uid()', '(select auth.uid())') end;
    v_check := case when p.check_expr is null then null
                    else replace(p.check_expr, 'auth.uid()', '(select auth.uid())') end;

    execute format('drop policy %I on %s', p.polname, p.polrelid::regclass);
    v_sql := format('create policy %I on %s as %s for %s to %s',
                    p.polname, p.polrelid::regclass, v_mode, v_command, v_roles);
    if v_using is not null then
      v_sql := v_sql || ' using (' || v_using || ')';
    end if;
    if v_check is not null then
      v_sql := v_sql || ' with check (' || v_check || ')';
    end if;
    execute v_sql;
    v_changed := v_changed + 1;
  end loop;

  raise notice 'Rebuilt % public policies with initplan-safe auth.uid() expressions.', v_changed;
end
$migration$;
