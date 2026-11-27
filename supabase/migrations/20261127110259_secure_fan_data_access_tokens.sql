CREATE OR REPLACE FUNCTION public.fan_my_data(p_voter_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if coalesce(p_voter_key, '') !~ '^v2_[0-9a-f]{64}$' then
    raise exception 'A valid secure browser code is needed.';
  end if;

  return jsonb_build_object(
    'reports', coalesce((
      select jsonb_agg(jsonb_build_object(
        'match_id', r.match_id, 'type', r.report_type, 'message', r.message,
        'status', r.status, 'created_at', r.created_at
      ) order by r.created_at)
      from public.fan_reports r where r.voter_key = p_voter_key
    ), '[]'::jsonb),
    'comments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'match_id', c.match_id, 'fan_name', c.fan_name, 'body', c.body,
        'status', c.status, 'created_at', c.created_at
      ) order by c.created_at)
      from public.match_comments c where c.voter_key = p_voter_key
    ), '[]'::jsonb),
    'predictions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'match_id', p.match_id, 'fan_name', p.fan_name, 'home', p.home_pred,
        'away', p.away_pred, 'created_at', p.created_at
      ) order by p.created_at)
      from public.match_predictions p where p.voter_key = p_voter_key
    ), '[]'::jsonb),
    'poll_votes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'poll_id', v.poll_id, 'option_id', v.option_id, 'created_at', v.created_at
      ) order by v.created_at)
      from public.poll_votes v where v.voter_key = p_voter_key
    ), '[]'::jsonb)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.fan_delete_my_data(p_voter_key text, p_kinds text[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  n_reports integer := 0;
  n_comments integer := 0;
  n_predictions integer := 0;
  n_votes integer := 0;
begin
  if coalesce(p_voter_key, '') !~ '^v2_[0-9a-f]{64}$' then
    raise exception 'A valid secure browser code is needed.';
  end if;

  if p_kinds is null or cardinality(p_kinds) = 0
     or exists (
       select 1 from unnest(p_kinds) as selected(kind)
       where selected.kind not in ('reports', 'comments', 'predictions', 'poll_votes')
     ) then
    raise exception 'Choose valid data categories to delete.';
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

  return jsonb_build_object(
    'reports', n_reports,
    'comments', n_comments,
    'predictions', n_predictions,
    'poll_votes', n_votes
  );
end;
$function$;
