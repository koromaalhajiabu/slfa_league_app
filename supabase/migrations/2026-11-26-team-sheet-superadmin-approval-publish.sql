-- Keep submitted team sheets private until Super Admin approval.
create or replace function public.submit_match_team_sheet(
  p_match_id bigint,
  p_starting_player_ids bigint[],
  p_substitute_player_ids bigint[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_club uuid;
  v_match public.matches%rowtype;
  v_sheet_id bigint;
  v_season bigint;
  v_all bigint[];
  v_count integer;
  v_reference text;
begin
  if v_uid is null then raise exception 'Sign in to submit a team sheet.'; end if;
  select club_id into v_club
  from public.user_profiles
  where id=v_uid and system_role='TEAM_OFFICIAL' and status='Active';
  if not found or v_club is null then raise exception 'This account is not assigned to an active club.'; end if;

  select * into v_match from public.matches where id=p_match_id for update;
  if not found then raise exception 'Fixture not found.'; end if;
  if v_club is distinct from v_match.home_club_id and v_club is distinct from v_match.away_club_id then
    raise exception 'You can only submit a team sheet for your assigned club in its own fixture.';
  end if;
  if v_match.match_status not in ('SCHEDULED','RESCHEDULED') then
    raise exception 'Team sheets can only be submitted for scheduled or rescheduled fixtures.';
  end if;
  if now() >= coalesce(v_match.new_match_date,v_match.match_date)-interval '20 minutes' then
    raise exception 'The team-sheet deadline has passed. Submissions close 20 minutes before kick-off.';
  end if;

  p_starting_player_ids := coalesce(p_starting_player_ids,'{}'::bigint[]);
  p_substitute_player_ids := coalesce(p_substitute_player_ids,'{}'::bigint[]);
  if cardinality(p_starting_player_ids) <> 11 then raise exception 'Select exactly 11 starting players.'; end if;
  if cardinality(p_substitute_player_ids) > 9 then raise exception 'A maximum of 9 substitutes can be listed.'; end if;
  v_all := p_starting_player_ids || p_substitute_player_ids;
  if cardinality(v_all) <> (select count(distinct x) from unnest(v_all) x) then
    raise exception 'A player cannot be selected more than once.';
  end if;

  v_season := coalesce(v_match.season_id,(select s.id from public.seasons s where s.is_current=true order by s.id desc limit 1));
  if v_season is null then raise exception 'A current competition season must be configured before submitting team sheets.'; end if;
  select count(*) into v_count
  from public.club_squad cs
  where cs.id=any(v_all) and cs.club_id=v_club
    and cs.status='Active' and cs.registration_status='Approved'
    and cs.season_id=v_season;
  if v_count <> cardinality(v_all) then
    raise exception 'Every selected player must be an active, approved player registered to your club for this season.';
  end if;

  insert into public.match_team_sheets
    (match_id,club_id,starting_player_ids,substitute_player_ids,submitted_by,submitted_at,status,updated_at)
  values (p_match_id,v_club,p_starting_player_ids,p_substitute_player_ids,v_uid,now(),'SUBMITTED',now())
  on conflict (match_id,club_id) do update
    set starting_player_ids=excluded.starting_player_ids,
        substitute_player_ids=excluded.substitute_player_ids,
        submitted_by=excluded.submitted_by,
        submitted_at=now(),
        status='SUBMITTED',
        reviewed_by=null,
        reviewed_at=null,
        review_notes=null,
        updated_at=now()
    where public.match_team_sheets.status <> 'APPROVED'
  returning id,reference_code into v_sheet_id,v_reference;
  if v_sheet_id is null then
    raise exception 'This team sheet has already been approved and locked. Contact the Super Admin for changes.';
  end if;

  -- Do not publish to match_lineups yet. The Super Admin approval RPC publishes it.
  return jsonb_build_object('id',v_sheet_id,'reference_code',v_reference,'status','SUBMITTED');
end;
$$;

create or replace function public.review_match_team_sheet(
  p_sheet_id bigint,
  p_status text,
  p_review_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sheet public.match_team_sheets%rowtype;
  v_uid uuid := auth.uid();
begin
  if v_uid is null or public.app_role() <> 'SUPER_ADMIN' then
    raise exception 'Only the Super Admin can review team sheets.';
  end if;
  if p_status not in ('APPROVED','RETURNED') then
    raise exception 'Choose APPROVED or RETURNED.';
  end if;
  if p_status='RETURNED' and (p_review_notes is null or length(btrim(p_review_notes)) < 5) then
    raise exception 'Give a correction note of at least 5 characters before returning a team sheet.';
  end if;

  select * into v_sheet from public.match_team_sheets where id=p_sheet_id for update;
  if not found then raise exception 'Team sheet not found.'; end if;
  if v_sheet.status='APPROVED' then raise exception 'This team sheet is already approved and locked.'; end if;

  update public.match_team_sheets
  set status=p_status,
      review_notes=nullif(btrim(p_review_notes),''),
      reviewed_by=v_uid,
      reviewed_at=now(),
      updated_at=now()
  where id=p_sheet_id;

  if p_status='APPROVED' then
    -- Only an approved team sheet becomes visible through the public match-lineup table.
    delete from public.match_lineups
    where match_id=v_sheet.match_id and club_id=v_sheet.club_id;
    insert into public.match_lineups(match_id,club_id,player_id,is_starter,submitted_by,submitted_at)
      select v_sheet.match_id,v_sheet.club_id,x,true,v_sheet.submitted_by,v_sheet.submitted_at
      from unnest(v_sheet.starting_player_ids) x
      union all
      select v_sheet.match_id,v_sheet.club_id,x,false,v_sheet.submitted_by,v_sheet.submitted_at
      from unnest(v_sheet.substitute_player_ids) x;
  end if;

  return jsonb_build_object('id',p_sheet_id,'status',p_status,'published_to_matchday',p_status='APPROVED');
end;
$$;

revoke all on function public.submit_match_team_sheet(bigint,bigint[],bigint[]) from public,anon;
grant execute on function public.submit_match_team_sheet(bigint,bigint[],bigint[]) to authenticated;
revoke all on function public.review_match_team_sheet(bigint,text,text) from public,anon;
grant execute on function public.review_match_team_sheet(bigint,text,text) to authenticated;

drop policy if exists match_team_sheets_superadmin_update on public.match_team_sheets;
revoke insert,update,delete on public.match_team_sheets from public,anon,authenticated;
grant select on public.match_team_sheets to authenticated;