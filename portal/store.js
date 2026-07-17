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
      return {
        client: s.clients.find(function (c) { return c.id === clientId; }) || null,
        projects: s.projects.filter(function (p) { return p.clientId === clientId; }),
        invoices: s.invoices.filter(function (i) { return i.clientId === clientId; }),
        activity: s.activity
          .filter(function (a) { return a.clientId === clientId; })
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

    // Wipe local edits and go back to the seed data
    resetDemo: async function () {
      try { localStorage.removeItem(KEY); } catch (e) {}
      return load();
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
      return "£" + Number(n).toLocaleString("en-GB");
    }
  };
})();
