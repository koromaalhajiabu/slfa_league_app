-- Fan comments on matches. Comments stay hidden until a Super Admin or Media Officer approves them.
create table if not exists public.match_comments (
  id bigserial primary key,
  match_id bigint not null references public.matches(id) on delete cascade,
  fan_name text not null check (char_length(fan_name) between 2 and 30),
  body text not null check (char_length(body) between 1 and 280),
  voter_key text not null,
  status text not null default 'PENDING' check (status in ('PENDING','APPROVED','REJECTED')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create index if not exists match_comments_match_idx on public.match_comments (match_id, status, created_at);
alter table public.match_comments enable row level security;

drop policy if exists match_comments_read_approved on public.match_comments;
create policy match_comments_read_approved on public.match_comments
  for select to anon, authenticated using (status = 'APPROVED');

drop policy if exists match_comments_read_moderators on public.match_comments;
create policy match_comments_read_moderators on public.match_comments
  for select to authenticated using (public.app_role() in ('SUPER_ADMIN','MEDIA_OFFICER'));

drop policy if exists match_comments_moderate on public.match_comments;
create policy match_comments_moderate on public.match_comments
  for update to authenticated
  using (public.app_role() in ('SUPER_ADMIN','MEDIA_OFFICER'))
  with check (public.app_role() in ('SUPER_ADMIN','MEDIA_OFFICER'));

drop policy if exists match_comments_delete_moderators on public.match_comments;
create policy match_comments_delete_moderators on public.match_comments
  for delete to authenticated using (public.app_role() in ('SUPER_ADMIN','MEDIA_OFFICER'));

-- Fans submit through this function only. It checks the match is live or scheduled,
-- trims input, and limits each browser to 5 comments per hour.
create or replace function public.submit_match_comment(p_match_id bigint, p_fan_name text, p_body text, p_voter_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  recent int;
begin
  if not exists (select 1 from public.matches m where m.id = p_match_id) then
    raise exception 'That match was not found.';
  end if;
  if char_length(trim(coalesce(p_fan_name,''))) < 2 or char_length(trim(p_fan_name)) > 30 then
    raise exception 'Your name must be 2 to 30 characters.';
  end if;
  if char_length(trim(coalesce(p_body,''))) < 1 or char_length(trim(p_body)) > 280 then
    raise exception 'Comments must be 1 to 280 characters.';
  end if;
  if coalesce(p_voter_key,'') = '' then
    raise exception 'Your browser could not be identified.';
  end if;
  select count(*) into recent from public.match_comments
    where voter_key = p_voter_key and created_at > now() - interval '1 hour';
  if recent >= 5 then
    raise exception 'You have sent several comments recently. Please try again later.';
  end if;
  insert into public.match_comments (match_id, fan_name, body, voter_key)
    values (p_match_id, trim(p_fan_name), trim(p_body), p_voter_key);
end $$;

revoke all on function public.submit_match_comment(bigint, text, text, text) from public;
grant execute on function public.submit_match_comment(bigint, text, text, text) to anon, authenticated;
