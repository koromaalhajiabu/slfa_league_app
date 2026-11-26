do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='match_commissioner_reports'
  ) then
    alter publication supabase_realtime add table public.match_commissioner_reports;
  end if;
end
$$;