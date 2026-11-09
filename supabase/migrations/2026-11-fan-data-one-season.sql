-- Fan comments, predictions and poll votes are kept for one season only.
-- Every day, rows created before the current season started are deleted.
-- Match results, tables, squads, problem reports and staff records are not affected.
create or replace function public.purge_fan_data_from_past_seasons()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start timestamptz;
  c_comments int := 0;
  c_predictions int := 0;
  c_votes int := 0;
begin
  select start_date::timestamptz into v_start from public.seasons where is_current limit 1;
  if v_start is null then
    return jsonb_build_object('skipped', 'no current season');
  end if;

  delete from public.match_comments where created_at < v_start;
  get diagnostics c_comments = row_count;
  delete from public.match_predictions where created_at < v_start;
  get diagnostics c_predictions = row_count;
  delete from public.poll_votes where created_at < v_start;
  get diagnostics c_votes = row_count;

  return jsonb_build_object('season_start', v_start, 'match_comments', c_comments,
    'match_predictions', c_predictions, 'poll_votes', c_votes);
end;
$$;

revoke all on function public.purge_fan_data_from_past_seasons() from public, anon, authenticated;

-- Runs every day at 03:00 UTC
select cron.unschedule('purge-past-season-fan-data')
  where exists (select 1 from cron.job where jobname = 'purge-past-season-fan-data');
select cron.schedule('purge-past-season-fan-data', '0 3 * * *', $$select public.purge_fan_data_from_past_seasons()$$);
