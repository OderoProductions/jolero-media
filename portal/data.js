/* ============================================================
   JOLERO MEDIA PORTAL — data.js (starting state)

   The lists below are the EMPTY starting state — real work gets
   added through the portal itself, not by editing this file. What
   stays here is configuration: the status pipeline, project and
   task types, content platforms and the accounting categories.
   Edit those lists to change the dropdowns across the portal.

   Every page reads this through store.js, never directly, so
   Phase 2 only has to replace store.js with real API calls.

   IMPORTANT: bump `version` below after editing anything here.
   Browsers hold their own copy in localStorage and only take a
   fresh one when the version number changes — which also means
   bumping it WIPES any data already entered in the portal.
   ============================================================ */

window.JOLERO_SEED = {
  // Bump this when you edit the seed — stale localStorage copies re-seed
  version: 8,

  statuses: ["Booked", "Shoot scheduled", "Shot", "In edit", "Review", "Delivered"],

  projectTypes: ["Matchday shoot", "Highlight reel", "Training content", "Event coverage"],

  // Task categories — "Post" is the content-posting schedule
  taskTypes: ["Shoot prep", "Edit", "Post", "Admin", "Invoice", "Other"],

  // Standalone calendar entries (anything not driven by a project)
  eventTypes: ["Shoot", "Meeting", "Content day", "Edit day", "Personal", "Other"],

  // Content planner
  postPlatforms: ["Instagram Reel", "Instagram Post", "Instagram Story", "TikTok", "YouTube", "Other"],
  postStatuses: ["Idea", "Drafted", "Ready", "Posted"],

  // Ledger categories — expense list loosely follows the HMRC self-assessment
  // buckets so year-end mapping is painless. Edit freely.
  txCategories: {
    income: ["Shoots & retainers", "Print & product sales", "Licensing", "Other income"],
    expense: ["Equipment", "Equipment hire", "Software & subscriptions", "Travel & fuel", "Insurance", "Marketing", "Phone & internet", "Training", "Fees & admin", "Other expense"]
  },
  /* Portal settings. googleAccount pins "Add to Google Calendar" links to
     a specific signed-in account — without it Google uses whichever account
     the browser happens to be signed into first, which is rarely the
     business one. Editable from the Schedule page. */
  settings: {
    googleAccount: "info@joleromedia.com"
  },


  clients: [],

  projects: [],

  invoices: [],

  /* ---- Accounting: manual/imported income & expenses ----
     Paid invoices join these automatically in the ledger — never enter
     an invoice here too, or it will be counted twice. ---- */

  transactions: [],

  /* ---- Content planner: what we're posting and when ----
     mediaLink points at the asset (Google Drive etc). Posts appear on
     the calendar and in the Google Calendar / .ics exports. ---- */

  posts: [],

  /* ---- Schedule: standalone events (added straight from the calendar) ----
     time/endTime are optional — leave blank for an all-day entry. */

  events: [],

  /* ---- Schedule: tasks (feed the calendar alongside shoots/deadlines) ---- */

  tasks: [],

  /* ---- Phase 4 collections ---- */

  contracts: [],

  briefs: [],

  testimonials: [],

  // Admin-side notifications (client actions land here)
  notifications: [],

  activity: []
};
