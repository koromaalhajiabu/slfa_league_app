-- Idempotent offline final-score submission for assigned referees.
-- This wrapper preserves the existing referee_submit_final workflow and its approval rules.
-- It records a unique client submission ID so retries cannot submit the same score twice.

create table if not exists public.referee_offline_submissions (
  client_submission_id uuid primary key,
  match_id bigint not null references public.matches(id) on delete restrict,
  submitted_by uuid not null references auth.users(id) on delete restrict,
  home_goals integer not null check (home_goals >= 0 and home_goals <= 30),
  away_goals integer not null check (away_goals >= 0 and away_goals <= 30),
  submitted_at timestamptz not null default now()
);

alter table public.referee_offline_submissions enable row level security;
revoke all on public.referee_offline_submissions from public, anon, authenticated;

create or replace function public.referee_submit_final_idempotent(
  p_client_submission_id uuid,
  p_match_id bigint,
  p_home integer,
  p_away integer
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_existing public.referee_offline_submissions%rowtype;
begin
  if v_uid is null or app_role() <> 'REFEREE' then
    raise exception 'Only an authenticated referee can submit a final score.'
      using errcode = '42501';
  end if;
  if p_client_submission_id is null then
    raise exception 'A unique submission ID is required.';
  end if;
  if p_home is null or p_away is null or p_home < 0 or p_away < 0 or p_home > 30 or p_away > 30 then
    raise exception 'Enter valid final scores between 0 and 30.';
  end if;
  if not exists (
    select 1 from public.user_profiles
     where id = v_uid and lower(coalesce(status,'')) = 'active'
  ) then
    raise exception 'This referee account is not active.'
      using errcode = '42501';
  end if;

  select * into v_existing
    from public.referee_offline_submissions
   where client_submission_id = p_client_submission_id
   for update;

  if found then
    if v_existing.submitted_by <> v_uid
       or v_existing.match_id <> p_match_id
       or v_existing.home_goals <> p_home
       or v_existing.away_goals <> p_away then
      raise exception 'This submission ID was already used for a different score.';
    end if;
    return;
  end if;

  insert into public.referee_offline_submissions
    (client_submission_id, match_id, submitted_by, home_goals, away_goals)
  values
    (p_client_submission_id, p_match_id, v_uid, p_home, p_away);

  -- The existing function enforces active match assignment and creates the normal pending result.
  -- Any error rolls back the idempotency record as part of the same transaction.
  perform public.referee_submit_final(p_match_id, p_home, p_away);
end;
$$;

revoke all on function public.referee_submit_final_idempotent(uuid,bigint,integer,integer) from public, anon;
grant execute on function public.referee_submit_final_idempotent(uuid,bigint,integer,integer) to authenticated;

-- If server-side maintenance guards were installed first, protect this new table too.
do $$
begin
  if to_regprocedure('public.enforce_slfa_application_controls()') is not null then
    execute 'drop trigger if exists enforce_slfa_application_controls on public.referee_offline_submissions';
    execute 'create trigger enforce_slfa_application_controls before insert or update or delete on public.referee_offline_submissions for each row execute function public.enforce_slfa_application_controls()';
  end if;
end;
$$;

notify pgrst, 'reload schema';
