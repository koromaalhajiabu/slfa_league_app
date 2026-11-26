-- Index foreign keys used to record who verified OCR corrections.
create index if not exists referee_match_record_ocr_verified_by_idx
  on public.referee_match_record_submissions (ocr_verified_by);
create index if not exists match_commissioner_reports_ocr_verified_by_idx
  on public.match_commissioner_reports (ocr_verified_by);
