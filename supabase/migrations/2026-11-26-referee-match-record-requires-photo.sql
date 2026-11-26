-- Require at least one captured record image before a referee report can be submitted.
alter table public.referee_match_record_submissions
  add constraint referee_match_record_submitted_requires_photo
  check (
    status <> 'SUBMITTED'
    or (
      cardinality(image_paths) between 1 and 6
      and submitted_at is not null
    )
  );