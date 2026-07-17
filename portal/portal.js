/* ============================================================
   RE.PLAYS PORTAL — portal.js (client view)
   Reads everything through PortalStore. The "previewing as"
   dropdown stands in for the Phase 2 login session.
   ============================================================ */

(function () {
  "use strict";

  var esc = PortalUtil.esc;
  var fmtDate = PortalUtil.fmtDate;
  var fmtMoney = PortalUtil.fmtMoney;
  var STATUSES = PortalStore.STATUSES;

  var VIEW_KEY = "replays_portal_viewing_as"; // preview-only; replaced by auth in Phase 2

  var tick = '<svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M1.5 5.5 4 8 8.5 2.5"/></svg>';

  function stepper(status) {
    var idx = STATUSES.indexOf(status);
    var lis = STATUSES.map(function (s, i) {
      var cls = i < idx ? "done" : i === idx ? "current" : "";
      return '<li class="' + cls + '"' + (i === idx ? ' aria-current="step"' : "") + '>' +
        '<span class="step-dot">' + tick + '</span>' +
        '<span class="step-label">' + esc(s) + "</span></li>";
    }).join("");
    return '<ol class="stepper" aria-label="Project progress: stage ' + (idx + 1) + ' of ' + STATUSES.length + ', ' + esc(status) + '">' + lis + "</ol>" +
      '<p class="stage-now"><span class="n">Stage ' + (idx + 1) + "/" + STATUSES.length + " — </span>" + esc(status) + "</p>";
  }

  function projectCard(p, bundle) {
    var cta = "";
    if (p.status === "Delivered" && p.deliveryLink) {
      cta = '<a class="btn btn-primary" href="' + esc(p.deliveryLink) + '" target="_blank" rel="noopener">Access your content</a>';
    } else if (p.status === "Review" && p.reviewLink) {
      cta = '<a class="btn btn-primary" href="' + esc(p.reviewLink) + '" target="_blank" rel="noopener">Review your edit</a>';
    }

    // Phase 4: pre-shoot brief prompt
    var brief = bundle.briefs.find(function (b) { return b.projectId === p.id; });
    if (brief && brief.status === "requested") {
      cta += '<button class="btn btn-ghost" type="button" data-brief="' + esc(brief.id) + '">Complete pre-shoot brief</button>';
    } else if (brief && brief.status === "submitted") {
      cta += '<span class="pbadge">Brief sent ' + fmtDate(brief.submittedDate) + "</span>";
    }

    // Phase 4: quick review prompt on delivered work (once per project)
    var reviewed = bundle.testimonials.some(function (t) { return t.projectId === p.id; });
    if (p.status === "Delivered" && !reviewed) {
      cta += '<button class="btn btn-ghost" type="button" data-review="' + esc(p.id) + '">Leave a quick review</button>';
    }

    var meta =
      '<p class="project-meta">' +
      "<span>Shoot: <strong>" + fmtDate(p.shootDate) + "</strong></span>" +
      "<span>Delivery due: <strong>" + fmtDate(p.deadline) + "</strong></span>" +
      "</p>";

    return (
      '<article class="panel project-card">' +
      '<div class="project-card-head"><h3>' + esc(p.title) + '</h3><span class="project-type">' + esc(p.type) + "</span></div>" +
      stepper(p.status) +
      meta +
      (p.notes ? '<p class="project-notes">' + esc(p.notes) + "</p>" : "") +
      (cta ? '<div class="project-cta">' + cta + "</div>" : "") +
      "</article>"
    );
  }

  // Phase 4: contract cards
  function contractCard(ct) {
    if (ct.status === "signed") {
      return '<article class="panel contract-row">' +
        '<span class="contract-title">' + esc(ct.title) + "</span>" +
        '<span class="contract-sub">Signed by ' + esc(ct.signerName) + " · " + fmtDate(ct.signedDate) + "</span>" +
        '<span class="pbadge">Signed</span>' +
        "</article>";
    }
    return '<article class="panel contract-row">' +
      '<span class="contract-title">' + esc(ct.title) + "</span>" +
      '<span class="contract-sub">Sent ' + fmtDate(ct.sentDate) + "</span>" +
      '<button class="btn btn-primary" type="button" data-contract="' + esc(ct.id) + '">Review &amp; sign</button>' +
      "</article>";
  }

  function render(bundle) {
    var c = bundle.client;
    document.getElementById("welcome").textContent = "Welcome back, " + (c ? c.name : "…");
    document.getElementById("welcome-sub").textContent = c
      ? "Here's where everything stands — updated as your projects move."
      : "";

    // Feed (latest 4)
    var feed = bundle.activity.slice(0, 4).map(function (a) {
      return "<li><span>" + esc(a.text) + '</span><span class="feed-date">' + fmtDate(a.date) + "</span></li>";
    }).join("");
    document.getElementById("feed").innerHTML = feed || '<li class="empty-note">Nothing new yet — updates land here as your projects move.</li>';

    // Projects: live ones first (by deadline), delivered last
    var projects = bundle.projects.slice().sort(function (a, b) {
      var ad = a.status === "Delivered" ? 1 : 0;
      var bd = b.status === "Delivered" ? 1 : 0;
      if (ad !== bd) return ad - bd;
      return (a.deadline || "9999") < (b.deadline || "9999") ? -1 : 1;
    });
    document.getElementById("projects").innerHTML =
      projects.map(function (p) { return projectCard(p, bundle); }).join("") ||
      '<p class="empty-note">No projects yet — once something is booked it appears here.</p>';
    document.getElementById("projects-count").textContent = projects.length ? "(" + projects.length + ")" : "";

    // Contracts (section only appears when the client has any)
    var contractsSection = document.getElementById("contracts-section");
    contractsSection.hidden = bundle.contracts.length === 0;
    document.getElementById("contracts").innerHTML = bundle.contracts
      .slice()
      .sort(function (a, b) { return a.status === "awaiting_signature" ? -1 : b.status === "awaiting_signature" ? 1 : 0; })
      .map(contractCard).join("");

    // Invoices
    var rows = bundle.invoices.map(function (inv) {
      var badge = inv.status === "paid"
        ? '<span class="pbadge">Paid</span>'
        : '<span class="pbadge pbadge-solid">Unpaid</span>';
      return "<tr><td>" + esc(inv.number) + "</td><td>" + fmtDate(inv.issued) + "</td><td>" + fmtDate(inv.due) +
        '</td><td class="num">' + fmtMoney(inv.amount) + "</td><td>" + badge + "</td></tr>";
    }).join("");
    document.querySelector("#invoices tbody").innerHTML =
      rows || '<tr><td colspan="5" class="empty-note">No invoices yet.</td></tr>';
  }

  var currentClientId = null;
  var currentBundle = null;

  async function show(clientId) {
    var bundle = await PortalStore.getClientBundle(clientId);
    if (!bundle.client) return;
    currentClientId = clientId;
    currentBundle = bundle;
    try { sessionStorage.setItem(VIEW_KEY, clientId); } catch (e) {}
    render(bundle);
  }

  /* ---------- Phase 4: dialogs ---------- */

  var contractDialog = document.getElementById("contract-dialog");
  var briefDialog = document.getElementById("brief-dialog");
  var reviewDialog = document.getElementById("review-dialog");
  var signForm = document.getElementById("sign-form");
  var briefForm = document.getElementById("brief-form");
  var reviewForm = document.getElementById("review-form");

  // Build the 5-star input (DOM order 5→1; row-reverse CSS renders 1→5)
  var starPath = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l2.9 6.3 6.9.6-5.2 4.6 1.5 6.7L12 16.9 5.9 20.2l1.5-6.7L2.2 8.9l6.9-.6z"/></svg>';
  document.getElementById("rd-stars").innerHTML = [5, 4, 3, 2, 1].map(function (n) {
    return '<input type="radio" name="rating" value="' + n + '" id="star-' + n + '" required>' +
      '<label for="star-' + n + '" aria-label="' + n + ' star' + (n > 1 ? "s" : "") + '">' + starPath + "</label>";
  }).join("");

  // Any [data-close] button closes its dialog
  document.querySelectorAll("[data-close]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.getElementById(btn.dataset.close).close();
    });
  });

  // Openers (delegated — cards re-render often)
  document.addEventListener("click", function (e) {
    var b;
    if ((b = e.target.closest("[data-contract]"))) {
      var ct = currentBundle.contracts.find(function (x) { return x.id === b.dataset.contract; });
      if (!ct) return;
      document.getElementById("cd-title").textContent = ct.title;
      document.getElementById("cd-body").textContent = ct.body;
      signForm.reset();
      signForm.elements.contractId.value = ct.id;
      contractDialog.showModal();
    } else if ((b = e.target.closest("[data-brief]"))) {
      briefForm.reset();
      briefForm.elements.briefId.value = b.dataset.brief;
      briefDialog.showModal();
    } else if ((b = e.target.closest("[data-review]"))) {
      reviewForm.reset();
      reviewForm.elements.projectId.value = b.dataset.review;
      reviewDialog.showModal();
    }
  });

  signForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    if (!signForm.reportValidity()) return;
    await PortalStore.signContract(signForm.elements.contractId.value, signForm.elements.signerName.value.trim());
    contractDialog.close();
    show(currentClientId);
  });

  briefForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    if (!briefForm.reportValidity()) return;
    await PortalStore.submitBrief(briefForm.elements.briefId.value, {
      goal: briefForm.elements.goal.value.trim(),
      mustCapture: briefForm.elements.mustCapture.value.trim(),
      access: briefForm.elements.access.value.trim(),
      handles: briefForm.elements.handles.value.trim(),
      extra: briefForm.elements.extra.value.trim()
    });
    briefDialog.close();
    show(currentClientId);
  });

  reviewForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    if (!reviewForm.reportValidity()) return;
    await PortalStore.addTestimonial({
      clientId: currentClientId,
      projectId: reviewForm.elements.projectId.value,
      rating: Number(reviewForm.elements.rating.value),
      quote: reviewForm.elements.quote.value.trim(),
      allowPublic: reviewForm.elements.allowPublic.checked
    });
    reviewDialog.close();
    show(currentClientId);
  });

  async function init() {
    var clients = await PortalStore.getClients();
    var select = document.getElementById("client-switch");
    select.innerHTML = clients.map(function (c) {
      return '<option value="' + esc(c.id) + '">' + esc(c.name) + "</option>";
    }).join("");

    var saved = null;
    try { saved = sessionStorage.getItem(VIEW_KEY); } catch (e) {}
    var current = clients.some(function (c) { return c.id === saved; }) ? saved : clients[0].id;
    select.value = current;

    select.addEventListener("change", function () { show(select.value); });
    show(current);
  }

  init();
})();
