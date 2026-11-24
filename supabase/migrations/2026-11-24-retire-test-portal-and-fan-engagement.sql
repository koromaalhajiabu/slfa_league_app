begin;

-- Retire the unapproved test portal and fan interaction workflows.
-- Keep their empty tables as inert historical schema; no client role can use
-- them, and the public/admin interfaces no longer expose these workflows.

revoke all on table
  public.slfa_test_accounts,
  public.slfa_test_records,
  public.slfa_test_activity,
  public.fan_reports,
  public.match_comments
from public, anon, authenticated;

alter table public.slfa_test_accounts enable row level security;
alter table public.slfa_test_records enable row level security;
alter table public.slfa_test_activity enable row level security;
alter table public.fan_reports enable row level security;
alter table public.match_comments enable row level security;

do $$
declare p record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'slfa_test_accounts','slfa_test_records','slfa_test_activity',
        'fan_reports','match_comments'
      )
  loop
    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

revoke all on function public.slfa_test_delete_record(uuid) from public, anon, authenticated;
revoke all on function public.slfa_test_list_records() from public, anon, authenticated;
revoke all on function public.slfa_test_my_profile() from public, anon, authenticated;
revoke all on function public.slfa_test_save_record(uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.submit_fan_report(bigint, text, text, text) from public, anon, authenticated;
revoke all on function public.submit_match_comment(bigint, text, text, text) from public, anon, authenticated;

commit;
notify pgrst, 'reload schema';
