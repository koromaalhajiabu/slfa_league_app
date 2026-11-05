-- Record when a new account accepted the privacy notice and terms.
-- The sign-up form sends terms_version in the account metadata only when the tick box is ticked;
-- the database stamps the time itself.
alter table public.user_profiles
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version text;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare inv public.role_invitations%rowtype; prev text;
begin
  insert into public.user_profiles (id, email, full_name, status, terms_accepted_at, terms_version)
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'Pending',
    case when coalesce(new.raw_user_meta_data ->> 'terms_version', '') <> '' then now() end,
    nullif(new.raw_user_meta_data ->> 'terms_version', '')
  )
  on conflict (id) do nothing;
  select * into inv from public.role_invitations where email = lower(new.email);
  if found then
    select system_role into prev from public.user_profiles where id = new.id;
    update public.user_profiles set system_role = inv.system_role, official_title = inv.official_title, club_id = inv.club_id, status = 'Active' where id = new.id;
    insert into public.role_change_log (user_id, user_email, previous_role, new_role, reason, changed_by)
    values (new.id, lower(new.email), prev, coalesce(inv.official_title, inv.system_role), 'Role assigned on sign-up', inv.invited_by);
    delete from public.role_invitations where email = lower(new.email);
  end if;
  return new;
end $function$;
