-- Do not hide newly appointed Match Data Operators just because the appointment was
-- created more than 14 days before kick-off. Deduplication is based on assignment ID.
do $migration$
declare
  v_definition text;
  v_old text := '    and a.assigned_at >= now() - interval ''14 days''';
begin
  v_definition := pg_get_functiondef('public.generate_match_ops_notifications()'::regprocedure);
  if position(v_old in v_definition)>0 then
    v_definition := replace(v_definition,v_old,'');
    execute v_definition;
  end if;
end
$migration$;
