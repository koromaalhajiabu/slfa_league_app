-- Fan privacy controls: a fan can see and delete the data their own browser sent.
-- The browser voter code is the only key; it is never shown in exports.

create or replace function public.fan_my_data(p_voter_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(char_length(p_voter_key), 0) not between 8 and 100 then
    raise exception 'A valid browser code is needed.';
  end if;
  return jsonb_build_object(
    'reports', coalesce((select jsonb_agg(jsonb_build_object(
        'match_id', r.match_id, 'type', r.report_type, 'message', r.message,
        'status', r.status, 'created_at', r.created_at) order by r.created_at)
        from public.fan_reports r where r.voter_key = p_voter_key), '[]'::jsonb),
    'comments', coalesce((select jsonb_agg(jsonb_build_object(
        'match_id', c.match_id, 'fan_name', c.fan_name, 'body', c.body,
        'status', c.status, 'created_at', c.created_at) order by c.created_at)
        from public.match_comments c where c.voter_key = p_voter_key), '[]'::jsonb),
    'predictions', coalesce((select jsonb_agg(jsonb_build_object(
        'match_id', p.match_id, 'fan_name', p.fan_name, 'home', p.home_pred,
        'away', p.away_pred, 'created_at', p.created_at) order by p.created_at)
        from public.match_predictions p where p.voter_key = p_voter_key), '[]'::jsonb),
    'poll_votes', coalesce((select jsonb_agg(jsonb_build_object(
        'poll_id', v.poll_id, 'option_id', v.option_id, 'created_at', v.created_at) order by v.created_at)
        from public.poll_votes v where v.voter_key = p_voter_key), '[]'::jsonb)
  );
end;
$$;

create or replace function public.fan_delete_my_data(p_voter_key text, p_kinds text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n_reports integer := 0; n_comments integer := 0; n_predictions integer := 0; n_votes integer := 0;
begin
  if coalesce(char_length(p_voter_key), 0) not between 8 and 100 then
    raise exception 'A valid browser code is needed.';
  end if;
  if p_kinds is null or array_length(p_kinds, 1) is null then
    raise exception 'Choose what to delete.';
  end if;
  if 'reports' = any(p_kinds) then
    delete from public.fan_reports where voter_key = p_voter_key;
    get diagnostics n_reports = row_count;
  end if;
  if 'comments' = any(p_kinds) then
    delete from public.match_comments where voter_key = p_voter_key;
    get diagnostics n_comments = row_count;
  end if;
  if 'predictions' = any(p_kinds) then
    delete from public.match_predictions where voter_key = p_voter_key;
    get diagnostics n_predictions = row_count;
  end if;
  if 'poll_votes' = any(p_kinds) then
    delete from public.poll_votes where voter_key = p_voter_key;
    get diagnostics n_votes = row_count;
  end if;
  return jsonb_build_object('reports', n_reports, 'comments', n_comments,
    'predictions', n_predictions, 'poll_votes', n_votes);
end;
$$;

revoke all on function public.fan_my_data(text) from public;
revoke all on function public.fan_delete_my_data(text, text[]) from public;
grant execute on function public.fan_my_data(text) to anon, authenticated;
grant execute on function public.fan_delete_my_data(text, text[]) to anon, authenticated;
