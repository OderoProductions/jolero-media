/* ============================================================
   JOLERO MEDIA PORTAL — crm.js  (admin/crm.html)

   Who we've reached out to, or mean to. It works like a spreadsheet:
   every cell is editable where it sits, and saves itself when you leave
   it. Only the field that changed is sent, so two people editing different
   things can't overwrite each other. Everything goes through PortalStore,
   and the database only lets an admin near this table.

   Moving someone to Messaged notes today as the last contact and, if no
   follow up is set, pencils one in a week later.

   Import CSV is how a list of new names comes in (the weekly prospect
   list, say). It reads the headings below, in any order, and skips anyone
   already here, matching on Instagram handle and then on name.
     name, type, sport, instagram, followers, email, relationship,
     status, who, follow up, notes, source
   ============================================================ */

(function () {
  "use strict";

  var esc = PortalUtil.esc;
  var seed = window.JOLERO_SEED || {};
  var STATUSES = seed.contactStatuses || [];
  var KINDS = seed.contactKinds || [];
  var TEAM = (seed.team || []).concat("Both");
  var FOLLOW_UP_DAYS = 7;

  var $ = function (id) { return document.getElementById(id); };
  if (!$("crm-rows")) return;

  var contacts = [];
  var statusFilter = "";     // "" for all, "due" for follow ups due, or a status
  var newestId = "";         // a contact just added stays at the top until the next load

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function plusDays(iso, n) {
    var d = new Date(iso + "T12:00:00");
    d.setDate(d.getDate() + n);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  /* ---------- Instagram ----------
     People paste a link, an @handle or a bare handle. Only ever link to
     instagram.com, or to an http(s) address someone typed in full. */

  function igHandle(value) {
    var v = String(value || "").trim();
    var m = /^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([A-Za-z0-9._]{1,30})/i.exec(v);
    if (m) return m[1].toLowerCase();
    m = /^@?([A-Za-z0-9._]{1,30})$/.exec(v);
    return m ? m[1].toLowerCase() : "";
  }
  function igLink(value) {
    var h = igHandle(value);
    return h ? "https://www.instagram.com/" + h + "/" : PortalUtil.safeUrl(String(value || "").trim());
  }

  /* ---------- filling the dropdowns ---------- */

  function options(list, blank) {
    return (blank != null ? '<option value="">' + esc(blank) + "</option>" : "") +
      list.map(function (v) { return "<option>" + esc(v) + "</option>"; }).join("");
  }
  $("crm-kind").innerHTML = options(KINDS, "All types");
  $("crm-who").innerHTML = options(TEAM, "Anyone");

  /* ---------- drawing ---------- */

  function isDue(c) {
    return c.followUp && c.followUp <= todayISO() && c.status !== "Client" && c.status !== "Not now";
  }

  function matches(c) {
    var q = $("crm-search").value.trim().toLowerCase();
    var hay = [c.name, c.sport, c.notes, c.instagram, c.kind, c.email].join(" ").toLowerCase();
    if (q && hay.indexOf(q) === -1) return false;
    if ($("crm-kind").value && c.kind !== $("crm-kind").value) return false;
    if ($("crm-rel").value && c.relationship !== $("crm-rel").value) return false;
    if ($("crm-who").value && c.who !== $("crm-who").value) return false;
    if (statusFilter === "due") return isDue(c);
    if (statusFilter && c.status !== statusFilter) return false;
    return true;
  }

  // what needs doing first: follow ups due, then by where they are, then A to Z
  function order(a, b) {
    return (b.id === newestId ? 1 : 0) - (a.id === newestId ? 1 : 0) || (isDue(b) ? 1 : 0) - (isDue(a) ? 1 : 0) ||
      STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status) ||
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  }

  function renderStats() {
    var chips = [{ key: "", label: "All", n: contacts.length }];
    var due = contacts.filter(isDue).length;
    if (due) chips.push({ key: "due", label: "Follow up due", n: due, hot: true });
    STATUSES.forEach(function (s) {
      chips.push({ key: s, label: s, n: contacts.filter(function (c) { return c.status === s; }).length });
    });
    $("crm-stats").innerHTML = chips.map(function (c) {
      return '<button class="crm-stat' + (c.hot ? " is-hot" : "") + (statusFilter === c.key ? " is-on" : "") +
        '" type="button" data-status="' + esc(c.key) + '" aria-pressed="' + (statusFilter === c.key) + '"><b>' + c.n + "</b>" + esc(c.label) + "</button>";
    }).join("");
  }

  /* ---------- the table ----------
     Built with DOM calls and .value, so nothing anyone types can become
     markup. Rows aren't re-sorted while you edit, or a row would jump out
     from under you: the order refreshes when you filter or reload. */

  function cell(tr, cls) {
    var td = document.createElement("td");
    if (cls) td.className = cls;
    tr.appendChild(td);
    return td;
  }

  function field(tag, c, key, label, attrs) {
    var n = document.createElement(tag);
    n.className = "crm-input";
    n.setAttribute("aria-label", label + " for " + c.name);
    n.setAttribute("data-field", key);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
  }

  function input(c, key, label, attrs) {
    var n = field("input", c, key, label, Object.assign({ type: "text" }, attrs));
    n.value = c[key] == null ? "" : c[key];
    return n;
  }

  function select(c, key, label, list, blank) {
    var n = field("select", c, key, label);
    var value = c[key] == null ? "" : String(c[key]);
    var all = list.slice();
    if (value && all.indexOf(value) === -1) all.push(value);   // an old value still shows
    n.innerHTML = options(all, blank);
    n.value = value;
    return n;
  }

  function fitNotes(t) {
    t.style.height = "auto";
    t.style.height = t.scrollHeight + 2 + "px";
  }

  function igButton(c) {
    var a = document.createElement("a");
    a.className = "crm-open";
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = "↗";
    a.setAttribute("aria-label", "Open Instagram for " + c.name);
    a.title = "Open";
    var link = igLink(c.instagram);
    if (link) a.href = link; else a.hidden = true;
    return a;
  }

  function row(c) {
    var tr = document.createElement("tr");
    tr.setAttribute("data-id", c.id);
    if (isDue(c)) tr.className = "is-due";

    var who = cell(tr);
    who.append(input(c, "name", "Name", { class: "crm-input crm-input-name", maxlength: "120", required: "" }),
      input(c, "email", "Email", { type: "email", class: "crm-input crm-input-sub", placeholder: "Email", maxlength: "200" }));

    var kind = cell(tr);
    kind.append(select(c, "kind", "Type", KINDS, "Type"), select(c, "relationship", "Existing or new", ["New", "Existing"]));

    cell(tr).append(input(c, "sport", "Sport", { maxlength: "80", placeholder: "Sport" }));

    var ig = cell(tr, "crm-ig");
    var igBox = input(c, "instagram", "Instagram", { maxlength: "200", placeholder: "Link or @handle", autocomplete: "off" });
    if (igHandle(c.instagram)) igBox.value = "@" + igHandle(c.instagram);   // a pasted link shows tidily
    ig.append(igBox, igButton(c));

    cell(tr).append(input(c, "followers", "Followers", { type: "number", min: "0", step: "1", class: "crm-input crm-input-num" }));
    cell(tr).append(select(c, "status", "Status", STATUSES));
    cell(tr).append(select(c, "who", "Who's handling it", TEAM, "Anyone"));
    cell(tr).append(input(c, "lastContact", "Last contact", { type: "date" }));
    cell(tr, "crm-follow").append(input(c, "followUp", "Follow up", { type: "date" }));

    var notes = field("textarea", c, "notes", "Notes", { rows: "1", maxlength: "4000", placeholder: "Notes" });
    notes.value = c.notes || "";
    cell(tr).append(notes);

    var del = document.createElement("button");
    del.type = "button";
    del.className = "crm-remove";
    del.textContent = "×";
    del.title = "Delete";
    del.setAttribute("aria-label", "Delete " + c.name);
    del.setAttribute("data-delete", c.id);
    cell(tr, "crm-del").append(del);
    return tr;
  }

  function renderCount(shown) {
    $("crm-count").textContent = shown === contacts.length ? contacts.length : shown + " of " + contacts.length;
  }

  function renderRows() {
    var shown = contacts.filter(matches).sort(order);
    renderCount(shown.length);
    var body = $("crm-rows");
    body.textContent = "";
    shown.forEach(function (c) { body.appendChild(row(c)); });
    body.querySelectorAll("textarea").forEach(fitNotes);
    var empty = $("crm-empty");
    empty.hidden = shown.length > 0;
    empty.textContent = contacts.length ? "Nobody matches that." : "Nobody here yet. Add someone, or import a list.";
  }

  function render() {
    renderStats();
    renderRows();
  }

  function showError(err) {
    var box = $("crm-error");
    if (!err) { box.hidden = true; return; }
    var msg = String((err && err.message) || err);
    box.textContent = /contacts/.test(msg) && /schema cache|does not exist/.test(msg)
      ? "The CRM table isn't in the database yet. Run section 9 of supabase/schema.sql in the Supabase SQL Editor."
      : msg;
    box.hidden = false;
  }

  async function load() {
    try {
      contacts = await PortalStore.getContacts();
      showError(null);
    } catch (err) {
      contacts = [];
      showError(err);
    }
    render();
  }

  /* ---------- editing in the table ---------- */

  function statusPatch(c, status) {
    var patch = { status: status };
    if (status === "Messaged" || status === "Replied" || status === "In talks") patch.lastContact = todayISO();
    if (status === "Messaged" && !c.followUp) patch.followUp = plusDays(todayISO(), FOLLOW_UP_DAYS);
    if (status === "Client" || status === "Not now") patch.followUp = "";
    return patch;
  }

  function showValue(tr, key, value) {
    var n = tr.querySelector('[data-field="' + key + '"]');
    if (n && n !== document.activeElement) n.value = value == null ? "" : value;
  }

  // a green flash on the cell when it has saved
  function flash(n, cls) {
    n.classList.remove("is-saved", "is-failed");
    void n.offsetWidth;
    n.classList.add(cls);
  }

  $("crm-rows").addEventListener("input", function (e) {
    if (e.target.tagName === "TEXTAREA") fitNotes(e.target);
  });

  $("crm-rows").addEventListener("change", async function (e) {
    var n = e.target;
    var key = n.getAttribute("data-field");
    var tr = n.closest("tr");
    if (!key || !tr) return;
    var c = contacts.find(function (x) { return x.id === tr.getAttribute("data-id"); });
    if (!c) return;

    var value = n.value.trim();
    if (key === "name" && !value) { n.value = c.name; return; }   // everyone needs a name
    if (key === "instagram" && igHandle(value)) value = "@" + igHandle(value);
    if (key === "followers") value = value === "" ? "" : Math.max(0, Math.round(Number(value))) || 0;

    var patch = key === "status" ? statusPatch(c, value) : {};
    patch[key] = value;
    try {
      var saved = await PortalStore.updateContact(c.id, patch);
      Object.assign(c, saved);
      Object.keys(patch).forEach(function (k) { showValue(tr, k, c[k]); });
      if (key === "instagram") tr.querySelector(".crm-open").replaceWith(igButton(c));
      tr.classList.toggle("is-due", !!isDue(c));
      renderStats();
      flash(n, "is-saved");
      showError(null);
    } catch (err) {
      flash(n, "is-failed");
      showError(err);
    }
  });

  $("crm-rows").addEventListener("click", async function (e) {
    var id = e.target.getAttribute("data-delete");
    if (!id) return;
    var c = contacts.find(function (x) { return x.id === id; });
    if (!c || !confirm("Delete " + c.name + " from the CRM?")) return;
    try {
      await PortalStore.deleteContact(id);
      contacts = contacts.filter(function (x) { return x.id !== id; });
      render();
    } catch (err) {
      showError(err);
    }
  });

  // Add contact: a new row at the top, with its name ready to type over
  $("crm-add").addEventListener("click", async function () {
    try {
      var made = await PortalStore.addContact({ name: "New contact", relationship: "New", status: STATUSES[0], source: "Added by hand" });
      contacts.push(made);
      newestId = made.id;
      statusFilter = "";
      ["crm-search", "crm-kind", "crm-rel", "crm-who"].forEach(function (id) { $(id).value = ""; });
      render();
      var first = $("crm-rows").querySelector('[data-field="name"]');
      first.focus();
      first.select();
    } catch (err) {
      showError(err);
    }
  });

  /* ---------- filters ---------- */

  $("crm-stats").addEventListener("click", function (e) {
    var b = e.target.closest("[data-status]");
    if (!b) return;
    statusFilter = b.getAttribute("data-status");
    render();
  });
  ["crm-search", "crm-kind", "crm-rel", "crm-who"].forEach(function (id) {
    $(id).addEventListener("input", renderRows);
  });

  /* ---------- CSV ---------- */

  function parseCsv(text) {
    var rows = [], row = [], cell = "", quoted = false;
    text = text.replace(/^﻿/, "");
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (quoted) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') quoted = false;
        else cell += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ",") { row.push(cell); cell = ""; }
      else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
      else if (ch !== "\r") cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (c) { return c.trim(); }); });
  }

  var HEADINGS = {
    name: "name", type: "kind", kind: "kind", sport: "sport", instagram: "instagram", followers: "followers",
    email: "email", relationship: "relationship", status: "status", who: "who", "last contact": "lastContact",
    "follow up": "followUp", notes: "notes", source: "source"
  };

  function fromCsv(rows) {
    var head = rows[0].map(function (h) { return HEADINGS[h.trim().toLowerCase()] || ""; });
    if (head.indexOf("name") === -1) throw new Error('That file needs a "name" column.');
    return rows.slice(1).map(function (r) {
      var c = {};
      head.forEach(function (k, i) { if (k && r[i] != null) c[k] = r[i].trim(); });
      c.followers = /^\d[\d,]*$/.test(c.followers || "") ? Number(c.followers.replace(/,/g, "")) : "";
      if (STATUSES.indexOf(c.status) === -1) c.status = STATUSES[0];
      if (c.relationship !== "Existing") c.relationship = "New";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(c.followUp || "")) delete c.followUp;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(c.lastContact || "")) delete c.lastContact;
      if (!c.source) c.source = "Imported";
      return c;
    }).filter(function (c) { return c.name; });
  }

  $("crm-import").addEventListener("click", function () { $("crm-import-file").click(); });
  $("crm-import-file").addEventListener("change", async function (e) {
    var file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      var incoming = fromCsv(parseCsv(await file.text()));
      var names = {}, handles = {};
      contacts.forEach(function (c) {
        names[c.name.toLowerCase()] = true;
        if (igHandle(c.instagram)) handles[igHandle(c.instagram)] = true;
      });
      var fresh = incoming.filter(function (c) {
        var h = igHandle(c.instagram);
        if ((h && handles[h]) || names[c.name.toLowerCase()]) return false;
        if (h) handles[h] = true;
        names[c.name.toLowerCase()] = true;
        return true;
      });
      var skipped = incoming.length - fresh.length;
      if (!fresh.length) {
        alert("Nothing new in " + file.name + (skipped ? ": all " + skipped + " are already here." : "."));
        return;
      }
      if (!confirm("Add " + fresh.length + " to the CRM?" + (skipped ? " (" + skipped + " already here, so skipped.)" : ""))) return;
      for (var i = 0; i < fresh.length; i++) await PortalStore.addContact(fresh[i]);
      await load();
    } catch (err) {
      showError(err);
    }
  });

  // A spreadsheet treats a cell starting = + - or @ as a formula. Handles
  // start with @ and a contact's text isn't ours, so such cells get a
  // leading apostrophe on export.
  function csvCell(v) {
    var s = v == null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  $("crm-export").addEventListener("click", function () {
    var cols = [["name", "Name"], ["kind", "Type"], ["sport", "Sport"], ["instagram", "Instagram"], ["followers", "Followers"],
      ["email", "Email"], ["relationship", "Relationship"], ["status", "Status"], ["who", "Who"], ["lastContact", "Last contact"],
      ["followUp", "Follow up"], ["notes", "Notes"], ["source", "Source"]];
    var lines = [cols.map(function (c) { return c[1]; }).join(",")].concat(contacts.slice().sort(order).map(function (c) {
      return cols.map(function (k) { return csvCell(c[k[0]]); }).join(",");
    }));
    var url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }));
    var a = document.createElement("a");
    a.href = url;
    a.download = "jolero-crm-" + todayISO() + ".csv";
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  });

  load();
})();
