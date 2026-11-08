/* ============================================================
   JOLERO MEDIA PORTAL — contract-templates.js  (admin/contracts.html)

   Ready-written agreements. Pick one and it fills the agreement box,
   with the client's name dropped in; anything in [SQUARE BRACKETS] is
   yours to fill before sending. Every template ends with the same
   standard terms and usage licence, kept once in TERMS below so a change
   there changes them all.

   These are sensible starting points written for a small UK media
   business. They are not legal advice: have a solicitor read them over
   once before relying on them.
   ============================================================ */

(function () {
  "use strict";

  var TERMS = [
    "STANDARD TERMS AND USAGE LICENCE",
    "",
    "1. Payment. Invoices are due within 14 days unless this agreement says otherwise. A booking is confirmed once any deposit is paid. Late payments by businesses may incur interest and compensation under the Late Payment of Commercial Debts (Interest) Act 1998.",
    "",
    "2. Cancellation and rescheduling. Cancel more than 7 days before a shoot and any deposit is refunded. Within 7 days, the deposit is kept. Within 48 hours, 50% of the shoot fee is due. One reschedule is free with at least 48 hours' notice. If we have to cancel, everything you have paid for that shoot is refunded in full or moved to a new date, whichever you prefer.",
    "",
    "3. Weather and conditions. If a shoot can't go ahead safely because of weather, a venue closure or a fixture being called off, we move it to the next date that suits us both at no extra cost.",
    "",
    "4. Delivery. Edited photos and videos are delivered through a private online gallery by the date agreed. Galleries stay live for at least 60 days; please download everything you want to keep. Raw, unedited footage is not included unless agreed in writing.",
    "",
    "5. Revisions. Each video includes one round of changes, sent together through the gallery. Further rounds, or changes to the brief after editing has started, are charged at [RATE] per hour.",
    "",
    "6. Ownership. Jolero Media owns the copyright in all photos and videos it creates. Once the invoice is paid in full you receive the licence in clause 7.",
    "",
    "7. Your licence. You may use the delivered content, without time limit, on your own website, social media channels, newsletters and printed promotional material, and you may share it with the people featured in it. Credit to @joleromedia is appreciated. The licence does not cover resale, sublicensing, use by third parties such as sponsors or brands, or paid advertising; ask us and we will quote for these.",
    "",
    "8. Our use. We may use the content in our own portfolio, website and social media. Tell us in writing if any part must stay private, for example before an announcement, and we will hold it back.",
    "",
    "9. People featured. You confirm you have permission for the people we film or photograph to appear, including written consent from a parent or guardian for anyone under 18. We do not publish children's full names or schools.",
    "",
    "10. Access and safety. You will arrange access to the venue and let us know of any rules, restricted areas or people who must not be filmed. We follow the venue's safety instructions at all times.",
    "",
    "11. Liability. Our total liability under this agreement is limited to the fees paid for the work concerned. In the unlikely event that files are lost or damaged through equipment failure, our liability is limited to a reshoot or a refund of the fee for the affected work. Nothing here limits liability for death or personal injury caused by negligence.",
    "",
    "12. Data. We keep your contact details and project files only as long as needed to provide the work and meet our legal obligations, and we never sell them. Our privacy notice is on our website and available on request.",
    "",
    "13. General. This agreement is governed by the law of England and Wales. If any part is found invalid, the rest still applies."
  ].join("\n");

  var TEMPLATES = [
    {
      name: "Single shoot",
      title: "Shoot agreement",
      body: [
        "This agreement is between Jolero Media and {client} for the shoot described below.",
        "",
        "THE WORK",
        "Shoot date: [DATE]",
        "Location: [VENUE AND ADDRESS]",
        "Time on site: [START] to [FINISH]",
        "What you receive: [e.g. 1 highlight film of 60 to 90 seconds, 3 vertical edits for Reels, 40+ edited photos]",
        "Delivery: within [10] working days of the shoot",
        "",
        "FEES",
        "Total fee: £[AMOUNT]",
        "Deposit: £[DEPOSIT] to confirm the booking, with the balance due within 14 days of delivery.",
        "Travel: included within 30 miles of West Sussex, otherwise [45p] per mile."
      ].join("\n")
    },
    {
      name: "Monthly content package",
      title: "Monthly content agreement",
      body: [
        "This agreement is between Jolero Media and {client} for regular content each month.",
        "",
        "THE WORK, EACH MONTH",
        "Shoot days: [e.g. 2 shoot days or up to 4 matchdays]",
        "Edits: [e.g. 8 vertical edits for Reels and TikTok, 1 longer highlight film]",
        "Photos: [e.g. 60+ edited photos]",
        "Delivery: within [5] working days of each shoot, through your private gallery.",
        "",
        "FEES AND TERM",
        "Monthly fee: £[AMOUNT], invoiced on the 1st of each month and due within 14 days.",
        "Starting: [START DATE]. Minimum term: [3] months, then rolling month to month.",
        "Either side can end the agreement after the minimum term with 30 days' notice in writing.",
        "Unused shoot days carry over for one month only and are not refunded."
      ].join("\n")
    },
    {
      name: "Athlete package",
      title: "Athlete content agreement",
      body: [
        "This agreement is between Jolero Media and {client} for content to build their profile with clubs, scouts and sponsors.",
        "",
        "THE WORK",
        "Sessions: [e.g. 1 training session and 1 match]",
        "What you receive: [e.g. 1 highlight reel for recruitment, 4 vertical edits, 30+ edited photos]",
        "Delivery: within [10] working days of the last session.",
        "",
        "FEES",
        "Total fee: £[AMOUNT], with a deposit of £[DEPOSIT] to confirm and the balance due within 14 days of delivery.",
        "",
        "FOR ATHLETES UNDER 18",
        "A parent or guardian signs this agreement on the athlete's behalf and agrees to the terms below, including clause 9.",
        "Parent or guardian name: [NAME]"
      ].join("\n")
    },
    {
      name: "Event coverage",
      title: "Event coverage agreement",
      body: [
        "This agreement is between Jolero Media and {client} for coverage of the event below.",
        "",
        "THE EVENT",
        "Event: [NAME]",
        "Date and times: [DATE], [START] to [FINISH]",
        "Location: [VENUE AND ADDRESS]",
        "Crew: [e.g. 2 camera operators]",
        "",
        "WHAT YOU RECEIVE",
        "[e.g. Same-day social edit within 24 hours, highlight film of 2 to 3 minutes within 10 working days, 150+ edited photos]",
        "",
        "FEES",
        "Total fee: £[AMOUNT]. Deposit of 50% to confirm the date, balance due within 14 days of delivery.",
        "Food and parking on the day to be provided by the organiser, or [£X] added to the invoice."
      ].join("\n")
    },
    {
      name: "Standard terms only",
      title: "Standard terms and usage licence",
      body: "These terms apply to all work Jolero Media carries out for {client}."
    }
  ];

  window.JOLERO_CONTRACT_TEMPLATES = { terms: TERMS, list: TEMPLATES };

  var pick = document.getElementById("nc2-template");
  if (!pick) return;
  pick.innerHTML = '<option value="">Start from blank</option>' + TEMPLATES.map(function (t, i) {
    return '<option value="' + i + '">' + PortalUtil.esc(t.name) + "</option>";
  }).join("");

  pick.addEventListener("change", function () {
    var t = TEMPLATES[Number(this.value)];
    if (!t || this.value === "") return;
    var body = document.getElementById("nc2-body");
    var title = document.getElementById("nc2-title");
    if (body.value.trim() && !confirm("Replace what's in the agreement box with the " + t.name + " template?")) {
      this.value = "";
      return;
    }
    var sel = document.getElementById("nc2-client");
    var client = sel && sel.selectedIndex >= 0 && sel.value ? sel.options[sel.selectedIndex].text : "[CLIENT]";
    title.value = t.title;
    body.value = t.body.replace(/\{client\}/g, client) + "\n\n" + TERMS;
    body.rows = 18;
  });
})();
