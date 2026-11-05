-- Removes the medical consent rule from squad eligibility, then removes the medical records table
-- and the functions that used it. The table was empty; nothing is lost. Other eligibility checks
-- (approved registration, pending transfers) are unchanged.

-- 1. Eligibility check without the medical consent step
do $$
declare d text;
begin
  d := pg_get_functiondef('public.player_eligibility_problem(bigint)'::regprocedure);
  d := regexp_replace(d, 'when not exists \(\s*select 1 from public\.player_medical_records.*?has not been confirmed by the club.\s*', '', 'g');
  execute d;
end $$;

-- 2. Medical functions
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as fn
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('admin_medical_records', 'player_set_medical_consent', 'club_confirm_medical_consent',
                        'my_medical_consent', 'super_admin_medical_records')
  loop
    execute 'drop function ' || r.fn;
  end loop;
end $$;

-- 3. Medical records table (its trigger and policies go with it)
drop table public.player_medical_records;
