drop policy if exists competition_rules_super_admin_insert on public.competition_rules;
drop policy if exists competition_rules_super_admin_update on public.competition_rules;
drop policy if exists competition_rules_super_admin_delete on public.competition_rules;

create policy competition_rules_super_admin_insert
on public.competition_rules for insert to authenticated
with check (
  public.app_role() = 'SUPER_ADMIN'
  and exists (select 1 from public.user_profiles up where up.id = auth.uid() and up.status = 'Active' and up.system_role = 'SUPER_ADMIN')
);

create policy competition_rules_super_admin_update
on public.competition_rules for update to authenticated
using (
  public.app_role() = 'SUPER_ADMIN'
  and exists (select 1 from public.user_profiles up where up.id = auth.uid() and up.status = 'Active' and up.system_role = 'SUPER_ADMIN')
)
with check (
  public.app_role() = 'SUPER_ADMIN'
  and exists (select 1 from public.user_profiles up where up.id = auth.uid() and up.status = 'Active' and up.system_role = 'SUPER_ADMIN')
);

create policy competition_rules_super_admin_delete
on public.competition_rules for delete to authenticated
using (
  public.app_role() = 'SUPER_ADMIN'
  and exists (select 1 from public.user_profiles up where up.id = auth.uid() and up.status = 'Active' and up.system_role = 'SUPER_ADMIN')
);
