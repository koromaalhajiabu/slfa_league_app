-- Remove the retired Finance Officer role and its obsolete invitation endpoint.
-- The active staff role model is enforced by the role-invitation constraint below.
begin;

delete from public.role_invitations
where upper(system_role) = 'FINANCE_OFFICER';

drop function if exists public.invite_user(text, text, uuid);

alter table public.role_invitations
  drop constraint if exists role_invitations_supported_roles_check;

alter table public.role_invitations
  add constraint role_invitations_supported_roles_check
  check (
    upper(system_role) = any (
      array[
        'SUPER_ADMIN',
        'REFEREE',
        'MATCH_COMMISSIONER',
        'MEDIA_OFFICER',
        'DISCIPLINARY_OFFICER'
      ]::text[]
    )
  );

commit;

notify pgrst, 'reload schema';
