# Prime Tapes — primetapes.co.uk

One-page marketing site for Prime Tapes, a sports creative agency in Worthing, West Sussex.
Plain static site — no frameworks, no build step. Deploy the folder as-is.

**Preview:** https://oderoproductions.github.io/prime-tapes/

## Editing

| Change | Where |
|---|---|
| Swap placeholder images for real shots | `index.html` — search `SWAP IMAGE` |
| Accent colour | `styles.css` line 7 — `--accent` |
| Connect the contact form | `index.html` — search `FORMSPREE`, replace `YOUR_FORM_ID` |
| Hero video background (phase 2) | `index.html` — search `HERO VIDEO` |
| Copy that needs founder input | search `TODO` |

## Going live on primetapes.co.uk

Point Cloudflare Pages / Netlify at this repo (no build command, output = repo root),
then add the custom domain. Remember to create the Formspree form and the
`hello@primetapes.co.uk` mailbox first.
