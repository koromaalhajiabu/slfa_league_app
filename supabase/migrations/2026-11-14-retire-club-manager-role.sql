-- Retire the Club Manager role completely.
-- Existing Club Manager accounts are retained for audit/history but disabled.
-- Club squad/player administration is now handled by the Super Admin / League Admin.
begin;

update public.user_profiles
   set system_role = 'NONE',
       status = 'Suspended',
       club_id = null
 where upper(coalesce(system_role::text, '')) = 'CLUB_ADMIN';

delete from public.role_invitations
 where upper(coalesce(system_role::text, '')) = 'CLUB_ADMIN';

alter table public.user_profiles
  drop constraint if exists user_profiles_no_club_admin_role;
alter table public.user_profiles
  add constraint user_profiles_no_club_admin_role
  check (upper(coalesce(system_role::text, '')) <> 'CLUB_ADMIN') not valid;
alter table public.user_profiles
  validate constraint user_profiles_no_club_admin_role;

alter table public.role_invitations
  drop constraint if exists role_invitations_no_club_admin_role;
alter table public.role_invitations
  add constraint role_invitations_no_club_admin_role
  check (upper(coalesce(system_role::text, '')) <> 'CLUB_ADMIN') not valid;
alter table public.role_invitations
  validate constraint role_invitations_no_club_admin_role;

create or replace function public.invite_user(
  p_email text,
  p_role text,
  p_club uuid,
  p_full_name text,
  p_photo_url text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(coalesce(p_email,'')));
  v_name text := btrim(coalesce(p_full_name,''));
  v_id uuid;
begin
  if app_role() is distinct from 'DEVELOPER' then
    raise exception 'Only the Developer can assign roles.';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address.';
  end if;
  if v_name = '' then raise exception 'Enter the full name.'; end if;
  if p_role not in ('SUPER_ADMIN','REFEREE','MATCH_COMMISSIONER','MEDIA_OFFICER','DISCIPLINARY_OFFICER') then
    raise exception 'That role cannot be assigned here.';
  end if;
  if p_club is not null then
    raise exception 'Club assignment is no longer supported. The Super Admin manages league player and club records.';
  end if;

  select id into v_id
    from public.user_profiles
   where lower(email) = v_email;

  if v_id is not null then
    if v_id = auth.uid() then raise exception 'You cannot change your own role.'; end if;
    perform public.set_user_role(v_id, p_role);
    update public.user_profiles
       set full_name = v_name,
           photo_url = coalesce(p_photo_url, photo_url),
           club_id = null
     where id = v_id;
    return 'Role and profile saved. The account already exists, so the role applies now.';
  end if;

  insert into public.role_invitations(email,system_role,club_id,invited_by,full_name,photo_url)
  values(v_email,p_role,null,auth.uid(),v_name,p_photo_url)
  on conflict(email) do update set
    system_role=excluded.system_role,
    club_id=null,
    invited_by=excluded.invited_by,
    full_name=excluded.full_name,
    photo_url=coalesce(excluded.photo_url,public.role_invitations.photo_url),
    invited_at=now();
  return 'Saved. The role and profile details will apply when this person creates their account.';
end;
$$;

revoke all on function public.invite_user(text,text,uuid,text,text) from public, anon;
grant execute on function public.invite_user(text,text,uuid,text,text) to authenticated;

drop function if exists public.set_user_club(uuid, uuid);
drop function if exists public.submit_club_profile_change(text, text, integer, text);

drop trigger if exists guard_squad_registration on public.club_squad;
drop function if exists public.guard_squad_registration();

-- Historical player/squad, club, announcement and profile-request records remain.
notify pgrst, 'reload schema';
commit;
