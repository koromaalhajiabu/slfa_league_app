-- Real Supabase Auth test accounts, isolated from production user_profiles and league tables.
create table if not exists public.slfa_test_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  test_role text not null check (test_role in ('TEST_SUPER_ADMIN','TEST_CLUB_ADMIN','TEST_REFEREE','TEST_DISCIPLINARY_OFFICER','TEST_MEDIA_OFFICER')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','DISABLED')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.slfa_test_accounts enable row level security;
revoke all on public.slfa_test_accounts from anon, authenticated;

create table if not exists public.slfa_test_activity (
  id bigint generated always as identity primary key,
  test_user_id uuid not null references auth.users(id) on delete cascade,
  test_role text not null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
alter table public.slfa_test_activity enable row level security;
revoke all on public.slfa_test_activity from anon, authenticated;

create table if not exists public.slfa_test_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  test_role text not null,
  record_type text not null,
  title text not null check (length(trim(title)) between 1 and 160),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists slfa_test_records_owner_idx on public.slfa_test_records(owner_id, created_at desc);
alter table public.slfa_test_records enable row level security;
revoke all on public.slfa_test_records from anon, authenticated;

create or replace function public.slfa_test_my_profile()
returns jsonb language plpgsql stable security definer set search_path=public
as $$
declare a public.slfa_test_accounts%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in required.'; end if;
  select * into a from public.slfa_test_accounts where user_id=auth.uid() and status='ACTIVE';
  if not found then raise exception 'This is not an active SLFA test account.'; end if;
  return jsonb_build_object('user_id',a.user_id,'email',a.email,'full_name',a.full_name,'test_role',a.test_role);
end $$;

create or replace function public.slfa_test_save_record(p_id uuid,p_record_type text,p_title text,p_payload jsonb)
returns uuid language plpgsql security definer set search_path=public
as $$
declare a public.slfa_test_accounts%rowtype; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in required.'; end if;
  select * into a from public.slfa_test_accounts where user_id=auth.uid() and status='ACTIVE';
  if not found then raise exception 'Active test account required.'; end if;
  if p_record_type not in ('FIXTURE','CLUB_NOTE','MATCH_EVENT','DISCIPLINARY_CASE','MEDIA_DRAFT') then raise exception 'Invalid test record type.'; end if;
  if length(trim(coalesce(p_title,''))) not between 1 and 160 then raise exception 'Title must be 1–160 characters.'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' or pg_column_size(p_payload)>32768 then raise exception 'Payload must be a JSON object no larger than 32 KB.'; end if;
  if p_id is null then
    insert into public.slfa_test_records(owner_id,test_role,record_type,title,payload)
    values(auth.uid(),a.test_role,p_record_type,trim(p_title),p_payload) returning id into v_id;
  else
    update public.slfa_test_records set record_type=p_record_type,title=trim(p_title),payload=p_payload,updated_at=now()
    where id=p_id and owner_id=auth.uid() returning id into v_id;
    if v_id is null then raise exception 'Test record not found.'; end if;
  end if;
  insert into public.slfa_test_activity(test_user_id,test_role,action,details)
  values(auth.uid(),a.test_role,case when p_id is null then 'CREATE_TEST_RECORD' else 'UPDATE_TEST_RECORD' end,jsonb_build_object('record_id',v_id,'record_type',p_record_type,'title',trim(p_title)));
  return v_id;
end $$;

create or replace function public.slfa_test_list_records()
returns jsonb language plpgsql stable security definer set search_path=public
as $$
declare a public.slfa_test_accounts%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in required.'; end if;
  select * into a from public.slfa_test_accounts where user_id=auth.uid() and status='ACTIVE';
  if not found then raise exception 'Active test account required.'; end if;
  return coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc) from
    (select id,record_type,title,payload,created_at,updated_at from public.slfa_test_records where owner_id=auth.uid()) r),'[]'::jsonb);
end $$;

create or replace function public.slfa_test_delete_record(p_id uuid)
returns boolean language plpgsql security definer set search_path=public
as $$
declare a public.slfa_test_accounts%rowtype; r public.slfa_test_records%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in required.'; end if;
  select * into a from public.slfa_test_accounts where user_id=auth.uid() and status='ACTIVE';
  if not found then raise exception 'Active test account required.'; end if;
  select * into r from public.slfa_test_records where id=p_id and owner_id=auth.uid();
  if not found then raise exception 'Test record not found.'; end if;
  delete from public.slfa_test_records where id=p_id and owner_id=auth.uid();
  insert into public.slfa_test_activity(test_user_id,test_role,action,details)
  values(auth.uid(),a.test_role,'DELETE_TEST_RECORD',jsonb_build_object('record_id',p_id,'record_type',r.record_type,'title',r.title));
  return true;
end $$;

revoke all on function public.slfa_test_my_profile() from public;
revoke all on function public.slfa_test_save_record(uuid,text,text,jsonb) from public;
revoke all on function public.slfa_test_list_records() from public;
revoke all on function public.slfa_test_delete_record(uuid) from public;
grant execute on function public.slfa_test_my_profile() to authenticated;
grant execute on function public.slfa_test_save_record(uuid,text,text,jsonb) to authenticated;
grant execute on function public.slfa_test_list_records() to authenticated;
grant execute on function public.slfa_test_delete_record(uuid) to authenticated;
