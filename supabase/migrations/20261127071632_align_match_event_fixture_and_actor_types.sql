-- Align live match event identifiers and actors with the canonical SLFA records.
-- Applied to Supabase project ticcaervmjdzbprdpxxv as migration 20261127071632.
-- Includes dependent policies/functions/view so the typed fixture key is enforced end-to-end.

DO $preflight$
BEGIN
  IF EXISTS (SELECT 1 FROM public.match_events WHERE match_id IS NULL OR btrim(match_id) !~ '^[0-9]+$') THEN
    RAISE EXCEPTION 'Alignment stopped: match_events contains a non-numeric fixture ID.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.match_events e WHERE NOT EXISTS (SELECT 1 FROM public.matches m WHERE m.id=btrim(e.match_id)::bigint)) THEN
    RAISE EXCEPTION 'Alignment stopped: match_events contains an orphan fixture ID.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.match_events WHERE recorded_by IS NULL OR NULLIF(btrim(recorded_by),'') IS NULL OR btrim(recorded_by) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
    RAISE EXCEPTION 'Alignment stopped: match_events contains a missing or invalid recorder UUID.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.match_events e WHERE NOT EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id=btrim(e.recorded_by)::uuid)) THEN
    RAISE EXCEPTION 'Alignment stopped: a match event recorder has no user profile.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.match_team_sheets s WHERE NOT EXISTS (SELECT 1 FROM public.league_clubs c WHERE c.id=s.club_id) OR NOT EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id=s.submitted_by)) THEN
    RAISE EXCEPTION 'Alignment stopped: a team sheet has an invalid club or submitting profile.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.match_lineups l WHERE l.submitted_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id=l.submitted_by)) THEN
    RAISE EXCEPTION 'Alignment stopped: a lineup submitter has no user profile.';
  END IF;
END
$preflight$;

DROP VIEW public.player_suspension_flags;

DROP POLICY IF EXISTS "Assigned referees read match events" ON public.match_events;
DROP POLICY IF EXISTS "assigned data operator inserts live match events" ON public.match_events;
DROP POLICY IF EXISTS "assigned data operators read match events" ON public.match_events;
DROP POLICY IF EXISTS "assigned on-field referees insert own match events" ON public.match_events;

ALTER TABLE public.match_events
  ALTER COLUMN match_id DROP DEFAULT,
  ALTER COLUMN match_id TYPE bigint USING btrim(match_id)::bigint,
  ALTER COLUMN recorded_by TYPE uuid USING NULLIF(btrim(recorded_by),'')::uuid,
  ALTER COLUMN recorded_by SET NOT NULL,
  ALTER COLUMN recorded_at SET DEFAULT now(),
  ALTER COLUMN recorded_at SET NOT NULL,
  ALTER COLUMN client_event_id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN client_event_id SET NOT NULL;

DROP INDEX IF EXISTS public.match_events_client_event_id_unique;
CREATE UNIQUE INDEX match_events_client_event_id_unique ON public.match_events (client_event_id);

ALTER TABLE public.match_events
  ADD CONSTRAINT match_events_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE RESTRICT,
  ADD CONSTRAINT match_events_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.user_profiles(id) ON DELETE RESTRICT;

ALTER TABLE public.match_team_sheets
  ADD CONSTRAINT match_team_sheets_club_id_fkey FOREIGN KEY (club_id) REFERENCES public.league_clubs(id) ON DELETE RESTRICT,
  ADD CONSTRAINT match_team_sheets_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES public.user_profiles(id) ON DELETE RESTRICT;

ALTER TABLE public.match_lineups
  ADD CONSTRAINT match_lineups_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES public.user_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS match_events_recorded_by_idx ON public.match_events (recorded_by);
CREATE INDEX IF NOT EXISTS match_team_sheets_club_id_idx ON public.match_team_sheets (club_id);
CREATE INDEX IF NOT EXISTS match_team_sheets_submitted_by_idx ON public.match_team_sheets (submitted_by);
CREATE INDEX IF NOT EXISTS match_lineups_submitted_by_idx ON public.match_lineups (submitted_by);

