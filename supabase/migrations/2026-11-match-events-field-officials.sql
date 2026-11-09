-- Goals, cards and substitutions are recorded by the assigned referees and match
-- commissioner in the field. The Super Admin assigns officials but no longer
-- records or deletes match events. Developer access is unchanged.
drop policy if exists "events insert" on public.match_events;
create policy "events insert" on public.match_events
  for insert
  with check (
    (app_role() = 'DEVELOPER' and exists (
      select 1 from public.user_profiles up
      where up.id = auth.uid() and up.system_role = 'DEVELOPER' and up.status = 'Active'))
    or
    (app_role() = 'REFEREE' and exists (
      select 1 from public.user_profiles up
      join public.match_referee_assignments ra on ra.referee_user_id = up.id
      where up.id = auth.uid() and up.system_role = 'REFEREE' and up.status = 'Active'
        and ra.assignment_status = 'ACTIVE' and ra.match_id::text = match_events.match_id))
  );

drop policy if exists "events delete" on public.match_events;
create policy "events delete" on public.match_events
  for delete
  using (
    exists (
      select 1 from public.user_profiles up
      where up.id = auth.uid() and up.system_role = 'DEVELOPER' and up.status = 'Active'
        and app_role() = 'DEVELOPER')
  );
