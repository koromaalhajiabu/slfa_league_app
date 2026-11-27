-- Align direct API table grants with the actual permissive RLS policies.
-- This changes privileges only; it does not alter records, RLS policies, or service_role access.
-- Public and authenticated operations are retained only where a matching permissive policy
-- grants that action to the role (or to PUBLIC). SECURITY DEFINER RPCs remain unaffected.
DO $$
DECLARE
  v_table record;
  v_role name;
  v_privilege text;
  v_policy_command text;
BEGIN
  FOR v_table IN
    SELECT c.oid, c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity
    ORDER BY c.relname
  LOOP
    FOREACH v_role IN ARRAY ARRAY['anon'::name, 'authenticated'::name]
    LOOP
      FOREACH v_privilege IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']
      LOOP
        v_policy_command := CASE v_privilege
          WHEN 'SELECT' THEN 'SELECT'
          WHEN 'INSERT' THEN 'INSERT'
          WHEN 'UPDATE' THEN 'UPDATE'
          WHEN 'DELETE' THEN 'DELETE'
        END;

        IF has_table_privilege(v_role, v_table.oid, v_privilege)
           AND NOT EXISTS (
             SELECT 1
             FROM pg_policies p
             WHERE p.schemaname = 'public'
               AND p.tablename = v_table.relname
               AND p.permissive = 'PERMISSIVE'
               AND p.cmd IN ('ALL', v_policy_command)
               AND (
                 p.roles @> ARRAY[v_role]::name[]
                 OR p.roles @> ARRAY['public'::name]
               )
           )
        THEN
          EXECUTE format(
            'REVOKE %s ON TABLE public.%I FROM %I',
            v_privilege,
            v_table.relname,
            v_role
          );
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
END
$$;
