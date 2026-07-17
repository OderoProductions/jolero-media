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

  function projectCard(p) {
    var cta = "";
    if (p.status === "Delivered" && p.deliveryLink) {
      cta = '<a class="btn btn-primary" href="' + esc(p.deliveryLink) + '" target="_blank" rel="noopener">Access your content</a>';
    } else if (p.status === "Review" && p.reviewLink) {
      cta = '<a class="btn btn-primary" href="' + esc(p.reviewLink) + '" target="_blank" rel="noopener">Review your edit</a>';
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
      projects.map(projectCard).join("") ||
      '<p class="empty-note">No projects yet — once something is booked it appears here.</p>';
    document.getElementById("projects-count").textContent = projects.length ? "(" + projects.length + ")" : "";

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

  async function show(clientId) {
    var bundle = await PortalStore.getClientBundle(clientId);
    if (!bundle.client) return;
    try { sessionStorage.setItem(VIEW_KEY, clientId); } catch (e) {}
    render(bundle);
  }

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