CREATE POLICY "Assigned referees read match events" ON public.match_events FOR SELECT TO authenticated
USING (
  public.app_role()='REFEREE' AND NOT public.is_match_commissioner_user()
  AND EXISTS (
    SELECT 1 FROM public.match_referee_assignments ra
    WHERE ra.referee_user_id=(SELECT auth.uid())
      AND ra.assignment_status='ACTIVE'
      AND ra.match_id=match_events.match_id
  )
);

CREATE POLICY "assigned data operator inserts live match events" ON public.match_events FOR INSERT TO authenticated
WITH CHECK (
  public.app_role()='MATCH_DATA_OPERATOR'
  AND recorded_by=(SELECT auth.uid())
  AND published_at IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.match_referee_assignments a
    JOIN public.user_profiles p ON p.id=a.referee_user_id
    WHERE a.match_id=match_events.match_id AND a.referee_user_id=(SELECT auth.uid())
      AND a.official_role='DATA_OPERATOR' AND a.assignment_status='ACTIVE'
      AND p.system_role='MATCH_DATA_OPERATOR' AND p.status='Active'
  )
  AND EXISTS (
    SELECT 1 FROM public.matches m
    WHERE m.id=match_events.match_id AND m.match_status IN ('LIVE','HT','FT')
  )
);

CREATE POLICY "assigned data operators read match events" ON public.match_events FOR SELECT TO authenticated
USING (
  public.app_role()='MATCH_DATA_OPERATOR'
  AND EXISTS (
    SELECT 1 FROM public.match_referee_assignments a
    JOIN public.user_profiles p ON p.id=a.referee_user_id
    WHERE a.match_id=match_events.match_id AND a.referee_user_id=(SELECT auth.uid())
      AND a.official_role='DATA_OPERATOR' AND a.assignment_status='ACTIVE'
      AND p.system_role='MATCH_DATA_OPERATOR' AND p.status='Active'
  )
);

CREATE POLICY "assigned on-field referees insert own match events" ON public.match_events FOR INSERT TO authenticated
WITH CHECK (
  public.app_role()='REFEREE' AND NOT public.is_match_commissioner_user()
  AND recorded_by=(SELECT auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.user_profiles up
    JOIN public.match_referee_assignments a ON a.referee_user_id=up.id
    WHERE up.id=(SELECT auth.uid()) AND up.system_role='REFEREE'
      AND lower(coalesce(up.status,''))='active'
      AND a.match_id=match_events.match_id
      AND a.assignment_status='ACTIVE'
      AND a.official_role IN ('MAIN','ASSISTANT')
  )
);

CREATE OR REPLACE FUNCTION public.discipline_on_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE pid bigint; rules public.disciplinary_rules%rowtype; cnt integer; since timestamptz;
BEGIN
  IF new.event_type NOT IN ('YELLOW_CARD','RED_CARD') THEN RETURN new; END IF;
  SELECT * INTO rules FROM public.disciplinary_rules WHERE id=1;
  SELECT s.id INTO pid FROM public.club_squad s JOIN public.league_clubs c ON c.id=s.club_id
  WHERE c.club_name=new.team_name AND s.player_name=new.player_name
  ORDER BY (s.registration_status='Approved') DESC,s.id DESC LIMIT 1;
  IF pid IS NULL THEN RETURN new; END IF;
  IF new.event_type='RED_CARD' THEN
    INSERT INTO public.suspensions(player_id,reason,source_event_id,matches_total)
    VALUES(pid,'RED_CARD',new.id,rules.red_ban);
    RETURN new;
  END IF;
  SELECT max(s.created_at) INTO since FROM public.suspensions s
  WHERE s.player_id=pid AND s.reason='YELLOW_ACCUMULATION';
  SELECT count(*) INTO cnt FROM public.match_events e
  JOIN public.matches m ON m.id=e.match_id
  WHERE m.season_id=(SELECT id FROM public.seasons WHERE is_current LIMIT 1)
    AND e.event_type='YELLOW_CARD' AND e.player_name=new.player_name AND e.team_name=new.team_name
    AND e.created_at>coalesce(since,'-infinity'::timestamptz);
  IF cnt>=rules.yellow_threshold THEN
    INSERT INTO public.suspensions(player_id,reason,source_event_id,matches_total)
    VALUES(pid,'YELLOW_ACCUMULATION',new.id,rules.yellow_ban);
  END IF;
  RETURN new;
