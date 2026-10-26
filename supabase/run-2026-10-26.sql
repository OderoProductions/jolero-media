-- Paste ALL of this into Supabase > SQL Editor > New query, then Run.
-- Safe to run more than once. Copied from the end of schema.sql (sections 7 and 8).

-- =============================================================
-- 7. KEEPING THE LIGHTS ON
--
-- A free project is paused after about a week without activity,
-- which takes the whole portal down. The gallery worker calls this
-- once a day. It is the ONE thing an anonymous caller may do, and
-- all it can learn is the time, which they already know.
--
-- It has to be a real query: asking for a table anon cannot read is
-- refused by the API before Postgres is ever touched, so it does not
-- count as activity. That is why the project paused anyway.
-- =============================================================

create or replace function public.ping()
  returns timestamptz
  language sql
  security definer
  set search_path = ''
as $$ select now() $$;

-- after the revoke above, or it would be taken straight back
grant execute on function public.ping() to anon;

-- =============================================================
-- 8. SECURITY HARDENING (2026-10-26, from the security review)
--
-- Safe to run more than once. Paste this whole section into the
-- Supabase SQL Editor and press Run.
--
-- a) A login only becomes a client once its email is CONFIRMED (the
--    6-digit code was entered). Before, the link happened the moment
--    an account was created, before anyone proved they own the inbox.
-- b) Changing or removing a client's email takes access away from
--    the old address's login.
-- c) profiles.client_id must point at a real client (and is cleared
--    if that client is deleted).
-- d) Anonymous callers can run ping() and nothing else; the client
--    functions are for signed-in users only.
-- =============================================================

-- a) link at sign-up only if already confirmed (an invite made from
--    the dashboard); otherwise start as 'none' and link on confirm.
create or replace function public.client_for_email(p_email text)
  returns uuid
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select coalesce(
    (select ci.client_id from public.client_invites ci where ci.email = p_email limit 1),
    (select c.id from public.clients c
      where coalesce(c.email, '') <> '' and lower(c.email) = lower(p_email)
      order by c.created_at limit 1));
$$;

create or replace function public.handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  invited_client uuid;
begin
  if new.email_confirmed_at is not null then
    invited_client := public.client_for_email(new.email);
  end if;

  insert into public.profiles (id, email, role, client_id)
  values (
    new.id,
    new.email,
    case when invited_client is not null then 'client' else 'none' end,
    invited_client
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create or replace function public.handle_user_confirmed()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  invited_client uuid;
begin
  if new.email_confirmed_at is not null and old.email_confirmed_at is null then
    invited_client := public.client_for_email(new.email);
    if invited_client is not null then
      update public.profiles p
      set role = 'client', client_id = invited_client
      where p.id = new.id and p.role = 'none';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed
  after update of email_confirmed_at on auth.users
  for each row execute function public.handle_user_confirmed();

-- a) + b) adding a client's email links an existing CONFIRMED login;
--    changing or clearing it unlinks the old one. Never touches an admin.
create or replace function public.link_client_email()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and lower(coalesce(old.email, '')) is distinct from lower(coalesce(new.email, '')) then
    update public.profiles p
    set role = 'none', client_id = null
    where p.client_id = new.id and p.role = 'client'
      and lower(p.email::text) is distinct from lower(coalesce(new.email, ''));
  end if;

  if coalesce(new.email, '') <> '' then
    update public.profiles p
    set role = 'client', client_id = new.id
    where lower(p.email::text) = lower(new.email) and p.role = 'none'
      and exists (select 1 from auth.users u
                  where u.id = p.id and u.email_confirmed_at is not null);
  end if;
  return new;
end;
$$;

-- c) (NOT VALID: enforced from now on without failing on old rows)
alter table public.profiles drop constraint if exists profiles_client_fk;
alter table public.profiles add constraint profiles_client_fk
  foreign key (client_id) references public.clients(id) on delete set null not valid;

-- d) function access: PUBLIC (which includes anon) loses the default
--    right to run every function; signed-in users keep what they use.
revoke execute on all functions in schema public from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.my_client_id() to authenticated;
grant execute on function public.sign_contract(uuid, text) to authenticated;
grant execute on function public.submit_brief(uuid, jsonb) to authenticated;
grant execute on function public.leave_testimonial(uuid, int, text, boolean) to authenticated;
grant execute on function public.ping() to anon;
alter default privileges in schema public revoke execute on functions from public, anon;
alter default privileges in schema public revoke all on tables from anon;
