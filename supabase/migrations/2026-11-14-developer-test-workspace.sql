-- Isolated Developer workspace: test records never enter official SLFA tables.
create table if not exists public.developer_test_records (
  id uuid primary key default gen_random_uuid(),
  target_role text not null check (target_role in ('SUPER_ADMIN','CLUB_ADMIN','REFEREE','DISCIPLINARY_OFFICER','MEDIA_OFFICER')),
  title text not null check (length(trim(title)) between 1 and 160),
  payload jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists developer_test_records_owner_idx on public.developer_test_records(created_by, target_role, updated_at desc);
alter table public.developer_test_records enable row level security;
revoke all on public.developer_test_records from anon, authenticated;
grant select, insert, update, delete on public.developer_test_records to authenticated;

create table if not exists public.developer_test_audit (
  id bigint generated always as identity primary key,
  actor_id uuid not null references auth.users(id) on delete restrict,
  test_record_id uuid,
  action text not null check (action in ('CREATE','UPDATE','DELETE')),
  target_role text not null,
  record_title text not null,
  occurred_at timestamptz not null default now()
);
alter table public.developer_test_audit enable row level security;
revoke all on public.developer_test_audit from anon, authenticated;

create or replace function public.developer_test_list()
returns jsonb language plpgsql stable security definer set search_path=public
as $$
begin
  if auth.uid() is null or public.app_role() is distinct from 'DEVELOPER' then
    raise exception 'Active Developer access required.';
  end if;
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.updated_at desc)
    from (select id,target_role,title,payload,created_at,updated_at
      from public.developer_test_records where created_by=auth.uid()) x),'[]'::jsonb);
end $$;

create or replace function public.developer_test_save(p_id uuid, p_target_role text, p_title text, p_payload jsonb)
returns uuid language plpgsql security definer set search_path=public
as $$
declare v_id uuid; v_action text;
begin
  if auth.uid() is null or public.app_role() is distinct from 'DEVELOPER' then
    raise exception 'Active Developer access required.';
  end if;
  if p_target_role not in ('SUPER_ADMIN','CLUB_ADMIN','REFEREE','DISCIPLINARY_OFFICER','MEDIA_OFFICER') then
    raise exception 'Choose a supported staff panel.';
  end if;
  if length(trim(coalesce(p_title,''))) not between 1 and 160 then raise exception 'Title must be 1–160 characters.'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then raise exception 'Test data must be a JSON object.'; end if;
  if pg_column_size(p_payload)>32768 then raise exception 'Test data is too large (maximum 32 KB).'; end if;
  if p_id is null then
    insert into public.developer_test_records(target_role,title,payload,created_by)
    values(p_target_role,trim(p_title),p_payload,auth.uid()) returning id into v_id;
    v_action:='CREATE';
  else
    update public.developer_test_records set target_role=p_target_role,title=trim(p_title),payload=p_payload,updated_at=now()
    where id=p_id and created_by=auth.uid() returning id into v_id;
    if v_id is null then raise exception 'Test record not found or not owned by this Developer.'; end if;
    v_action:='UPDATE';
  end if;
  insert into public.developer_test_audit(actor_id,test_record_id,action,target_role,record_title)
  values(auth.uid(),v_id,v_action,p_target_role,trim(p_title));
  return v_id;
end $$;

create or replace function public.developer_test_delete(p_id uuid)
returns boolean language plpgsql security definer set search_path=public
as $$
declare r public.developer_test_records%rowtype;
begin
  if auth.uid() is null or public.app_role() is distinct from 'DEVELOPER' then
    raise exception 'Active Developer access required.';
  end if;
  select * into r from public.developer_test_records where id=p_id and created_by=auth.uid();
  if not found then raise exception 'Test record not found or not owned by this Developer.'; end if;
  delete from public.developer_test_records where id=p_id and created_by=auth.uid();
  insert into public.developer_test_audit(actor_id,test_record_id,action,target_role,record_title)
  values(auth.uid(),r.id,'DELETE',r.target_role,r.title);
  return true;
end $$;

revoke all on function public.developer_test_list() from public;
revoke all on function public.developer_test_save(uuid,text,text,jsonb) from public;
revoke all on function public.developer_test_delete(uuid) from public;
grant execute on function public.developer_test_list() to authenticated;
grant execute on function public.developer_test_save(uuid,text,text,jsonb) to authenticated;
grant execute on function public.developer_test_delete(uuid) to authenticated;
