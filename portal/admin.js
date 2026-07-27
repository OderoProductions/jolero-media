/* ============================================================
   JOLERO MEDIA PORTAL — admin.js

   Shared across every admin page. Each section renders only if its
   container exists on the current page, so pages compose whichever
   sections they need (dashboard, projects, clients, invoices,
   contracts, reviews, tasks) from one script.

   All reads/writes go through PortalStore — Phase 2 swaps that out.
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

  function el(id) { return document.getElementById(id); }
  function on(id, evt, fn) { var e = el(id); if (e) e.addEventListener(evt, fn); }
  function todayISO() { return new Date().toISOString().slice(0, 10); }

  function statusBadge(status) {
    var idx = STATUSES.indexOf(status);
    var cls = status === "Delivered" ? "pbadge" : idx >= 4 ? "pbadge pbadge-solid" : idx >= 1 ? "pbadge pbadge-accent" : "pbadge";
    return '<span class="' + cls + '">' + esc(status) + "</span>";
  }

  /* ================= DASHBOARD ================= */

  function renderDashboard(data) {
    var host = el("dash-grid");
    if (!host) return;

    var openTasks = (data.tasks || []).filter(function (t) { return !t.done; });
    var overdueTasks = openTasks.filter(function (t) { return t.due && t.due < todayISO(); });
    var unpaid = data.invoices.filter(function (i) { return i.status === "unpaid"; });
    var unpaidTotal = unpaid.reduce(function (t, i) { return t + i.amount; }, 0);
    var paidTotal = data.invoices.filter(function (i) { return i.status === "paid"; })
      .reduce(function (t, i) { return t + i.amount; }, 0);
    var awaiting = (data.contracts || []).filter(function (c) { return c.status !== "signed"; });
    var live = data.projects.filter(function (p) { return p.status !== "Delivered"; });
    var briefsWaiting = (data.briefs || []).filter(function (b) { return b.status === "requested"; });

    var upcoming = []
      .concat((data.events || []).map(function (e) {
        return { date: e.date, time: e.time || "", text: e.title, tag: e.type };
      }))
      .concat(data.projects.filter(function (p) { return p.shootDate; }).map(function (p) {
        return { date: p.shootDate, time: "", text: p.title, tag: "Shoot" };
      }))
      .filter(function (x) { return x.date >= todayISO(); })
      .sort(function (a, b) { return a.date === b.date ? (a.time > b.time ? 1 : -1) : (a.date < b.date ? -1 : 1); })
      .slice(0, 4);

    var reviews = (data.testimonials || []);
    var avg = reviews.length
      ? (reviews.reduce(function (t, r) { return t + r.rating; }, 0) / reviews.length).toFixed(1)
      : null;

    function card(href, label, value, sub, accent) {
      return '<a class="dash-card" href="' + href + '">' +
        '<span class="dash-label">' + label + "</span>" +
        '<span class="dash-value' + (accent ? " accent" : "") + '">' + value + "</span>" +
        '<span class="dash-sub">' + sub + "</span></a>";
    }

    host.innerHTML =
      card("schedule.html", "Schedule",
        upcoming.length ? upcoming.length : "—",
        upcoming.length
          ? upcoming.map(function (u) {
              return fmtDate(u.date) + (u.time ? " " + u.time : "") + " — " + esc(u.text);
            }).join("<br>")
          : "Nothing coming up") +

      card("tasks.html", "Tasks", openTasks.length,
        overdueTasks.length ? overdueTasks.length + " overdue" : "None overdue",
        overdueTasks.length > 0) +

      card("invoices.html", "Accounting", fmtMoney(unpaidTotal),
        unpaid.length + " unpaid · " + fmtMoney(paidTotal) + " received",
        unpaid.length > 0) +

      card("contracts.html", "Contracts", (data.contracts || []).length,
        awaiting.length ? awaiting.length + " awaiting signature" : "All signed",
        awaiting.length > 0) +

      card("projects.html", "Projects", live.length,
        live.length + " live · " + (data.projects.length - live.length) + " delivered" +
        (briefsWaiting.length ? "<br>" + briefsWaiting.length + " brief(s) awaiting client" : "")) +

      card("clients.html", "Clients", data.clients.length,
        reviews.length
          ? reviews.length + (reviews.length === 1 ? " review · " : " reviews · ") + avg + "★ average"
          : "No reviews yet");
  }

  /* ================= PROJECTS ================= */

  function renderOverview(data) {
    var host = el("overview");
    if (!host) return;
    host.innerHTML = STATUSES.map(function (s) {
      var n = data.projects.filter(function (p) { return p.status === s; }).length;
      return '<div class="stat"><span class="stat-label">' + esc(s) + '</span><span class="stat-value">' + n + "</span></div>";
    }).join("");
  }

  function renderBoard(data) {
    var host = document.querySelector("#board tbody");
    if (!host) return;

    var clientName = {};
    data.clients.forEach(function (c) { clientName[c.id] = c.name; });

    var rows = data.projects.slice().sort(function (a, b) {
      var av, bv;
      if (sortBy === "status") { av = STATUSES.indexOf(a.status); bv = STATUSES.indexOf(b.status); }
      else { av = a.deadline || "9999"; bv = b.deadline || "9999"; }
      if (av === bv) return (a.deadline || "9999") < (b.deadline || "9999") ? -1 : 1;
      return (av < bv ? -1 : 1) * (sortAsc ? 1 : -1);
    });

    host.innerHTML = rows.map(function (p) {
      return "<tr>" +
        '<td><button class="row-btn" type="button" data-project="' + esc(p.id) + '">' + esc(p.title) + "</button></td>" +
        "<td>" + esc(clientName[p.clientId] || "—") + "</td>" +
        "<td>" + esc(p.type) + "</td>" +
        "<td>" + statusBadge(p.status) + "</td>" +
        "<td>" + fmtDate(p.shootDate) + "</td>" +
        "<td>" + fmtDate(p.deadline) + "</td>" +
        "</tr>";
    }).join("");
    if (el("board-count")) el("board-count").textContent = "(" + rows.length + ")";

    document.querySelectorAll(".sort-btn").forEach(function (btn) {
      var active = btn.dataset.sort === sortBy;
      btn.classList.toggle("is-sorted", active);
      btn.classList.toggle("asc", active && sortAsc);
    });
  }

  /* ================= CLIENTS ================= */

  function renderClients(data) {
    var host = el("clients");
    if (!host) return;

    host.innerHTML = data.clients.map(function (c) {
      var projects = data.projects.filter(function (p) { return p.clientId === c.id; });
      var invoices = data.invoices.filter(function (i) { return i.clientId === c.id; });
      var contracts = (data.contracts || []).filter(function (ct) { return ct.clientId === c.id; });

      var plines = projects.map(function (p) {
        return '<div class="line-item"><button class="row-btn" type="button" data-project="' + esc(p.id) + '">' +
          esc(p.title) + "</button>" + statusBadge(p.status) + "<span>due " + fmtDate(p.deadline) + "</span></div>";
      }).join("") || '<p class="empty-note">No projects yet.</p>';

      var ilines = invoices.map(function (i) {
        return '<div class="line-item"><strong>' + esc(i.number) + "</strong><span>" + fmtMoney(i.amount) + "</span>" +
          (i.status === "paid" ? '<span class="pbadge">Paid</span>' : '<span class="pbadge pbadge-solid">Unpaid</span>') +
          "<span>due " + fmtDate(i.due) + "</span></div>";
      }).join("") || '<p class="empty-note">No invoices yet.</p>';

      var ctlines = contracts.map(function (ct) {
        return '<div class="line-item"><strong>' + esc(ct.title) + "</strong>" +
          (ct.status === "signed"
            ? '<span class="pbadge">Signed ' + fmtDate(ct.signedDate) + "</span>"
            : '<span class="pbadge pbadge-accent">Awaiting signature</span>') + "</div>";
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

  /* ================= ACCOUNTING ================= */

  function renderInvoices(data) {
    var host = document.querySelector("#invoice-table tbody");
    if (!host) return;

    var clientName = {};
    data.clients.forEach(function (c) { clientName[c.id] = c.name; });

    var rows = data.invoices.slice().sort(function (a, b) { return a.due < b.due ? 1 : -1; });

    host.innerHTML = rows.map(function (i) {
      var overdue = i.status === "unpaid" && i.due < todayISO();
      return "<tr>" +
        "<td>" + esc(i.number) + "</td>" +
        "<td>" + esc(clientName[i.clientId] || "—") + "</td>" +
        "<td>" + fmtDate(i.issued) + "</td>" +
        '<td class="' + (overdue ? "num overdue-cell" : "num") + '">' + fmtDate(i.due) +
        (overdue ? " ⚠" : "") + "</td>" +
        '<td class="num">' + fmtMoney(i.amount) + "</td>" +
        "<td>" + (i.status === "paid"
          ? '<span class="pbadge">Paid</span>'
          : '<span class="pbadge pbadge-solid">Unpaid</span>') + "</td>" +
        '<td><button class="row-btn" type="button" data-toggle-invoice="' + esc(i.id) + '">' +
        (i.status === "paid" ? "Mark unpaid" : "Mark paid") + "</button></td>" +
        "</tr>";
    }).join("") || '<tr><td colspan="7" class="empty-note">No invoices yet.</td></tr>';

    var unpaid = data.invoices.filter(function (i) { return i.status === "unpaid"; });
    var overdue = unpaid.filter(function (i) { return i.due < todayISO(); });
    var totals = el("invoice-totals");
    if (totals) {
      totals.innerHTML =
        '<div class="stat"><span class="stat-label">Outstanding</span><span class="stat-value accent">' +
        fmtMoney(unpaid.reduce(function (t, i) { return t + i.amount; }, 0)) +
        '</span><span class="stat-sub">' + unpaid.length + " unpaid</span></div>" +
        '<div class="stat"><span class="stat-label">Overdue</span><span class="stat-value' +
        (overdue.length ? " accent" : "") + '">' +
        fmtMoney(overdue.reduce(function (t, i) { return t + i.amount; }, 0)) +
        '</span><span class="stat-sub">' + overdue.length + " invoice(s)</span></div>" +
        '<div class="stat"><span class="stat-label">Received</span><span class="stat-value">' +
        fmtMoney(data.invoices.filter(function (i) { return i.status === "paid"; })
          .reduce(function (t, i) { return t + i.amount; }, 0)) +
        '</span><span class="stat-sub">all time</span></div>';
    }
  }

  /* ================= CONTRACTS ================= */

  function renderContracts(data) {
    var host = el("contracts-list");
    if (!host) return;

    var clientName = {};
    data.clients.forEach(function (c) { clientName[c.id] = c.name; });

    var items = (data.contracts || []).slice().sort(function (a, b) {
      return a.status === b.status ? 0 : a.status === "signed" ? 1 : -1;
    });

    host.innerHTML = items.map(function (ct) {
      return '<article class="panel contract-row">' +
        '<span class="contract-title">' + esc(ct.title) + "</span>" +
        '<span class="contract-sub">' + esc(clientName[ct.clientId] || "—") + " · sent " + fmtDate(ct.sentDate) + "</span>" +
        (ct.status === "signed"
          ? '<span class="pbadge">Signed by ' + esc(ct.signerName) + " · " + fmtDate(ct.signedDate) + "</span>"
          : '<span class="pbadge pbadge-accent">Awaiting signature</span>') +
        "</article>";
    }).join("") || '<p class="empty-note">No contracts yet — send one below.</p>';

    if (el("contracts-count")) {
      var waiting = items.filter(function (c) { return c.status !== "signed"; }).length;
      el("contracts-count").textContent = waiting ? "(" + waiting + " awaiting)" : "";
    }
  }

  /* ================= REVIEWS ================= */

  function renderTestimonials(data) {
    var host = el("testimonials");
    if (!host) return;

    var clientName = {}, projectTitle = {};
    data.clients.forEach(function (c) { clientName[c.id] = c.name; });
    data.projects.forEach(function (p) { projectTitle[p.id] = p.title; });

    var star = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l2.9 6.3 6.9.6-5.2 4.6 1.5 6.7L12 16.9 5.9 20.2l1.5-6.7L2.2 8.9l6.9-.6z"/></svg>';
    var items = (data.testimonials || []).slice().sort(function (a, b) { return b.date < a.date ? -1 : 1; });

    host.innerHTML = items.map(function (t) {
      return '<article class="panel client-block">' +
        '<div class="client-block-head"><span class="star-display" aria-label="' + t.rating +
        ' out of 5">' + star.repeat(t.rating) + "</span><h3>" + esc(clientName[t.clientId] || "—") + "</h3>" +
        '<span class="project-type">' + esc(projectTitle[t.projectId] || "") + "</span></div>" +
        (t.quote ? '<p class="testimonial-quote">&ldquo;' + esc(t.quote) + "&rdquo;</p>" : "") +
        '<p class="testimonial-meta">' + fmtDate(t.date) + " · " +
        (t.allowPublic ? "OK to use publicly" : "Private — not for public use") + "</p>" +
        "</article>";
    }).join("") || '<p class="empty-note">No reviews yet — delivered projects prompt clients for one.</p>';
    if (el("reviews-count")) el("reviews-count").textContent = items.length ? "(" + items.length + ")" : "";
  }

  /* ================= TASKS ================= */

  function renderTasks(data) {
    var host = el("task-list");
    if (!host) return;

    var projectTitle = {};
    data.projects.forEach(function (p) { projectTitle[p.id] = p.title; });

    var tasks = (data.tasks || []).slice().sort(function (a, b) {
      return (a.due || "9999") < (b.due || "9999") ? -1 : 1;
    });
    var open = tasks.filter(function (t) { return !t.done; });
    var done = tasks.filter(function (t) { return t.done; });

    function row(t) {
      var overdue = !t.done && t.due && t.due < todayISO();
      return '<div class="task-row' + (t.done ? " is-done" : "") + '">' +
        '<input type="checkbox" ' + (t.done ? "checked" : "") +
        ' data-toggle-task="' + esc(t.id) + '" aria-label="Mark ' + esc(t.title) + '">' +
        "<div><button class='row-btn t-title' type='button' data-edit-task='" + esc(t.id) + "'>" +
        esc(t.title) + "</button>" +
        '<div class="t-meta">' + esc(t.type) +
        (t.projectId && projectTitle[t.projectId] ? " · " + esc(projectTitle[t.projectId]) : "") +
        "</div></div>" +
        '<span class="t-meta t-due' + (overdue ? " is-overdue" : "") + '">' +
        (overdue ? "Overdue · " : "") + fmtDate(t.due) + "</span>" +
        '<button class="task-del" type="button" data-del-task="' + esc(t.id) + '" aria-label="Delete task">&times;</button>' +
        "</div>";
    }

    host.innerHTML = (open.map(row).join("") + done.map(row).join("")) ||
      '<p class="empty-note">No tasks yet — add one below.</p>';
    if (el("tasks-count")) el("tasks-count").textContent = open.length ? "(" + open.length + " open)" : "";
  }

  /* ================= NOTIFICATION BELL ================= */

  async function renderBell() {
    if (!el("bell-count")) return;
    var notifications = await PortalStore.getNotifications();
    var unread = notifications.filter(function (n) { return !n.read; }).length;
    el("bell-count").hidden = unread === 0;
    el("bell-count").textContent = unread;
    el("bell-list").innerHTML = notifications.map(function (n) {
      return '<li class="' + (n.read ? "" : "unread") + '"><span>' + esc(n.text) +
        '</span><span class="feed-date">' + fmtDate(n.date) + "</span></li>";
    }).join("") || '<li class="bell-empty">Nothing yet — client actions land here.</li>';
  }

  /* ================= REFRESH ================= */

  async function renderAll() {
    var data = await PortalStore.getData();
    renderDashboard(data);
    renderOverview(data);
    renderBoard(data);
    renderClients(data);
    renderInvoices(data);
    renderContracts(data);
    renderTestimonials(data);
    renderTasks(data);
    renderBell();
    syncDropdowns(data);
  }
  window.AdminRefresh = renderAll;   // schedule.js calls this after edits

  function syncDropdowns(data) {
    var clientOpts = data.clients.map(function (c) {
      return '<option value="' + esc(c.id) + '">' + esc(c.name) + "</option>";
    }).join("");
    ["np-client", "nc2-client", "ni-client"].forEach(function (id) {
      var sel = el(id);
      if (!sel) return;
      var current = sel.value;
      sel.innerHTML = clientOpts;
      if (current) sel.value = current;
    });

    var projectOpts = '<option value="">— none —</option>' + data.projects.map(function (p) {
      return '<option value="' + esc(p.id) + '">' + esc(p.title) + "</option>";
    }).join("");
    ["nt-project", "td-project"].forEach(function (id) {
      var sel = el(id);
      if (!sel) return;
      var current = sel.value;
      sel.innerHTML = projectOpts;
      if (current) sel.value = current;
    });

    syncContractProjects(data);
  }

  function syncContractProjects(data) {
    var sel = el("nc2-project");
    if (!sel || !el("nc2-client")) return;
    var clientId = el("nc2-client").value;
    sel.innerHTML = '<option value="">— none —</option>' + data.projects
      .filter(function (p) { return p.clientId === clientId; })
      .map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.title) + "</option>"; })
      .join("");
  }

  /* ================= PROJECT DIALOG ================= */

  var dialog = el("project-dialog");
  var editForm = el("edit-project");

  async function openProject(id) {
    if (!dialog) return;
    var data = await PortalStore.getData();
    var p = data.projects.find(function (x) { return x.id === id; });
    if (!p) return;

    el("pd-title").textContent = p.title;
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

    var brief = (data.briefs || []).find(function (b) { return b.projectId === p.id; });
    var briefEl = el("ep-brief");
    if (briefEl) {
      if (!brief) {
        briefEl.innerHTML = "<label>Pre-shoot brief</label>" +
          '<div><button class="btn btn-ghost" type="button" data-request-brief="' + esc(p.id) + '">Request brief from client</button></div>';
      } else if (brief.status === "requested") {
        briefEl.innerHTML = "<label>Pre-shoot brief</label>" +
          '<div><span class="pbadge pbadge-accent">Requested ' + fmtDate(brief.requestedDate) + " — waiting on client</span></div>";
      } else {
        var a = brief.answers || {};
        briefEl.innerHTML = "<label>Pre-shoot brief — submitted " + fmtDate(brief.submittedDate) + "</label>" +
          '<div class="contract-body">Goal: ' + esc(a.goal || "—") +
          "\nMust capture: " + esc(a.mustCapture || "—") +
          "\nAccess notes: " + esc(a.access || "—") +
          "\nTag: " + esc(a.handles || "—") +
          (a.extra ? "\nExtra: " + esc(a.extra) : "") + "</div>";
      }
    }
    dialog.showModal();
  }

  if (editForm) {
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
  }
  on("pd-close", "click", function () { dialog.close(); });
  on("pd-cancel", "click", function () { dialog.close(); });

  /* ================= TASK DIALOG =================
     Lives here so both the Tasks page and the calendar can open it. */

  var taskDialog = el("task-dialog");
  var taskForm = el("task-form");

  window.AdminEditTask = async function (taskId) {
    if (!taskDialog) return;
    var t = await PortalStore.getTask(taskId);
    if (!t) return;
    var f = taskForm;
    f.elements.id.value = t.id;
    f.elements.title.value = t.title;
    f.elements.type.value = t.type;
    f.elements.due.value = t.due || "";
    f.elements.projectId.value = t.projectId || "";
    f.elements.done.checked = !!t.done;
    taskDialog.showModal();
  };

  if (taskForm) {
    taskForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      var f = taskForm;
      await PortalStore.updateTask(f.elements.id.value, {
        title: f.elements.title.value.trim(),
        type: f.elements.type.value,
        due: f.elements.due.value,
        projectId: f.elements.projectId.value,
        done: f.elements.done.checked
      });
      taskDialog.close();
      renderAll();
      if (window.ScheduleRefresh) window.ScheduleRefresh();
    });
    on("td-delete", "click", async function () {
      var id = taskForm.elements.id.value;
      if (id && confirm("Delete this task?")) {
        await PortalStore.deleteTask(id);
        taskDialog.close();
        renderAll();
        if (window.ScheduleRefresh) window.ScheduleRefresh();
      }
    });
  }

  document.querySelectorAll("[data-close]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var d = el(btn.dataset.close);
      if (d) d.close();
    });
  });

  /* ================= DELEGATED ACTIONS ================= */

  document.addEventListener("click", async function (e) {
    var btn;

    if ((btn = e.target.closest("[data-project]"))) { openProject(btn.dataset.project); return; }

    if ((btn = e.target.closest("[data-request-brief]"))) {
      await PortalStore.requestBrief(btn.dataset.requestBrief);
      if (el("ep-brief")) {
        el("ep-brief").innerHTML = "<label>Pre-shoot brief</label>" +
          '<div><span class="pbadge pbadge-accent">Requested — waiting on client</span></div>';
      }
      renderAll(); return;
    }

    if ((btn = e.target.closest("[data-toggle-invoice]"))) {
      await PortalStore.toggleInvoice(btn.dataset.toggleInvoice);
      renderAll(); return;
    }

    if ((btn = e.target.closest("[data-edit-task]"))) { window.AdminEditTask(btn.dataset.editTask); return; }

    if ((btn = e.target.closest("[data-toggle-task]"))) {
      await PortalStore.toggleTask(btn.dataset.toggleTask);
      renderAll();
      if (window.ScheduleRefresh) window.ScheduleRefresh();
      return;
    }
    if ((btn = e.target.closest("[data-del-task]"))) {
      if (confirm("Delete this task?")) {
        await PortalStore.deleteTask(btn.dataset.delTask);
        renderAll();
        if (window.ScheduleRefresh) window.ScheduleRefresh();
      }
      return;
    }
  });

  document.querySelectorAll(".sort-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (sortBy === btn.dataset.sort) sortAsc = !sortAsc;
      else { sortBy = btn.dataset.sort; sortAsc = true; }
      renderAll();
    });
  });

  /* ================= ADD FORMS ================= */

  function form(id, handler) {
    var f = el(id);
    if (!f) return;
    f.addEventListener("submit", async function (e) {
      e.preventDefault();
      await handler(f);
      f.reset();
      var d = f.closest("details");
      if (d) d.open = false;
      renderAll();
    });
  }

  form("add-project", function (f) {
    return PortalStore.addProject({
      title: f.elements.title.value.trim(),
      clientId: f.elements.clientId.value,
      type: f.elements.type.value,
      shootDate: f.elements.shootDate.value,
      deadline: f.elements.deadline.value,
      notes: f.elements.notes.value.trim()
    });
  });

  form("add-client", function (f) {
    return PortalStore.addClient({
      name: f.elements.name.value.trim(),
      kind: f.elements.kind.value.trim(),
      contactName: f.elements.contactName.value.trim(),
      email: f.elements.email.value.trim(),
      phone: f.elements.phone.value.trim()
    });
  });

  form("add-contract", function (f) {
    return PortalStore.addContract({
      clientId: f.elements.clientId.value,
      projectId: f.elements.projectId.value,
      title: f.elements.title.value.trim(),
      body: f.elements.body.value.trim()
    });
  });

  form("add-invoice", function (f) {
    return PortalStore.addInvoice({
      clientId: f.elements.clientId.value,
      number: f.elements.number.value.trim(),
      amount: Number(f.elements.amount.value),
      issued: f.elements.issued.value,
      due: f.elements.due.value
    });
  });

  form("add-task", function (f) {
    return PortalStore.addTask({
      title: f.elements.title.value.trim(),
      type: f.elements.type.value,
      due: f.elements.due.value,
      projectId: f.elements.projectId.value
    });
  });

  on("nc2-client", "change", async function () {
    syncContractProjects(await PortalStore.getData());
  });

  /* ================= BELL ================= */

  var bellBtn = el("bell-btn");
  var bellPanel = el("bell-panel");
  if (bellBtn && bellPanel) {
    bellBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      var open = bellPanel.hidden;
      bellPanel.hidden = !open;
      bellBtn.setAttribute("aria-expanded", String(open));
    });
    on("bell-read-all", "click", async function () {
      await PortalStore.markNotificationsRead();
      renderBell();
    });
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
  }

  on("reset-demo", "click", async function () {
    if (confirm("Reset the demo? This wipes your local edits and restores the sample data.")) {
      await PortalStore.resetDemo();
      location.reload();
    }
  });

  /* ================= INIT ================= */

  (function init() {
    if (el("ep-status")) {
      el("ep-status").innerHTML = STATUSES.map(function (s) { return "<option>" + esc(s) + "</option>"; }).join("");
    }
    var typeOpts = TYPES.map(function (t) { return "<option>" + esc(t) + "</option>"; }).join("");
    ["ep-type", "np-type"].forEach(function (id) { if (el(id)) el(id).innerHTML = typeOpts; });

    var taskOpts = PortalStore.TASK_TYPES.map(function (t) { return "<option>" + esc(t) + "</option>"; }).join("");
    ["nt-type", "td-type"].forEach(function (id) { if (el(id)) el(id).innerHTML = taskOpts; });

    renderAll();
  })();
})();
