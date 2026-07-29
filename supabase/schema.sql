-- =============================================================
-- JOLERO MEDIA PORTAL — database schema and access rules
--
-- Paste this whole file into the Supabase SQL Editor and run it
-- once. Safe to re-run: everything is created if-not-exists and
-- policies are dropped before being recreated.
--
-- THE SECURITY MODEL, IN ONE PARAGRAPH
-- Every table has Row Level Security switched on, which means the
-- database denies everything by default and only the policies below
-- open anything up. A logged-in client can read the rows whose
-- client_id matches their own and nothing else — not by convention,
-- but because Postgres itself refuses. That is what makes this real:
-- the public API key shipped in the site's JavaScript cannot be used
-- to read another client's invoices even by someone who reads all of
-- our source code, which they can, because the repo is public.
--
-- Clients never touch the accounting, calendar, tasks, content
-- planner or notifications at all — those tables have no client
-- policy whatsoever, so they are invisible to anyone but an admin.
--
-- Client writes (signing a contract, submitting a brief, leaving a
-- review) go through the three functions at the bottom rather than
-- direct table access, so a client cannot, say, mark their own
-- invoice paid or edit the text of a contract they are signing.
-- =============================================================

create extension if not exists citext;

-- =============================================================
-- 1. WHO IS WHO
-- =============================================================

-- One row per person who can log in. Created automatically by the
-- trigger at the bottom of this section.
--   role = 'admin'  -> you and Justin: full access
--   role = 'client' -> sees only the client named in client_id
--   role = 'none'   -> signed up but not invited: sees nothing
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      citext not null,
  role       text   not null default 'none' check (role in ('admin', 'client', 'none')),
  client_id  uuid,
  created_at timestamptz not null default now()
);

-- Admin adds a row here before a client first signs in. When that
-- email logs in for the first time, the trigger reads this and wires
-- their login to the right client.
create table if not exists public.client_invites (
  email      citext primary key,
  client_id  uuid not null,
  created_at timestamptz not null default now()
);

-- =============================================================
-- 2. THE RECORDS
-- =============================================================

create table if not exists public.clients (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  kind         text default '',
  contact_name text default '',
  email        text default '',
  phone        text default '',
  created_at   timestamptz not null default now()
);

create table if not exists public.projects (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients (id) on delete cascade,
  title         text not null,
  type          text default '',
  status        text not null default 'Booked',
  shoot_date    date,
  deadline      date,
  review_link   text default '',
  delivery_link text default '',
  notes         text default '',
  created_at    timestamptz not null default now()
);

create table if not exists public.invoices (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.clients (id) on delete cascade,
  number     text not null,
  amount     numeric(10, 2) not null default 0,
  status     text not null default 'unpaid' check (status in ('paid', 'unpaid')),
  issued     date,
  due        date,
  paid_date  date,
  created_at timestamptz not null default now()
);

create table if not exists public.contracts (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.clients (id) on delete cascade,
  project_id   uuid references public.projects (id) on delete set null,
  title        text not null,
  body         text default '',
  status       text not null default 'sent' check (status in ('sent', 'signed')),
  sent_date    date,
  signed_date  date,
  signer_name  text default '',
  created_at   timestamptz not null default now()
);

create table if not exists public.briefs (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references public.clients (id) on delete cascade,
  project_id     uuid references public.projects (id) on delete set null,
  status         text not null default 'requested' check (status in ('requested', 'submitted')),
  requested_date date,
  submitted_date date,
  answers        jsonb,
  created_at     timestamptz not null default now()
);

create table if not exists public.testimonials (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.clients (id) on delete cascade,
  project_id   uuid references public.projects (id) on delete set null,
  rating       int check (rating between 1 and 5),
  quote        text default '',
  allow_public boolean not null default false,
  date         date default current_date,
  created_at   timestamptz not null default now()
);

-- The client's "What's new" feed.
create table if not exists public.activity (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.clients (id) on delete cascade,
  date       date not null default current_date,
  text       text not null,
  created_at timestamptz not null default now()
);

-- ---- admin-only tables: no client policy exists for these ----

