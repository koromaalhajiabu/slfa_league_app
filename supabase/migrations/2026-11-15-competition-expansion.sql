-- SLFA competition expansion.
-- Adds descriptive competition metadata and a Developer/Super Admin-only management RPC.
-- Existing league IDs, clubs, fixtures, standings and results are preserved.
--
-- IMPORTANT:
-- Do not backfill existing league rows in this SQL migration. The database has
-- enforce_slfa_application_controls() triggers that correctly require an
-- authenticated active league account for row changes. New metadata columns
-- receive safe defaults; existing competition metadata can be completed
-- through the authorised competition-management RPC after signing in.

ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS competition_type text NOT NULL DEFAULT 'LEAGUE',
  ADD COLUMN IF NOT EXISTS gender_category text NOT NULL DEFAULT 'OPEN',
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS logo_url text;

ALTER TABLE public.leagues
  DROP CONSTRAINT IF EXISTS leagues_competition_type_check;
ALTER TABLE public.leagues
  ADD CONSTRAINT leagues_competition_type_check
  CHECK (competition_type IN ('LEAGUE','CUP','YOUTH','FUTSAL','OTHER'));

ALTER TABLE public.leagues
  DROP CONSTRAINT IF EXISTS leagues_gender_category_check;
ALTER TABLE public.leagues
  ADD CONSTRAINT leagues_gender_category_check
  CHECK (gender_category IN ('MEN','WOMEN','MIXED','OPEN'));

CREATE OR REPLACE FUNCTION public.admin_upsert_competition(
  p_id bigint,
  p_name text,
  p_type text,
  p_gender text,
  p_description text DEFAULT NULL,
  p_logo_url text DEFAULT NULL,
  p_sort_order integer DEFAULT 10,
  p_is_active boolean DEFAULT true
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id bigint;
  v_role text := public.app_role();
BEGIN
  IF v_role NOT IN ('DEVELOPER', 'SUPER_ADMIN') THEN
    RAISE EXCEPTION 'Only the Developer or Super Admin can manage competitions.';
  END IF;

  IF char_length(trim(COALESCE(p_name, ''))) NOT BETWEEN 3 AND 100 THEN
    RAISE EXCEPTION 'Competition name must contain between 3 and 100 characters.';
  END IF;

  IF p_type IS NULL OR p_type NOT IN ('LEAGUE','CUP','YOUTH','FUTSAL','OTHER') THEN
    RAISE EXCEPTION 'Choose a valid competition format.';
  END IF;

  IF p_gender IS NULL OR p_gender NOT IN ('MEN','WOMEN','MIXED','OPEN') THEN
    RAISE EXCEPTION 'Choose a valid competition category.';
  END IF;

  IF p_sort_order IS NULL OR p_sort_order < 0 THEN
    RAISE EXCEPTION 'Display order must be zero or greater.';
  END IF;

  IF length(COALESCE(p_description, '')) > 500 THEN
    RAISE EXCEPTION 'Competition description cannot exceed 500 characters.';
  END IF;

  IF length(COALESCE(p_logo_url, '')) > 500 THEN
    RAISE EXCEPTION 'Competition logo path cannot exceed 500 characters.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.leagues l
    WHERE lower(trim(l.name)) = lower(trim(p_name))
      AND (p_id IS NULL OR l.id <> p_id)
  ) THEN
    RAISE EXCEPTION 'A competition with this name already exists.';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.leagues (
      name, competition_type, gender_category, description, logo_url,
      sort_order, is_active
    )
    VALUES (
      trim(p_name), p_type, p_gender, NULLIF(trim(COALESCE(p_description, '')), ''),
      NULLIF(trim(COALESCE(p_logo_url, '')), ''), p_sort_order, COALESCE(p_is_active, true)
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.leagues
       SET name = trim(p_name),
           competition_type = p_type,
           gender_category = p_gender,
           description = NULLIF(trim(COALESCE(p_description, '')), ''),
           logo_url = NULLIF(trim(COALESCE(p_logo_url, '')), ''),
           sort_order = p_sort_order,
           is_active = COALESCE(p_is_active, true)
     WHERE id = p_id
     RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'The selected competition does not exist.';
    END IF;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_upsert_competition(bigint,text,text,text,text,text,integer,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_upsert_competition(bigint,text,text,text,text,text,integer,boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_upsert_competition(bigint,text,text,text,text,text,integer,boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
