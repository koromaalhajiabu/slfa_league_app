-- At the start of each season, the previous season's problem reports are deleted.
-- Staff who have left the league (their latest status change before this season
-- was not Active) have their personal details removed and their old privacy
-- requests deleted. The account row stays so the audit history still reads correctly.
-- Anonymised accounts are banned from signing in. Audit log entries are not changed by this job.
create or replace function public.purge_records_from_past_season()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start timestamptz;
  c_reports int := 0;
  c_staff int := 0;
  c_requests int := 0;
begin
  select start_date::timestamptz into v_start from public.seasons where is_current limit 1;
  if v_start is null then
    return jsonb_build_object('skipped', 'no current season');
  end if;

  delete from public.fan_reports where created_at < v_start;
  get diagnostics c_reports = row_count;

  with left_staff as (
    select up.id
    from public.user_profiles up
    join lateral (
      select l.new_status from public.account_status_log l
      where l.user_id = up.id and l.changed_at < v_start
      order by l.changed_at desc limit 1
    ) last on true
    where last.new_status is distinct from 'Active'
      and lower(coalesce(up.status, '')) <> 'active'
      and up.system_role not in ('DEVELOPER', 'SUPER_ADMIN')
  )
  update public.user_profiles up
     set full_name = 'Former staff member',
         email = 'former-staff-' || up.id || '@removed.invalid',
         photo_url = null,
         club_id = null,
         official_title = null,
         media_team_role = null
   where up.id in (select id from left_staff)
     and up.email not like 'former-staff-%';
  get diagnostics c_staff = row_count;

  -- Anonymised accounts cannot sign in: the login is banned and the profile is suspended.
  update auth.users au
     set banned_until = 'infinity'::timestamptz
   where au.id in (select up.id from public.user_profiles up where up.email like 'former-staff-%')
     and (au.banned_until is null or au.banned_until < 'infinity'::timestamptz);

  update public.user_profiles up
     set status = 'Suspended'
   where up.email like 'former-staff-%'
     and up.status is distinct from 'Suspended';

  delete from public.privacy_requests pr
   where pr.created_at < v_start
     and pr.user_id in (select up.id from public.user_profiles up where up.email like 'former-staff-%');
  get diagnostics c_requests = row_count;

  return jsonb_build_object('season_start', v_start, 'problem_reports', c_reports,
    'former_staff_anonymised', c_staff, 'privacy_requests', c_requests);
end;
$$;

revoke all on function public.purge_records_from_past_season() from public, anon, authenticated;

select cron.unschedule('purge-season-reports-staff')
  where exists (select 1 from cron.job where jobname = 'purge-season-reports-staff');
select cron.schedule('purge-season-reports-staff', '15 3 * * *', $$select public.purge_records_from_past_season()$$);
