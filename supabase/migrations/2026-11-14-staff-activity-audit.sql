-- Append-only activity trail for staff operations across the main operational tables.
-- Stores actor, role, table, operation and row identifier; it does not copy private row contents.
create table if not exists public.slfa_activity_audit (
  id bigint generated always as identity primary key,
  actor_id uuid,
  actor_role text,
  table_name text not null,
  operation text not null check (operation in ('INSERT','UPDATE','DELETE')),
  row_id text,
  occurred_at timestamptz not null default now()
);
create index if not exists slfa_activity_audit_time_idx on public.slfa_activity_audit(occurred_at desc);
create index if not exists slfa_activity_audit_actor_idx on public.slfa_activity_audit(actor_id, occurred_at desc);
alter table public.slfa_activity_audit enable row level security;
revoke all on public.slfa_activity_audit from anon, authenticated;

create or replace function public.capture_slfa_activity_audit()
returns trigger language plpgsql security definer set search_path=public
as $$
declare
  v_row jsonb;
  v_actor uuid;
  v_role text;
  v_id text;
begin
  v_actor := auth.uid();
  v_role := public.app_role();
  if TG_OP = 'DELETE' then v_row := to_jsonb(OLD); else v_row := to_jsonb(NEW); end if;
  v_id := coalesce(v_row->>'id',v_row->>'match_id',v_row->>'club_id',v_row->>'user_id');
  insert into public.slfa_activity_audit(actor_id,actor_role,table_name,operation,row_id)
  values(v_actor,v_role,TG_TABLE_NAME,TG_OP,v_id);
  if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'matches','match_events','match_lineups','club_squad','disciplinary_actions',
    'suspensions','media_posts','polls','poll_options','league_clubs','leagues',
    'league_standings','club_announcements','match_comments','fan_reports',
    'user_profiles','role_invitations'
  ] loop
    if to_regclass('public.'||t) is not null then
      execute format('drop trigger if exists trg_slfa_activity_audit on public.%I',t);
      execute format('create trigger trg_slfa_activity_audit after insert or update or delete on public.%I for each row execute function public.capture_slfa_activity_audit()',t);
    end if;
  end loop;
end $$;

revoke all on function public.capture_slfa_activity_audit() from public;
