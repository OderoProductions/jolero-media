/* ============================================================
   RE.PLAYS PORTAL — store.js (the data layer)

   THE ONLY FILE THAT KNOWS WHERE DATA LIVES.
   Phase 1: seed from data.js, persist edits to localStorage.
   Phase 2: replace the internals of these methods with real API
   calls (they are already async, so no call site changes).

   Pages must never touch REPLAYS_SEED or localStorage directly.
   ============================================================ */

(function () {
  "use strict";

  var KEY = "replays_portal_v1";
  var seed = window.REPLAYS_SEED;

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
