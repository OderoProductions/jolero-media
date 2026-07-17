/* ============================================================
   RE.PLAYS PORTAL — admin.js (admin view)
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

      return '<article class="panel client-block">' +
        '<div class="client-block-head"><h3>' + esc(c.name) + '</h3><span class="project-type">' + esc(c.kind) + "</span></div>" +
        '<p class="client-contact">' + esc(c.contactName) + (c.email ? " · " + esc(c.email) : "") + (c.phone ? " · " + esc(c.phone) : "") + "</p>" +
        '<div class="client-lines">' + plines + "</div>" +
        '<div class="client-lines">' + ilines + "</div>" +
        "</article>";
    }).join("");
  }

  async function renderAll() {
    var data = await PortalStore.getData();
    renderOverview(data);
    renderBoard(data);
    renderClients(data);

    // Keep the add-project client dropdown in sync with newly added clients
    var npClient = document.getElementById("np-client");
    var current = npClient.value;
    npClient.innerHTML = data.clients.map(function (c) {
      return '<option value="' + esc(c.id) + '">' + esc(c.name) + "</option>";
    }).join("");
    if (current) npClient.value = current;
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
    dialog.showModal();
  }

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
