-- SLFA activity audit attribution hardening.
-- Additive migration: preserves all existing audit rows and never invents past actors.
-- Captures authenticated identity when present and database execution context otherwise.

alter table public.slfa_activity_audit
  add column if not exists actor_source text,
  add column if not exists auth_context_role text,
  add column if not exists database_session_user text,
  add column if not exists database_active_role text;

alter table public.slfa_activity_audit
  drop constraint if exists slfa_activity_audit_actor_source_check;

alter table public.slfa_activity_audit
  add constraint slfa_activity_audit_actor_source_check
  check (actor_source is null or actor_source in ('AUTHENTICATED_USER','SERVICE_ROLE','DATABASE_SESSION'));

create index if not exists slfa_activity_audit_source_time_idx
  on public.slfa_activity_audit(actor_source, occurred_at desc);

create or replace function public.capture_slfa_activity_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row jsonb;
  v_actor uuid;
  v_role text;
  v_auth_role text;
  v_source text;
  v_session_user text;
  v_active_role text;
  v_id text;
begin
  -- Read Supabase request identity where the request carries one.
  begin
    v_actor := auth.uid();
  exception when others then
    v_actor := null;
  end;

  begin
    v_role := public.app_role();
  exception when others then
    v_role := null;
  end;

  v_auth_role := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role'
  );

  v_session_user := session_user;
  v_active_role := nullif(current_setting('role', true), '');

  if v_actor is not null then
    v_source := 'AUTHENTICATED_USER';
  elsif v_auth_role = 'service_role' then
    v_source := 'SERVICE_ROLE';
  else
    v_source := 'DATABASE_SESSION';
  end if;

  if TG_OP = 'DELETE' then
    v_row := to_jsonb(OLD);
  else
    v_row := to_jsonb(NEW);
  end if;

  v_id := coalesce(v_row->>'id', v_row->>'match_id', v_row->>'club_id', v_row->>'user_id');

  insert into public.slfa_activity_audit(
    actor_id, actor_role, table_name, operation, row_id,
    actor_source, auth_context_role, database_session_user, database_active_role
  )
  values(
    v_actor, v_role, TG_TABLE_NAME, TG_OP, v_id,
    v_source, v_auth_role, v_session_user, v_active_role
  );

  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$$;

revoke all on function public.capture_slfa_activity_audit() from public;
revoke all on public.slfa_activity_audit from anon, authenticated;

notify pgrst, 'reload schema';
