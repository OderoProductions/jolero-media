/* ============================================================
   JOLERO MEDIA PORTAL — data.js (MOCK DATA — Phase 1)

   Single source of sample data for the whole portal. Every page
   reads it through store.js, never directly — so Phase 2 only
   has to replace store.js with real API calls.

   All names, contacts, links and amounts below are fictional
   placeholders for previewing the structure.
   ============================================================ */

window.JOLERO_SEED = {
  // Bump this when you edit the seed — stale localStorage copies re-seed
  version: 6,

  statuses: ["Booked", "Shoot scheduled", "Shot", "In edit", "Review", "Delivered"],

  projectTypes: ["Matchday shoot", "Highlight reel", "Training content", "Event coverage"],

  // Task categories — "Post" is the content-posting schedule
  taskTypes: ["Shoot prep", "Edit", "Post", "Admin", "Invoice", "Other"],

  // Standalone calendar entries (anything not driven by a project)
  eventTypes: ["Shoot", "Meeting", "Content day", "Edit day", "Personal", "Other"],

  // Ledger categories — expense list loosely follows the HMRC self-assessment
  // buckets so year-end mapping is painless. Edit freely.
  txCategories: {
    income: ["Shoots & retainers", "Print & product sales", "Licensing", "Other income"],
    expense: ["Equipment", "Equipment hire", "Software & subscriptions", "Travel & fuel", "Insurance", "Marketing", "Phone & internet", "Training", "Fees & admin", "Other expense"]
  },

  clients: [
    {
      id: "c1",
      name: "Worthing Town FC",
      kind: "Football club",
      contactName: "Mark Davies",
      email: "ops@worthingtownfc.example",
      phone: "01903 000000"
    },
    {
      id: "c2",
      name: "South Coast Boxing Club",
      kind: "Boxing gym",
      contactName: "Danny Price",
      email: "danny@scboxing.example",
      phone: "01903 000001"
    },
    {
      id: "c3",
      name: "Amara Osei",
      kind: "Athlete — semi-pro striker",
      contactName: "Amara Osei",
      email: "amara.osei@example.com",
      phone: "07700 900000"
    }
  ],

  projects: [
    {
      id: "p1",
      clientId: "c1",
      title: "Matchday — Worthing Town vs Lancing FC",
      type: "Matchday shoot",
      status: "Delivered",
      shootDate: "2026-07-05",
      deadline: "2026-07-10",
      reviewLink: "",
      deliveryLink: "https://drive.google.com/drive/folders/DEMO-p1-final-delivery",
      notes: "Full match coverage + 3 reels. Delivered 4:5 and 9:16 crops."
    },
    {
      id: "p2",
      clientId: "c1",
      title: "Pre-season promo shoot",
      type: "Training content",
      status: "In edit",
      shootDate: "2026-07-12",
      deadline: "2026-07-24",
      reviewLink: "",
      deliveryLink: "",
      notes: "Squad portraits + drills. Hero clip for season-ticket push."
    },
    {
      id: "p3",
      clientId: "c1",
      title: "Matchday — season opener vs Horsham",
      type: "Matchday shoot",
      status: "Shoot scheduled",
      shootDate: "2026-08-01",
      deadline: "2026-08-06",
      reviewLink: "",
      deliveryLink: "",
      notes: "3pm kick-off, Woodside Road. Arrive 1:30pm for warm-up content."
    },
    {
      id: "p4",
      clientId: "c2",
      title: "Fight Night 12 — event coverage",
      type: "Event coverage",
      status: "Review",
      shootDate: "2026-07-11",
      deadline: "2026-07-21",
      reviewLink: "https://drive.google.com/drive/folders/DEMO-p4-review-cut",
      deliveryLink: "",
      notes: "Main event highlight + walkout reels for 4 fighters."
    },
    {
      id: "p5",
      clientId: "c2",
      title: "Training block — August content",
      type: "Training content",
      status: "Booked",
      shootDate: "2026-08-04",
      deadline: "2026-08-18",
      reviewLink: "",
      deliveryLink: "",
      notes: "Monthly content day: pads, bags, coach interviews."
    },
    {
      id: "p6",
      clientId: "c3",
      title: "2025/26 season highlight reel",
      type: "Highlight reel",
      status: "Delivered",
      shootDate: "2026-06-20",
      deadline: "2026-07-01",
      reviewLink: "",
      deliveryLink: "https://drive.google.com/drive/folders/DEMO-p6-highlight-reel",
      notes: "Scout-ready tape: 3 min cut + 60s social version."
    },
    {
      id: "p7",
      clientId: "c3",
      title: "Pre-season training content",
      type: "Training content",
      status: "Shot",
      shootDate: "2026-07-15",
      deadline: "2026-07-29",
      reviewLink: "",
      deliveryLink: "",
      notes: "Gym + pitch sessions. Cut weekly posts through pre-season."
    }
  ],

  invoices: [
    { id: "inv1", clientId: "c1", number: "JM-2026-011", amount: 450, status: "paid",   issued: "2026-07-01", due: "2026-07-15", paidDate: "2026-07-14" },
    { id: "inv2", clientId: "c1", number: "JM-2026-014", amount: 450, status: "unpaid", issued: "2026-07-14", due: "2026-07-28" },
    { id: "inv3", clientId: "c2", number: "JM-2026-012", amount: 320, status: "paid",   issued: "2026-07-02", due: "2026-07-16", paidDate: "2026-07-15" },
    { id: "inv4", clientId: "c2", number: "JM-2026-015", amount: 180, status: "unpaid", issued: "2026-07-15", due: "2026-07-29" },
    { id: "inv5", clientId: "c3", number: "JM-2026-013", amount: 250, status: "paid",   issued: "2026-06-25", due: "2026-07-09", paidDate: "2026-07-08" }
  ],

  /* ---- Accounting: manual/imported income & expenses ----
     Paid invoices join these automatically in the ledger — never enter
     an invoice here too, or it will be counted twice. ---- */

  transactions: [
    { id: "tx0a", kind: "expense", date: "2026-06-12", description: "Public liability insurance",    category: "Insurance",                amount: 14.75,  clientId: "" },
    { id: "tx0b", kind: "income",  date: "2026-06-18", description: "Preset pack sales",             category: "Print & product sales",    amount: 40.00,  clientId: "" },
    { id: "tx1", kind: "expense", date: "2026-07-03", description: "Adobe Creative Cloud",          category: "Software & subscriptions", amount: 59.98,  clientId: "" },
    { id: "tx2", kind: "expense", date: "2026-07-05", description: "Fuel — Lancing away day",       category: "Travel & fuel",            amount: 28.40,  clientId: "c1" },
    { id: "tx3", kind: "expense", date: "2026-07-10", description: "70-200mm lens hire (2 days)",   category: "Equipment hire",           amount: 96.00,  clientId: "c2" },
    { id: "tx4", kind: "expense", date: "2026-07-12", description: "Public liability insurance",    category: "Insurance",                amount: 14.75,  clientId: "" },
    { id: "tx5", kind: "income",  date: "2026-07-18", description: "Matchday print sales",          category: "Print & product sales",    amount: 85.00,  clientId: "c1" },
    { id: "tx6", kind: "expense", date: "2026-07-21", description: "SD cards x2",                   category: "Equipment",                amount: 43.98,  clientId: "" }
  ],

  /* ---- Schedule: standalone events (added straight from the calendar) ----
     time/endTime are optional — leave blank for an all-day entry. */

  events: [
    { id: "ev1", title: "Content planning — August", type: "Meeting",     date: "2026-07-29", time: "10:00", endTime: "11:00", notes: "Map out the August posting schedule.", clientId: "" },
    { id: "ev2", title: "Edit day — no shoots",      type: "Edit day",    date: "2026-08-05", time: "",      endTime: "",      notes: "Clear the backlog.",                  clientId: "" },
    { id: "ev3", title: "Kit service + card wipe",   type: "Personal",    date: "2026-08-10", time: "",      endTime: "",      notes: "",                                     clientId: "" }
  ],

  /* ---- Schedule: tasks (feed the calendar alongside shoots/deadlines) ---- */

  tasks: [
    { id: "tk1", title: "First cut — pre-season promo",              type: "Edit",       due: "2026-07-22", projectId: "p2", done: true },
    { id: "tk2", title: "Post Lancing reel — Tuesday slot",           type: "Post",       due: "2026-07-28", projectId: "p1", done: false },
    { id: "tk3", title: "Chase invoice JM-2026-014",                  type: "Invoice",    due: "2026-07-29", projectId: "",   done: false },
    { id: "tk4", title: "Confirm access with Woodside Road stewards", type: "Shoot prep", due: "2026-07-30", projectId: "p3", done: false },
    { id: "tk5", title: "Send August content plan to the gym",        type: "Admin",      due: "2026-07-31", projectId: "p5", done: false },
    { id: "tk6", title: "Charge batteries + clear cards",             type: "Shoot prep", due: "2026-08-01", projectId: "p3", done: false },
    { id: "tk7", title: "Batch walkout reels for socials",            type: "Post",       due: "2026-08-03", projectId: "p4", done: false }
  ],

  /* ---- Phase 4 collections ---- */

  contracts: [
    {
      id: "ct1",
      clientId: "c1",
      projectId: "",
      title: "Season content agreement 2026/27",
      status: "signed",
      sentDate: "2026-07-06",
      signedDate: "2026-07-08",
      signerName: "Mark Davies",
      body: "This agreement covers ongoing matchday and training content for the 2026/27 season.\n\n1. Jolero Media will shoot and edit content as scheduled with the club.\n2. Delivery via private link within the agreed turnaround.\n3. The club may use delivered content across its own channels.\n4. Jolero Media may feature selected work in its portfolio unless agreed otherwise.\n5. Cancellations within 48 hours of a shoot may be charged.\n\n(Sample agreement text — replace with your real terms.)"
    },
    {
      id: "ct2",
      clientId: "c2",
      projectId: "p5",
      title: "Monthly content agreement — August block",
      status: "awaiting_signature",
      sentDate: "2026-07-15",
      signedDate: "",
      signerName: "",
      body: "This agreement covers the August training-content block.\n\n1. One content day per month at the gym, dates agreed in advance.\n2. Edited clips delivered within 7 days of each shoot.\n3. The gym may use delivered content across its own channels.\n4. Jolero Media may feature selected work in its portfolio unless agreed otherwise.\n5. Cancellations within 48 hours of a shoot may be charged.\n\n(Sample agreement text — replace with your real terms.)"
    }
  ],

  briefs: [
    {
      id: "b1",
      clientId: "c1",
      projectId: "p3",
      status: "requested",
      requestedDate: "2026-07-16",
      submittedDate: "",
      answers: null
    }
  ],

  testimonials: [
    {
      id: "t1",
      clientId: "c3",
      projectId: "p6",
      rating: 5,
      quote: "The tape got me two trial invites within a fortnight. Worth every penny.",
      allowPublic: true,
      date: "2026-07-03"
    }
  ],

  // Admin-side notifications (client actions land here)
  notifications: [
    { id: "n1", date: "2026-07-08", text: "Contract signed — Season content agreement 2026/27 (Worthing Town FC)", read: true },
    { id: "n2", date: "2026-07-03", text: "New 5★ review from Amara Osei — 2025/26 season highlight reel", read: false }
  ],

  activity: [
    { id: "a1", clientId: "c1", date: "2026-07-10", text: "Your delivery is ready — Matchday vs Lancing FC" },
    { id: "a2", clientId: "c1", date: "2026-07-14", text: "New invoice JM-2026-014 added" },
    { id: "a3", clientId: "c1", date: "2026-07-16", text: "Pre-season promo shoot moved to In edit" },
    { id: "a4", clientId: "c2", date: "2026-07-16", text: "An edit is ready for your review — Fight Night 12" },
    { id: "a8", clientId: "c2", date: "2026-07-15", text: "A contract is ready to sign — Monthly content agreement" },
    { id: "a9", clientId: "c1", date: "2026-07-16", text: "Pre-shoot brief requested — Matchday — season opener vs Horsham" },
    { id: "a5", clientId: "c2", date: "2026-07-15", text: "New invoice JM-2026-015 added" },
    { id: "a6", clientId: "c3", date: "2026-07-01", text: "Your delivery is ready — 2025/26 highlight reel" },
    { id: "a7", clientId: "c3", date: "2026-07-15", text: "Pre-season training content marked as Shot" }
  ]
};
