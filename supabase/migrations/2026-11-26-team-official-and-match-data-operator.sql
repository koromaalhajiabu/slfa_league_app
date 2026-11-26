-- SLFA Team Official invitations and independent Live Match Data Operator.
-- Team-sheet storage and submit RPC already exist; this migration connects the club
-- invitation flow and gives a separately assigned operator event-only permissions.

begin;

-- Roles and assignment duties.
alter table public.user_profiles drop constraint if exists user_profiles_system_role_check;
alter table public.user_profiles add constraint user_profiles_system_role_check
  check (system_role = any (array[
    'DEVELOPER','SUPER_ADMIN','TEAM_OFFICIAL','REFEREE','MATCH_DATA_OPERATOR',
    'MEDIA_OFFICER','DISCIPLINARY_OFFICER','NONE'
  ]::text[]));

alter table public.role_invitations drop constraint if exists role_invitations_supported_roles_check;
update public.role_invitations
   set system_role='REFEREE', official_title='Match Commissioner'
 where system_role='MATCH_COMMISSIONER';
alter table public.role_invitations add constraint role_invitations_supported_roles_check
  check (upper(system_role) = any (array[
    'SUPER_ADMIN','REFEREE','TEAM_OFFICIAL','MATCH_DATA_OPERATOR',
    'MEDIA_OFFICER','DISCIPLINARY_OFFICER'
  ]::text[]));

alter table public.match_referee_assignments drop constraint if exists match_referee_assignments_official_role_check;
alter table public.match_referee_assignments add constraint match_referee_assignments_official_role_check
  check (official_role = any (array['MAIN','ASSISTANT','MATCH_COMMISSIONER','DATA_OPERATOR']::text[]));

create unique index if not exists match_referee_assignments_one_active_data_operator
  on public.match_referee_assignments(match_id)
  where assignment_status='ACTIVE' and official_role='DATA_OPERATOR';

-- Developer role management: Match Commissioner is stored as REFEREE plus title.
create or replace function public.set_user_role(p_user uuid,p_role text)
returns text
language plpgsql
security definer
set search_path=''
as $$
declare v_previous text; v_email text; v_role text:=p_role; v_title text:=null;
begin
  if auth.uid() is null or public.app_role() <> 'DEVELOPER' then
    raise exception 'Only the Developer can assign roles.';
  end if;
  if p_user=auth.uid() then raise exception 'You cannot change your own role.'; end if;
  if p_role not in ('SUPER_ADMIN','REFEREE','MEDIA_OFFICER','DISCIPLINARY_OFFICER','MATCH_COMMISSIONER','TEAM_OFFICIAL','MATCH_DATA_OPERATOR') then
    raise exception 'Invalid role.';
  end if;
  if p_role='MATCH_COMMISSIONER' then v_role:='REFEREE'; v_title:='Match Commissioner'; end if;
  if p_role='MATCH_DATA_OPERATOR' then v_title:='Match Data Operator'; end if;
  select system_role,email into v_previous,v_email
  from public.user_profiles where id=p_user for update;
  if not found then raise exception 'Account not found.'; end if;
  if upper(v_previous)='DEVELOPER' then raise exception 'Developer accounts cannot be changed here.'; end if;
  update public.user_profiles
     set system_role=v_role,official_title=v_title,club_id=null
   where id=p_user;
  insert into public.role_change_log(user_id,user_email,previous_role,new_role,reason,changed_by)
  values(p_user,v_email,v_previous,coalesce(v_title,v_role),'Developer role update',auth.uid());
  return case
    when v_role='TEAM_OFFICIAL' then 'Team Official role assigned. Assign the club before the account can submit team sheets.'
    when v_role='MATCH_DATA_OPERATOR' then 'Match Data Operator role assigned. The Super Admin must appoint this user to each fixture.'
    else 'Role updated.'
  end;
end;
$$;

