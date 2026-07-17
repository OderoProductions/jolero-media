# re.plays — sports creative agency, Worthing

One-page marketing site for re.plays (formerly Prime Tapes), a sports creative agency
in Worthing, West Sussex. Plain static site — no frameworks, no build step.
Deploy the folder as-is.

**Preview:** https://oderoproductions.github.io/prime-tapes/
(repo name still says prime-tapes — rename repo + Pages URL whenever you like)

## Client portal (Phase 1 — structure preview)

`/portal/` is the client view (a "Previewing as" dropdown stands in for login),
`/portal/admin/` is the admin board. All data is mock (`portal/data.js`) and every
page reads it through `portal/store.js` — the single data layer. Admin edits
persist to localStorage; "Reset demo data" restores the seed.

Phase 2 (auth + real backend) only replaces the internals of `store.js` (its
methods are already async) and swaps the dropdown for a session. Phase 3 hooks
notifications into `store.updateProject`, which already knows when a status
changes. Phases 2–4 are NOT built yet.

## Editing

| Change | Where |
|---|---|
| Swap placeholder images for real shots | `index.html` — search `SWAP IMAGE` |
| Accent colour | `styles.css` line 7 — `--accent` |
| Connect the contact form | `index.html` — search `FORMSPREE`, replace `YOUR_FORM_ID` |
| Hero video background (phase 2) | `index.html` — search `HERO VIDEO` |
| Copy that needs founder input | search `TODO` |

## Rebrand follow-ups

Domain (canonical/OG/JSON-LD still point at primetapes.co.uk), the
`hello@primetapes.co.uk` email and the `@prime.tapes` Instagram handle still carry
the old name — search `TODO` in `index.html` and update once the new ones exist.

## Going live

Point Cloudflare Pages / Netlify at this repo (no build command, output = repo root),
then add the custom domain. Create the Formspree form and the hello@ mailbox first.
