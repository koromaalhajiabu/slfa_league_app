-- Source-attributed Noda Score demonstration records.
-- These tables are isolated from official SLFA matches, events and standings.
create table if not exists public.noda_demo_matches (
  id uuid primary key default gen_random_uuid(),
  source_match_key text not null unique,
  competition text not null,
  season text not null,
  match_date date not null,
  kickoff_local text,
  home_team text not null,
  away_team text not null,
  home_score integer not null check (home_score >= 0),
  away_score integer not null check (away_score >= 0),
  half_time_home integer,
  half_time_away integer,
  venue text,
  source_url text not null,
  source_name text not null default 'Noda Sports',
  data_label text not null default 'DEMONSTRATION — NOT OFFICIAL SLFA DATA',
  imported_at timestamptz not null default now(),
  constraint noda_demo_match_score_check check (
    (half_time_home is null or half_time_home >= 0) and
    (half_time_away is null or half_time_away >= 0)
  )
);
create table if not exists public.noda_demo_events (
  id uuid primary key default gen_random_uuid(),
  demo_match_id uuid not null references public.noda_demo_matches(id) on delete cascade,
  event_type text not null,
  minute_label text not null,
  team_name text,
  player_name text,
  assist_player_name text,
  event_description text,
  source_url text not null,
  source_name text not null default 'Noda Sports',
  imported_at timestamptz not null default now()
);
create index if not exists noda_demo_events_match_idx on public.noda_demo_events(demo_match_id);
alter table public.noda_demo_matches enable row level security;
alter table public.noda_demo_events enable row level security;
drop policy if exists noda_demo_matches_public_read on public.noda_demo_matches;
create policy noda_demo_matches_public_read on public.noda_demo_matches for select to anon, authenticated using (true);
drop policy if exists noda_demo_events_public_read on public.noda_demo_events;
create policy noda_demo_events_public_read on public.noda_demo_events for select to anon, authenticated using (true);
revoke insert, update, delete on public.noda_demo_matches from anon, authenticated;
revoke insert, update, delete on public.noda_demo_events from anon, authenticated;
grant select on public.noda_demo_matches to anon, authenticated;
grant select on public.noda_demo_events to anon, authenticated;

insert into public.noda_demo_matches
(source_match_key,competition,season,match_date,kickoff_local,home_team,away_team,home_score,away_score,half_time_home,half_time_away,venue,source_url)
values
('noda-2026-11-22-old-edwardians-waterloo','Leone Rock Premier League','Leone Rock 2026/2027','2026-11-22','16:15','Old Edwardians FC','Waterloo FC',0,1,null,null,'SLFA Academy','https://www.nodasports.com/matches?status=finished'),
('noda-2026-11-22-diamond-bo','Leone Rock Premier League','Leone Rock 2026/2027','2026-11-22','16:15','Diamond Stars FC','Bo Rangers FC',0,1,0,1,'Koidu Sefadu Sports Stadium','https://www.nodasports.com/matches/22f16c07-ae8d-47f2-a4a0-256f76cc9c69'),
('noda-2026-11-22-ports-star','Leone Rock Premier League','Leone Rock 2026/2027','2026-11-22','16:15','Ports Authority FC','Star Sport Academy',1,1,0,1,'Approved School Field','https://www.nodasports.com/matches/55fdbe75-d2d7-4e64-9bea-098c571cce6c?tab=overview'),
('noda-2026-11-22-kallon-bai-bureh','Leone Rock Premier League','Leone Rock 2026/2027','2026-11-22','16:15','FC Kallon','Bai Bureh Warriors FC',0,0,0,0,'MK3/10 Playing Field','https://www.nodasports.com/matches/ec3ad992-1e6d-49da-a7e1-d336d6921166?tab=stats'),
('noda-2026-11-21-east-end-bhantal','Leone Rock Premier League','Leone Rock 2026/2027','2026-11-21',null,'East End Lions FC','Bhantal FC',2,1,null,null,'Trade Centre Field','https://www.nodasports.com/matches?status=finished')
on conflict (source_match_key) do update set
  home_score=excluded.home_score, away_score=excluded.away_score,
  half_time_home=excluded.half_time_home, half_time_away=excluded.half_time_away,
  venue=excluded.venue, source_url=excluded.source_url;

insert into public.noda_demo_events
(demo_match_id,event_type,minute_label,team_name,player_name,assist_player_name,event_description,source_url)
select m.id, e.event_type, e.minute_label, e.team_name, e.player_name, e.assist_player_name, e.event_description, e.source_url
from (values
('noda-2026-11-22-diamond-bo','GOAL','31','Bo Rangers FC','A. Bangura',null,'Goal recorded in Noda match centre.','https://www.nodasports.com/matches/22f16c07-ae8d-47f2-a4a0-256f76cc9c69'),
('noda-2026-11-22-diamond-bo','YELLOW_CARD','57','Bo Rangers FC','Mohamed Kabba',null,'Yellow card recorded in Noda match centre.','https://www.nodasports.com/matches/22f16c07-ae8d-47f2-a4a0-256f76cc9c69'),
('noda-2026-11-22-diamond-bo','YELLOW_CARD','90+2','Bo Rangers FC','Mohamed Sesay',null,'Yellow card recorded in Noda match centre.','https://www.nodasports.com/matches/22f16c07-ae8d-47f2-a4a0-256f76cc9c69'),
('noda-2026-11-22-ports-star','GOAL','18','Star Sport Academy','Larry Siemon','Shaka Sesay','Goal recorded in Noda match centre.','https://www.nodasports.com/matches/55fdbe75-d2d7-4e64-9bea-098c571cce6c?tab=overview'),
('noda-2026-11-22-ports-star','GOAL','62','Ports Authority FC','Derosimi Ibrahim','Osman A. Bangura','Goal recorded in Noda match centre.','https://www.nodasports.com/matches/55fdbe75-d2d7-4e64-9bea-098c571cce6c?tab=overview'),
('noda-2026-11-22-ports-star','YELLOW_CARD','29','Ports Authority FC','Abdul Budu Kamara',null,'Yellow card recorded in Noda match centre.','https://www.nodasports.com/matches/55fdbe75-d2d7-4e64-9bea-098c571cce6c?tab=overview'),
('noda-2026-11-22-ports-star','YELLOW_CARD','56','Ports Authority FC','Abdulai Aruna Sankoh',null,'Yellow card recorded in Noda match centre.','https://www.nodasports.com/matches/55fdbe75-d2d7-4e64-9bea-098c571cce6c?tab=overview'),
('noda-2026-11-22-ports-star','YELLOW_CARD','56','Ports Authority FC','Derosimi Ibrahim',null,'Yellow card recorded in Noda match centre.','https://www.nodasports.com/matches/55fdbe75-d2d7-4e64-9bea-098c571cce6c?tab=overview')
) as e(match_key,event_type,minute_label,team_name,player_name,assist_player_name,event_description,source_url)
join public.noda_demo_matches m on m.source_match_key=e.match_key
where not exists (
  select 1 from public.noda_demo_events old
  where old.demo_match_id=m.id and old.event_type=e.event_type
    and old.minute_label=e.minute_label and old.player_name is not distinct from e.player_name
);
