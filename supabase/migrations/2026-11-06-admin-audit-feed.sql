-- Super Admin audit timeline. Reads the existing audit tables; changes nothing.

create or replace function public.admin_audit_feed(p_days integer default 90, p_limit integer default 200)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare result jsonb;
begin
  if app_role() is distinct from 'SUPER_ADMIN' then
    raise exception 'Only a Super Admin can read the audit log.';
  end if;
  p_days := least(greatest(coalesce(p_days, 90), 1), 730);
  p_limit := least(greatest(coalesce(p_limit, 200), 1), 500);

  with feed as (
    select m.occurred_at as at, 'Match records' as area, coalesce(m.actor_name, 'Unknown') as actor,
           m.action as action, coalesce(m.table_name, '') || coalesce(' · match ' || m.match_id, '') as summary, m.reason as reason
      from public.match_audit_log m
     where m.occurred_at >= now() - make_interval(days => p_days)
    union all
    select r.changed_at, 'Match results', coalesce(u.full_name, 'Unknown'), r.action,
           'Match ' || r.match_id || ': ' || coalesce(r.old_home::text, '–') || '–' || coalesce(r.old_away::text, '–')
             || ' to ' || coalesce(r.new_home::text, '–') || '–' || coalesce(r.new_away::text, '–'), r.reason
      from public.match_result_changes r left join public.user_profiles u on u.id = r.changed_by
     where r.changed_at >= now() - make_interval(days => p_days)
    union all
    select s.changed_at, 'Account status', coalesce(u.full_name, 'Unknown'), 'Status changed',
           coalesce(s.user_email, '') || ': ' || coalesce(s.previous_status, '–') || ' to ' || coalesce(s.new_status, '–'), s.reason
      from public.account_status_log s left join public.user_profiles u on u.id = s.changed_by
     where s.changed_at >= now() - make_interval(days => p_days)
    union all
    select c.changed_at, 'Staff roles', coalesce(u.full_name, 'Unknown'), 'Role changed',
           coalesce(c.user_email, '') || ': ' || coalesce(c.previous_role, '–') || ' to ' || coalesce(c.new_role, '–'), c.reason
      from public.role_change_log c left join public.user_profiles u on u.id = c.changed_by
     where c.changed_at >= now() - make_interval(days => p_days)
    union all
    select p.changed_at, 'League pause', coalesce(u.full_name, 'Unknown'), case when p.paused then 'Paused' else 'Resumed' end,
           'League operations', p.reason
      from public.system_pause_log p left join public.user_profiles u on u.id = p.changed_by
     where p.changed_at >= now() - make_interval(days => p_days)
    union all
    select k.removed_at, 'Account clean-up', coalesce(u.full_name, 'Unknown'), 'Account removed',
           coalesce(k.removed_email, '') || coalesce(' (' || k.removed_full_name || ')', ''), k.reason
      from public.account_cleanup_log k left join public.user_profiles u on u.id = k.removed_by
     where k.removed_at >= now() - make_interval(days => p_days)
    union all
    select v.occurred_at, 'League verification', coalesce(u.full_name, 'Unknown'), 'Status changed',
           coalesce(v.old_status, '–') || ' to ' || coalesce(v.new_status, '–'), v.notes
      from public.league_verification_audit v left join public.user_profiles u on u.id = v.actor_id
     where v.occurred_at >= now() - make_interval(days => p_days)
    union all
    select a.created_at, 'Club profile changes', coalesce(u.full_name, 'Unknown'), a.action,
           'Club profile request ' || coalesce(a.request_id::text, ''), null
      from public.club_profile_change_audit a left join public.user_profiles u on u.id = a.actor_id
     where a.created_at >= now() - make_interval(days => p_days)
    union all
    select e.created_at, 'Downloads', coalesce(u.full_name, 'Unknown'), 'Downloaded',
           e.export_name, null
      from public.export_audit e left join public.user_profiles u on u.id = e.user_id
     where e.created_at >= now() - make_interval(days => p_days)
  )
  select coalesce(jsonb_agg(jsonb_build_object('at', at, 'area', area, 'actor', actor, 'action', action,
           'summary', summary, 'reason', reason) order by at desc), '[]'::jsonb)
    into result
    from (select * from feed order by at desc limit p_limit) f;
  return result;
end
$$;

revoke all on function public.admin_audit_feed(integer, integer) from public;
grant execute on function public.admin_audit_feed(integer, integer) to authenticated;