END;
$function$;

CREATE OR REPLACE FUNCTION public.recalculate_match_scorers()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  DROP TABLE IF EXISTS _sc_photos;
  CREATE TEMP TABLE _sc_photos AS SELECT lower(trim(player)) AS lp,photo_url FROM public.top_scorers WHERE photo_url IS NOT NULL;
  DROP TABLE IF EXISTS _as_photos;
  CREATE TEMP TABLE _as_photos AS SELECT lower(trim(player)) AS lp,photo_url FROM public.top_assists WHERE photo_url IS NOT NULL;
  DELETE FROM public.top_scorers;
  INSERT INTO public.top_scorers(player,club,goals,photo_url,updated_at)
  SELECT g.player,g.club,g.goals,(SELECT p.photo_url FROM _sc_photos p WHERE p.lp=lower(g.player) LIMIT 1),now()
  FROM (
    SELECT trim(e.player_name) AS player,(array_agg(trim(e.team_name) ORDER BY e.created_at DESC))[1] AS club,count(*)::integer AS goals
    FROM public.match_events e JOIN public.matches m ON m.id=e.match_id
    WHERE e.event_type='GOAL' AND nullif(trim(e.player_name),'') IS NOT NULL
      AND public.match_season(m.season_id,m.match_date) IS NOT DISTINCT FROM (SELECT id FROM public.seasons WHERE is_current LIMIT 1)
    GROUP BY trim(e.player_name)
  ) g;
  DELETE FROM public.top_assists;
  INSERT INTO public.top_assists(player,club,assists,photo_url,updated_at)
  SELECT a.player,a.club,a.assists,(SELECT p.photo_url FROM _as_photos p WHERE p.lp=lower(a.player) LIMIT 1),now()
  FROM (
    SELECT trim(e.assist_player_name) AS player,(array_agg(trim(e.team_name) ORDER BY e.created_at DESC))[1] AS club,count(*)::integer AS assists
    FROM public.match_events e JOIN public.matches m ON m.id=e.match_id
    WHERE e.event_type='GOAL' AND nullif(trim(e.assist_player_name),'') IS NOT NULL
      AND public.match_season(m.season_id,m.match_date) IS NOT DISTINCT FROM (SELECT id FROM public.seasons WHERE is_current LIMIT 1)
    GROUP BY trim(e.assist_player_name)
  ) a;
  DROP TABLE IF EXISTS _sc_photos;
  DROP TABLE IF EXISTS _as_photos;
END;
$function$;

CREATE OR REPLACE FUNCTION public.season_player_stats(p_season_id bigint)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
SELECT jsonb_build_object(
 'scorers',coalesce((
   SELECT jsonb_agg(jsonb_build_object('player',g.player,'club',g.club,'goals',g.goals) ORDER BY g.goals DESC,g.player)
   FROM (
     SELECT trim(e.player_name) AS player,(array_agg(trim(e.team_name) ORDER BY e.created_at DESC))[1] AS club,count(*)::integer AS goals
     FROM public.match_events e JOIN public.matches m ON m.id=e.match_id
     WHERE e.event_type='GOAL' AND nullif(trim(e.player_name),'') IS NOT NULL
       AND public.match_season(m.season_id,m.match_date)=p_season_id
     GROUP BY trim(e.player_name) ORDER BY count(*) DESC LIMIT 200
   ) g),'[]'::jsonb),
 'assists',coalesce((
   SELECT jsonb_agg(jsonb_build_object('player',a.player,'club',a.club,'assists',a.assists) ORDER BY a.assists DESC,a.player)
   FROM (
     SELECT trim(e.assist_player_name) AS player,(array_agg(trim(e.team_name) ORDER BY e.created_at DESC))[1] AS club,count(*)::integer AS assists
     FROM public.match_events e JOIN public.matches m ON m.id=e.match_id
     WHERE e.event_type='GOAL' AND nullif(trim(e.assist_player_name),'') IS NOT NULL
       AND public.match_season(m.season_id,m.match_date)=p_season_id
     GROUP BY trim(e.assist_player_name) ORDER BY count(*) DESC LIMIT 200
   ) a),'[]'::jsonb)
);
$function$;