create table if not exists public.transactions (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('income', 'expense')),
  date        date not null,
  description text default '',
  category    text default '',
  amount      numeric(10, 2) not null default 0,
  client_id   uuid references public.clients (id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.events (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  type       text default '',
  date       date not null,
  time       text default '',
  end_time   text default '',
  notes      text default '',
  client_id  uuid references public.clients (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  type       text default '',
  due        date,
  done       boolean not null default false,
  project_id uuid references public.projects (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.posts (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  platform   text default '',
  date       date,
  time       text default '',
  status     text not null default 'Idea',
  media_link text default '',
  project_id uuid references public.projects (id) on delete set null,
  notes      text default '',
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  date       date not null default current_date,
  text       text not null,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

-- RLS filters on client_id constantly, so index it.
create index if not exists idx_projects_client     on public.projects (client_id);
create index if not exists idx_invoices_client     on public.invoices (client_id);
create index if not exists idx_contracts_client    on public.contracts (client_id);
create index if not exists idx_briefs_client       on public.briefs (client_id);
create index if not exists idx_testimonials_client on public.testimonials (client_id);
create index if not exists idx_activity_client     on public.activity (client_id);
create index if not exists idx_profiles_client     on public.profiles (client_id);

-- =============================================================
-- 3. WHO AM I? (helpers)
--
-- These read the profiles table, and the policies below use them.
-- They must be SECURITY DEFINER: a policy on profiles that queried
-- profiles through RLS would recurse forever. Empty search_path is
-- the standard hardening so the function body can't be hijacked by
-- a caller-controlled schema.
-- =============================================================

create or replace function public.is_admin()
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

create or replace function public.my_client_id()
  returns uuid
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select p.client_id from public.profiles p
  where p.id = auth.uid() and p.role = 'client';
$$;

-- New login -> profile. An invited email becomes that client;
-- anyone else lands on 'none' and sees nothing at all.
create or replace function public.handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  invited_client uuid;
begin
  select ci.client_id into invited_client
  from public.client_invites ci
  where ci.email = new.email;

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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================
-- 4. ACCESS RULES
-- =============================================================

alter table public.profiles      enable row level security;
alter table public.client_invites enable row level security;
alter table public.clients       enable row level security;
alter table public.projects      enable row level security;
alter table public.invoices      enable row level security;
alter table public.contracts     enable row level security;
alter table public.briefs        enable row level security;
alter table public.testimonials  enable row level security;
alter table public.activity      enable row level security;
alter table public.transactions  enable row level security;
alter table public.events        enable row level security;
alter table public.tasks         enable row level security;
alter table public.posts         enable row level security;
alter table public.notifications enable row level security;

-- profiles: you may read your own row; admins manage all.
drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles
  for select to authenticated using (id = auth.uid());

drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all on public.profiles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- invites: admin only, and deliberately unreadable by clients
-- (it maps emails to clients, which is nobody else's business).
drop policy if exists invites_admin_all on public.client_invites;
create policy invites_admin_all on public.client_invites
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Admin gets full control of every record table.
do $$
declare t text;
begin
  foreach t in array array[
    'clients', 'projects', 'invoices', 'contracts', 'briefs', 'testimonials',
    'activity', 'transactions', 'events', 'tasks', 'posts', 'notifications'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_admin_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (public.is_admin()) with check (public.is_admin())',
      t || '_admin_all', t);
  end loop;
end $$;

-- Client reads: own rows only, and read-only. Note what is absent —
-- there is no client policy on transactions, events, tasks, posts or
-- notifications, so those stay invisible.
drop policy if exists clients_client_read on public.clients;
create policy clients_client_read on public.clients
  for select to authenticated using (id = public.my_client_id());

do $$
declare t text;
begin
  foreach t in array array[
    'projects', 'invoices', 'contracts', 'briefs', 'testimonials', 'activity'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_client_read', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (client_id = public.my_client_id())',
      t || '_client_read', t);
  end loop;
end $$;

-- =============================================================
-- 5. THE THREE THINGS A CLIENT MAY CHANGE
--
-- Routed through functions instead of table policies so a client
-- can only alter the specific fields involved. Signing a contract
-- cannot rewrite the contract; leaving a review cannot touch an
-- invoice. Each one re-checks ownership rather than trusting the id
-- it was handed.
-- =============================================================

create or replace function public.sign_contract(p_contract_id uuid, p_signer_name text)
  returns public.contracts
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  mine uuid := public.my_client_id();
  row_out public.contracts;
begin
  if mine is null then raise exception 'not a client'; end if;
  if coalesce(trim(p_signer_name), '') = '' then raise exception 'signature required'; end if;

  update public.contracts c
     set status = 'signed', signed_date = current_date, signer_name = trim(p_signer_name)
   where c.id = p_contract_id
     and c.client_id = mine
     and c.status = 'sent'
  returning * into row_out;

  if row_out.id is null then raise exception 'contract not found or already signed'; end if;

  insert into public.notifications (text)
  values ('Contract signed — ' || row_out.title);

  insert into public.activity (client_id, text)
  values (mine, 'You signed ' || row_out.title);

  return row_out;
end;
$$;

create or replace function public.submit_brief(p_brief_id uuid, p_answers jsonb)
  returns public.briefs
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  mine uuid := public.my_client_id();
  row_out public.briefs;
begin
  if mine is null then raise exception 'not a client'; end if;

  update public.briefs b
     set answers = p_answers, status = 'submitted', submitted_date = current_date
   where b.id = p_brief_id and b.client_id = mine
  returning * into row_out;

  if row_out.id is null then raise exception 'brief not found'; end if;

  insert into public.notifications (text) values ('Pre-shoot brief submitted');
  return row_out;
end;
$$;

create or replace function public.leave_testimonial(
    p_project_id uuid, p_rating int, p_quote text, p_allow_public boolean)
  returns public.testimonials
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  mine uuid := public.my_client_id();
  row_out public.testimonials;
begin
  if mine is null then raise exception 'not a client'; end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then raise exception 'rating must be 1-5'; end if;

  -- the project must actually be theirs
  if not exists (
    select 1 from public.projects p where p.id = p_project_id and p.client_id = mine
  ) then raise exception 'project not found'; end if;

  insert into public.testimonials (client_id, project_id, rating, quote, allow_public)
  values (mine, p_project_id, p_rating, coalesce(p_quote, ''), coalesce(p_allow_public, false))
  returning * into row_out;

  insert into public.notifications (text) values ('New review left by a client');
  return row_out;
end;
$$;

-- Anonymous visitors get nothing anywhere. Everything above is
-- granted to 'authenticated' only; this makes that explicit.
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon;
