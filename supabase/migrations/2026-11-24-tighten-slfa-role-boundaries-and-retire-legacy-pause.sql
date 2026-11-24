begin;

-- The Developer account is a technical platform role. Remove its write access
-- to football records while keeping the agreed account, role, analytics and
-- whole-application maintenance controls.

drop policy if exists "staff write" on public.clean_sheets;
create policy "Super Admin maintains clean sheets"
on public.clean_sheets for all to authenticated
using (public.app_role() = 'SUPER_ADMIN')
with check (public.app_role() = 'SUPER_ADMIN');

drop policy if exists "staff write" on public.top_scorers;
create policy "Super Admin maintains top scorers"
on public.top_scorers for all to authenticated
using (public.app_role() = 'SUPER_ADMIN')
with check (public.app_role() = 'SUPER_ADMIN');

drop policy if exists "staff write" on public.top_assists;
create policy "Super Admin maintains top assists"
on public.top_assists for all to authenticated
using (public.app_role() = 'SUPER_ADMIN')
with check (public.app_role() = 'SUPER_ADMIN');

drop policy if exists "motm insert" on public.man_of_the_match;
create policy "motm insert"
on public.man_of_the_match for insert to authenticated
with check (public.app_role() in ('REFEREE','SUPER_ADMIN') and created_by = (select auth.uid()));

drop policy if exists "motm update" on public.man_of_the_match;
create policy "motm update"
on public.man_of_the_match for update to authenticated
using (
  public.app_role() = 'SUPER_ADMIN'
  or (public.app_role() = 'REFEREE' and created_by = (select auth.uid()))
)
with check (
  public.app_role() = 'SUPER_ADMIN'
  or (public.app_role() = 'REFEREE' and created_by = (select auth.uid()))
);

drop policy if exists "motm delete" on public.man_of_the_match;
create policy "motm delete"
on public.man_of_the_match for delete to authenticated
using (
  public.app_role() = 'SUPER_ADMIN'
  or (public.app_role() = 'REFEREE' and created_by = (select auth.uid()))
);

drop policy if exists "club admin manages announcements" on public.club_announcements;
create policy "Super Admin manages announcements"
on public.club_announcements for all to authenticated
using (public.app_role() = 'SUPER_ADMIN')
with check (public.app_role() = 'SUPER_ADMIN');

drop policy if exists "rules staff update" on public.disciplinary_rules;
create policy "Disciplinary Officer and Super Admin update rules"
on public.disciplinary_rules for update to authenticated
using (public.app_role() in ('DISCIPLINARY_OFFICER','SUPER_ADMIN'))
with check (public.app_role() in ('DISCIPLINARY_OFFICER','SUPER_ADMIN'));

drop policy if exists "Managers maintain role responsibilities" on public.league_role_responsibilities;
create policy "Super Admin maintains role responsibilities"
on public.league_role_responsibilities for all to authenticated
using (public.app_role() = 'SUPER_ADMIN')
with check (public.app_role() = 'SUPER_ADMIN');

drop policy if exists "club profile audit visible to reviewers" on public.club_profile_change_audit;
create policy "Super Admin reads club profile audit"
on public.club_profile_change_audit for select to authenticated
using (public.app_role() = 'SUPER_ADMIN');

drop policy if exists "league_verification_audit_read" on public.league_verification_audit;
create policy "Super Admin reads league verification audit"
on public.league_verification_audit for select to authenticated
using (public.app_role() = 'SUPER_ADMIN');

drop policy if exists "league_verification_read" on public.league_verification_requests;
create policy "league_verification_read"
on public.league_verification_requests for select to authenticated
using (
  public.app_role() = 'SUPER_ADMIN'
  or submitted_by = (select auth.uid())
  or (
    public.app_role() = 'CLUB_ADMIN'
    and club_id is not null
    and club_id = (select public.league_current_club())
  )
);

drop policy if exists "league_verification_review" on public.league_verification_requests;
create policy "league_verification_review"
on public.league_verification_requests for update to authenticated
using (
  public.app_role() = 'SUPER_ADMIN'
  and submitted_by <> (select auth.uid())
  and exists (
    select 1 from public.user_profiles up
    where up.id = (select auth.uid())
      and up.status = 'Active'
      and up.system_role = 'SUPER_ADMIN'
  )
)
with check (
  public.app_role() = 'SUPER_ADMIN'
  and submitted_by <> (select auth.uid())
  and exists (
    select 1 from public.user_profiles up
    where up.id = (select auth.uid())
      and up.status = 'Active'
      and up.system_role = 'SUPER_ADMIN'
  )
);

drop policy if exists "player_reports_reviewer_read" on public.player_reports;
create policy "Super Admin reads player reports"
on public.player_reports for select to authenticated
using (public.app_role() = 'SUPER_ADMIN');

drop policy if exists "transfers: read" on public.squad_transfers;
create policy "transfers: read"
on public.squad_transfers for select to authenticated
using (
  public.app_role() = 'SUPER_ADMIN'
  or (
    public.app_role() = 'CLUB_ADMIN'
    and from_club = (select up.club_id from public.user_profiles up where up.id = (select auth.uid()))
  )
  or (
    public.app_role() = 'CLUB_ADMIN'
    and to_club = (select up.club_id from public.user_profiles up where up.id = (select auth.uid()))
  )
);

drop policy if exists "staff read goalkeepers" on public.match_goalkeepers;
create policy "Authorised officials read match goalkeepers"
on public.match_goalkeepers for select to authenticated
using (public.app_role() in ('SUPER_ADMIN','REFEREE'));

-- A Match Commissioner may access their own evidence only; Super Admin is
-- the only administrative reviewer. Developer access is not part of this role.
drop policy if exists mc_evidence_select_own_or_admin on storage.objects;
create policy mc_evidence_select_own_or_superadmin
on storage.objects for select to authenticated
using (
  bucket_id = 'match-commissioner-evidence'
  and (
    (
      (storage.foldername(name))[1] = (select auth.uid())::text
      and exists (
        select 1
        from public.user_profiles p
        join public.match_referee_assignments a
          on a.referee_user_id = p.id
        where p.id = (select auth.uid())
          and p.system_role = 'REFEREE'
          and lower(coalesce(p.official_title,'')) = 'match commissioner'
          and lower(p.status) = 'active'
          and a.match_id::text = (storage.foldername(name))[2]
          and a.official_role = 'MATCH_COMMISSIONER'
          and a.assignment_status = 'ACTIVE'
      )
    )
    or public.app_role() = 'SUPER_ADMIN'
  )
);

-- Retire the separate legacy league-pause mechanism. The agreed maintenance
-- switch is application_control.app_frozen, which remains Developer-controlled.
do $$
declare v record;
begin
  for v in
    select n.nspname, c.relname, t.tgname
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where t.tgfoid = to_regprocedure('public.enforce_global_system_pause()')
      and not t.tgisinternal
  loop
    execute format('drop trigger if exists %I on %I.%I', v.tgname, v.nspname, v.relname);
  end loop;
end $$;

drop policy if exists "public can read system pause" on public.system_pause;
drop policy if exists "system pause read" on public.system_pause;
revoke all on table public.system_pause from public, anon, authenticated;
revoke all on table public.system_pause_log from public, anon, authenticated;
revoke all on function public.set_system_pause(boolean) from public, anon, authenticated;
revoke all on function public.set_system_pause(boolean, text) from public, anon, authenticated;
revoke all on function public.enforce_global_system_pause() from public, anon, authenticated;

commit;
notify pgrst, 'reload schema';