CREATE OR REPLACE FUNCTION public.reverse_match_event(p_event_id bigint,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE e public.match_events%rowtype; v_name text; v_role text;
BEGIN
  IF public.is_match_commissioner_user() THEN RAISE EXCEPTION 'Match Commissioners cannot reverse referee match events.'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason))<5 THEN
    RAISE EXCEPTION 'Give a reason of at least 5 characters. It is kept in the log.';
  END IF;
  SELECT * INTO e FROM public.match_events WHERE id=p_event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Event not found.'; END IF;
  IF public.app_role()='SUPER_ADMIN' THEN
    NULL;
  ELSIF public.app_role()='REFEREE' AND EXISTS (
    SELECT 1 FROM public.user_profiles up JOIN public.match_referee_assignments a ON a.referee_user_id=up.id
    WHERE up.id=auth.uid() AND up.system_role='REFEREE' AND lower(coalesce(up.status,''))='active'
      AND a.match_id=e.match_id AND a.assignment_status='ACTIVE' AND a.official_role='MAIN'
  ) THEN NULL;
  ELSIF public.app_role()='MATCH_DATA_OPERATOR' AND e.recorded_by=auth.uid() AND EXISTS (
    SELECT 1 FROM public.user_profiles up
    JOIN public.match_referee_assignments a ON a.referee_user_id=up.id
    JOIN public.matches m ON m.id=a.match_id
    WHERE up.id=auth.uid() AND up.system_role='MATCH_DATA_OPERATOR' AND up.status='Active'
      AND a.match_id=e.match_id AND a.assignment_status='ACTIVE' AND a.official_role='DATA_OPERATOR'
      AND m.match_status IN ('LIVE','HT')
  ) THEN NULL;
  ELSE
    RAISE EXCEPTION 'You cannot reverse this event. A Match Data Operator may reverse only an event they personally recorded in their assigned live fixture.';
  END IF;
  SELECT full_name,system_role INTO v_name,v_role FROM public.user_profiles WHERE id=auth.uid();
  INSERT INTO public.match_audit_log(actor_id,actor_name,actor_role,table_name,record_id,match_id,action,reason,old_data)
  VALUES(auth.uid(),v_name,v_role,'match_events',e.id::text,e.match_id::text,'REVERSED',btrim(p_reason),to_jsonb(e));
  UPDATE public.match_events SET change_reason=btrim(p_reason) WHERE id=p_event_id;
  DELETE FROM public.match_events WHERE id=p_event_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_match_data_operator_event()
