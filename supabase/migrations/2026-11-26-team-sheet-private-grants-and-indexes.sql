begin;
revoke all on public.match_team_sheets from public, anon;
grant select on public.match_team_sheets to authenticated;
create index if not exists match_team_sheets_club_submitted_at_idx
  on public.match_team_sheets(club_id, submitted_at desc);
create index if not exists match_team_sheets_status_submitted_at_idx
  on public.match_team_sheets(status, submitted_at desc);
create index if not exists match_team_sheets_reviewed_by_idx
  on public.match_team_sheets(reviewed_by);
commit;