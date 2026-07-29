/* ============================================================
   JOLERO MEDIA PORTAL — store.js  (Supabase-backed)

   THE ONLY FILE THAT KNOWS WHERE DATA LIVES. Every page goes through
   PortalStore and none of them know the records moved from browser
   storage into Postgres — which is the whole reason that move touched
   only this file.

   The dropdown lists (statuses, project types, accounting categories)
   still come from data.js. Those are configuration, not data: putting
   them in the database would mean a round trip to reword a label.

   SECURITY, IN ONE LINE
   Nothing in this file enforces anything. Every request carries the
   signed-in person's token and the DATABASE decides what comes back:
   an admin sees everything, a client sees only rows carrying their own
   client_id, and the accounting, calendar, tasks, content planner and
   notifications have no client policy at all, so they do not exist as
   far as a client is concerned. The rules live in supabase/schema.sql.

   THE CACHE
   Pages call getData() constantly, so a full snapshot is fetched once
   and held in memory. Any write clears it and the next read re-fetches.
   That is deliberately blunt: at this size correctness is worth more
   than saving requests, and it makes stale-data bugs structurally
   impossible rather than merely unlikely.
   ============================================================ */

(function () {
  "use strict";

  var seed = window.JOLERO_SEED || {};

  /* Tables that make up a full snapshot. */
  var TABLES = [
    "clients", "projects", "invoices", "contracts", "briefs",
    "testimonials", "activity", "transactions", "events", "tasks",
    "posts", "notifications"
  ];

  /* ---------- naming ----------
     Postgres columns are snake_case, the app has always used camelCase.
     Convert generically rather than maintaining a field map, which
     would drift the moment a column is added. */

  function camel(s) { return s.replace(/_([a-z])/g, function (_, c) { return c.toUpperCase(); }); }
  function snake(s) { return s.replace(/[A-Z]/g, function (c) { return "_" + c.toLowerCase(); }); }

  function toApp(row) {
    if (!row || typeof row !== "object") return row;
    var out = {};
    Object.keys(row).forEach(function (k) {
      // null becomes "" so the UI's truthiness checks behave exactly as
      // they did when this came out of localStorage
      out[camel(k)] = row[k] === null ? "" : row[k];
    });
    return out;
  }

  function toDb(obj) {
    var out = {};
    Object.keys(obj).forEach(function (k) {
      if (k === "id" || k === "createdAt") return;         // never write these
      var v = obj[k];
      out[snake(k)] = v === "" ? null : v;                 // "" is not a valid date or uuid
    });
    return out;
  }

  /* ---------- REST ---------- */

  function cfg() { return window.SUPABASE_CONFIG || { url: "", anonKey: "" }; }

  async function authHeaders(extra) {
    var token = window.PortalAuth ? await window.PortalAuth.getToken() : null;
    if (!token) throw new Error("Not signed in.");
    return Object.assign({
      "apikey": cfg().anonKey,
      "Authorization": "Bearer " + token,
      "Content-Type": "application/json",
      "Accept": "application/json"
    }, extra || {});
  }

  async function rest(path, options) {
    options = options || {};
    var res = await fetch(cfg().url + "/rest/v1" + path, {
      method: options.method || "GET",
      headers: await authHeaders(options.headers),
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
    var text = await res.text();
    var json = text ? JSON.parse(text) : null;
    if (!res.ok) {
      throw new Error((json && (json.message || json.hint)) || ("Request failed (" + res.status + ")"));
    }
    return json;
  }

  function selectAll(table) { return rest("/" + table + "?select=*"); }

  async function insert(table, row) {
    var out = await rest("/" + table, {
      method: "POST",
      headers: { "Prefer": "return=representation" },
      body: toDb(row)
    });
    return toApp(out && out[0]);
  }

  async function update(table, id, patch) {
    var out = await rest("/" + table + "?id=eq." + encodeURIComponent(id), {
      method: "PATCH",
      headers: { "Prefer": "return=representation" },
      body: toDb(patch)
    });
    return toApp(out && out[0]);
  }

  function remove(table, id) {
    return rest("/" + table + "?id=eq." + encodeURIComponent(id), { method: "DELETE" });
  }

  /* The three things a client may change go through database functions
     that re-check ownership — schema.sql section 5. */
  function rpc(fn, args) {
    return rest("/rpc/" + fn, { method: "POST", body: args });
  }

  /* ---------- snapshot ---------- */

  var cache = null;
  var inFlight = null;

  async function fetchAll() {
    var results = await Promise.all(TABLES.map(selectAll));
    var state = {
      statuses: seed.statuses || [],
      projectTypes: seed.projectTypes || [],
      taskTypes: seed.taskTypes || [],
      eventTypes: seed.eventTypes || [],
      postPlatforms: seed.postPlatforms || [],
      postStatuses: seed.postStatuses || [],
      txCategories: seed.txCategories || { income: [], expense: [] }
    };
    TABLES.forEach(function (t, i) {
      state[t] = (results[i] || []).map(toApp);
    });
    // Feeds read newest-first.
    state.activity.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    state.notifications.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    return state;
  }

  /* Concurrent callers share one fetch rather than each firing twelve
     requests — several panels render at once on the dashboard. */
  function ready() {
    if (cache) return Promise.resolve(cache);
    if (!inFlight) {
      inFlight = fetchAll().then(function (s) {
        cache = s; inFlight = null; return s;
      }, function (e) {
        inFlight = null; throw e;
      });
    }
    return inFlight;
  }

  function invalidate() { cache = null; }

  function todayISO() { return new Date().toISOString().slice(0, 10); }

  async function notify(text) {
    // a missing notification must never fail the real action
    try { await insert("notifications", { date: todayISO(), text: text, read: false }); } catch (e) {}
  }

  async function logActivity(clientId, text) {
    if (!clientId) return;
    try { await insert("activity", { clientId: clientId, date: todayISO(), text: text }); } catch (e) {}
  }

  /* ============================================================
     Public API — identical to the local-storage version, which is
     why no page needed editing.
     ============================================================ */

  window.PortalStore = {

    STATUSES: seed.statuses || [],
    PROJECT_TYPES: seed.projectTypes || [],
    TASK_TYPES: seed.taskTypes || [],
    EVENT_TYPES: seed.eventTypes || [],
    POST_PLATFORMS: seed.postPlatforms || [],
    POST_STATUSES: seed.postStatuses || [],
    TX_CATEGORIES: seed.txCategories || { income: [], expense: [] },

    refresh: function () { invalidate(); return ready(); },

    getData: function () { return ready(); },

    getClients: async function () {
      return (await ready()).clients;
    },

    getClientBundle: async function (clientId) {
      var s = await ready();
      function mine(x) { return x.clientId === clientId; }
      return {
        client: s.clients.find(function (c) { return c.id === clientId; }) || null,
        projects: s.projects.filter(mine),
        invoices: s.invoices.filter(mine),
        contracts: s.contracts.filter(mine),
        briefs: s.briefs.filter(mine),
        testimonials: s.testimonials.filter(mine),
        activity: s.activity
          .filter(mine)
          .sort(function (a, b) { return b.date < a.date ? -1 : 1; })
      };
    },

    /* ---------- projects ---------- */

    updateProject: async function (projectId, patch) {
      var s = await ready();
      var before = s.projects.find(function (x) { return x.id === projectId; });
      if (!before) return null;

      var row = await update("projects", projectId, patch);

      // A status change posts an update to that client's feed
      if (patch.status && patch.status !== before.status) {
        var text =
          patch.status === "Delivered" ? "Your delivery is ready — " + before.title :
          patch.status === "Review" ? "An edit is ready for your review — " + before.title :
          before.title + " moved to " + patch.status;
        await logActivity(before.clientId, text);
      }

      invalidate();
      return row;
    },

    addProject: async function (p) {
      var row = await insert("projects", p);
      invalidate();
      return row;
    },

    addClient: async function (c) {
      var row = await insert("clients", c);
      invalidate();
      return row;
    },

    /* ---------- contracts ---------- */

    addContract: async function (ct) {
      var row = await insert("contracts", Object.assign({ status: "sent", sentDate: todayISO() }, ct));
      invalidate();
      return row;
    },

    // Client action: the database function re-checks the contract is
    // theirs and unsigned, then records it.
    signContract: async function (contractId, signerName) {
      var row = await rpc("sign_contract", { p_contract_id: contractId, p_signer_name: signerName });
      invalidate();
      return toApp(row);
    },

    /* ---------- briefs ---------- */

    requestBrief: async function (clientId, projectId) {
      var row = await insert("briefs", {
        clientId: clientId,
        projectId: projectId || "",
        status: "requested",
        requestedDate: todayISO()
      });
      invalidate();
      return row;
    },

    submitBrief: async function (briefId, answers) {
      var row = await rpc("submit_brief", { p_brief_id: briefId, p_answers: answers });
      invalidate();
      return toApp(row);
    },

    /* ---------- testimonials ---------- */

    addTestimonial: async function (t) {
      var row = await rpc("leave_testimonial", {
        p_project_id: t.projectId,
        p_rating: Number(t.rating),
        p_quote: t.quote || "",
        p_allow_public: !!t.allowPublic
      });
      invalidate();
      return toApp(row);
    },

    /* ---------- invoices ---------- */

    addInvoice: async function (inv) {
      var row = await insert("invoices", Object.assign({ status: "unpaid" }, inv));
      invalidate();
      return row;
    },

    toggleInvoice: async function (invoiceId) {
      var s = await ready();
      var inv = s.invoices.find(function (x) { return x.id === invoiceId; });
      if (!inv) return null;
      var nowPaid = inv.status !== "paid";
      var row = await update("invoices", invoiceId, {
        status: nowPaid ? "paid" : "unpaid",
        paidDate: nowPaid ? todayISO() : ""
      });
      invalidate();
      return row;
    },

    /* ---------- accounting ---------- */

    getLedger: async function () {
      var s = await ready();
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
          amount: Number(inv.amount)
        });
      });

      s.transactions.forEach(function (tx) {
        rows.push({
          id: tx.id,
          source: "manual",
          kind: tx.kind,
          date: tx.date,
          description: tx.description,
          category: tx.category,
          client: clientName[tx.clientId] || "",
          amount: Number(tx.amount)
        });
      });

      return rows.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    },

    getTransaction: async function (id) {
      var s = await ready();
      return s.transactions.find(function (t) { return t.id === id; }) || null;
    },

    addTransaction: async function (tx) {
      var row = await insert("transactions", tx);
      invalidate();
      return row;
    },

    updateTransaction: async function (id, patch) {
      var row = await update("transactions", id, patch);
      invalidate();
      return row;
    },

    deleteTransaction: async function (id) {
      await remove("transactions", id);
      invalidate();
    },

    /* Spreadsheet import. Same duplicate rule as before — same date,
       description, amount and direction counts as already there, so
       re-importing an overlapping statement is safe. */
    importTransactions: async function (rows) {
      var s = await ready();
      var seen = {};
      s.transactions.forEach(function (t) {
        seen[t.date + "|" + String(t.description).toLowerCase() + "|" + Number(t.amount) + "|" + t.kind] = true;
      });

      var fresh = [];
      var duplicates = 0;
      rows.forEach(function (r) {
        var amount = Math.abs(Number(r.amount)) || 0;
        var key = r.date + "|" + String(r.description).toLowerCase() + "|" + amount + "|" + r.kind;
        if (seen[key]) { duplicates++; return; }
        seen[key] = true;
        fresh.push({
          kind: r.kind,
          date: r.date,
          description: r.description,
          category: r.category || "Other",
          amount: amount,
          clientId: ""
        });
      });

      if (fresh.length) {
        // one request for the batch rather than one per row
        await rest("/transactions", { method: "POST", body: fresh.map(toDb) });
        await notify("Imported " + fresh.length + " transaction(s) from spreadsheet");
      }
      invalidate();
      return { added: fresh.length, duplicates: duplicates };
    },

    /* ---------- calendar ---------- */

    getEvent: async function (id) {
      var s = await ready();
      return s.events.find(function (e) { return e.id === id; }) || null;
    },

    addEvent: async function (e) {
      var row = await insert("events", e);
      invalidate();
      return row;
    },

    updateEvent: async function (id, patch) {
      var row = await update("events", id, patch);
      invalidate();
      return row;
    },

    deleteEvent: async function (id) {
      await remove("events", id);
      invalidate();
    },

    /* ---------- content planner ---------- */

    getPost: async function (id) {
      var s = await ready();
      return s.posts.find(function (p) { return p.id === id; }) || null;
    },

    addPost: async function (p) {
      var row = await insert("posts", p);
      invalidate();
      return row;
    },

    updatePost: async function (id, patch) {
      var row = await update("posts", id, patch);
      invalidate();
      return row;
    },

    deletePost: async function (id) {
      await remove("posts", id);
      invalidate();
    },

    /* ---------- tasks ---------- */

    getTasks: async function () {
      return (await ready()).tasks;
    },

    getTask: async function (id) {
      var s = await ready();
      return s.tasks.find(function (t) { return t.id === id; }) || null;
    },

    addTask: async function (t) {
      var row = await insert("tasks", t);
      invalidate();
      return row;
    },

    updateTask: async function (id, patch) {
      var row = await update("tasks", id, patch);
      invalidate();
      return row;
    },

    toggleTask: async function (id) {
      var s = await ready();
      var t = s.tasks.find(function (x) { return x.id === id; });
      if (!t) return null;
      var row = await update("tasks", id, { done: !t.done });
      invalidate();
      return row;
    },

    deleteTask: async function (id) {
      await remove("tasks", id);
      invalidate();
    },

    /* ---------- the calendar's combined view ---------- */

    getScheduleEvents: async function () {
      var s = await ready();
      var clientName = {};
      s.clients.forEach(function (c) { clientName[c.id] = c.name; });

      var events = [];

      s.events.forEach(function (e) {
        events.push({
          kind: "event", date: e.date,
          time: e.time || "", endTime: e.endTime || "",
          title: e.title, label: e.type,
          sub: e.notes || (clientName[e.clientId] || ""),
          eventId: e.id
        });
      });

      // Content planner: planned posts land on the calendar too
      s.posts.forEach(function (po) {
        if (!po.date) return;
        events.push({
          kind: "post", date: po.date,
          time: po.time || "",
          title: po.title, label: po.platform,
          sub: po.status,
          postId: po.id,
          done: po.status === "Posted"
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

      s.tasks.forEach(function (t) {
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

    /* ---------- notifications ---------- */

    getNotifications: async function () {
      return (await ready()).notifications;
    },

    markNotificationsRead: async function () {
      var s = await ready();
      if (!s.notifications.some(function (n) { return !n.read; })) return;
      await rest("/notifications?read=eq.false", { method: "PATCH", body: { read: true } });
      invalidate();
    },

    /* ---------- settings ----------
       Admin-only table, so a client gets a 401 here. That is expected
       rather than broken: fall back to the default instead of letting
       one denied request take a page down. */

    getSettings: async function () {
      try {
        var rows = await rest("/settings?select=key,value");
        var out = {};
        (rows || []).forEach(function (r) { out[camel(r.key)] = r.value; });
        return Object.assign({ googleAccount: "" }, out);
      } catch (e) {
        return { googleAccount: "" };
      }
    },

    updateSettings: async function (patch) {
      var keys = Object.keys(patch);
      for (var i = 0; i < keys.length; i++) {
        await rest("/settings", {
          method: "POST",
          headers: { "Prefer": "resolution=merge-duplicates" },
          body: {
            key: snake(keys[i]),
            value: String(patch[keys[i]]),
            updated_at: new Date().toISOString()
          }
        });
      }
      return this.getSettings();
    },

    /* ---------- backup ----------
       Supabase keeps the real backups now, but an export is still worth
       having: it is readable, it is yours, and it doubles as the way to
       lift data out of the old browser-storage version into here. */

    exportAll: async function () {
      return JSON.stringify(await ready(), null, 2);
    },

    /* Restores an export. Old browser-storage backups used ids like
       "c1"/"p3" which are not valid uuids, so rows are re-inserted and
       the new ids mapped as we go — parents first, so children can
       point at them. */
    importAll: async function (json) {
      var incoming = JSON.parse(json);
      if (!incoming || typeof incoming !== "object" || !Array.isArray(incoming.clients)) {
        throw new Error("That doesn't look like a Jolero portal backup.");
      }

      var map = {};            // old id -> new id
      var counts = {};

      async function restore(table, rows, links) {
        counts[table] = 0;
        for (var i = 0; i < (rows || []).length; i++) {
          var row = Object.assign({}, rows[i]);
          var oldId = row.id;
          (links || []).forEach(function (field) {
            if (row[field]) row[field] = map[row[field]] || "";
          });
          delete row.id;
          delete row.createdAt;
          var made = await insert(table, row);
          if (oldId && made && made.id) map[oldId] = made.id;
          counts[table]++;
        }
      }

      await restore("clients", incoming.clients, []);
      await restore("projects", incoming.projects, ["clientId"]);
      await restore("invoices", incoming.invoices, ["clientId"]);
      await restore("contracts", incoming.contracts, ["clientId", "projectId"]);
      await restore("briefs", incoming.briefs, ["clientId", "projectId"]);
      await restore("testimonials", incoming.testimonials, ["clientId", "projectId"]);
      await restore("activity", incoming.activity, ["clientId"]);
      await restore("transactions", incoming.transactions, ["clientId"]);
      await restore("events", incoming.events, ["clientId"]);
      await restore("tasks", incoming.tasks, ["projectId"]);
      await restore("posts", incoming.posts, ["projectId"]);
      await restore("notifications", incoming.notifications, []);

      invalidate();
      return counts;
    },

    /* Deletes every record. The admin pages already make this hard to
       hit by accident (typing ERASE); this just carries it out. */
    resetAll: async function () {
      // children before parents, so foreign keys never block a delete
      var order = [
        "activity", "testimonials", "briefs", "contracts", "invoices",
        "posts", "tasks", "events", "transactions", "notifications",
        "projects", "clients"
      ];
      for (var i = 0; i < order.length; i++) {
        await rest("/" + order[i] + "?id=not.is.null", { method: "DELETE" });
      }
      invalidate();
      return ready();
    }
  };

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
      return "£" + Number(n || 0).toLocaleString("en-GB");
    },

    safeUrl: function (url) {
      /* esc() stops HTML injection but NOT javascript: hrefs — any
         stored link goes through this before it becomes an <a href>.
         Web URLs only; anything else renders as no-link. */
      var s = String(url == null ? "" : url).trim();
      return /^https?:\/\//i.test(s) ? s : "";
    }
  };
})();
