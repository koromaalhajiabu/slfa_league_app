-- SLFA Developer Panel follow-up: save invitee identity and portrait with the pending role.
-- Run once in Supabase SQL Editor after the base Developer Panel update.

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
  v_club uuid;
begin
  if app_role() <> 'DEVELOPER' then
    raise exception 'Only the Developer can assign roles.';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address.';
  end if;
  if v_name = '' then raise exception 'Enter the full name.'; end if;
  if p_role not in ('SUPER_ADMIN','CLUB_ADMIN','REFEREE','MATCH_COMMISSIONER','MEDIA_OFFICER','DISCIPLINARY_OFFICER') then
    raise exception 'That role cannot be assigned here.';
  end if;
  if p_role = 'CLUB_ADMIN' and p_club is null then
    raise exception 'Choose the club for this Club Manager.';
  end if;
  v_club := case when p_role = 'CLUB_ADMIN' then p_club else null end;
  if v_club is not null and not exists (select 1 from public.league_clubs where id = v_club) then
    raise exception 'Club not found.';
  end if;

  select id into v_id from public.user_profiles where lower(email)=v_email;
  if v_id is not null then
    if v_id=auth.uid() then raise exception 'You cannot change your own role.'; end if;
    perform public.set_user_role(v_id,p_role);
    update public.user_profiles
      set full_name=v_name, photo_url=p_photo_url, club_id=v_club
      where id=v_id;
    return 'Role and profile saved. The account already exists, so the role applies now.';
  end if;

  insert into public.role_invitations(email,system_role,club_id,invited_by,full_name,photo_url)
  values(v_email,p_role,v_club,auth.uid(),v_name,p_photo_url)
  on conflict(email) do update set
    system_role=excluded.system_role,
    club_id=excluded.club_id,
    invited_by=excluded.invited_by,
    full_name=excluded.full_name,
    photo_url=excluded.photo_url,
    invited_at=now();
  return 'Saved. The role and profile details will apply when this person creates their account.';
end;
$$;

revoke all on function public.invite_user(text,text,uuid,text,text) from public,anon;
grant execute on function public.invite_user(text,text,uuid,text,text) to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.role_invitations%rowtype;
  prev text;
begin
  insert into public.user_profiles(id,email,full_name)
  values(new.id,lower(new.email),coalesce(new.raw_user_meta_data->>'full_name',''))
  on conflict(id) do nothing;

  select * into inv from public.role_invitations where email=lower(new.email);
  if found then
    select system_role into prev from public.user_profiles where id=new.id;
    update public.user_profiles
      set system_role=inv.system_role,
          club_id=inv.club_id,
          full_name=coalesce(nullif(inv.full_name,''),full_name),
          photo_url=coalesce(inv.photo_url,photo_url),
          status='Active'
      where id=new.id;
    insert into public.role_change_log(user_id,user_email,previous_role,new_role,reason,changed_by)
    values(new.id,lower(new.email),prev,inv.system_role,'Role assigned by Developer',inv.invited_by);
    delete from public.role_invitations where email=lower(new.email);
  end if;
  return new;
end;
$$;

notify pgrst,'reload schema';
