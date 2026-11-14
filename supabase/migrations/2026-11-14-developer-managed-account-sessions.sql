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
