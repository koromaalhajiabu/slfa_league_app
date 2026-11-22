-- SLFA Premium Media Operations: uploads, review outcomes, and privacy-minimised engagement.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('slfa-media','slfa-media',true,52428800,array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime'])
on conflict (id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists slfa_media_upload_own on storage.objects;
create policy slfa_media_upload_own on storage.objects for insert to authenticated
with check (bucket_id='slfa-media' and (storage.foldername(name))[1]=(select auth.uid())::text and app_role()=any(array['MEDIA_OFFICER','SUPER_ADMIN','DEVELOPER']::text[]));

drop policy if exists slfa_media_delete_own_or_admin on storage.objects;
create policy slfa_media_delete_own_or_admin on storage.objects for delete to authenticated
using (bucket_id='slfa-media' and (((storage.foldername(name))[1]=(select auth.uid())::text and app_role()=any(array['MEDIA_OFFICER','SUPER_ADMIN','DEVELOPER']::text[])) or app_role()=any(array['SUPER_ADMIN','DEVELOPER']::text[])));

alter table public.media_posts drop constraint if exists media_posts_video_url_check;
alter table public.media_posts add constraint media_posts_video_url_check check (video_url is null or video_url like 'https://%');
alter table public.media_posts drop constraint if exists media_posts_status_check;
alter table public.media_posts add constraint media_posts_status_check check (status=any(array['DRAFT','SUBMITTED','RETURNED','PUBLISHED','REJECTED']::text[]));

drop policy if exists media_posts_officer_insert on public.media_posts;
create policy media_posts_officer_insert on public.media_posts for insert to authenticated
with check (app_role()=any(array['MEDIA_OFFICER','DEVELOPER']::text[]) and created_by=(select auth.uid()) and status=any(array['DRAFT','SUBMITTED']::text[]));

drop policy if exists media_posts_officer_update on public.media_posts;
create policy media_posts_officer_update on public.media_posts for update to authenticated
using (app_role()=any(array['MEDIA_OFFICER','DEVELOPER']::text[]) and created_by=(select auth.uid()) and status<>'PUBLISHED')
with check (app_role()=any(array['MEDIA_OFFICER','DEVELOPER']::text[]) and created_by=(select auth.uid()) and status=any(array['DRAFT','SUBMITTED','RETURNED','REJECTED']::text[]));

drop policy if exists media_posts_officer_delete on public.media_posts;
create policy media_posts_officer_delete on public.media_posts for delete to authenticated
using (app_role()=any(array['MEDIA_OFFICER','DEVELOPER']::text[]) and created_by=(select auth.uid()) and status=any(array['DRAFT','RETURNED','REJECTED']::text[]));

create table if not exists public.media_engagement (
 id bigint generated always as identity primary key,
 media_post_id uuid not null references public.media_posts(id) on delete cascade,
 event_type text not null check(event_type in ('IMPRESSION','VIDEO_PLAY','VIDEO_CLICK','SHARE')),
 event_day date not null default current_date,
 session_key text not null check(session_key ~ '^[a-f0-9-]{20,64}$'),
 created_at timestamptz not null default now(),
 constraint media_engagement_dedupe unique(media_post_id,event_type,event_day,session_key)
);
create index if not exists media_engagement_created_at_idx on public.media_engagement(created_at desc);
create index if not exists media_engagement_post_idx on public.media_engagement(media_post_id,event_type,created_at desc);
alter table public.media_engagement enable row level security;
drop policy if exists media_engagement_public_insert on public.media_engagement;
create policy media_engagement_public_insert on public.media_engagement for insert to anon,authenticated
with check (exists(select 1 from public.media_posts p where p.id=media_post_id and p.status='PUBLISHED'));
drop policy if exists media_engagement_admin_read on public.media_engagement;
create policy media_engagement_admin_read on public.media_engagement for select to authenticated
using(app_role()=any(array['SUPER_ADMIN','DEVELOPER']::text[]));
grant insert on public.media_engagement to anon,authenticated;
grant select on public.media_engagement to authenticated;
notify pgrst,'reload schema';
