-- Index the optional review actor foreign key for efficient profile deletes and lookups.
create index if not exists referee_match_record_reviewed_by_idx
  on public.referee_match_record_submissions (reviewed_by);
