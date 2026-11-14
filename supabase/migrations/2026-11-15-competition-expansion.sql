-- SLFA competition expansion.
-- Adds descriptive competition metadata and a Super Admin-only management RPC.
-- Existing league IDs, clubs, fixtures, standings and results are preserved.

ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS competition_type text NOT NULL DEFAULT 'LEAGUE',
  ADD COLUMN IF NOT EXISTS gender_category text NOT NULL DEFAULT 'OPEN',
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS logo_url text;

UPDATE public.leagues
SET
  competition_type = CASE
    WHEN lower(name) LIKE '%cup%' THEN 'CUP'
    WHEN lower(name) LIKE '%youth%' OR lower(name) LIKE '%under-%' THEN 'YOUTH'
    ELSE COALESCE(NULLIF(competition_type, ''), 'LEAGUE')
  END,
  gender_category = CASE
    WHEN lower(name) LIKE '%women%' OR lower(name) LIKE '%female%' THEN 'WOMEN'
    WHEN lower(name) LIKE '%men%' AND lower(name) NOT LIKE '%women%' THEN 'MEN'
    ELSE COALESCE(NULLIF(gender_category, ''), 'OPEN')
  END,
  description = COALESCE(
    NULLIF(description, ''),
    CASE
      WHEN lower(name) LIKE '%marampa%' AND lower(name) LIKE '%women%'
        THEN 'The women’s premier league competition in Sierra Leone.'
      WHEN lower(name) LIKE '%leone rock%'
        THEN 'The top-tier men’s league competition in Sierra Leone.'
      ELSE 'Official competition information, participating clubs, fixtures, results and statistics.'
    END
  ),
  logo_url = COALESCE(
    NULLIF(logo_url, ''),
    CASE
      WHEN lower(name) LIKE '%marampa%' AND lower(name) LIKE '%women%'
        THEN 'league-logos/marampa-mines-womens-premier-league.jpg'
      WHEN lower(name) LIKE '%leone rock%'
        THEN 'league-logos/leone-rock-premier-league.jpg'
      ELSE NULL
    END
  );

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
BEGIN
  IF public.app_role() IS DISTINCT FROM 'SUPER_ADMIN' THEN
    RAISE EXCEPTION 'Only a Super Admin can manage competitions.';
  END IF;

  IF char_length(trim(COALESCE(p_name, ''))) NOT BETWEEN 3 AND 100 THEN
    RAISE EXCEPTION 'Competition name must contain between 3 and 100 characters.';
  END IF;

  IF p_type NOT IN ('LEAGUE','CUP','YOUTH','FUTSAL','OTHER') THEN
    RAISE EXCEPTION 'Choose a valid competition format.';
  END IF;

  IF p_gender NOT IN ('MEN','WOMEN','MIXED','OPEN') THEN
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
