-- Fans save favourite clubs to their own account.
create table if not exists public.user_favorite_clubs (
  user_id uuid not null references auth.users(id) on delete cascade,
  club_id uuid not null references public.league_clubs(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, club_id)
);

alter table public.user_favorite_clubs enable row level security;

create policy "fans read own favourites" on public.user_favorite_clubs
  for select to authenticated using (user_id = (select auth.uid()));
create policy "fans add own favourites" on public.user_favorite_clubs
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "fans remove own favourites" on public.user_favorite_clubs
  for delete to authenticated using (user_id = (select auth.uid()));

grant select, insert, delete on public.user_favorite_clubs to authenticated;
