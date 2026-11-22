-- Premium Media Centre metadata. Additive: existing news and media posts are preserved.
alter table public.media_posts
  add column if not exists media_type text not null default 'NEWS',
  add column if not exists gallery_urls text[] not null default '{}',
  add column if not exists interviewee text,
  add column if not exists media_metadata jsonb not null default '{}'::jsonb;

update public.media_posts
set media_type = case
  when upper(coalesce(category::text,'')) = 'PHOTO' then 'GALLERY'
  when upper(coalesce(category::text,'')) = 'MATCH_REPORT' then 'MATCH_REPORT'
  when video_url is not null then 'VIDEO'
  else 'NEWS'
end
where media_type is null or media_type = 'NEWS';

alter table public.media_posts
  drop constraint if exists media_posts_media_type_check;
alter table public.media_posts
  add constraint media_posts_media_type_check
  check (media_type in ('NEWS','GALLERY','VIDEO','INTERVIEW','MATCH_REPORT'));

notify pgrst, 'reload schema';