create or replace function public.set_user_role(p_user uuid,p_role text,p_reason text)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare t public.user_profiles%rowtype; v_role text:=p_role; v_title text:=null;
begin
  if public.app_role() <> 'DEVELOPER' then raise exception 'Only the Technical Director can assign roles.'; end if;
  if p_reason is null or length(btrim(p_reason)) < 5 then raise exception 'Give a reason of at least 5 characters. It is kept in the log.'; end if;
  if p_role='MATCH_COMMISSIONER' then v_role:='REFEREE'; v_title:='Match Commissioner'; end if;
  if p_role='MATCH_DATA_OPERATOR' then v_title:='Match Data Operator'; end if;
  if p_role not in ('SUPER_ADMIN','REFEREE','MEDIA_OFFICER','DISCIPLINARY_OFFICER','MATCH_COMMISSIONER','TEAM_OFFICIAL','MATCH_DATA_OPERATOR') then
    raise exception 'That role cannot be assigned here.';
  end if;
  if p_user=auth.uid() then raise exception 'You cannot change your own role.'; end if;
  select * into t from public.user_profiles where id=p_user for update;
  if not found then raise exception 'Account not found.'; end if;
  if upper(t.system_role)='DEVELOPER' then raise exception 'The Technical Director role cannot be changed here.'; end if;
  update public.user_profiles
     set system_role=v_role,official_title=v_title,club_id=null,status='Active'
   where id=p_user;
  insert into public.role_change_log(user_id,user_email,previous_role,new_role,reason,changed_by)
  values(p_user,t.email,coalesce(t.official_title,t.system_role),coalesce(v_title,v_role),btrim(p_reason),auth.uid());
end;
$$;

-- Team Official invitations include the selected active club. Existing accounts are
-- assigned immediately; new accounts receive that club through handle_new_user().
create or replace function public.invite_user(
  p_email text,p_role text,p_club uuid,p_full_name text,p_photo_url text
)
returns text
language plpgsql
security definer
set search_path=''
as $$
declare
  v_email text:=lower(btrim(coalesce(p_email,'')));
  v_name text:=btrim(coalesce(p_full_name,''));
  v_id uuid;
  v_role text:=p_role;
  v_title text:=null;
  v_club_name text;
begin
  if public.app_role() is distinct from 'DEVELOPER' then
    raise exception 'Only the Developer can assign roles.';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    raise exception 'Enter a valid email address.';
  end if;
  if v_name='' then raise exception 'Enter the full name.'; end if;
  if p_role not in ('SUPER_ADMIN','REFEREE','MATCH_COMMISSIONER','TEAM_OFFICIAL','MATCH_DATA_OPERATOR','MEDIA_OFFICER','DISCIPLINARY_OFFICER') then
    raise exception 'That role cannot be assigned here.';
  end if;
  if p_role='MATCH_COMMISSIONER' then v_role:='REFEREE'; v_title:='Match Commissioner'; end if;
  if p_role='MATCH_DATA_OPERATOR' then v_title:='Match Data Operator'; end if;
  if p_role='TEAM_OFFICIAL' then
    if p_club is null then raise exception 'Choose the club this Team Official represents.'; end if;
    select club_name into v_club_name from public.league_clubs where id=p_club and is_active=true;
    if not found then raise exception 'Choose an active club.'; end if;
  elsif p_club is not null then
    raise exception 'Only a Team Official invitation can include a club assignment.';
  end if;

  select id into v_id from public.user_profiles where lower(email)=v_email;
  if v_id is not null then
    if v_id=auth.uid() then raise exception 'You cannot change your own role.'; end if;
    perform public.set_user_role(v_id,p_role);
    update public.user_profiles
       set full_name=v_name,
           photo_url=coalesce(p_photo_url,photo_url),
           club_id=p_club,
           official_title=v_title
     where id=v_id;
    return case when p_role='TEAM_OFFICIAL'
      then 'Team Official saved and assigned to '||v_club_name||'. The account can now submit this club team sheets.'
      when p_role='MATCH_DATA_OPERATOR'
      then 'Match Data Operator role saved. The Super Admin must appoint this person to fixtures.'
      else 'Role and profile saved. The account already exists, so the role applies now.' end;
  end if;

  insert into public.role_invitations(email,system_role,club_id,invited_by,official_title,full_name,photo_url)
  values(v_email,v_role,p_club,auth.uid(),v_title,v_name,p_photo_url)
  on conflict(email) do update set
    system_role=excluded.system_role,
    club_id=excluded.club_id,
    invited_by=excluded.invited_by,
    official_title=excluded.official_title,
    full_name=excluded.full_name,
    photo_url=coalesce(excluded.photo_url,public.role_invitations.photo_url),
    invited_at=now();

  return case when p_role='TEAM_OFFICIAL'
    then 'Invitation saved for '||v_club_name||'. On sign-up, this person will be activated as this club Team Official.'
    when p_role='MATCH_DATA_OPERATOR'
    then 'Invitation saved. On sign-up, the Super Admin can appoint this person to fixtures.'
    else 'Saved. The role and profile details will apply when this person creates their account.' end;
end;
$$;

