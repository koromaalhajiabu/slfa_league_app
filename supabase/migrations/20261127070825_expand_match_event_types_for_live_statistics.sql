-- Keep the match_events event-type constraint aligned with the
-- eleven event types exposed by the Match Data Operator interface.
-- Existing role, fixture, team, approved-lineup, assist and substitution
-- validations remain enforced by the existing database triggers.

alter table public.match_events
  drop constraint if exists match_events_event_type_check;

alter table public.match_events
  add constraint match_events_event_type_check
  check (
    event_type = any (
      array[
        'GOAL'::text,
        'YELLOW_CARD'::text,
        'RED_CARD'::text,
        'SUB'::text,
        'SHOT_ON_TARGET'::text,
        'SHOT_OFF_TARGET'::text,
        'SHOT_BLOCKED'::text,
        'SAVE'::text,
        'CORNER'::text,
        'FOUL'::text,
        'OFFSIDE'::text
      ]
    )
  );
