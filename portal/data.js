/* ============================================================
   JOLERO MEDIA PORTAL — data.js (configuration)

   The dropdown lists used across the portal. These are settings,
   not records: changing a word here changes it everywhere, with no
   database migration and no round trip.

   The actual records — clients, projects, invoices, accounting,
   calendar, contracts — live in Postgres and are reached through
   store.js. Nothing in this file affects them, so editing it can
   never lose data. (It used to. It doesn't now.)

   Editing a list below only changes what future dropdowns offer;
   records already saved with an old value keep it and still display
   correctly.
   ============================================================ */

window.JOLERO_SEED = {

  // The project pipeline, in order. The client's progress stepper
  // walks these left to right, so order is meaningful.
  statuses: ["Booked", "Shoot scheduled", "Shot", "In edit", "Review", "Delivered"],

  projectTypes: ["Matchday shoot", "Highlight reel", "Training content", "Event coverage"],

  // Task categories — "Post" is the content-posting schedule
  taskTypes: ["Shoot prep", "Edit", "Post", "Admin", "Invoice", "Other"],

  // Standalone calendar entries (anything not driven by a project)
  eventTypes: ["Shoot", "Meeting", "Content day", "Edit day", "Personal", "Other"],

  // Content planner
  postPlatforms: ["Instagram Reel", "Instagram Post", "Instagram Story", "TikTok", "YouTube", "Other"],
  postStatuses: ["Idea", "Drafted", "Ready", "Posted"],

  // Ledger categories — the expense list loosely follows the HMRC
  // self-assessment headings, so the yearly total maps onto the form.
  txCategories: {
    income: ["Shoots & retainers", "Print & product sales", "Licensing", "Other income"],
    expense: ["Equipment", "Equipment hire", "Software & subscriptions", "Travel & fuel",
              "Insurance", "Marketing", "Phone & internet", "Training", "Fees & admin",
              "Other expense"]
  }
};
