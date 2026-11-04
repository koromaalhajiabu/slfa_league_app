-- News & Announcements Centre: enforce Super Admin approval at database level.
-- Safe, additive migration. Existing posts and published content are preserved.
-- Media Officers may save drafts and submit posts, but cannot publish directly.

CREATE OR REPLACE FUNCTION public.guard_media_post_publication()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_role text;
BEGIN
  -- Permit trusted backend/service-role maintenance. Anonymous and normal
  -- authenticated sessions must pass the user_profiles role check.
  IF coalesce(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF upper(coalesce(NEW.status::text, '')) = 'PUBLISHED' THEN
    SELECT upper(coalesce(system_role, ''))
      INTO v_role
      FROM public.user_profiles
     WHERE id = auth.uid()
       AND lower(coalesce(status, '')) = 'active';

    IF coalesce(v_role, '') NOT IN ('SUPER_ADMIN', 'DEVELOPER') THEN
      RAISE EXCEPTION 'Only an active Super Admin or Developer can publish league news. Submit the post for approval.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_media_post_publication ON public.media_posts;
CREATE TRIGGER guard_media_post_publication
BEFORE INSERT OR UPDATE
ON public.media_posts
FOR EACH ROW
EXECUTE FUNCTION public.guard_media_post_publication();

REVOKE ALL ON FUNCTION public.guard_media_post_publication() FROM PUBLIC, anon, authenticated;
