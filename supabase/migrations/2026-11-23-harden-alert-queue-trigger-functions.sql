-- Harden the push alert queue trigger path.
-- The queue writes are privileged because league_alerts is intentionally not
-- directly writable by public clients. Fix search_path and remove direct RPC access.

alter function public.queue_club_alert(text,text,bigint,text,text)
  security definer
  set search_path = pg_catalog, public;
alter function public.queue_league_alert(text,text)
  security definer
  set search_path = pg_catalog, public;
alter function public.trg_league_alert_fixture()
  security definer
  set search_path = pg_catalog, public;

revoke all on function public.queue_club_alert(text,text,bigint,text,text) from public, anon, authenticated;
revoke all on function public.queue_league_alert(text,text) from public, anon, authenticated;
revoke all on function public.trg_league_alert_fixture() from public, anon, authenticated;