-- Event access for an operator is match-scoped. This role receives no direct UPDATE,
-- DELETE, clock or score privileges on matches and results.
drop policy if exists "assigned data operators read match events" on public.match_events;
create policy "assigned data operators read match events"
on public.match_events for select to authenticated
using (
  public.app_role()='MATCH_DATA_OPERATOR'
  and exists (
    select 1 from public.match_referee_assignments a
    join public.user_profiles p on p.id=a.referee_user_id
    where a.match_id::text=match_events.match_id
      and a.referee_user_id=(select auth.uid())
      and a.official_role='DATA_OPERATOR'
      and a.assignment_status='ACTIVE'
      and p.system_role='MATCH_DATA_OPERATOR'
      and p.status='Active'
  )
);

drop policy if exists "assigned data operator inserts live match events" on public.match_events;
create policy "assigned data operator inserts live match events"
on public.match_events for insert to authenticated
with check (
  public.app_role()='MATCH_DATA_OPERATOR'
  and recorded_by=(select auth.uid())::text
  and published_at is not null
  and exists (
    select 1 from public.match_referee_assignments a
    join public.user_profiles p on p.id=a.referee_user_id
    where a.match_id::text=match_events.match_id
      and a.referee_user_id=(select auth.uid())
      and a.official_role='DATA_OPERATOR'
      and a.assignment_status='ACTIVE'
      and p.system_role='MATCH_DATA_OPERATOR'
      and p.status='Active'
  )
  and exists (
    select 1 from public.matches m
    where m.id::text=match_events.match_id
      and m.match_status in ('LIVE','HT','FT')
  )
);

-- Operators can correct only their own erroneous event. Each reversal is logged.
create or replace function public.reverse_match_event(p_event_id bigint,p_reason text)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  e public.match_events%rowtype;
  v_name text;
  v_role text;
begin
  if public.is_match_commissioner_user() then
    raise exception 'Match Commissioners cannot reverse referee match events.';
  end if;
  if p_reason is null or length(btrim(p_reason))<5 then
    raise exception 'Give a reason of at least 5 characters. It is kept in the log.';
  end if;
  select * into e from public.match_events where id=p_event_id for update;
  if not found then raise exception 'Event not found.'; end if;

  if public.app_role()='SUPER_ADMIN' then
    null;
  elsif public.app_role()='REFEREE' and exists (
    select 1 from public.user_profiles up
    join public.match_referee_assignments a on a.referee_user_id=up.id
    where up.id=auth.uid() and up.system_role='REFEREE' and lower(coalesce(up.status,''))='active'
      and a.match_id::text=e.match_id and a.assignment_status='ACTIVE' and a.official_role='MAIN'
  ) then
    null;
  elsif public.app_role()='MATCH_DATA_OPERATOR'
    and e.recorded_by=(select auth.uid())::text
    and exists (
      select 1 from public.user_profiles up
      join public.match_referee_assignments a on a.referee_user_id=up.id
      join public.matches m on m.id=a.match_id
      where up.id=auth.uid() and up.system_role='MATCH_DATA_OPERATOR' and up.status='Active'
        and a.match_id::text=e.match_id and a.assignment_status='ACTIVE' and a.official_role='DATA_OPERATOR'
        and m.match_status in ('LIVE','HT')
    ) then
    null;
  else
    raise exception 'You cannot reverse this event. A Match Data Operator may reverse only an event they personally recorded in their assigned live fixture.';
  end if;

  select full_name,system_role into v_name,v_role from public.user_profiles where id=auth.uid();
  insert into public.match_audit_log(actor_id,actor_name,actor_role,table_name,record_id,match_id,action,reason,old_data)
  values(auth.uid(),v_name,v_role,'match_events',e.id::text,e.match_id,'REVERSED',btrim(p_reason),to_jsonb(e));
  update public.match_events set change_reason=btrim(p_reason) where id=p_event_id;
  delete from public.match_events where id=p_event_id;
end;
$$;

revoke all on function public.invite_user(text,text,uuid,text,text) from public,anon;
grant execute on function public.invite_user(text,text,uuid,text,text) to authenticated;
revoke all on function public.set_user_role(uuid,text) from public,anon;
grant execute on function public.set_user_role(uuid,text) to authenticated;
revoke all on function public.set_user_role(uuid,text,text) from public,anon;
grant execute on function public.set_user_role(uuid,text,text) to authenticated;
revoke all on function public.reverse_match_event(bigint,text) from public,anon;
grant execute on function public.reverse_match_event(bigint,text) to authenticated;

notify pgrst,'reload schema';
commit;
