-- Optional human-corrected OCR text, kept separately from original machine output.
alter table public.referee_match_record_submissions
  add column if not exists ocr_verified_text text,
  add column if not exists ocr_verified_by uuid references public.user_profiles(id) on delete set null,
  add column if not exists ocr_verified_at timestamptz;
alter table public.match_commissioner_reports
  add column if not exists ocr_verified_text text,
  add column if not exists ocr_verified_by uuid references public.user_profiles(id) on delete set null,
  add column if not exists ocr_verified_at timestamptz;