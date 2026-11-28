-- Source-controlled definitions for operational staff delegation.
-- The Developer alone appoints Super Admins; Super Admins manage operational staff.

CREATE OR REPLACE FUNCTION public.invite_user(p_email text, p_role text, p_club uuid, p_full_name text, p_photo_url text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_caller text := public.app_role();
  v_email text := lower(btrim(coalesce(p_email,'')));
  v_name text := btrim(coalesce(p_full_name,''));
  v_id uuid;
  v_role text := p_role;
  v_title text := null;
  v_club_name text;
  v_existing_invite_role text;
begin
  if auth.uid() is null or v_caller not in ('DEVELOPER','SUPER_ADMIN') then
    raise exception 'Only the Developer or a Super Admin can invite staff.' using errcode='42501';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then raise exception 'Enter a valid email address.'; end if;
  if v_name='' then raise exception 'Enter the full name.'; end if;
  if p_role not in ('SUPER_ADMIN','REFEREE','MATCH_COMMISSIONER','TEAM_OFFICIAL','MATCH_DATA_OPERATOR','MEDIA_OFFICER','DISCIPLINARY_OFFICER','LEAGUE_ADMIN') then
    raise exception 'That role cannot be assigned here.';
  end if;
  if v_caller='SUPER_ADMIN' and p_role='SUPER_ADMIN' then
    raise exception 'Only the Developer can invite or appoint Super Admins.' using errcode='42501';
  end if;

  if p_role='MATCH_COMMISSIONER' then v_role:='REFEREE'; v_title:='Match Commissioner';
  elsif p_role='MATCH_DATA_OPERATOR' then v_title:='Match Data Operator'; end if;

  if p_role='TEAM_OFFICIAL' then
    if p_club is null then raise exception 'Choose the club this Team Official represents.'; end if;
    select club_name into v_club_name from public.league_clubs where id=p_club and is_active=true;
    if not found then raise exception 'Choose an active club.'; end if;
  elsif p_club is not null then
    raise exception 'Only a Team Official invitation can include a club assignment.';
  end if;

  select id,system_role into v_id,v_existing_invite_role
  from public.user_profiles where lower(email)=v_email for update;
  if v_id is not null then
    if v_id=auth.uid() then raise exception 'You cannot change your own role.'; end if;
    if upper(coalesce(v_existing_invite_role,''))='DEVELOPER' then raise exception 'Developer accounts are protected.'; end if;
    if v_caller='SUPER_ADMIN' and upper(coalesce(v_existing_invite_role,''))='SUPER_ADMIN' then
      raise exception 'Super Admin accounts can only be managed by the Developer.' using errcode='42501';
    end if;
    perform public.set_user_role(v_id,p_role);
    update public.user_profiles set full_name=v_name,photo_url=coalesce(p_photo_url,photo_url),club_id=p_club,official_title=v_title where id=v_id;
    return case when p_role='TEAM_OFFICIAL' then
      'Team Official saved and assigned to '||v_club_name||'.'
      when p_role='MATCH_DATA_OPERATOR' then 'Match Data Operator role saved. The Super Admin must appoint this person to fixtures.'
      else 'Role and profile saved. The account already exists, so the role applies now.' end;
  end if;

  select system_role into v_existing_invite_role from public.role_invitations where email=v_email for update;
  if v_caller='SUPER_ADMIN' and upper(coalesce(v_existing_invite_role,''))='SUPER_ADMIN' then
    raise exception 'Only the Developer can manage a pending Super Admin invitation.' using errcode='42501';
  end if;

  insert into public.role_invitations(
    email,system_role,club_id,invited_by,official_title,full_name,photo_url,
    invitation_status,account_created_at,email_delivery_status,email_sent_at,email_delivery_error,email_attempts,invited_at
  ) values (
    v_email,v_role,p_club,auth.uid(),v_title,v_name,p_photo_url,
    'PENDING',null,'NOT_SENT',null,null,0,now()
  )
  on conflict(email) do update set
    system_role=excluded.system_role,club_id=excluded.club_id,invited_by=excluded.invited_by,
    official_title=excluded.official_title,full_name=excluded.full_name,
    photo_url=coalesce(excluded.photo_url,public.role_invitations.photo_url),
    invitation_status='PENDING',account_created_at=null,accepted_at=null,
    email_delivery_status='NOT_SENT',email_sent_at=null,email_delivery_error=null,email_attempts=0,invited_at=now();

  return case when p_role='TEAM_OFFICIAL' then
    'Invitation saved for '||v_club_name||'. An invitation email will be sent; the person must accept it and set a password.'
    when p_role='MATCH_DATA_OPERATOR' then 'Invitation saved. After registration the Super Admin must appoint this person to fixtures.'
    when p_role='MATCH_COMMISSIONER' then 'Match Commissioner invitation saved. After registration, the Super Admin must appoint this person to fixtures.'
    else 'Invitation saved. An invitation email will be sent; the role will activate after acceptance.' end;
end;
$function$

CREATE OR REPLACE FUNCTION public.set_account_status(p_user uuid, p_status text, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_caller text := public.app_role();
  v_target public.user_profiles%rowtype;
begin
  if auth.uid() is null or v_caller not in ('DEVELOPER','SUPER_ADMIN') then
    raise exception 'Only the Developer or a Super Admin can change staff account status.' using errcode='42501';
  end if;
  if p_status not in ('Active','Suspended') then raise exception 'Status must be Active or Suspended.'; end if;
  if p_reason is null or length(btrim(p_reason)) < 5 then raise exception 'Give a reason of at least 5 characters. It is kept in the log.'; end if;
  if p_user=auth.uid() then raise exception 'You cannot change your own account status.'; end if;
  select * into v_target from public.user_profiles where id=p_user for update;
  if not found then raise exception 'Account not found.'; end if;
  if upper(v_target.system_role)='DEVELOPER' then raise exception 'Developer accounts are protected.' using errcode='42501'; end if;
  if v_caller='SUPER_ADMIN' and upper(v_target.system_role)='SUPER_ADMIN' then
    raise exception 'Super Admin accounts can only be managed by the Developer.' using errcode='42501';
  end if;
  update public.user_profiles set status=p_status where id=p_user;
  insert into public.account_status_log(user_id,user_email,previous_status,new_status,reason,changed_by)
  values(p_user,v_target.email,v_target.status,p_status,btrim(p_reason),auth.uid());
end;
$function$

CREATE OR REPLACE FUNCTION public.set_team_official_club(p_user uuid, p_club uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_caller text:=public.app_role(); v_old uuid; v_email text; v_target_role text; v_club_name text;
begin
  if auth.uid() is null or v_caller not in ('DEVELOPER','SUPER_ADMIN') then
    raise exception 'Only the Developer or a Super Admin can assign a Team Official to a club.' using errcode='42501';
  end if;
  if p_user=auth.uid() then raise exception 'You cannot assign your own account as a Team Official.'; end if;
  select club_id,email,system_role into v_old,v_email,v_target_role
  from public.user_profiles where id=p_user for update;
  if not found or upper(coalesce(v_target_role,''))<>'TEAM_OFFICIAL' then raise exception 'The selected account is not a Team Official.'; end if;
  if v_caller='SUPER_ADMIN' and upper(v_target_role) in ('SUPER_ADMIN','DEVELOPER') then
    raise exception 'This account is protected.' using errcode='42501';
  end if;
  if p_club is not null then
    select club_name into v_club_name from public.league_clubs where id=p_club and is_active=true;
    if not found then raise exception 'The selected club is not active.'; end if;
  else v_club_name:='Unassigned'; end if;
  update public.user_profiles set club_id=p_club where id=p_user;
  insert into public.role_change_log(user_id,user_email,previous_role,new_role,reason,changed_by)
  values(p_user,v_email,'TEAM_OFFICIAL','TEAM_OFFICIAL','Club assignment: '||v_club_name,auth.uid());
  return 'Team Official club assignment saved.';
end;
$function$

CREATE OR REPLACE FUNCTION public.set_user_role(p_user uuid, p_role text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_caller text := public.app_role();
  v_previous text;
  v_email text;
  v_role text := p_role;
  v_title text := null;
begin
  if auth.uid() is null or v_caller not in ('DEVELOPER','SUPER_ADMIN') then
    raise exception 'Only the Developer or a Super Admin can assign operational roles.' using errcode='42501';
  end if;
  if p_user = auth.uid() then raise exception 'You cannot change your own role.'; end if;
  if p_role not in ('SUPER_ADMIN','REFEREE','MEDIA_OFFICER','DISCIPLINARY_OFFICER','MATCH_COMMISSIONER','TEAM_OFFICIAL','MATCH_DATA_OPERATOR','LEAGUE_ADMIN') then
    raise exception 'Invalid role.';
  end if;
  if v_caller = 'SUPER_ADMIN' and p_role = 'SUPER_ADMIN' then
    raise exception 'Only the Developer can appoint or change a Super Admin.' using errcode='42501';
  end if;
  if p_role='MATCH_COMMISSIONER' then v_role:='REFEREE'; v_title:='Match Commissioner'; end if;
  if p_role='MATCH_DATA_OPERATOR' then v_title:='Match Data Operator'; end if;

  select system_role,email into v_previous,v_email
  from public.user_profiles where id=p_user for update;
  if not found then raise exception 'Account not found.'; end if;
  if upper(coalesce(v_previous,''))='DEVELOPER' then raise exception 'Developer accounts are protected.' using errcode='42501'; end if;
  if v_caller='SUPER_ADMIN' and upper(coalesce(v_previous,''))='SUPER_ADMIN' then
    raise exception 'Super Admin accounts can only be managed by the Developer.' using errcode='42501';
  end if;

  update public.user_profiles
     set system_role=v_role,official_title=v_title,club_id=null
   where id=p_user;
  insert into public.role_change_log(user_id,user_email,previous_role,new_role,reason,changed_by)
  values(p_user,v_email,v_previous,coalesce(v_title,v_role),
    case when v_caller='DEVELOPER' then 'Developer role update' else 'Super Admin operational role update' end,auth.uid());
  return case
    when v_role='TEAM_OFFICIAL' then 'Team Official role assigned. Assign the club before the account can submit team sheets.'
    when v_role='MATCH_DATA_OPERATOR' then 'Match Data Operator role assigned. The Super Admin must appoint this user to each fixture.'
    else 'Role updated.'
  end;
end;
$function$

drop policy if exists superadmin_read_operational_profiles on public.user_profiles;
create policy superadmin_read_operational_profiles on public.user_profiles for select to authenticated
using (public.app_role()='SUPER_ADMIN' and upper(coalesce(system_role,'')) not in ('SUPER_ADMIN','DEVELOPER'));
drop policy if exists superadmin_read_operational_invitations on public.role_invitations;
create policy superadmin_read_operational_invitations on public.role_invitations for select to authenticated
using (public.app_role()='SUPER_ADMIN' and upper(coalesce(system_role,'')) not in ('SUPER_ADMIN','DEVELOPER'));
drop policy if exists superadmin_update_operational_invitations on public.role_invitations;
create policy superadmin_update_operational_invitations on public.role_invitations for update to authenticated
using (public.app_role()='SUPER_ADMIN' and upper(coalesce(system_role,'')) not in ('SUPER_ADMIN','DEVELOPER'))
with check (public.app_role()='SUPER_ADMIN' and upper(coalesce(system_role,'')) not in ('SUPER_ADMIN','DEVELOPER'));
drop policy if exists superadmin_reads_role_change_log on public.role_change_log;
create policy superadmin_reads_role_change_log on public.role_change_log for select to authenticated using (public.app_role()='SUPER_ADMIN');
grant select on public.user_profiles,public.role_invitations,public.role_change_log to authenticated;
revoke update on public.role_invitations from authenticated;
grant update (invitation_status) on public.role_invitations to authenticated;
revoke all on function public.invite_user(text,text,uuid,text,text) from public,anon;
revoke all on function public.set_user_role(uuid,text) from public,anon;
revoke all on function public.set_account_status(uuid,text,text) from public,anon;
revoke all on function public.set_team_official_club(uuid,uuid) from public,anon;
grant execute on function public.invite_user(text,text,uuid,text,text) to authenticated;
grant execute on function public.set_user_role(uuid,text) to authenticated;
grant execute on function public.set_account_status(uuid,text,text) to authenticated;
grant execute on function public.set_team_official_club(uuid,uuid) to authenticated;
