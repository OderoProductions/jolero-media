/* ============================================================
   RE.PLAYS PORTAL — data.js (MOCK DATA — Phase 1)

   Single source of sample data for the whole portal. Every page
   reads it through store.js, never directly — so Phase 2 only
   has to replace store.js with real API calls.

   All names, contacts, links and amounts below are fictional
   placeholders for previewing the structure.
   ============================================================ */

window.REPLAYS_SEED = {
  // Bump this when you edit the seed — stale localStorage copies re-seed
  version: 1,

  statuses: ["Booked", "Shoot scheduled", "Shot", "In edit", "Review", "Delivered"],

  projectTypes: ["Matchday shoot", "Highlight reel", "Training content", "Event coverage"],

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
    { id: "inv1", clientId: "c1", number: "RP-2026-011", amount: 450, status: "paid",   issued: "2026-07-01", due: "2026-07-15" },
    { id: "inv2", clientId: "c1", number: "RP-2026-014", amount: 450, status: "unpaid", issued: "2026-07-14", due: "2026-07-28" },
    { id: "inv3", clientId: "c2", number: "RP-2026-012", amount: 320, status: "paid",   issued: "2026-07-02", due: "2026-07-16" },
    { id: "inv4", clientId: "c2", number: "RP-2026-015", amount: 180, status: "unpaid", issued: "2026-07-15", due: "2026-07-29" },
    { id: "inv5", clientId: "c3", number: "RP-2026-013", amount: 250, status: "paid",   issued: "2026-06-25", due: "2026-07-09" }
  ],

  activity: [
    { id: "a1", clientId: "c1", date: "2026-07-10", text: "Your delivery is ready — Matchday vs Lancing FC" },
    { id: "a2", clientId: "c1", date: "2026-07-14", text: "New invoice RP-2026-014 added" },
    { id: "a3", clientId: "c1", date: "2026-07-16", text: "Pre-season promo shoot moved to In edit" },
    { id: "a4", clientId: "c2", date: "2026-07-16", text: "An edit is ready for your review — Fight Night 12" },
    { id: "a5", clientId: "c2", date: "2026-07-15", text: "New invoice RP-2026-015 added" },
    { id: "a6", clientId: "c3", date: "2026-07-01", text: "Your delivery is ready — 2025/26 highlight reel" },
    { id: "a7", clientId: "c3", date: "2026-07-15", text: "Pre-season training content marked as Shot" }
  ]
};
