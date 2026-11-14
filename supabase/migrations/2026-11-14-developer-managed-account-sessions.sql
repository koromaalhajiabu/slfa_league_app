-- Audited Developer-managed account sessions. No client can read, update or delete this log.
create table if not exists public.developer_account_sessions (
  id bigint generated always as identity primary key,
  developer_id uuid not null,
  target_user_id uuid not null,
  target_email text not null,
  target_role text not null,
  event text not null check (event in ('SESSION_ISSUED','SESSION_ISSUE_FAILED')),
  user_agent text,
  created_at timestamptz not null default now()
);
alter table public.developer_account_sessions enable row level security;
revoke all on table public.developer_account_sessions from anon, authenticated;
grant all on table public.developer_account_sessions to service_role;
comment on table public.developer_account_sessions is
  'Immutable audit of Developer-managed account session issuance. Never grant client write access.';

create or replace function public.prevent_developer_session_audit_mutation()
returns trigger language plpgsql
set search_path = public
as $$
begin
  raise exception 'Developer account session audit records are append-only.';
end;
$$;
drop trigger if exists trg_developer_session_audit_immutable on public.developer_account_sessions;
create trigger trg_developer_session_audit_immutable
before update or delete on public.developer_account_sessions
for each row execute function public.prevent_developer_session_audit_mutation();
revoke update, delete, truncate, references, trigger on public.developer_account_sessions from service_role;
grant select, insert on public.developer_account_sessions to service_role;
