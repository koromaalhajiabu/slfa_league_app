-- Enforce the SLFA League App authority model.
-- Developer appoints/manages only the single Super Admin.
-- Super Admin is also the League Administrator and manages all operational staff.
CREATE OR REPLACE FUNCTION public.admin_assign_league_admin(p_email text, p_league_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 raise exception 'League Administrator is the Super Admin role. A second League Administrator cannot be appointed.';
end;$function$

CREATE OR REPLACE FUNCTION public.admin_revoke_league_admin(p_assignment_id bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 raise exception 'League Administrator is the Super Admin role. Manage the single Super Admin appointment from the Developer panel.';
end;$function$

CREATE OR REPLACE FUNCTION public.app_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
select case when upper(coalesce(system_role,''))='LEAGUE_ADMIN' then 'SUPER_ADMIN' else system_role end
from public.user_profiles where id=auth.uid() and status='Active'
$function$

CREATE OR REPLACE FUNCTION public.delete_user_account(p_user uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare v_role text;
begin
 if auth.uid() is null or public.app_role()<>'DEVELOPER' then raise exception 'Only the Developer can manage the Super Admin account.' using errcode='42501';end if;
 if p_user=auth.uid() then raise exception 'You cannot delete your own account.';end if;
 select system_role into v_role from public.user_profiles where id=p_user;
 if not found then raise exception 'Account not found.';end if;
 if upper(coalesce(v_role,'')) not in ('SUPER_ADMIN','LEAGUE_ADMIN') then raise exception 'The Developer can delete only the Super Admin account. Operational accounts are managed by the Super Admin.' using errcode='42501';end if;
 delete from auth.users where id=p_user;
 return 'Super Admin account deleted.';
end;$function$

CREATE OR REPLACE FUNCTION public.invite_user(p_email text, p_role text, p_club uuid, p_full_name text, p_photo_url text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_caller text:=public.app_role(); v_email text:=lower(btrim(coalesce(p_email,'')));
 v_name text:=btrim(coalesce(p_full_name,'')); v_id uuid; v_role text:=p_role;
 v_title text:=null; v_club_name text; v_existing_role text;
begin
 if auth.uid() is null or v_caller not in ('DEVELOPER','SUPER_ADMIN') then raise exception 'Only the Developer or Super Admin can invite staff.' using errcode='42501'; end if;
 if v_caller='DEVELOPER' and p_role<>'SUPER_ADMIN' then raise exception 'The Developer can appoint only the Super Admin. Operational roles are managed by the Super Admin.' using errcode='42501'; end if;
 if v_caller='SUPER_ADMIN' and p_role='SUPER_ADMIN' then raise exception 'The Super Admin / League Administrator position is managed only by the Developer.' using errcode='42501'; end if;
 if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then raise exception 'Enter a valid email address.'; end if;
 if v_name='' then raise exception 'Enter the full name.'; end if;
 if p_role not in ('SUPER_ADMIN','REFEREE','MATCH_COMMISSIONER','TEAM_OFFICIAL','MATCH_DATA_OPERATOR','MEDIA_OFFICER','DISCIPLINARY_OFFICER') then raise exception 'That role cannot be assigned here.'; end if;
 if p_role='SUPER_ADMIN' then
   perform pg_advisory_xact_lock(hashtext('slfa_single_super_admin'));
   if exists(select 1 from public.user_profiles where upper(coalesce(system_role,'')) in ('SUPER_ADMIN','LEAGUE_ADMIN') and lower(coalesce(email,''))<>v_email)
      or exists(select 1 from public.role_invitations where upper(coalesce(system_role,'')) in ('SUPER_ADMIN','LEAGUE_ADMIN') and invitation_status in ('PENDING','ACCOUNT_CREATED') and lower(email)<>v_email) then
     raise exception 'Only one Super Admin / League Administrator is permitted. Revoke the existing appointment before replacing it.' using errcode='23505';
   end if;
 end if;
 if p_role='MATCH_COMMISSIONER' then v_role:='REFEREE';v_title:='Match Commissioner';
 elsif p_role='MATCH_DATA_OPERATOR' then v_title:='Match Data Operator';end if;
 if p_role='TEAM_OFFICIAL' then
   if p_club is null then raise exception 'Choose the club this Team Official represents.';end if;
   select club_name into v_club_name from public.league_clubs where id=p_club and is_active=true;
   if not found then raise exception 'Choose an active club.';end if;
 elsif p_club is not null then raise exception 'Only a Team Official invitation can include a club assignment.';end if;
 select id,system_role into v_id,v_existing_role from public.user_profiles where lower(email)=v_email for update;
 if v_id is not null then
   if v_id=auth.uid() then raise exception 'You cannot change your own role.';end if;
   if upper(coalesce(v_existing_role,''))='DEVELOPER' then raise exception 'Developer accounts are protected.';end if;
   if v_caller='SUPER_ADMIN' and upper(coalesce(v_existing_role,'')) in ('SUPER_ADMIN','LEAGUE_ADMIN') then raise exception 'The Super Admin account is managed only by the Developer.' using errcode='42501';end if;
   perform public.set_user_role(v_id,p_role);
   update public.user_profiles set full_name=v_name,photo_url=coalesce(p_photo_url,photo_url),club_id=p_club,official_title=v_title where id=v_id;
   return 'Existing account role and profile updated.';
 end if;
 select system_role into v_existing_role from public.role_invitations where lower(email)=v_email for update;
 if v_caller='SUPER_ADMIN' and upper(coalesce(v_existing_role,'')) in ('SUPER_ADMIN','LEAGUE_ADMIN') then raise exception 'The Super Admin invitation is managed only by the Developer.' using errcode='42501';end if;
 insert into public.role_invitations(email,system_role,club_id,invited_by,official_title,full_name,photo_url,invitation_status,account_created_at,email_delivery_status,email_sent_at,email_delivery_error,email_attempts,invited_at)
 values(v_email,v_role,p_club,auth.uid(),v_title,v_name,p_photo_url,'PENDING',null,'NOT_SENT',null,null,0,now())
 on conflict(email) do update set system_role=excluded.system_role,club_id=excluded.club_id,invited_by=excluded.invited_by,official_title=excluded.official_title,full_name=excluded.full_name,photo_url=coalesce(excluded.photo_url,public.role_invitations.photo_url),invitation_status='PENDING',account_created_at=null,accepted_at=null,email_delivery_status='NOT_SENT',email_sent_at=null,email_delivery_error=null,email_attempts=0,invited_at=now();
 return 'Operational staff invitation saved.';
end;$function$

CREATE OR REPLACE FUNCTION public.league_current_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select lower(public.app_role())
$function$

CREATE OR REPLACE FUNCTION public.review_role_access_request(p_request_id uuid, p_decision text, p_review_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_req public.role_access_requests%rowtype;
 v_role text:=lower(coalesce(public.app_role(),''));
 v_decision text:=lower(trim(coalesce(p_decision,'')));
 v_requested_role text;
begin
 if auth.uid() is null or v_role not in ('developer','super_admin') then raise exception 'Not authorized to review role requests.' using errcode='42501';end if;
 if v_decision not in ('approved','rejected') then raise exception 'Decision must be approved or rejected.';end if;
 select * into v_req from public.role_access_requests where id=p_request_id for update;
 if not found then raise exception 'Access request not found.';end if;
 if v_req.status<>'pending' then raise exception 'This request has already been reviewed.';end if;
 v_requested_role:=upper(coalesce(v_req.requested_role,''));
 if v_decision='approved' then
   if v_role='developer' and v_requested_role<>'SUPER_ADMIN' then raise exception 'The Developer can approve only the Super Admin appointment.' using errcode='42501';end if;
   if v_role='super_admin' and v_requested_role not in ('REFEREE','MATCH_COMMISSIONER','TEAM_OFFICIAL','MATCH_DATA_OPERATOR','MEDIA_OFFICER','DISCIPLINARY_OFFICER') then raise exception 'The Super Admin can approve operational roles only.' using errcode='42501';end if;
   perform public.set_user_role(v_req.auth_user_id,v_requested_role);
   update public.user_profiles set status='Active' where id=v_req.auth_user_id;
 end if;
 update public.role_access_requests set status=v_decision,reviewer_id=auth.uid(),review_notes=nullif(trim(coalesce(p_review_notes,'')),''),reviewed_at=now(),updated_at=now()
 where id=p_request_id;
 return jsonb_build_object('request_id',p_request_id,'status',v_decision,'reviewed_by',auth.uid(),'reviewer_role',v_role);
end;$function$

CREATE OR REPLACE FUNCTION public.set_account_status(p_user uuid, p_status text, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_caller text:=public.app_role();v_target public.user_profiles%rowtype;
begin
 if auth.uid() is null or v_caller not in ('DEVELOPER','SUPER_ADMIN') then raise exception 'Not authorized to change account status.' using errcode='42501';end if;
 if p_status not in ('Active','Suspended') then raise exception 'Status must be Active or Suspended.';end if;
 if p_reason is null or length(btrim(p_reason))<5 then raise exception 'Give a reason of at least 5 characters.';end if;
 if p_user=auth.uid() then raise exception 'You cannot change your own account status.';end if;
 select * into v_target from public.user_profiles where id=p_user for update;
 if not found then raise exception 'Account not found.';end if;
 if upper(coalesce(v_target.system_role,''))='DEVELOPER' then raise exception 'Developer accounts are protected.';end if;
 if v_caller='DEVELOPER' and upper(coalesce(v_target.system_role,'')) not in ('SUPER_ADMIN','LEAGUE_ADMIN') then raise exception 'The Developer can manage only the Super Admin account.' using errcode='42501';end if;
 if v_caller='SUPER_ADMIN' and upper(coalesce(v_target.system_role,'')) in ('SUPER_ADMIN','LEAGUE_ADMIN') then raise exception 'The Super Admin account is managed by the Developer.' using errcode='42501';end if;
 update public.user_profiles set status=p_status where id=p_user;
 insert into public.account_status_log(user_id,user_email,previous_status,new_status,reason,changed_by)
 values(p_user,v_target.email,v_target.status,p_status,btrim(p_reason),auth.uid());
end;$function$

CREATE OR REPLACE FUNCTION public.set_account_status(p_user uuid, p_status text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_email text;v_role text;
begin
 if auth.uid() is null or public.app_role()<>'DEVELOPER' then raise exception 'Only the Developer can manage the Super Admin account.' using errcode='42501';end if;
 if p_user=auth.uid() then raise exception 'You cannot suspend your own account.';end if;
 if p_status not in ('Active','Suspended') then raise exception 'Invalid account status.';end if;
 select email,system_role into v_email,v_role from public.user_profiles where id=p_user for update;
 if not found then raise exception 'Account not found.';end if;
 if upper(coalesce(v_role,'')) not in ('SUPER_ADMIN','LEAGUE_ADMIN') then raise exception 'The Developer can change status only for the Super Admin account.' using errcode='42501';end if;
 update public.user_profiles set status=p_status where id=p_user;
 insert into public.role_change_log(user_id,user_email,previous_role,new_role,reason,changed_by)
 values(p_user,v_email,v_role,v_role||' / '||p_status,'Developer Super Admin account status update',auth.uid());
 return 'Super Admin account status updated.';
end;$function$

CREATE OR REPLACE FUNCTION public.set_team_official_club(p_user uuid, p_club uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_old uuid;v_email text;v_target_role text;v_club_name text;
begin
 if auth.uid() is null or public.app_role()<>'SUPER_ADMIN' then raise exception 'Only the Super Admin can assign a Team Official to a club.' using errcode='42501';end if;
 if p_user=auth.uid() then raise exception 'You cannot assign your own account as a Team Official.';end if;
 select club_id,email,system_role into v_old,v_email,v_target_role from public.user_profiles where id=p_user for update;
 if not found or upper(coalesce(v_target_role,''))<>'TEAM_OFFICIAL' then raise exception 'The selected account is not a Team Official.';end if;
 if p_club is not null then
   select club_name into v_club_name from public.league_clubs where id=p_club and is_active=true;
   if not found then raise exception 'The selected club is not active.';end if;
 else v_club_name:='Unassigned';end if;
 update public.user_profiles set club_id=p_club where id=p_user;
 insert into public.role_change_log(user_id,user_email,previous_role,new_role,reason,changed_by)
 values(p_user,v_email,'TEAM_OFFICIAL','TEAM_OFFICIAL','Club assignment: '||v_club_name,auth.uid());
 return 'Team Official club assignment saved.';
end;$function$

CREATE OR REPLACE FUNCTION public.set_user_role(p_user uuid, p_role text, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.user_profiles%rowtype;
begin
 if public.app_role()<>'DEVELOPER' then raise exception 'Only the Developer can appoint the Super Admin.' using errcode='42501';end if;
 if p_role<>'SUPER_ADMIN' then raise exception 'The Developer can assign only the Super Admin role.' using errcode='42501';end if;
 if p_reason is null or length(btrim(p_reason))<5 then raise exception 'Give a reason of at least 5 characters.';end if;
 if p_user=auth.uid() then raise exception 'You cannot change your own role.';end if;
 perform pg_advisory_xact_lock(hashtext('slfa_single_super_admin'));
 if exists(select 1 from public.user_profiles where upper(coalesce(system_role,'')) in ('SUPER_ADMIN','LEAGUE_ADMIN') and id<>p_user)
    or exists(select 1 from public.role_invitations where upper(coalesce(system_role,'')) in ('SUPER_ADMIN','LEAGUE_ADMIN') and invitation_status in ('PENDING','ACCOUNT_CREATED') and lower(email)<>(select lower(email) from public.user_profiles where id=p_user)) then
   raise exception 'Only one Super Admin / League Administrator is permitted.' using errcode='23505';
 end if;
 select * into t from public.user_profiles where id=p_user for update;
 if not found then raise exception 'Account not found.';end if;
 if upper(coalesce(t.system_role,''))='DEVELOPER' then raise exception 'Developer accounts are protected.';end if;
 update public.user_profiles set system_role='SUPER_ADMIN',official_title='Super Admin / League Administrator',club_id=null,status='Active' where id=p_user;
 insert into public.role_change_log(user_id,user_email,previous_role,new_role,reason,changed_by)
 values(p_user,t.email,coalesce(t.official_title,t.system_role),'SUPER_ADMIN',btrim(p_reason),auth.uid());
end;$function$

CREATE OR REPLACE FUNCTION public.set_user_role(p_user uuid, p_role text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_caller text:=public.app_role();v_previous text;v_email text;v_role text:=p_role;v_title text:=null;
begin
 if auth.uid() is null or v_caller not in ('DEVELOPER','SUPER_ADMIN') then raise exception 'Not authorized to assign roles.' using errcode='42501';end if;
 if p_user=auth.uid() then raise exception 'You cannot change your own role.';end if;
 if v_caller='DEVELOPER' and p_role<>'SUPER_ADMIN' then raise exception 'The Developer can assign only the Super Admin role. Operational roles belong to the Super Admin.' using errcode='42501';end if;
 if v_caller='SUPER_ADMIN' and p_role='SUPER_ADMIN' then raise exception 'The Super Admin / League Administrator position is managed only by the Developer.' using errcode='42501';end if;
 if p_role not in ('SUPER_ADMIN','REFEREE','MEDIA_OFFICER','DISCIPLINARY_OFFICER','MATCH_COMMISSIONER','TEAM_OFFICIAL','MATCH_DATA_OPERATOR') then raise exception 'Invalid operational role.';end if;
 if p_role='SUPER_ADMIN' then
   perform pg_advisory_xact_lock(hashtext('slfa_single_super_admin'));
   if exists(select 1 from public.user_profiles where upper(coalesce(system_role,'')) in ('SUPER_ADMIN','LEAGUE_ADMIN') and id<>p_user)
      or exists(select 1 from public.role_invitations where upper(coalesce(system_role,'')) in ('SUPER_ADMIN','LEAGUE_ADMIN') and invitation_status in ('PENDING','ACCOUNT_CREATED') and lower(email)<>(select lower(email) from public.user_profiles where id=p_user)) then
     raise exception 'Only one Super Admin / League Administrator is permitted.' using errcode='23505';
   end if;
 end if;
 if p_role='MATCH_COMMISSIONER' then v_role:='REFEREE';v_title:='Match Commissioner';end if;
 if p_role='MATCH_DATA_OPERATOR' then v_title:='Match Data Operator';end if;
 select system_role,email into v_previous,v_email from public.user_profiles where id=p_user for update;
 if not found then raise exception 'Account not found.';end if;
 if upper(coalesce(v_previous,''))='DEVELOPER' then raise exception 'Developer accounts are protected.' using errcode='42501';end if;
 if v_caller='SUPER_ADMIN' and upper(coalesce(v_previous,'')) in ('SUPER_ADMIN','LEAGUE_ADMIN') then raise exception 'The Super Admin account is managed only by the Developer.' using errcode='42501';end if;
 update public.user_profiles set system_role=v_role,official_title=v_title,club_id=null where id=p_user;
 insert into public.role_change_log(user_id,user_email,previous_role,new_role,reason,changed_by)
 values(p_user,v_email,v_previous,coalesce(v_title,v_role),case when v_caller='DEVELOPER' then 'Developer appointed Super Admin' else 'Super Admin assigned operational role' end,auth.uid());
 return case when v_role='TEAM_OFFICIAL' then 'Team Official role assigned. Assign the club before team-sheet submission.'
 when v_role='MATCH_DATA_OPERATOR' then 'Match Data Operator role assigned. Appoint this user to fixtures.' else 'Role updated.' end;
end;$function$

drop policy if exists "profiles update" on public.user_profiles;
drop policy if exists "developer update own profile only" on public.user_profiles;
create policy "developer update own profile only" on public.user_profiles
for update to authenticated
using (id=auth.uid() and public.app_role()='DEVELOPER')
with check (id=auth.uid() and public.app_role()='DEVELOPER');
