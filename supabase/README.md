# Turning on portal logins

## STATUS: steps 1–5 are DONE (29 July 2026)

The project exists and is wired up. Verified from outside:

- Project **Jolero Media Website**, org **Jolero Media**, owned by
  info@joleromedia.com, AWS eu-west-1 (Ireland).
- Schema run: 14 tables, RLS on all 14, 22 policies, 6 security-definer
  functions, signup trigger live, **0 unprotected tables**.
- Redirect URLs and Site URL set.
- `portal/supabase-config.js` filled in with the Project URL and the
  publishable key.
- Anonymous callers holding the publishable key get HTTP 401 on every
  table — confirming the key alone grants nothing.

**What is left is section 6 and 7 below** — making yourselves admins,
and inviting a client. Everything above them is history, kept so the
setup can be repeated on a new project if it ever needs to be.

---

Roughly 15 minutes. Do steps 1–5, send Christopher's two values back, and
the rest of the wiring gets finished on this end.

---

## 1. Create the project

1. Sign up at [supabase.com](https://supabase.com) — **use info@joleromedia.com**, not a
   personal Google account. Free tier is far more than this needs.
2. New project. Name it `jolero-portal`. Region **London (eu-west-2)** — closest, and
   it keeps client data in the UK.
3. It gives you a database password. **Save it in a password manager.** It isn't
   needed for any of the steps below, but losing it is a nuisance later.

## 2. Create the tables and the security rules

1. Left sidebar → **SQL Editor** → **New query**.
2. Open `supabase/schema.sql` from this repo, copy the whole file, paste it in.
3. **Run**. It should finish with no errors.

That one file creates all 14 tables and, more importantly, the rules that make a
login mean something: each client can only ever read their own rows, and the
accounting, calendar, tasks, content planner and notifications are invisible to
anyone who isn't an admin.

## 3. Point the magic links back at the site

Sidebar → **Authentication** → **URL Configuration**.

- **Site URL**: `https://joleromedia.com`
- **Redirect URLs** — add all three, one per line:
  ```
  https://joleromedia.com/portal/login.html
  https://oderoproductions.github.io/jolero-media/portal/login.html
  http://localhost:4620/portal/login.html
  ```

Without these, clicking an emailed link goes nowhere. The last one is only so
sign-in can be tested locally before launch.

## 4. Turn off open sign-ups (optional but sensible)

Sidebar → **Authentication** → **Providers** → **Email**. Leave "Email" enabled;
magic links need it. Confirm **"Confirm email"** is on.

Anyone who signs in without an invite lands with no access and sees nothing —
that's handled in the schema — but it's tidier if strangers can't create accounts
at all. If you'd rather lock it down completely, turn **"Allow new users to sign
up"** off, and accounts get created from the Supabase dashboard instead.

## 5. Send back two values

Sidebar → **Project Settings** → **API**. Copy:

- **Project URL** — looks like `https://abcdefgh.supabase.co`
- **anon / public** key — the long one labelled *public*

Both go into `portal/supabase-config.js`. They're safe to share and safe to sit
in a public repo: on their own they grant nothing, because every table is locked
by the rules from step 2.

> **Never share or commit the `service_role` key.** It's on the same settings
> page and it bypasses every security rule. It has no use here — we have no
> server — so it should never leave that page.

---

## 6. Make yourselves admins (after the first sign-in)

Chicken and egg: the first admin has to be promoted by hand.

1. Go to `/portal/login.html`, enter **info@joleromedia.com**, click the emailed link.
2. You'll be told the account isn't linked to anything yet. That's correct.
3. In Supabase: **Table Editor** → `profiles`. Find your row, change `role` from
   `none` to `admin`, save.
4. Sign in again. You now have the admin side.
5. Repeat for Justin's address.

## 7. Adding a client

1. Add the client in the portal's admin area as normal.
2. In Supabase: **Table Editor** → `client_invites` → Insert row.
   - `email` — their email address
   - `client_id` — the client's id, copied from the `clients` table
3. Tell them to go to `/portal/login.html` and enter that email.

First time they sign in, their login gets linked to that client automatically and
they see their own projects, contracts and invoices — and nothing else.

*(Making this a button in the admin area is a small follow-up job once the
data layer is moved over.)*

---

## What is still to do after this

Sign-in works from step 5 onward, but the portal's pages still read from browser
storage rather than the database. Moving `store.js` over to Supabase is the next
piece of work, and it's the bigger half. Until then:

- **Keep using Back up** in the admin header. Nothing entered in the portal is on
  a server yet.
- Don't put real client data in expecting it to survive — it lives in one browser.

## Two things worth knowing

**Cost.** The free tier covers this comfortably. Its one catch is that a project
with no activity for 7 days gets paused; opening the dashboard un-pauses it. Once
you're using the portal weekly that never comes up.

**Backups.** Free tier doesn't include automatic database backups. Once real
client records are in there, either upgrade (~$25/month, includes daily backups)
or export periodically from **Database → Backups**.
