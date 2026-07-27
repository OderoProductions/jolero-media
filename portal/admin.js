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
      .concat((data.posts || []).filter(function (po) { return po.status !== "Posted"; }).map(function (po) {
        return { date: po.date, time: po.time || "", text: po.title, tag: po.platform };
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

      card("schedule.html", "Tasks", openTasks.length,
        overdueTasks.length ? overdueTasks.length + " overdue" : "None overdue",
        overdueTasks.length > 0) +

      card("invoices.html", "Accounting", fmtMoney(unpaidTotal),
        unpaid.length + " unpaid · " + fmtMoney(paidTotal) + " received" +
        (function () {
          // profit this tax year: paid invoices + income tx − expense tx
          var ty = taxYearOf(todayISO());
          var inc = 0, exp = 0;
          data.invoices.forEach(function (i) {
            if (i.status === "paid" && taxYearOf(i.paidDate || i.due) === ty) inc += i.amount;
          });
          (data.transactions || []).forEach(function (t) {
            if (taxYearOf(t.date) !== ty) return;
            if (t.kind === "income") inc += t.amount; else exp += t.amount;
          });
          return "<br>" + money2(inc - exp) + " profit · tax year " + ty;
        })(),
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

  /* ================= INCOME & EXPENSE LEDGER ================= */

  var taxYearFilter = "all";
  var pendingImport = [];

  function money2(n) {
    return "£" + Number(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // UK tax year: 6 April – 5 April. "2026/27" starts 2026-04-06.
  function taxYearOf(dateISO) {
    if (!dateISO) return "—";
    var y = Number(dateISO.slice(0, 4));
    var start = y + "-04-06";
    return dateISO >= start
      ? y + "/" + String(y + 1).slice(2)
      : (y - 1) + "/" + String(y).slice(2);
  }

  async function renderLedger() {
    var tbody = document.querySelector("#ledger-table tbody");
    if (!tbody) return;

    var rows = await PortalStore.getLedger();

    // Tax-year dropdown (keep the current pick across re-renders)
    var years = [];
    rows.forEach(function (r) {
      var ty = taxYearOf(r.date);
      if (years.indexOf(ty) === -1) years.push(ty);
    });
    years.sort().reverse();
    var sel = el("tax-year");
    sel.innerHTML = '<option value="all">All</option>' + years.map(function (y) {
      return '<option value="' + y + '">' + y + "</option>";
    }).join("");
    if (taxYearFilter !== "all" && years.indexOf(taxYearFilter) === -1) taxYearFilter = "all";
    sel.value = taxYearFilter;

    var visible = rows.filter(function (r) {
      return taxYearFilter === "all" || taxYearOf(r.date) === taxYearFilter;
    });

    tbody.innerHTML = visible.map(function (r) {
      var amount = r.kind === "expense"
        ? '<span class="tx-out">−' + money2(r.amount) + "</span>"
        : '<span class="tx-in">+' + money2(r.amount) + "</span>";
      var action = r.source === "invoice"
        ? '<span class="t-meta">invoice</span>'
        : '<button class="row-btn" type="button" data-edit-tx="' + esc(r.id) + '">Edit</button>';
      return "<tr>" +
        "<td>" + fmtDate(r.date) + "</td>" +
        "<td>" + esc(r.description) + "</td>" +
        "<td>" + esc(r.category) + "</td>" +
        "<td>" + esc(r.client || "—") + "</td>" +
        '<td class="num">' + amount + "</td>" +
        "<td>" + action + "</td>" +
        "</tr>";
    }).join("") || '<tr><td colspan="6" class="empty-note">Nothing recorded yet.</td></tr>';

    var income = visible.filter(function (r) { return r.kind === "income"; })
      .reduce(function (t, r) { return t + r.amount; }, 0);
    var expenses = visible.filter(function (r) { return r.kind === "expense"; })
      .reduce(function (t, r) { return t + r.amount; }, 0);
    var profit = income - expenses;

    renderMonthly(visible);

    el("ledger-totals").innerHTML =
      '<div class="stat"><span class="stat-label">Income</span><span class="stat-value">' +
      money2(income) + '</span><span class="stat-sub">' +
      (taxYearFilter === "all" ? "all time" : "tax year " + taxYearFilter) + "</span></div>" +
      '<div class="stat"><span class="stat-label">Expenses</span><span class="stat-value">' +
      money2(expenses) + '</span><span class="stat-sub">' +
      visible.filter(function (r) { return r.kind === "expense"; }).length + " entries</span></div>" +
      '<div class="stat"><span class="stat-label">Profit</span><span class="stat-value' +
      (profit < 0 ? " accent" : "") + '">' + money2(profit) +
      '</span><span class="stat-sub">income minus expenses</span></div>';
  }

  // Month-by-month: income vs expense bars + profit, oldest first so the
  // trend reads left-to-right like a season.
  function renderMonthly(rows) {
    var panel = el("monthly-panel");
    if (!panel) return;

    var months = {};
    rows.forEach(function (r) {
      var key = r.date.slice(0, 7);                     // YYYY-MM
      if (!months[key]) months[key] = { income: 0, expense: 0 };
      months[key][r.kind === "income" ? "income" : "expense"] += r.amount;
    });

    var keys = Object.keys(months).sort();
    panel.hidden = keys.length === 0;
    if (!keys.length) return;

    var max = 0;
    keys.forEach(function (k) {
      max = Math.max(max, months[k].income, months[k].expense);
    });

    var bestKey = null, bestProfit = -Infinity;
    keys.forEach(function (k) {
      var profit = months[k].income - months[k].expense;
      if (profit > bestProfit) { bestProfit = profit; bestKey = k; }
    });

    var MN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    el("monthly-breakdown").innerHTML = keys.map(function (k) {
      var m = months[k];
      var profit = m.income - m.expense;
      var label = MN[Number(k.slice(5, 7)) - 1] + " " + k.slice(0, 4);
      return '<div class="month-row">' +
        '<span class="month-name">' + label +
        (keys.length > 1 && k === bestKey ? ' <span class="pbadge">Best</span>' : "") + "</span>" +
        '<div class="month-bars" aria-hidden="true">' +
        '<div class="mbar mbar-in" style="width:' + (max ? (m.income / max * 100).toFixed(1) : 0) + '%"></div>' +
        '<div class="mbar mbar-out" style="width:' + (max ? (m.expense / max * 100).toFixed(1) : 0) + '%"></div>' +
        "</div>" +
        '<div class="month-nums">' +
        '<span class="m-in">+' + money2(m.income) + "</span>" +
        '<span class="m-out">−' + money2(m.expense) + "</span>" +
        '<strong class="m-profit' + (profit < 0 ? " is-loss" : "") + '">' + money2(profit) + "</strong>" +
        "</div></div>";
    }).join("");
  }

  /* ---- CSV: parse, import, export ---- */

  function parseCSV(text) {
    var rows = [], row = [], field = "", inQ = false, i, ch;
    for (i = 0; i < text.length; i++) {
      ch = text[i];
      if (inQ) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQ = false;
        } else field += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ",") { row.push(field); field = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(field); field = "";
        if (row.length > 1 || row[0] !== "") rows.push(row);
        row = [];
      } else field += ch;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  // Accepts YYYY-MM-DD or DD/MM/YYYY (UK day-first)
  function normDate(s) {
    s = String(s).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    var m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (m) {
      return m[3] + "-" + String(m[2]).padStart(2, "0") + "-" + String(m[1]).padStart(2, "0");
    }
    return null;
  }

  function mapCsv(rows) {
    if (!rows.length) return { rows: [], bad: 0 };
    var head = rows[0].map(function (h) { return h.trim().toLowerCase(); });
    function col(names) {
      for (var i = 0; i < head.length; i++) {
        if (names.indexOf(head[i]) !== -1) return i;
      }
      return -1;
    }
    var cDate = col(["date", "transaction date", "when"]);
    var cDesc = col(["description", "desc", "details", "item", "narrative", "memo"]);
    var cAmount = col(["amount", "value", "total", "amount (£)", "gbp"]);
    var cKind = col(["type", "kind", "in/out", "direction"]);
    var cCat = col(["category", "cat"]);
    if (cDate === -1 || cAmount === -1) return { error: "Couldn't find Date and Amount columns in the header row." };

    var out = [], bad = 0;
    rows.slice(1).forEach(function (r) {
      var date = normDate(r[cDate]);
      var amount = parseFloat(String(r[cAmount]).replace(/[£,\s]/g, ""));
      if (!date || isNaN(amount) || amount === 0) { bad++; return; }
      var kind;
      if (cKind !== -1 && r[cKind]) {
        var k = String(r[cKind]).trim().toLowerCase();
        kind = (k.indexOf("in") === 0 || k === "credit") ? "income" : "expense";
      } else {
        kind = amount < 0 ? "expense" : "income";
      }
      out.push({
        date: date,
        description: cDesc !== -1 ? String(r[cDesc]).trim() : "Imported entry",
        amount: Math.abs(amount),
        kind: kind,
        category: cCat !== -1 && r[cCat] ? String(r[cCat]).trim() : (kind === "income" ? "Other income" : "Other expense")
      });
    });
    return { rows: out, bad: bad };
  }

  function ledgerCsv(rows) {
    function cell(v) {
      v = String(v == null ? "" : v);
      return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    }
    var lines = ["Date,Tax year,Type,Category,Description,Client,Source,Amount"];
    rows.forEach(function (r) {
      lines.push([r.date, taxYearOf(r.date), r.kind, r.category, r.description,
        r.client, r.source, (r.kind === "expense" ? "-" : "") + r.amount.toFixed(2)
      ].map(cell).join(","));
    });
    return lines.join("\r\n");
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

  /* ================= CONTENT PLANNER ================= */

  function renderPosts(data) {
    var host = el("post-list");
    if (!host) return;

    var projectTitle = {};
    data.projects.forEach(function (p) { projectTitle[p.id] = p.title; });

    var posts = (data.posts || []).slice().sort(function (a, b) {
      return (a.date || "9999") < (b.date || "9999") ? -1 : 1;
    });
    var live = posts.filter(function (p) { return p.status !== "Posted"; });
    var posted = posts.filter(function (p) { return p.status === "Posted"; });

    function row(po) {
      var statusSel = '<select class="post-status" data-post-status="' + esc(po.id) + '" aria-label="Status of ' + esc(po.title) + '">' +
        PortalStore.POST_STATUSES.map(function (s) {
          return "<option" + (s === po.status ? " selected" : "") + ">" + esc(s) + "</option>";
        }).join("") + "</select>";
      var media = po.mediaLink
        ? '<a class="btn btn-ghost btn-mini" href="' + esc(po.mediaLink) + '" target="_blank" rel="noopener">Open media</a>'
        : '<span class="t-meta">no media yet</span>';
      return '<div class="post-row' + (po.status === "Posted" ? " is-done" : "") + '">' +
        '<span class="post-when">' + fmtDate(po.date) + (po.time ? " · " + esc(po.time) : "") + "</span>" +
        "<div><button class='row-btn t-title' type='button' data-edit-post='" + esc(po.id) + "'>" +
        esc(po.title) + "</button>" +
        '<div class="t-meta">' + esc(po.platform) +
        (po.projectId && projectTitle[po.projectId] ? " · " + esc(projectTitle[po.projectId]) : "") +
        (po.notes ? " · " + esc(po.notes) : "") + "</div></div>" +
        '<div class="post-actions">' + media + statusSel + "</div>" +
        "</div>";
    }

    host.innerHTML = (live.map(row).join("") + posted.map(row).join("")) ||
      '<p class="empty-note">Nothing planned yet — add your first post below.</p>';
    if (el("posts-count")) {
      var ready = live.filter(function (p) { return p.status === "Ready"; }).length;
      el("posts-count").textContent = live.length
        ? "(" + live.length + " planned" + (ready ? " · " + ready + " ready" : "") + ")"
        : "";
    }
  }

  var postDialog = el("post-dialog");
  var postForm = el("post-form");

  window.AdminEditPost = async function (postId) {
    if (!postDialog) return;
    var po = await PortalStore.getPost(postId);
    if (!po) return;
    var f = postForm;
    el("pod-title").textContent = "Edit post";
    f.elements.id.value = po.id;
    f.elements.title.value = po.title;
    f.elements.platform.value = po.platform;
    f.elements.date.value = po.date;
    f.elements.time.value = po.time || "";
    f.elements.status.value = po.status;
    f.elements.mediaLink.value = po.mediaLink || "";
    f.elements.projectId.value = po.projectId || "";
    f.elements.notes.value = po.notes || "";
    el("pod-delete").hidden = false;
    postDialog.showModal();
  };

  window.AdminAddPost = function (dateISO) {
    if (!postDialog) return;
    postForm.reset();
    el("pod-title").textContent = "Plan a post";
    postForm.elements.id.value = "";
    postForm.elements.date.value = dateISO || todayISO();
    el("pod-delete").hidden = true;
    postDialog.showModal();
  };

  if (postForm) {
    postForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      var f = postForm;
      var fields = {
        title: f.elements.title.value.trim(),
        platform: f.elements.platform.value,
        date: f.elements.date.value,
        time: f.elements.time.value,
        status: f.elements.status.value,
        mediaLink: f.elements.mediaLink.value.trim(),
        projectId: f.elements.projectId.value,
        notes: f.elements.notes.value.trim()
      };
      if (f.elements.id.value) await PortalStore.updatePost(f.elements.id.value, fields);
      else await PortalStore.addPost(fields);
      postDialog.close();
      renderAll();
      if (window.ScheduleRefresh) window.ScheduleRefresh();
    });
    on("pod-delete", "click", async function () {
      var id = postForm.elements.id.value;
      if (id && confirm("Delete this planned post?")) {
        await PortalStore.deletePost(id);
        postDialog.close();
        renderAll();
        if (window.ScheduleRefresh) window.ScheduleRefresh();
      }
    });
  }

  // Inline status change from the planner list
  document.addEventListener("change", async function (e) {
    var sel = e.target.closest("[data-post-status]");
    if (!sel) return;
    await PortalStore.updatePost(sel.dataset.postStatus, { status: sel.value });
    renderAll();
    if (window.ScheduleRefresh) window.ScheduleRefresh();
  });

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
    renderPosts(data);
    renderBell();
    await renderLedger();
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
    ["nt-project", "td-project", "pod-project"].forEach(function (id) {
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
    if ((btn = e.target.closest("[data-edit-post]"))) { window.AdminEditPost(btn.dataset.editPost); return; }

    if ((btn = e.target.closest("[data-edit-tx]"))) {
      var tx = await PortalStore.getTransaction(btn.dataset.editTx);
      if (tx && txDialog) {
        txForm.elements.id.value = tx.id;
        txForm.elements.kind.value = tx.kind;
        fillTxCategories("txd-kind", "txd-cat");
        txForm.elements.date.value = tx.date;
        txForm.elements.description.value = tx.description;
        txForm.elements.category.value = tx.category;
        txForm.elements.amount.value = tx.amount;
        txDialog.showModal();
      }
      return;
    }

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

  /* ================= LEDGER HANDLERS ================= */

  function fillTxCategories(kindSelId, catSelId) {
    var kindSel = el(kindSelId), catSel = el(catSelId);
    if (!kindSel || !catSel) return;
    var current = catSel.value;
    var cats = PortalStore.TX_CATEGORIES[kindSel.value] || [];
    catSel.innerHTML = cats.map(function (c) { return "<option>" + esc(c) + "</option>"; }).join("");
    if (current && cats.indexOf(current) !== -1) catSel.value = current;
  }
  on("ntx-kind", "change", function () { fillTxCategories("ntx-kind", "ntx-cat"); });
  on("txd-kind", "change", function () { fillTxCategories("txd-kind", "txd-cat"); });

  form("add-tx", function (f) {
    return PortalStore.addTransaction({
      kind: f.elements.kind.value,
      date: f.elements.date.value,
      description: f.elements.description.value.trim(),
      category: f.elements.category.value,
      amount: f.elements.amount.value
    });
  });

  on("tax-year", "change", function () {
    taxYearFilter = el("tax-year").value;
    renderLedger();
  });

  on("export-ledger", "click", async function () {
    var rows = (await PortalStore.getLedger()).filter(function (r) {
      return taxYearFilter === "all" || taxYearOf(r.date) === taxYearFilter;
    });
    var blob = new Blob([ledgerCsv(rows)], { type: "text/csv;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "jolero-media-ledger" + (taxYearFilter === "all" ? "" : "-" + taxYearFilter.replace("/", "-")) + ".csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  // CSV file chosen → parse and preview before anything is written
  on("csv-file", "change", function () {
    var input = el("csv-file");
    var preview = el("csv-preview");
    var importBtn = el("csv-import-btn");
    pendingImport = [];
    preview.hidden = false;
    importBtn.hidden = true;

    var file = input.files && input.files[0];
    if (!file) { preview.hidden = true; return; }

    var reader = new FileReader();
    reader.onload = function () {
      var mapped = mapCsv(parseCSV(String(reader.result)));
      if (mapped.error) {
        preview.innerHTML = '<p class="form-error">' + esc(mapped.error) + "</p>";
        return;
      }
      pendingImport = mapped.rows;
      var inc = mapped.rows.filter(function (r) { return r.kind === "income"; }).length;
      var exp = mapped.rows.length - inc;
      var sample = mapped.rows.slice(0, 5).map(function (r) {
        return "<tr><td>" + fmtDate(r.date) + "</td><td>" + esc(r.description) + "</td><td>" +
          esc(r.category) + "</td><td class='num'>" +
          (r.kind === "expense" ? "−" : "+") + money2(r.amount) + "</td></tr>";
      }).join("");
      preview.innerHTML =
        '<p class="hint"><strong>' + mapped.rows.length + " rows ready</strong> — " +
        inc + " income · " + exp + " expense" +
        (mapped.bad ? " · " + mapped.bad + " skipped (bad date or amount)" : "") + "</p>" +
        (sample
          ? '<div class="table-wrap"><table class="ptable"><thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Amount</th></tr></thead><tbody>' +
            sample + "</tbody></table></div>" +
            (mapped.rows.length > 5 ? '<p class="hint">…and ' + (mapped.rows.length - 5) + " more.</p>" : "")
          : "");
      importBtn.hidden = mapped.rows.length === 0;
    };
    reader.readAsText(file);
  });

  on("csv-import-btn", "click", async function () {
    if (!pendingImport.length) return;
    var result = await PortalStore.importTransactions(pendingImport);
    el("csv-preview").innerHTML = '<p class="hint"><strong>Done.</strong> ' +
      result.added + " imported" +
      (result.duplicates ? ", " + result.duplicates + " skipped as duplicates already in the ledger" : "") + ".</p>";
    el("csv-import-btn").hidden = true;
    el("csv-file").value = "";
    pendingImport = [];
    renderAll();
  });

  /* ---- transaction edit dialog ---- */

  var txDialog = el("tx-dialog");
  var txForm = el("tx-form");

  if (txForm) {
    txForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      await PortalStore.updateTransaction(txForm.elements.id.value, {
        kind: txForm.elements.kind.value,
        date: txForm.elements.date.value,
        description: txForm.elements.description.value.trim(),
        category: txForm.elements.category.value,
        amount: txForm.elements.amount.value
      });
      txDialog.close();
      renderAll();
    });
    on("txd-delete", "click", async function () {
      var id = txForm.elements.id.value;
      if (id && confirm("Delete this entry?")) {
        await PortalStore.deleteTransaction(id);
        txDialog.close();
        renderAll();
      }
    });
  }

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

    if (el("pod-platform")) {
      el("pod-platform").innerHTML = PortalStore.POST_PLATFORMS.map(function (x) { return "<option>" + esc(x) + "</option>"; }).join("");
      el("pod-status").innerHTML = PortalStore.POST_STATUSES.map(function (x) { return "<option>" + esc(x) + "</option>"; }).join("");
    }

    // Ledger form defaults
    fillTxCategories("ntx-kind", "ntx-cat");
    if (el("ntx-date")) el("ntx-date").value = todayISO();

    renderAll();
  })();
})();
