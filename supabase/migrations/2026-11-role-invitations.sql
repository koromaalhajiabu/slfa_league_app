-- Pending role assignments for people who have not created an account yet.
-- Already applied to the project; kept here for the record.
create table if not exists public.role_invitations (
  email text primary key,
  system_role text not null,
  club_id uuid references public.league_clubs(id) on delete set null,
  invited_by uuid,
  invited_at timestamptz not null default now()
);
alter table public.role_invitations enable row level security;
drop policy if exists "developer manages invitations" on public.role_invitations;
create policy "developer manages invitations" on public.role_invitations
  for all to authenticated
  using (app_role() = 'DEVELOPER') with check (app_role() = 'DEVELOPER');

create or replace function public.invite_user(p_email text, p_role text, p_club uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_email text := lower(btrim(coalesce(p_email, ''))); v_id uuid; v_club uuid;
begin
  if app_role() <> 'DEVELOPER' then raise exception 'Only the Technical Director can assign roles.'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid email address.'; end if;
  if p_role not in ('SUPER_ADMIN','FINANCE_OFFICER','CLUB_ADMIN','REFEREE','STAFF','PLAYER','MEDIA_OFFICER','VIEWER') then
    raise exception 'That role cannot be assigned here.';
  end if;
  if p_role = 'CLUB_ADMIN' and p_club is null then raise exception 'Choose the club for this Club Manager.'; end if;
  v_club := case when p_role = 'CLUB_ADMIN' then p_club else null end;
  if v_club is not null and not exists (select 1 from public.league_clubs where id = v_club) then raise exception 'Club not found.'; end if;

  select id into v_id from public.user_profiles where lower(email) = v_email;
  if v_id is not null then
    if v_id = auth.uid() then raise exception 'You cannot change your own role.'; end if;
    perform public.set_user_role(v_id, p_role, 'Role assigned by Developer');
    update public.user_profiles set club_id = v_club where id = v_id;
    return 'Role saved. The account already exists, so the role applies now.';
  end if;

  insert into public.role_invitations (email, system_role, club_id, invited_by)
  values (v_email, p_role, v_club, auth.uid())
  on conflict (email) do update set system_role = excluded.system_role, club_id = excluded.club_id,
    invited_by = excluded.invited_by, invited_at = now();
  return 'Saved. The role applies when this person creates their account.';
end $$;
drop function if exists public.invite_user(text, text, uuid, text);
revoke all on function public.invite_user(text, text, uuid) from public, anon;
grant execute on function public.invite_user(text, text, uuid) to authenticated;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare inv public.role_invitations%rowtype; prev text;
begin
  insert into public.user_profiles (id, email, full_name)
  values (new.id, lower(new.email), coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  select * into inv from public.role_invitations where email = lower(new.email);
  if found then
    select system_role into prev from public.user_profiles where id = new.id;
    update public.user_profiles set system_role = inv.system_role, club_id = inv.club_id, status = 'Active' where id = new.id;
    insert into public.role_change_log (user_id, user_email, previous_role, new_role, reason, changed_by)
    values (new.id, lower(new.email), prev, inv.system_role, 'Role assigned on sign-up', inv.invited_by);
    delete from public.role_invitations where email = lower(new.email);
  end if;
  return new;
end $$;
