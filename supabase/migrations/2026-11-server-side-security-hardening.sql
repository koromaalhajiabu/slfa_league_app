-- SLFA League App: server-side maintenance controls and offline event idempotency.
-- Additive and safe for existing records. Run once in the Supabase SQL Editor.
-- The Developer can still unfreeze the application. Service-role maintenance remains available.

-- The browser needs to read these two control flags. Only SECURITY DEFINER RPCs may change them.
alter table public.application_control enable row level security;
drop policy if exists "public can read application control" on public.application_control;
create policy "public can read application control"
  on public.application_control for select to anon, authenticated using (true);
revoke insert, update, delete on public.application_control from anon, authenticated;
grant select on public.application_control to anon, authenticated;

alter table public.system_pause enable row level security;
drop policy if exists "public can read system pause" on public.system_pause;
create policy "public can read system pause"
  on public.system_pause for select to anon, authenticated using (true);
revoke insert, update, delete on public.system_pause from anon, authenticated;
grant select on public.system_pause to anon, authenticated;

insert into public.application_control (id, app_frozen)
values (1, false)
on conflict (id) do nothing;

insert into public.system_pause (id, paused)
values (1, false)
on conflict (id) do nothing;

-- Give every match event a stable client id. Retrying an offline sync cannot create duplicates.
alter table public.match_events
  add column if not exists client_event_id uuid;

create unique index if not exists match_events_client_event_id_unique
  on public.match_events (client_event_id)
  where client_event_id is not null;

-- Enforce freeze/pause on the database itself, not only by hiding browser pages.
create or replace function public.enforce_slfa_application_controls()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_role text := '';
  v_status text := '';
  v_frozen boolean := true;
  v_paused boolean := true;
  v_pause_tables text[] := array[
    'matches',
    'match_events',
    'match_lineups',
    'match_results',
    'match_referee_assignments'
  ];
begin
  -- Trusted server-side maintenance is allowed to proceed.
  if coalesce(auth.role(), '') = 'service_role' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if v_uid is null then
    raise exception 'Sign in with an active league account to make changes.'
      using errcode = '42501';
  end if;

  select upper(coalesce(system_role, '')), lower(coalesce(status, ''))
    into v_role, v_status
    from public.user_profiles
   where id = v_uid;

  if not found or v_status <> 'active' then
    raise exception 'This account is not active and cannot change league records.'
      using errcode = '42501';
  end if;

  select coalesce(app_frozen, true)
    into v_frozen
    from public.application_control
   where id = 1;

  if v_role <> 'DEVELOPER' and coalesce(v_frozen, true) then
    raise exception 'The SLFA League App is in maintenance mode. Changes are temporarily disabled.'
      using errcode = '55000';
  end if;

  select coalesce(paused, true)
    into v_paused
    from public.system_pause
   where id = 1;

  if v_role <> 'DEVELOPER'
     and tg_table_name = any(v_pause_tables)
     and coalesce(v_paused, true) then
    raise exception 'League operations are paused. Match records cannot be changed until the league resumes.'
      using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.enforce_slfa_application_controls() from public, anon, authenticated;

do $$
declare
  t text;
  protected_tables text[] := array[
    'matches',
    'match_events',
    'match_lineups',
    'match_results',
    'match_referee_assignments',
    'club_squad',
    'squad_transfers',
    'club_announcements',
    'media_posts',
    'polls',
    'poll_options',
    'disciplinary_actions',
    'suspensions',
    'league_clubs',
    'leagues'
  ];
begin
  foreach t in array protected_tables loop
    if to_regclass(format('public.%I', t)) is not null then
      execute format('drop trigger if exists enforce_slfa_application_controls on public.%I', t);
      execute format(
        'create trigger enforce_slfa_application_controls before insert or update or delete on public.%I for each row execute function public.enforce_slfa_application_controls()',
        t
      );
    end if;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
