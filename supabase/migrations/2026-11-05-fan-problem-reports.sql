-- Fan reports of wrong scores, wrong players or other problems. Reviewed by Super Admins and Media Officers.
create table if not exists public.fan_reports (
  id bigserial primary key,
  match_id bigint references public.matches(id) on delete cascade,
  report_type text not null check (report_type in ('WRONG_SCORE','WRONG_PLAYER','OTHER')),
  message text not null check (char_length(message) between 5 and 500),
  voter_key text not null,
  status text not null default 'OPEN' check (status in ('OPEN','RESOLVED')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists fan_reports_status_idx on public.fan_reports (status, created_at);
alter table public.fan_reports enable row level security;

drop policy if exists fan_reports_read_moderators on public.fan_reports;
create policy fan_reports_read_moderators on public.fan_reports
  for select to authenticated using (public.app_role() in ('SUPER_ADMIN','MEDIA_OFFICER'));

drop policy if exists fan_reports_update_moderators on public.fan_reports;
create policy fan_reports_update_moderators on public.fan_reports
  for update to authenticated
  using (public.app_role() in ('SUPER_ADMIN','MEDIA_OFFICER'))
  with check (public.app_role() in ('SUPER_ADMIN','MEDIA_OFFICER'));

create or replace function public.submit_fan_report(p_match_id bigint, p_type text, p_message text, p_voter_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  recent int;
begin
  if p_match_id is not null and not exists (select 1 from public.matches m where m.id = p_match_id) then
    raise exception 'That match was not found.';
  end if;
  if p_type not in ('WRONG_SCORE','WRONG_PLAYER','OTHER') then
    raise exception 'Choose the type of problem.';
  end if;
  if char_length(trim(coalesce(p_message,''))) < 5 or char_length(trim(p_message)) > 500 then
    raise exception 'Describe the problem in 5 to 500 characters.';
  end if;
  if coalesce(p_voter_key,'') = '' then
    raise exception 'Your browser could not be identified.';
  end if;
  select count(*) into recent from public.fan_reports
    where voter_key = p_voter_key and created_at > now() - interval '1 hour';
  if recent >= 5 then
    raise exception 'You have sent several reports recently. Please try again later.';
  end if;
  insert into public.fan_reports (match_id, report_type, message, voter_key)
    values (p_match_id, p_type, trim(p_message), p_voter_key);
end $$;

revoke all on function public.submit_fan_report(bigint, text, text, text) from public;
grant execute on function public.submit_fan_report(bigint, text, text, text) to anon, authenticated;
