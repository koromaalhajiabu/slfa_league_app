begin;
-- Preserve the referee-only result submission workflow and remove obsolete
-- Super Admin/Developer result entry and approval RPCs.
drop function if exists public.approve_match_result(bigint);
drop function if exists public.record_match_result(bigint,integer,integer);
drop function if exists public.referee_submit_match_result(bigint,integer,integer);
commit;
notify pgrst,'reload schema';
