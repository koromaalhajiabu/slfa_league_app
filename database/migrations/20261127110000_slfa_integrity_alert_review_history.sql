create table if not exists public.slfa_integrity_alert_history (
  id bigint generated always as identity primary key,
  alert_id uuid not null references public.slfa_integrity_alerts(id) on delete restrict,
  actor_id uuid,
  action text not null check (action in ('CREATED','REVIEW_UPDATED')),
  old_status text,
  new_status text,
  old_resolution_notes text,
  new_resolution_notes text,
  old_reviewed_by uuid,
  new_reviewed_by uuid,
  changed_at timestamptz not null default now()
);

alter table public.slfa_integrity_alert_history enable row level security;
revoke all on public.slfa_integrity_alert_history from anon, authenticated;
grant select on public.slfa_integrity_alert_history to authenticated;
drop policy if exists "Super Admin reads integrity alert history" on public.slfa_integrity_alert_history;
create policy "Super Admin reads integrity alert history" on public.slfa_integrity_alert_history
for select to authenticated using ((select public.app_role()) = 'SUPER_ADMIN');
create index if not exists slfa_integrity_alert_history_alert_idx on public.slfa_integrity_alert_history(alert_id, changed_at desc);
create or replace function public.record_slfa_integrity_alert_history()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    insert into public.slfa_integrity_alert_history(alert_id,actor_id,action,new_status,new_resolution_notes,new_reviewed_by)
    values(new.id,auth.uid(),'CREATED',new.status,new.resolution_notes,new.reviewed_by);
    return new;
  end if;
  if old.status is distinct from new.status or old.resolution_notes is distinct from new.resolution_notes or old.reviewed_by is distinct from new.reviewed_by then
    insert into public.slfa_integrity_alert_history(alert_id,actor_id,action,old_status,new_status,old_resolution_notes,new_resolution_notes,old_reviewed_by,new_reviewed_by)
    values(new.id,auth.uid(),'REVIEW_UPDATED',old.status,new.status,old.resolution_notes,new.resolution_notes,old.reviewed_by,new.reviewed_by);
  end if;
  return new;
end; $$;
revoke all on function public.record_slfa_integrity_alert_history() from public,anon,authenticated;
drop trigger if exists slfa_integrity_alert_history_insert on public.slfa_integrity_alerts;
create trigger slfa_integrity_alert_history_insert after insert on public.slfa_integrity_alerts for each row execute function public.record_slfa_integrity_alert_history();
drop trigger if exists slfa_integrity_alert_history_update on public.slfa_integrity_alerts;
create trigger slfa_integrity_alert_history_update after update on public.slfa_integrity_alerts for each row execute function public.record_slfa_integrity_alert_history();