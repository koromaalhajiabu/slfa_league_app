-- Only the referee starts, pauses and times a match. The Super Admin can still
-- set the final score and status such as postponed, but cannot move a match to
-- LIVE or HT, or change its minute while it is running.
create or replace function public.guard_super_admin_match_clock()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if app_role() = 'SUPER_ADMIN' then
    if new.match_status in ('LIVE', 'HT') and new.match_status is distinct from old.match_status then
      raise exception 'Only the referee starts, pauses and resumes a match.';
    end if;
    if new.match_minute is distinct from old.match_minute and new.match_minute is not null then
      raise exception 'Only the referee sets the match minute.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_super_admin_match_clock on public.matches;
create trigger guard_super_admin_match_clock
  before update on public.matches
  for each row execute function public.guard_super_admin_match_clock();
