# re.plays — sports creative agency, Worthing

One-page marketing site for re.plays (formerly Prime Tapes), a sports creative agency
in Worthing, West Sussex. Plain static site — no frameworks, no build step.
Deploy the folder as-is.

**Preview:** https://oderoproductions.github.io/prime-tapes/
(repo name still says prime-tapes — rename repo + Pages URL whenever you like)

## Client portal (Phases 1 & 4 — structure preview)

`/portal/` is the client view (a "Previewing as" dropdown stands in for login),
`/portal/admin/` is the admin board. All data is mock (`portal/data.js`) and every
page reads it through `portal/store.js` — the single data layer. Admin edits
persist to localStorage; "Reset demo data" restores the seed.

Phase 4 extras are built in the same mock style: contract sending + client
signing (typed-name signature for now), pre-shoot brief request/submit flow,
post-delivery review collection (star rating + quote + usage permission), and
an admin notification bell fed by client actions.

Phase 2 (auth + real backend) only replaces the internals of `store.js` (its
methods are already async) and swaps the dropdown for a session — it also
upgrades contract signing with verified identity/audit trail. Phase 3 hooks
emails into the same store methods that already post feed entries and bell
notifications. Phases 2–3 are NOT built yet.

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
