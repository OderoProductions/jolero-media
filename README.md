# Jolero Media — joleromedia.com

One-page marketing site for Jolero Media, a sports creative agency in Worthing,
West Sussex. Plain static site — no frameworks, no build step. Deploy the folder as-is.

**Preview:** https://oderoproductions.github.io/jolero-media/

## Editing

| Change | Where |
|---|---|
| Swap placeholder images for real shots | `index.html` — search `SWAP IMAGE` |
| Accent colour | `styles.css` line 7 — `--accent` |
| Connect the contact form | `index.html` — search `FORMSPREE`, replace `YOUR_FORM_ID` |
| Hero video background | `index.html` — search `HERO VIDEO` |
| Copy that needs founder input | search `TODO` |

## Client portal (Phases 1 & 4 — structure preview)

`/portal/` is the client view (a "Previewing as" dropdown stands in for login),
`/portal/admin/` is the admin board. All data is mock (`portal/data.js`) and every
page reads it through `portal/store.js` — the single data layer. Admin edits
persist to localStorage; "Reset demo data" restores the seed.

The admin area is a hub: `/portal/admin/` is a **Dashboard** of summary cards
that link into the section pages — `projects.html`, `schedule.html` (calendar +
content planner + tasks), `invoices.html`, `contracts.html`, `clients.html`.
One shared `admin.js` powers them all; each section renders only if its
container exists on the page. (`tasks.html` now just redirects to Schedule.)

The Schedule page carries the **content planner**: planned posts with platform,
post date/time, a status pipeline (Idea → Drafted → Ready → Posted), a media
link (Google Drive etc) and notes. Posts appear on the calendar in pink, join
the Google Calendar / .ics exports, and tick off via an inline status dropdown.

`/portal/admin/schedule.html` is the Schedule page: a month calendar that
aggregates shoot dates, delivery deadlines, unpaid invoice due dates and tasks
(nothing is entered twice — it reads the same data as the board), plus a task
list with types, due dates and overdue highlighting.

The Accounting page also carries an **income & expenses ledger** for tax:
paid invoices flow in automatically as income (no double entry), manual
income/expenses can be added with HMRC-friendly categories, and totals
(income / expenses / profit) filter by UK tax year (6 Apr–5 Apr).
Spreadsheets import via CSV (Excel / Google Sheets / Numbers export) with a
preview, tolerant parsing (DD/MM/YYYY or ISO dates, £ signs, quoted commas)
and duplicate-safe re-imports; Export CSV produces an accountant-ready file.
Native .xlsx parsing needs a third-party library — CSV is the supported route
until Phase 2.

Everything on the calendar is editable in place: click any entry to open the
right editor. Standalone events (`events` in the seed) can be added, edited and
deleted with optional start/end times; tasks open a full edit dialog; shoots and
deadlines open a date editor that writes back to the project, so the board stays
in step. Invoice due dates are read-only reflections of the invoice.

Google Calendar today: each event has an "Add to Google Calendar" link and
there's an "Export .ics" download to import everything in one go. Automatic
two-way sync needs OAuth + a backend and arrives with Phase 2 — it plugs into
`PortalStore.getScheduleEvents()`, so no view code changes.

Phase 4 extras are built in the same mock style: contract sending + client
signing (typed-name signature for now), pre-shoot brief request/submit flow,
post-delivery review collection (star rating + quote + usage permission), and
an admin notification bell fed by client actions.

Phase 2 (auth + real backend) only replaces the internals of `store.js` (its
methods are already async) and swaps the dropdown for a session — it also
upgrades contract signing with verified identity/audit trail. Phase 3 hooks
emails into the same store methods that already post feed entries and bell
notifications. Phases 2–3 are NOT built yet.

## Going live on joleromedia.com

The domain is registered but not yet connected. To point it at this repo:

1. At your registrar, add these DNS records for the apex domain:
   `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153` (A records)
   plus a CNAME for `www` → `oderoproductions.github.io`.
2. Once those resolve, add a `CNAME` file containing `joleromedia.com` to this
   repo and set the custom domain in the repo's Pages settings.

Alternatively point Cloudflare Pages / Netlify at this repo (no build command,
output = repo root) and add the domain there.

Still to do before launch: real portfolio photos, the Formspree form ID, and a
1200×630 `assets/og.jpg` for link previews.
