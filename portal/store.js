/* ============================================================
   JOLERO MEDIA PORTAL — store.js (the data layer)

   THE ONLY FILE THAT KNOWS WHERE DATA LIVES.
   Phase 1: seed from data.js, persist edits to localStorage.
   Phase 2: replace the internals of these methods with real API
   calls (they are already async, so no call site changes).

   Pages must never touch JOLERO_SEED or localStorage directly.
   ============================================================ */

(function () {
  "use strict";

  var KEY = "jolero_portal_v1";
  var seed = window.JOLERO_SEED;

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var state = JSON.parse(raw);
        if (state.version === seed.version) return state;
      }
    } catch (e) { /* corrupted or blocked storage — fall through to seed */ }
    var fresh = JSON.parse(JSON.stringify(seed));
    save(fresh);
    return fresh;
  }

  function save(state) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* private mode — edits just won't persist */ }
  }

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function uid(prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  window.PortalStore = {
    STATUSES: seed.statuses.slice(),
    PROJECT_TYPES: seed.projectTypes.slice(),

    /* ---------- reads ---------- */

    getData: async function () {
      return load();
    },

    getClients: async function () {
      return load().clients;
    },

    // Everything the client view needs for one client, in one call
    // (Phase 2: becomes one authenticated API request).
    getClientBundle: async function (clientId) {
      var s = load();
      function mine(x) { return x.clientId === clientId; }
      return {
        client: s.clients.find(function (c) { return c.id === clientId; }) || null,
        projects: s.projects.filter(mine),
        invoices: s.invoices.filter(mine),
        contracts: (s.contracts || []).filter(mine),
        briefs: (s.briefs || []).filter(mine),
        testimonials: (s.testimonials || []).filter(mine),
        activity: s.activity
          .filter(mine)
          .sort(function (a, b) { return b.date < a.date ? -1 : 1; })
      };
    },

    /* ---------- writes ---------- */

    updateProject: async function (projectId, patch) {
      var s = load();
      var p = s.projects.find(function (x) { return x.id === projectId; });
      if (!p) return null;

      var oldStatus = p.status;
      Object.keys(patch).forEach(function (k) { p[k] = patch[k]; });

      // A status change posts an update to that client's feed
      if (patch.status && patch.status !== oldStatus) {
        var text =
          patch.status === "Delivered" ? "Your delivery is ready — " + p.title :
          patch.status === "Review" ? "An edit is ready for your review — " + p.title :
          p.title + " moved to " + patch.status;
        s.activity.push({ id: uid("a"), clientId: p.clientId, date: todayISO(), text: text });
      }

      save(s);
      return p;
    },

    addProject: async function (fields) {
      var s = load();
      var p = {
        id: uid("p"),
        clientId: fields.clientId,
        title: fields.title,
        type: fields.type,
        status: fields.status || "Booked",
        shootDate: fields.shootDate || "",
        deadline: fields.deadline || "",
        reviewLink: "",
        deliveryLink: "",
        notes: fields.notes || ""
      };
      s.projects.push(p);
      s.activity.push({ id: uid("a"), clientId: p.clientId, date: todayISO(), text: "New project booked — " + p.title });
      save(s);
      return p;
    },

    addClient: async function (fields) {
      var s = load();
      var c = {
        id: uid("c"),
        name: fields.name,
        kind: fields.kind || "",
        contactName: fields.contactName || "",
        email: fields.email || "",
        phone: fields.phone || ""
      };
      s.clients.push(c);
      save(s);
      return c;
    },

    /* ---------- Phase 4: contracts ---------- */

    addContract: async function (fields) {
      var s = load();
      var ct = {
        id: uid("ct"),
        clientId: fields.clientId,
        projectId: fields.projectId || "",
        title: fields.title,
        status: "awaiting_signature",
        sentDate: todayISO(),
        signedDate: "",
        signerName: "",
        body: fields.body || ""
      };
      s.contracts.push(ct);
      s.activity.push({ id: uid("a"), clientId: ct.clientId, date: todayISO(), text: "A contract is ready to sign — " + ct.title });
      save(s);
      return ct;
    },

    // Phase 2 upgrades this to a real e-sign flow with identity + audit trail;
    // for now the client types their name as a mock signature.
    signContract: async function (contractId, signerName) {
      var s = load();
      var ct = s.contracts.find(function (x) { return x.id === contractId; });
      if (!ct || ct.status === "signed") return ct || null;
      ct.status = "signed";
      ct.signedDate = todayISO();
      ct.signerName = signerName;
      var client = s.clients.find(function (c) { return c.id === ct.clientId; });
      notify(s, "Contract signed — " + ct.title + (client ? " (" + client.name + ")" : ""));
      save(s);
      return ct;
    },

    /* ---------- Phase 4: pre-shoot briefs ---------- */

    requestBrief: async function (projectId) {
      var s = load();
      var p = s.projects.find(function (x) { return x.id === projectId; });
      if (!p) return null;
      var existing = s.briefs.find(function (b) { return b.projectId === projectId; });
      if (existing) return existing;
      var b = {
        id: uid("b"),
        clientId: p.clientId,
        projectId: projectId,
        status: "requested",
        requestedDate: todayISO(),
        submittedDate: "",
        answers: null
      };
      s.briefs.push(b);
      s.activity.push({ id: uid("a"), clientId: p.clientId, date: todayISO(), text: "Pre-shoot brief requested — " + p.title });
      save(s);
      return b;
    },

    submitBrief: async function (briefId, answers) {
      var s = load();
      var b = s.briefs.find(function (x) { return x.id === briefId; });
      if (!b) return null;
      b.status = "submitted";
      b.submittedDate = todayISO();
      b.answers = answers;
      var p = s.projects.find(function (x) { return x.id === b.projectId; });
      notify(s, "Pre-shoot brief submitted — " + (p ? p.title : "project"));
      save(s);
      return b;
    },

    /* ---------- Phase 4: testimonials ---------- */

    addTestimonial: async function (fields) {
      var s = load();
      var t = {
        id: uid("t"),
        clientId: fields.clientId,
        projectId: fields.projectId,
        rating: fields.rating,
        quote: fields.quote || "",
        allowPublic: !!fields.allowPublic,
        date: todayISO()
      };
      s.testimonials.push(t);
      var client = s.clients.find(function (c) { return c.id === t.clientId; });
      var p = s.projects.find(function (x) { return x.id === t.projectId; });
      notify(s, "New " + t.rating + "★ review from " + (client ? client.name : "a client") + (p ? " — " + p.title : ""));
      save(s);
      return t;
    },

    /* ---------- Accounting: invoices ---------- */

    addInvoice: async function (fields) {
      var s = load();
      var inv = {
        id: uid("inv"),
        clientId: fields.clientId,
        number: fields.number,
        amount: Number(fields.amount) || 0,
        status: "unpaid",
        issued: fields.issued || todayISO(),
        due: fields.due || ""
      };
      s.invoices.push(inv);
      s.activity.push({ id: uid("a"), clientId: inv.clientId, date: todayISO(), text: "New invoice " + inv.number + " added" });
      save(s);
      return inv;
    },

    toggleInvoice: async function (invoiceId) {
      var s = load();
      var inv = s.invoices.find(function (x) { return x.id === invoiceId; });
      if (!inv) return null;
      inv.status = inv.status === "paid" ? "unpaid" : "paid";
      if (inv.status === "paid") {
        inv.paidDate = todayISO();   // becomes the income date in the ledger
        notify(s, "Invoice " + inv.number + " marked paid");
      } else {
        inv.paidDate = "";
      }
      save(s);
      return inv;
    },

    /* ---------- Accounting: income & expense ledger ----------
       The ledger = paid invoices (income, automatic) + the transactions
       collection (manual + CSV imports). Phase 2 can point this at real
       bank/accounting data without any page changes. */

    TX_CATEGORIES: JSON.parse(JSON.stringify(seed.txCategories || { income: [], expense: [] })),

    getLedger: async function () {
      var s = load();
      var clientName = {};
      s.clients.forEach(function (c) { clientName[c.id] = c.name; });

      var rows = [];

      s.invoices.forEach(function (inv) {
        if (inv.status !== "paid") return;
        rows.push({
          id: "inv:" + inv.id,
          source: "invoice",
          kind: "income",
          date: inv.paidDate || inv.due || inv.issued,
          description: "Invoice " + inv.number,
          category: "Shoots & retainers",
          client: clientName[inv.clientId] || "",
          amount: inv.amount
        });
      });

      (s.transactions || []).forEach(function (tx) {
        rows.push({
          id: tx.id,
          source: "manual",
          kind: tx.kind,
          date: tx.date,
          description: tx.description,
          category: tx.category,
          client: clientName[tx.clientId] || "",
          amount: tx.amount
        });
      });

      return rows.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    },

    getTransaction: async function (txId) {
      return (load().transactions || []).find(function (x) { return x.id === txId; }) || null;
    },

    addTransaction: async function (fields) {
      var s = load();
      var tx = {
        id: uid("tx"),
        kind: fields.kind === "income" ? "income" : "expense",
        date: fields.date,
        description: fields.description,
        category: fields.category || "Other",
        amount: Math.abs(Number(fields.amount)) || 0,
        clientId: fields.clientId || ""
      };
      s.transactions.push(tx);
      save(s);
      return tx;
    },

    updateTransaction: async function (txId, patch) {
      var s = load();
      var tx = (s.transactions || []).find(function (x) { return x.id === txId; });
      if (!tx) return null;
      Object.keys(patch).forEach(function (k) { tx[k] = patch[k]; });
      tx.amount = Math.abs(Number(tx.amount)) || 0;
      save(s);
      return tx;
    },

    deleteTransaction: async function (txId) {
      var s = load();
      s.transactions = (s.transactions || []).filter(function (x) { return x.id !== txId; });
      save(s);
    },

    // Bulk CSV import. Skips rows identical (date+description+amount+kind)
    // to something already recorded, so re-importing a file is safe.
    importTransactions: async function (rows) {
      var s = load();
      var seen = {};
      (s.transactions || []).forEach(function (t) {
        seen[t.date + "|" + t.description.toLowerCase() + "|" + t.amount + "|" + t.kind] = true;
      });
      var added = 0, duplicates = 0;
      rows.forEach(function (r) {
        var key = r.date + "|" + String(r.description).toLowerCase() + "|" + r.amount + "|" + r.kind;
        if (seen[key]) { duplicates++; return; }
        seen[key] = true;
        s.transactions.push({
          id: uid("tx"),
          kind: r.kind,
          date: r.date,
          description: r.description,
          category: r.category || "Other",
          amount: Math.abs(Number(r.amount)) || 0,
          clientId: ""
        });
        added++;
      });
      if (added) notify(s, "Imported " + added + " transaction(s) from spreadsheet");
      save(s);
      return { added: added, duplicates: duplicates };
    },

    /* ---------- Schedule: standalone events ---------- */

    EVENT_TYPES: (seed.eventTypes || []).slice(),

    addEvent: async function (fields) {
      var s = load();
      var ev = {
        id: uid("ev"),
        title: fields.title,
        type: fields.type || "Other",
        date: fields.date,
        time: fields.time || "",
        endTime: fields.endTime || "",
        notes: fields.notes || "",
        clientId: fields.clientId || ""
      };
      s.events.push(ev);
      save(s);
      return ev;
    },

    updateEvent: async function (eventId, patch) {
      var s = load();
      var ev = (s.events || []).find(function (x) { return x.id === eventId; });
      if (!ev) return null;
      Object.keys(patch).forEach(function (k) { ev[k] = patch[k]; });
      save(s);
      return ev;
    },

    deleteEvent: async function (eventId) {
      var s = load();
      s.events = (s.events || []).filter(function (x) { return x.id !== eventId; });
      save(s);
    },

    getEvent: async function (eventId) {
      return (load().events || []).find(function (x) { return x.id === eventId; }) || null;
    },

    /* ---------- Schedule: tasks ---------- */

    TASK_TYPES: (seed.taskTypes || []).slice(),

    getTask: async function (taskId) {
      return (load().tasks || []).find(function (x) { return x.id === taskId; }) || null;
    },

    updateTask: async function (taskId, patch) {
      var s = load();
      var t = (s.tasks || []).find(function (x) { return x.id === taskId; });
      if (!t) return null;
      Object.keys(patch).forEach(function (k) { t[k] = patch[k]; });
      save(s);
      return t;
    },

    getTasks: async function () {
      return (load().tasks || []).slice().sort(function (a, b) {
        return (a.due || "9999") < (b.due || "9999") ? -1 : 1;
      });
    },

    addTask: async function (fields) {
      var s = load();
      var t = {
        id: uid("tk"),
        title: fields.title,
        type: fields.type || "Other",
        due: fields.due || "",
        projectId: fields.projectId || "",
        done: false
      };
      s.tasks.push(t);
      save(s);
      return t;
    },

    toggleTask: async function (taskId) {
      var s = load();
      var t = (s.tasks || []).find(function (x) { return x.id === taskId; });
      if (!t) return null;
      t.done = !t.done;
      save(s);
      return t;
    },

    deleteTask: async function (taskId) {
      var s = load();
      s.tasks = (s.tasks || []).filter(function (x) { return x.id !== taskId; });
      save(s);
    },

    /* ---------- Schedule: unified calendar feed ----------
       Everything that lands on a date, from every collection, so shoot
       days and portal deadlines appear without being re-entered.
       PHASE 2: this is the method real Google Calendar sync plugs into —
       swap the body for an API call and every view follows. */

    getScheduleEvents: async function () {
      var s = load();
      var clientName = {};
      s.clients.forEach(function (c) { clientName[c.id] = c.name; });

      var events = [];

      (s.events || []).forEach(function (e) {
        events.push({
          kind: "event", date: e.date,
          time: e.time || "", endTime: e.endTime || "",
          title: e.title, label: e.type,
          sub: e.notes || (clientName[e.clientId] || ""),
          eventId: e.id
        });
      });

      s.projects.forEach(function (p) {
        if (p.shootDate) events.push({
          kind: "shoot", date: p.shootDate,
          title: p.title, label: "Shoot",
          sub: clientName[p.clientId] || "", projectId: p.id
        });
        if (p.deadline) events.push({
          kind: "deadline", date: p.deadline,
          title: p.title, label: "Delivery due",
          sub: clientName[p.clientId] || "", projectId: p.id
        });
      });

      (s.tasks || []).forEach(function (t) {
        if (!t.due) return;
        events.push({
          kind: "task", date: t.due,
          title: t.title, label: t.type,
          sub: t.projectId ? (function () {
            var p = s.projects.find(function (x) { return x.id === t.projectId; });
            return p ? p.title : "";
          })() : "",
          taskId: t.id, done: t.done
        });
      });

      s.invoices.forEach(function (i) {
        if (i.status !== "unpaid" || !i.due) return;
        events.push({
          kind: "invoice", date: i.due,
          title: i.number, label: "Invoice due",
          sub: clientName[i.clientId] || ""
        });
      });

      // Date first, then timed entries in clock order ahead of all-day ones
      return events.sort(function (a, b) {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
        return (a.time || "99:99") < (b.time || "99:99") ? -1 : 1;
      });
    },

    /* ---------- Phase 4: admin notifications ---------- */

    getNotifications: async function () {
      return (load().notifications || []).slice().sort(function (a, b) { return b.date < a.date ? -1 : 1; });
    },

    markNotificationsRead: async function () {
      var s = load();
      (s.notifications || []).forEach(function (n) { n.read = true; });
      save(s);
    },

    // Wipe local edits and go back to the seed data
    resetDemo: async function () {
      try { localStorage.removeItem(KEY); } catch (e) {}
      return load();
    }
  };

  // Internal: client actions surface on the admin bell (Phase 3 also emails)
  function notify(state, text) {
    state.notifications.push({ id: uid("n"), date: todayISO(), text: text, read: false });
  }

  /* ---------- shared formatting helpers ---------- */

  window.PortalUtil = {
    esc: function (str) {
      return String(str == null ? "" : str)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    },
    fmtDate: function (iso) {
      if (!iso) return "—";
      var d = new Date(iso + "T00:00:00");
      if (isNaN(d)) return iso;
      var opts = { day: "numeric", month: "short" };
      if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
      return d.toLocaleDateString("en-GB", opts);
    },
    fmtMoney: function (n) {
      return "£" + Number(n).toLocaleString("en-GB");
    }
  };
})();