RETURNS trigger LANGUAGE plpgsql SET search_path TO ''
AS $function$
DECLARE v_match public.matches%rowtype; v_team_club uuid; v_player_id bigint; v_related_player_id bigint;
BEGIN
  IF public.app_role() IS DISTINCT FROM 'MATCH_DATA_OPERATOR' THEN RETURN new; END IF;
  IF new.match_id IS NULL THEN RAISE EXCEPTION 'The Data Operator event must reference a valid SLFA fixture.'; END IF;
  SELECT * INTO v_match FROM public.matches WHERE id=new.match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'The selected fixture could not be found.'; END IF;
  IF v_match.match_status NOT IN ('LIVE','HT','FT') THEN
    RAISE EXCEPTION 'Match events can only be recorded while the fixture is live, at half-time, or when syncing its completed offline record.';
  END IF;
  IF v_match.home_club_id IS NULL OR v_match.away_club_id IS NULL THEN
    RAISE EXCEPTION 'This fixture is not linked to both registered clubs. Ask the Super Admin to correct its fixture records.';
  END IF;
  IF lower(btrim(new.team_name))=lower(btrim(v_match.home_team)) THEN
    v_team_club:=v_match.home_club_id;
  ELSIF lower(btrim(new.team_name))=lower(btrim(v_match.away_team)) THEN
    v_team_club:=v_match.away_club_id;
  ELSE RAISE EXCEPTION 'Choose either the home or away team recorded for this fixture.'; END IF;
  SELECT cs.id INTO v_player_id FROM public.match_lineups ml JOIN public.club_squad cs ON cs.id=ml.player_id
  WHERE ml.match_id=v_match.id AND ml.club_id=v_team_club
    AND lower(btrim(cs.player_name))=lower(btrim(new.player_name))
    AND cs.status='Active' AND cs.registration_status='Approved' AND cs.season_id=v_match.season_id LIMIT 1;
  IF v_player_id IS NULL THEN RAISE EXCEPTION 'The selected player is not in this club’s approved team sheet for the fixture.'; END IF;
  IF new.event_type='SUB' THEN
    IF coalesce(btrim(new.player_off_name),'')='' THEN RAISE EXCEPTION 'A substitution must identify the player leaving the pitch.'; END IF;
    IF lower(btrim(new.player_off_name))=lower(btrim(new.player_name)) THEN RAISE EXCEPTION 'The player coming on and the player leaving must be different.'; END IF;
    SELECT cs.id INTO v_related_player_id FROM public.match_lineups ml JOIN public.club_squad cs ON cs.id=ml.player_id
    WHERE ml.match_id=v_match.id AND ml.club_id=v_team_club
      AND lower(btrim(cs.player_name))=lower(btrim(new.player_off_name))
      AND cs.status='Active' AND cs.registration_status='Approved' AND cs.season_id=v_match.season_id LIMIT 1;
    IF v_related_player_id IS NULL THEN RAISE EXCEPTION 'The player leaving the pitch is not on this club’s approved match team sheet.'; END IF;
  ELSIF coalesce(btrim(new.player_off_name),'')<>'' THEN
    RAISE EXCEPTION 'Only a substitution event can include a player leaving the pitch.';
  END IF;
  IF new.event_type='GOAL' AND coalesce(btrim(new.assist_player_name),'')<>'' THEN
    IF lower(btrim(new.assist_player_name))=lower(btrim(new.player_name)) THEN RAISE EXCEPTION 'The goal scorer cannot be listed as their own assist provider.'; END IF;
    SELECT cs.id INTO v_related_player_id FROM public.match_lineups ml JOIN public.club_squad cs ON cs.id=ml.player_id
    WHERE ml.match_id=v_match.id AND ml.club_id=v_team_club
      AND lower(btrim(cs.player_name))=lower(btrim(new.assist_player_name))
      AND cs.status='Active' AND cs.registration_status='Approved' AND cs.season_id=v_match.season_id LIMIT 1;
    IF v_related_player_id IS NULL THEN RAISE EXCEPTION 'The assist provider must be a player on the same club’s approved match team sheet.'; END IF;
  ELSIF new.event_type<>'GOAL' AND coalesce(btrim(new.assist_player_name),'')<>'' THEN
    RAISE EXCEPTION 'Only a goal event can include an assist provider.';
  END IF;
  RETURN new;
END;
$function$;

CREATE VIEW public.player_suspension_flags WITH (security_invoker=true) AS
WITH cards AS (
  SELECT e.team_name,e.player_name,m.season_id,e.event_type
  FROM public.match_events e JOIN public.matches m ON m.id=e.match_id
  WHERE e.event_type IN ('YELLOW_CARD','RED_CARD') AND e.player_name IS NOT NULL
), totals AS (
  SELECT cards.team_name,cards.player_name,cards.season_id,
    count(*) FILTER (WHERE cards.event_type='YELLOW_CARD') AS yellow_cards,
    count(*) FILTER (WHERE cards.event_type='RED_CARD') AS red_cards
  FROM cards GROUP BY cards.team_name,cards.player_name,cards.season_id
)
SELECT t.team_name,t.player_name,t.season_id,t.yellow_cards,t.red_cards,
  r.yellow_card_limit,r.red_card_ban_matches,
  (t.yellow_cards>=coalesce(r.yellow_card_limit,3) OR t.red_cards>0) AS suspension_due
FROM totals t
LEFT JOIN public.suspension_rules r
  ON NOT (r.season_id IS DISTINCT FROM t.season_id) AND r.competition_name='League';
