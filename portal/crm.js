/* ============================================================
   JOLERO MEDIA PORTAL — crm.js  (admin/crm.html)

   Who we've reached out to, or mean to: a list you can filter, with the
   status changed right in the table. Everything goes through PortalStore,
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
  var fmtDate = PortalUtil.fmtDate;
  var seed = window.JOLERO_SEED || {};
  var STATUSES = seed.contactStatuses || [];
  var KINDS = seed.contactKinds || [];
  var TEAM = (seed.team || []).concat("Both");
  var FOLLOW_UP_DAYS = 7;

  var $ = function (id) { return document.getElementById(id); };
  if (!$("crm-rows")) return;

  var contacts = [];
  var statusFilter = "";     // "" for all, "due" for follow ups due, or a status

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
    return h ? "https://www.instagram.com/" + h + "/" : PortalUtil.safeUrl(value);
  }

  /* ---------- filling the dropdowns ---------- */

  function options(list, blank) {
    return (blank != null ? '<option value="">' + esc(blank) + "</option>" : "") +
      list.map(function (v) { return "<option>" + esc(v) + "</option>"; }).join("");
  }
  $("crm-kind").innerHTML = options(KINDS, "All types");
  $("crm-who").innerHTML = options(TEAM, "Anyone");
  $("cf-kind").innerHTML = options(KINDS, "");
  $("cf-status").innerHTML = options(STATUSES);
  $("cf-who").innerHTML = options(TEAM, "Not assigned");

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
    return (isDue(b) ? 1 : 0) - (isDue(a) ? 1 : 0) ||
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

  function renderRows() {
    var shown = contacts.filter(matches).sort(order);
    $("crm-count").textContent = shown.length === contacts.length ? contacts.length : shown.length + " of " + contacts.length;
    $("crm-rows").innerHTML = shown.map(function (c) {
      var h = igHandle(c.instagram);
      var link = igLink(c.instagram);
      var ig = link
        ? '<a href="' + esc(link) + '" target="_blank" rel="noopener noreferrer">' + esc(h ? "@" + h : "Link") + "</a>"
        : "";
      var statusOpts = STATUSES.concat(STATUSES.indexOf(c.status) === -1 ? [c.status] : []).map(function (s) {
        return "<option" + (s === c.status ? " selected" : "") + ">" + esc(s) + "</option>";
      }).join("");
      return '<tr data-id="' + esc(c.id) + '">' +
        '<td class="crm-name"><button class="row-btn" type="button" data-edit="' + esc(c.id) + '">' + esc(c.name) + "</button>" +
          '<span class="crm-sub">' + esc([c.kind, c.relationship].filter(Boolean).join(" · ")) + "</span></td>" +
        "<td>" + esc(c.sport) + "</td>" +
        "<td>" + ig + "</td>" +
        '<td class="num">' + (c.followers === "" || c.followers == null ? "" : Number(c.followers).toLocaleString("en-GB")) + "</td>" +
        '<td><select class="crm-status" data-status-of="' + esc(c.id) + '" aria-label="Status of ' + esc(c.name) + '">' + statusOpts + "</select></td>" +
        "<td>" + esc(c.who) + "</td>" +
        "<td>" + (c.lastContact ? esc(fmtDate(c.lastContact)) : "") + "</td>" +
        '<td class="' + (isDue(c) ? "crm-due" : "") + '">' + (c.followUp ? esc(fmtDate(c.followUp)) : "") + "</td>" +
        '<td class="crm-notes" title="' + esc(c.notes) + '">' + esc(c.notes) + "</td>" +
        "</tr>";
    }).join("");
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

  /* ---------- changing a status in the table ---------- */

  function statusPatch(c, status) {
    var patch = { status: status };
    if (status === "Messaged" || status === "Replied" || status === "In talks") patch.lastContact = todayISO();
    if (status === "Messaged" && !c.followUp) patch.followUp = plusDays(todayISO(), FOLLOW_UP_DAYS);
    if (status === "Client" || status === "Not now") patch.followUp = "";
    return patch;
  }

  $("crm-rows").addEventListener("change", async function (e) {
    var id = e.target.getAttribute("data-status-of");
    if (!id) return;
    var c = contacts.find(function (x) { return x.id === id; });
    if (!c) return;
    e.target.disabled = true;
    try {
      var row = await PortalStore.updateContact(id, statusPatch(c, e.target.value));
      Object.assign(c, row);
      showError(null);
    } catch (err) {
      showError(err);
    }
    render();
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

  /* ---------- add / edit ---------- */

  var dialog = $("crm-dialog");
  var form = $("crm-form");

  function openDialog(c) {
    form.reset();
    var editing = !!c;
    $("crm-d-title").textContent = editing ? "Edit contact" : "Add contact";
    $("crm-d-delete").hidden = !editing;
    c = c || { status: STATUSES[0], relationship: "New" };
    ["id", "name", "kind", "sport", "instagram", "followers", "email", "relationship", "status", "who", "lastContact", "followUp", "notes"]
      .forEach(function (k) {
        if (form.elements[k]) form.elements[k].value = c[k] == null ? "" : c[k];
      });
    dialog.showModal();
    form.elements.name.focus();
  }
  function closeDialog() { dialog.close(); }

  $("crm-add").addEventListener("click", function () { openDialog(null); });
  $("crm-d-close").addEventListener("click", closeDialog);
  $("crm-d-cancel").addEventListener("click", closeDialog);
  $("crm-rows").addEventListener("click", function (e) {
    var b = e.target.closest("[data-edit]");
    if (!b) return;
    openDialog(contacts.find(function (x) { return x.id === b.getAttribute("data-edit"); }));
  });

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    var f = form.elements;
    var patch = {
      name: f.name.value.trim(),
      kind: f.kind.value,
      sport: f.sport.value.trim(),
      instagram: f.instagram.value.trim(),
      followers: f.followers.value === "" ? "" : Number(f.followers.value),
      email: f.email.value.trim(),
      relationship: f.relationship.value,
      status: f.status.value,
      who: f.who.value,
      lastContact: f.lastContact.value,
      followUp: f.followUp.value,
      notes: f.notes.value.trim()
    };
    if (!patch.name) return;
    form.classList.add("is-busy");
    try {
      if (f.id.value) await PortalStore.updateContact(f.id.value, patch);
      else await PortalStore.addContact(Object.assign({ source: "Added by hand" }, patch));
      closeDialog();
      await load();
    } catch (err) {
      closeDialog();
      showError(err);
    }
    form.classList.remove("is-busy");
  });

  $("crm-d-delete").addEventListener("click", async function () {
    var id = form.elements.id.value;
    if (!id || !confirm("Delete " + form.elements.name.value + " from the CRM?")) return;
    try {
      await PortalStore.deleteContact(id);
      closeDialog();
      await load();
    } catch (err) {
      closeDialog();
      showError(err);
    }
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
