-- Staff privacy: each signed-in user can download their own account data and ask for deletion.
-- Requests are reviewed by a Super Admin. Nothing is deleted automatically.

create table if not exists public.privacy_requests (
  id bigserial primary key,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  request_type text not null default 'DELETE_ACCOUNT' check (request_type in ('DELETE_ACCOUNT')),
  note text check (note is null or char_length(note) <= 500),
  status text not null default 'OPEN' check (status in ('OPEN','DONE','DECLINED')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists privacy_requests_status_idx on public.privacy_requests (status, created_at);
alter table public.privacy_requests enable row level security;

drop policy if exists privacy_requests_read_own on public.privacy_requests;
create policy privacy_requests_read_own on public.privacy_requests
  for select to authenticated using (user_id = auth.uid());

drop policy if exists privacy_requests_read_super_admin on public.privacy_requests;
create policy privacy_requests_read_super_admin on public.privacy_requests
  for select to authenticated using (app_role() = 'SUPER_ADMIN');

drop policy if exists privacy_requests_update_super_admin on public.privacy_requests;
create policy privacy_requests_update_super_admin on public.privacy_requests
  for update to authenticated using (app_role() = 'SUPER_ADMIN') with check (app_role() = 'SUPER_ADMIN');

create or replace function public.staff_my_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  prof jsonb;
begin
  if uid is null then
    raise exception 'Sign in to download your data.';
  end if;
  select jsonb_build_object(
    'id', p.id, 'unique_user_id', p.unique_user_id, 'full_name', p.full_name, 'email', p.email,
    'system_role', p.system_role, 'status', p.status, 'official_title', p.official_title,
    'media_team_role', p.media_team_role, 'account_created', p.created_at,
    'terms_accepted_at', p.terms_accepted_at, 'terms_version', p.terms_version)
    into prof from public.user_profiles p where p.id = uid;
  return jsonb_build_object(
    'profile', coalesce(prof, '{}'::jsonb),
    'downloads', coalesce((select jsonb_agg(jsonb_build_object('export', e.export_name, 'at', e.created_at) order by e.created_at)
      from public.export_audit e where e.user_id = uid), '[]'::jsonb),
    'requests', coalesce((select jsonb_agg(jsonb_build_object('type', r.request_type, 'status', r.status,
      'requested_at', r.created_at, 'resolved_at', r.resolved_at) order by r.created_at)
      from public.privacy_requests r where r.user_id = uid), '[]'::jsonb)
  );
end;
$$;

create or replace function public.staff_request_deletion(p_note text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  new_id bigint;
begin
  if uid is null then
    raise exception 'Sign in to ask for deletion.';
  end if;
  if exists (select 1 from public.privacy_requests where user_id = uid and request_type = 'DELETE_ACCOUNT' and status = 'OPEN') then
    raise exception 'You already have a deletion request waiting for review.';
  end if;
  insert into public.privacy_requests (user_id, request_type, note)
    values (uid, 'DELETE_ACCOUNT', nullif(trim(coalesce(p_note, '')), ''))
    returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.staff_my_data() from public;
revoke all on function public.staff_request_deletion(text) from public;
grant execute on function public.staff_my_data() to authenticated;
grant execute on function public.staff_request_deletion(text) to authenticated;
