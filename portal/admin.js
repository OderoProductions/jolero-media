/* ============================================================
   JOLERO MEDIA PORTAL — admin.js (admin view)
   All reads/writes go through PortalStore; edits persist to
   localStorage so the flow can be played with in the preview.
   ============================================================ */

(function () {
  "use strict";

  var esc = PortalUtil.esc;
  var fmtDate = PortalUtil.fmtDate;
  var fmtMoney = PortalUtil.fmtMoney;
  var STATUSES = PortalStore.STATUSES;
  var TYPES = PortalStore.PROJECT_TYPES;

  var sortBy = "deadline";
  var sortAsc = true;

  var dialog = document.getElementById("project-dialog");
  var editForm = document.getElementById("edit-project");

  function statusBadge(status) {
    var idx = STATUSES.indexOf(status);
    var cls = status === "Delivered" ? "pbadge" : idx >= 4 ? "pbadge pbadge-solid" : idx >= 1 ? "pbadge pbadge-accent" : "pbadge";
    return '<span class="' + cls + '">' + esc(status) + "</span>";
  }

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  /* ---------- render ---------- */

  function renderOverview(data) {
    var chips = STATUSES.map(function (s) {
      var n = data.projects.filter(function (p) { return p.status === s; }).length;
      return '<div class="stat"><span class="stat-label">' + esc(s) + '</span><span class="stat-value">' + n + "</span></div>";
    }).join("");

    var unpaid = data.invoices.filter(function (i) { return i.status === "unpaid"; });
    var unpaidTotal = unpaid.reduce(function (t, i) { return t + i.amount; }, 0);
    chips += '<div class="stat"><span class="stat-label">Unpaid invoices</span><span class="stat-value accent">' + fmtMoney(unpaidTotal) +
      '</span><span class="stat-sub">' + unpaid.length + " open</span></div>";

    var upcoming = data.projects
      .filter(function (p) { return p.shootDate && p.shootDate >= todayISO(); })
      .sort(function (a, b) { return a.shootDate < b.shootDate ? -1 : 1; })
      .slice(0, 3);
    chips += '<div class="stat"><span class="stat-label">Next shoots</span>' +
      (upcoming.length
        ? '<span class="stat-sub">' + upcoming.map(function (p) {
            return fmtDate(p.shootDate) + " — " + esc(p.title);
          }).join("<br>") + "</span>"
        : '<span class="stat-sub">Nothing scheduled</span>') +
      "</div>";

    document.getElementById("overview").innerHTML = chips;
  }

  function renderBoard(data) {
    var clientName = {};
    data.clients.forEach(function (c) { clientName[c.id] = c.name; });

    var rows = data.projects.slice().sort(function (a, b) {
      var av, bv;
      if (sortBy === "status") {
        av = STATUSES.indexOf(a.status); bv = STATUSES.indexOf(b.status);
      } else {
        av = a.deadline || "9999"; bv = b.deadline || "9999";
      }
      if (av === bv) return (a.deadline || "9999") < (b.deadline || "9999") ? -1 : 1;
      return (av < bv ? -1 : 1) * (sortAsc ? 1 : -1);
    });

    document.querySelector("#board tbody").innerHTML = rows.map(function (p) {
      return "<tr>" +
        '<td><button class="row-btn" type="button" data-project="' + esc(p.id) + '">' + esc(p.title) + "</button></td>" +
        "<td>" + esc(clientName[p.clientId] || "—") + "</td>" +
        "<td>" + esc(p.type) + "</td>" +
        "<td>" + statusBadge(p.status) + "</td>" +
        "<td>" + fmtDate(p.shootDate) + "</td>" +
        "<td>" + fmtDate(p.deadline) + "</td>" +
        "</tr>";
    }).join("");
    document.getElementById("board-count").textContent = "(" + rows.length + ")";

    document.querySelectorAll(".sort-btn").forEach(function (btn) {
      var active = btn.dataset.sort === sortBy;
      btn.classList.toggle("is-sorted", active);
      btn.classList.toggle("asc", active && sortAsc);
    });
  }

  function renderClients(data) {
    document.getElementById("clients").innerHTML = data.clients.map(function (c) {
      var projects = data.projects.filter(function (p) { return p.clientId === c.id; });
      var invoices = data.invoices.filter(function (i) { return i.clientId === c.id; });

      var plines = projects.map(function (p) {
        return '<div class="line-item"><button class="row-btn" type="button" data-project="' + esc(p.id) + '">' +
          esc(p.title) + "</button>" + statusBadge(p.status) + "<span>due " + fmtDate(p.deadline) + "</span></div>";
      }).join("") || '<p class="empty-note">No projects yet.</p>';

      var ilines = invoices.map(function (i) {
        return '<div class="line-item"><strong>' + esc(i.number) + "</strong><span>" + fmtMoney(i.amount) + "</span>" +
          (i.status === "paid" ? '<span class="pbadge">Paid</span>' : '<span class="pbadge pbadge-solid">Unpaid</span>') +
          "<span>due " + fmtDate(i.due) + "</span></div>";
      }).join("") || '<p class="empty-note">No invoices yet.</p>';

      var contracts = (data.contracts || []).filter(function (ct) { return ct.clientId === c.id; });
      var ctlines = contracts.map(function (ct) {
        return '<div class="line-item"><strong>' + esc(ct.title) + "</strong>" +
          (ct.status === "signed"
            ? '<span class="pbadge">Signed ' + fmtDate(ct.signedDate) + "</span>"
            : '<span class="pbadge pbadge-accent">Awaiting signature</span>') +
          "</div>";
      }).join("");

      return '<article class="panel client-block">' +
        '<div class="client-block-head"><h3>' + esc(c.name) + '</h3><span class="project-type">' + esc(c.kind) + "</span></div>" +
        '<p class="client-contact">' + esc(c.contactName) + (c.email ? " · " + esc(c.email) : "") + (c.phone ? " · " + esc(c.phone) : "") + "</p>" +
        '<div class="client-lines">' + plines + "</div>" +
        '<div class="client-lines">' + ilines + "</div>" +
        (ctlines ? '<div class="client-lines">' + ctlines + "</div>" : "") +
        "</article>";
    }).join("");
  }

  // Phase 4: reviews left by clients
  function renderTestimonials(data) {
    var clientName = {}, projectTitle = {};
    data.clients.forEach(function (c) { clientName[c.id] = c.name; });
    data.projects.forEach(function (p) { projectTitle[p.id] = p.title; });

    var star = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l2.9 6.3 6.9.6-5.2 4.6 1.5 6.7L12 16.9 5.9 20.2l1.5-6.7L2.2 8.9l6.9-.6z"/></svg>';
    var items = (data.testimonials || []).slice().sort(function (a, b) { return b.date < a.date ? -1 : 1; });

    document.getElementById("testimonials").innerHTML = items.map(function (t) {
      var stars = '<span class="star-display" aria-label="' + t.rating + ' out of 5">' + star.repeat(t.rating) + "</span>";
      return '<article class="panel client-block">' +
        '<div class="client-block-head">' + stars + "<h3>" + esc(clientName[t.clientId] || "—") + "</h3>" +
        '<span class="project-type">' + esc(projectTitle[t.projectId] || "") + "</span></div>" +
        (t.quote ? '<p class="testimonial-quote">&ldquo;' + esc(t.quote) + "&rdquo;</p>" : "") +
        '<p class="testimonial-meta">' + fmtDate(t.date) + " · " +
        (t.allowPublic ? "OK to use publicly" : "Private — not for public use") + "</p>" +
        "</article>";
    }).join("") || '<p class="empty-note">No reviews yet — delivered projects prompt clients for one.</p>';
    var n = items.length;
    document.getElementById("reviews-count").textContent = n ? "(" + n + ")" : "";
  }

  // Phase 4: notification bell
  async function renderBell() {
    var notifications = await PortalStore.getNotifications();
    var unread = notifications.filter(function (n) { return !n.read; }).length;
    var count = document.getElementById("bell-count");
    count.hidden = unread === 0;
    count.textContent = unread;
    document.getElementById("bell-list").innerHTML = notifications.map(function (n) {
      return '<li class="' + (n.read ? "" : "unread") + '"><span>' + esc(n.text) + '</span><span class="feed-date">' + fmtDate(n.date) + "</span></li>";
    }).join("") || '<li class="bell-empty">Nothing yet — client actions land here.</li>';
  }

  async function renderAll() {
    var data = await PortalStore.getData();
    renderOverview(data);
    renderBoard(data);
    renderClients(data);
    renderTestimonials(data);
    renderBell();

    // Keep both client dropdowns in sync with newly added clients
    var opts = data.clients.map(function (c) {
      return '<option value="' + esc(c.id) + '">' + esc(c.name) + "</option>";
    }).join("");
    ["np-client", "nc2-client"].forEach(function (id) {
      var sel = document.getElementById(id);
      var current = sel.value;
      sel.innerHTML = opts;
      if (current) sel.value = current;
    });
    syncContractProjects(data);
  }

  // The contract form's project dropdown only lists the chosen client's projects
  function syncContractProjects(data) {
    var clientId = document.getElementById("nc2-client").value;
    var sel = document.getElementById("nc2-project");
    sel.innerHTML = '<option value="">— none —</option>' + data.projects
      .filter(function (p) { return p.clientId === clientId; })
      .map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.title) + "</option>"; })
      .join("");
  }

  /* ---------- project dialog ---------- */

  async function openProject(id) {
    var data = await PortalStore.getData();
    var p = data.projects.find(function (x) { return x.id === id; });
    if (!p) return;

    document.getElementById("pd-title").textContent = p.title;
    var f = editForm;
    f.elements.id.value = p.id;
    f.elements.title.value = p.title;
    f.elements.status.value = p.status;
    f.elements.type.value = p.type;
    f.elements.shootDate.value = p.shootDate || "";
    f.elements.deadline.value = p.deadline || "";
    f.elements.reviewLink.value = p.reviewLink || "";
    f.elements.deliveryLink.value = p.deliveryLink || "";
    f.elements.notes.value = p.notes || "";

    // Phase 4: brief status for this project
    var brief = (data.briefs || []).find(function (b) { return b.projectId === p.id; });
    var briefEl = document.getElementById("ep-brief");
    if (!brief) {
      briefEl.innerHTML = '<label>Pre-shoot brief</label>' +
        '<div><button class="btn btn-ghost" type="button" data-request-brief="' + esc(p.id) + '">Request brief from client</button></div>';
    } else if (brief.status === "requested") {
      briefEl.innerHTML = "<label>Pre-shoot brief</label>" +
        '<div><span class="pbadge pbadge-accent">Requested ' + fmtDate(brief.requestedDate) + " — waiting on client</span></div>";
    } else {
      var a = brief.answers || {};
      briefEl.innerHTML = "<label>Pre-shoot brief — submitted " + fmtDate(brief.submittedDate) + "</label>" +
        '<div class="contract-body">' +
        "Goal: " + esc(a.goal || "—") + "\n" +
        "Must capture: " + esc(a.mustCapture || "—") + "\n" +
        "Access notes: " + esc(a.access || "—") + "\n" +
        "Tag: " + esc(a.handles || "—") +
        (a.extra ? "\nExtra: " + esc(a.extra) : "") +
        "</div>";
    }

    dialog.showModal();
  }

  // Request-brief button inside the dialog
  document.addEventListener("click", async function (e) {
    var btn = e.target.closest("[data-request-brief]");
    if (!btn) return;
    await PortalStore.requestBrief(btn.dataset.requestBrief);
    document.getElementById("ep-brief").innerHTML = "<label>Pre-shoot brief</label>" +
      '<div><span class="pbadge pbadge-accent">Requested — waiting on client</span></div>';
    renderAll();
  });

  editForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    var f = editForm;
    await PortalStore.updateProject(f.elements.id.value, {
      title: f.elements.title.value.trim(),
      status: f.elements.status.value,
      type: f.elements.type.value,
      shootDate: f.elements.shootDate.value,
      deadline: f.elements.deadline.value,
      reviewLink: f.elements.reviewLink.value.trim(),
      deliveryLink: f.elements.deliveryLink.value.trim(),
      notes: f.elements.notes.value.trim()
    });
    dialog.close();
    renderAll();
  });

  document.getElementById("pd-close").addEventListener("click", function () { dialog.close(); });
  document.getElementById("pd-cancel").addEventListener("click", function () { dialog.close(); });

  // One delegated listener covers project buttons in the board AND client list
  document.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-project]");
    if (btn) openProject(btn.dataset.project);
  });

  /* ---------- sorting ---------- */

  document.querySelectorAll(".sort-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (sortBy === btn.dataset.sort) { sortAsc = !sortAsc; }
      else { sortBy = btn.dataset.sort; sortAsc = true; }
      renderAll();
    });
  });

  /* ---------- add forms ---------- */

  document.getElementById("add-project").addEventListener("submit", async function (e) {
    e.preventDefault();
    var f = e.target;
    await PortalStore.addProject({
      title: f.elements.title.value.trim(),
      clientId: f.elements.clientId.value,
      type: f.elements.type.value,
      shootDate: f.elements.shootDate.value,
      deadline: f.elements.deadline.value,
      notes: f.elements.notes.value.trim()
    });
    f.reset();
    f.closest("details").open = false;
    renderAll();
  });

  document.getElementById("add-client").addEventListener("submit", async function (e) {
    e.preventDefault();
    var f = e.target;
    await PortalStore.addClient({
      name: f.elements.name.value.trim(),
      kind: f.elements.kind.value.trim(),
      contactName: f.elements.contactName.value.trim(),
      email: f.elements.email.value.trim(),
      phone: f.elements.phone.value.trim()
    });
    f.reset();
    f.closest("details").open = false;
    renderAll();
  });

  /* ---------- Phase 4: send contract ---------- */

  document.getElementById("nc2-client").addEventListener("change", async function () {
    syncContractProjects(await PortalStore.getData());
  });

  document.getElementById("add-contract").addEventListener("submit", async function (e) {
    e.preventDefault();
    var f = e.target;
    await PortalStore.addContract({
      clientId: f.elements.clientId.value,
      projectId: f.elements.projectId.value,
      title: f.elements.title.value.trim(),
      body: f.elements.body.value.trim()
    });
    f.reset();
    f.closest("details").open = false;
    renderAll();
  });

  /* ---------- Phase 4: notification bell ---------- */

  var bellBtn = document.getElementById("bell-btn");
  var bellPanel = document.getElementById("bell-panel");

  bellBtn.addEventListener("click", function () {
    var open = bellPanel.hidden;
    bellPanel.hidden = !open;
    bellBtn.setAttribute("aria-expanded", String(open));
  });

  document.getElementById("bell-read-all").addEventListener("click", async function () {
    await PortalStore.markNotificationsRead();
    renderBell();
  });

  // Close the panel on outside click or Escape
  document.addEventListener("click", function (e) {
    if (!bellPanel.hidden && !e.target.closest(".bell-wrap")) {
      bellPanel.hidden = true;
      bellBtn.setAttribute("aria-expanded", "false");
    }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !bellPanel.hidden) {
      bellPanel.hidden = true;
      bellBtn.setAttribute("aria-expanded", "false");
      bellBtn.focus();
    }
  });

  /* ---------- reset demo ---------- */

  document.getElementById("reset-demo").addEventListener("click", async function () {
    if (confirm("Reset the demo? This wipes your local edits and restores the sample data.")) {
      await PortalStore.resetDemo();
      renderAll();
    }
  });

  /* ---------- init ---------- */

  async function init() {
    // Populate selects
    document.getElementById("ep-status").innerHTML = STATUSES.map(function (s) {
      return "<option>" + esc(s) + "</option>";
    }).join("");
    var typeOpts = TYPES.map(function (t) { return "<option>" + esc(t) + "</option>"; }).join("");
    document.getElementById("ep-type").innerHTML = typeOpts;
    document.getElementById("np-type").innerHTML = typeOpts;

    renderAll(); // also fills the add-project client dropdown
  }

  init();
})();
