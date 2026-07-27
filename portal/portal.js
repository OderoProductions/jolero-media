/* ============================================================
   JOLERO MEDIA PORTAL — portal.js (client view)
   Reads everything through PortalStore. The "previewing as"
   dropdown stands in for the Phase 2 login session.
   ============================================================ */

(function () {
  "use strict";

  var esc = PortalUtil.esc;
  var fmtDate = PortalUtil.fmtDate;
  var fmtMoney = PortalUtil.fmtMoney;
  var STATUSES = PortalStore.STATUSES;

  var VIEW_KEY = "jolero_portal_viewing_as"; // preview-only; replaced by auth in Phase 2

  var tick = '<svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M1.5 5.5 4 8 8.5 2.5"/></svg>';

  function stepper(status) {
    var idx = STATUSES.indexOf(status);
    var lis = STATUSES.map(function (s, i) {
      var cls = i < idx ? "done" : i === idx ? "current" : "";
      // --i drives the draw-in stagger in portal.css (connector sweep + dot pop delays)
      return '<li class="' + cls + '" style="--i:' + i + '"' + (i === idx ? ' aria-current="step"' : "") + '>' +
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
        '<button class="btn btn-ghost btn-mini" type="button" data-contract-pdf="' + esc(ct.id) + '">Download PDF</button>' +
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

    // Invoices (extra header cell for the per-row PDF download)
    var headRow = document.querySelector("#invoices thead tr");
    if (headRow && headRow.children.length === 5) {
      var th = document.createElement("th");
      th.setAttribute("scope", "col");
      headRow.appendChild(th);
    }
    var rows = bundle.invoices.map(function (inv) {
      var badge = inv.status === "paid"
        ? '<span class="pbadge">Paid</span>'
        : '<span class="pbadge pbadge-solid">Unpaid</span>';
      return "<tr><td>" + esc(inv.number) + "</td><td>" + fmtDate(inv.issued) + "</td><td>" + fmtDate(inv.due) +
        '</td><td class="num">' + fmtMoney(inv.amount) + "</td><td>" + badge + "</td>" +
        '<td><button class="row-btn" type="button" data-invoice-pdf="' + esc(inv.id) +
        '" aria-label="Download PDF of invoice ' + esc(inv.number) + '">PDF</button></td></tr>';
    }).join("");
    document.querySelector("#invoices tbody").innerHTML =
      rows || '<tr><td colspan="6" class="empty-note">No invoices yet.</td></tr>';

    setupEntrance();
  }

  /* ---------- Motion polish: panel entrance + stepper draw-in ----------
     Progressive enhancement only. When IntersectionObserver is missing or
     the user prefers reduced motion, no classes are ever added, so the
     page renders exactly as before: fully visible, zero animation.
     (The matching CSS lives at the end of portal.css and is additionally
     gated behind @media (prefers-reduced-motion: no-preference).) */

  var animObserver = null;

  function motionAllowed() {
    if (!("IntersectionObserver" in window)) return false;
    try {
      if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
    } catch (e) {}
    return true;
  }

  function onPanelIntersect(entries) {
    for (var k = 0; k < entries.length; k++) {
      var entry = entries[k];
      if (!entry.isIntersecting) continue;
      var rootH = entry.rootBounds ? entry.rootBounds.height : window.innerHeight;
      // Reveal at 35% visibility. A panel taller than ~60% of the viewport
      // may never reach that ratio, so any intersection reveals it instead
      // of leaving it invisible.
      if (entry.intersectionRatio >= 0.35 || entry.boundingClientRect.height > rootH * 0.6) {
        entry.target.classList.add("anim-ready");
        animObserver.unobserve(entry.target); // once per element
      }
    }
  }

  // Arms every client-view panel (feed, project cards, contracts, invoices)
  // for its entrance. Runs after every render, so switching client in the
  // dropdown re-runs the entrance — that's intentional.
  function setupEntrance() {
    if (!motionAllowed()) return;
    if (animObserver) animObserver.disconnect();
    else animObserver = new IntersectionObserver(onPanelIntersect, { threshold: [0, 0.35] });
    var panels = document.querySelectorAll(".portal-shell .panel");
    for (var k = 0; k < panels.length; k++) {
      panels[k].classList.remove("anim-ready");         // persistent panels re-arm on re-render
      panels[k].style.setProperty("--p", k);            // 60ms entrance stagger in portal.css
      panels[k].classList.add("will-anim");             // hidden state applies from this point only
      animObserver.observe(panels[k]);
    }
  }

  // Keyboard safety: if focus lands inside a panel that is still waiting to
  // animate (e.g. tabbing below the fold), reveal it immediately rather than
  // letting the user focus invisible controls.
  document.addEventListener("focusin", function (e) {
    var el = e.target && e.target.closest ? e.target.closest(".will-anim:not(.anim-ready)") : null;
    if (el) {
      el.classList.add("anim-ready");
      if (animObserver) animObserver.unobserve(el);
    }
  });

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

  // Signed contracts download as a real PDF (built in pdf.js, no server)
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-contract-pdf]");
    if (!b || !window.ContractPDF || !currentBundle) return;
    var ct = currentBundle.contracts.find(function (x) { return x.id === b.dataset.contractPdf; });
    if (ct) window.ContractPDF.download(ct, currentBundle.client ? currentBundle.client.name : "");
  });

  // Invoices download as branded PDFs the same way
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-invoice-pdf]");
    if (!b || !window.InvoicePDF || !currentBundle) return;
    var inv = currentBundle.invoices.find(function (x) { return x.id === b.dataset.invoicePdf; });
    if (inv) window.InvoicePDF.download(inv, currentBundle.client || {});
  });

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
