/* ============================================================
   JOLERO MEDIA PORTAL — schedule.js (calendar + tasks)

   Reads everything through PortalStore.getScheduleEvents(), which
   aggregates shoots, deadlines, invoices and tasks. Google Calendar
   handoff is done with public link/file formats — no API key, no
   OAuth, works offline. Phase 2 swaps the store method for real
   sync and this page follows automatically.
   ============================================================ */

(function () {
  "use strict";

  var esc = PortalUtil.esc;
  var fmtDate = PortalUtil.fmtDate;

  var MONTHS = ["January", "February", "March", "April", "May", "June",
                "July", "August", "September", "October", "November", "December"];
  var DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  var today = new Date();
  var view = { y: today.getFullYear(), m: today.getMonth() };
  var selected = null;      // ISO date string
  var allEvents = [];

  /* ---------- date helpers (local time — no UTC drift) ---------- */

  function iso(d) {
    return d.getFullYear() + "-" +
      String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");
  }
  function parseISO(s) {
    var p = String(s).split("-");
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }
  function compact(s) { return String(s).replace(/-/g, ""); }
  function nextDayCompact(s) {
    var d = parseISO(s);
    d.setDate(d.getDate() + 1);
    return compact(iso(d));
  }
  var todayISO = iso(today);

  // Drag-and-drop is desktop-only sugar (dialogs are the touch/keyboard path).
  // Without this gate, iPadOS lifts draggable chips on press-and-hold and a
  // stray release silently rewrites dates.
  var DRAG_OK = !!(window.matchMedia && matchMedia("(hover: hover) and (pointer: fine)").matches);

  /* ---------- Google Calendar handoff ---------- */

  function plusHour(hhmm) {
    var p = hhmm.split(":");
    var h = Math.min(23, Number(p[0]) + 1);
    return String(h).padStart(2, "0") + ":" + p[1];
  }
  function stampT(dateISO, hhmm) {
    return compact(dateISO) + "T" + hhmm.replace(":", "") + "00";
  }

  // Timed entries get real start/end times; everything else stays all-day.
  function rangeFor(ev) {
    if (ev.time) {
      return {
        start: stampT(ev.date, ev.time),
        end: stampT(ev.date, ev.endTime || plusHour(ev.time)),
        timed: true
      };
    }
    return { start: compact(ev.date), end: nextDayCompact(ev.date), timed: false };
  }

  // Single event → Google's prefilled "create event" screen.
  function gcalUrl(ev) {
    var r = rangeFor(ev);
    var params = new URLSearchParams({
      action: "TEMPLATE",
      text: (ev.label ? ev.label + " — " : "") + ev.title,
      dates: r.start + "/" + r.end,
      details: (ev.sub ? ev.sub + "\n" : "") + "Added from the Jolero Media portal."
    });
    return "https://calendar.google.com/calendar/render?" + params.toString();
  }

  function icsEscape(s) {
    return String(s == null ? "" : s)
      .replace(/\\/g, "\\\\").replace(/;/g, "\\;")
      .replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  }

  function buildIcs(events) {
    var stamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    var lines = [
      "BEGIN:VCALENDAR", "VERSION:2.0",
      "PRODID:-//Jolero Media//Portal//EN",
      "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
      "X-WR-CALNAME:Jolero Media"
    ];
    events.forEach(function (ev, i) {
      lines.push("BEGIN:VEVENT");
      lines.push("UID:" + (ev.taskId || ev.projectId || "ev") + "-" + i + "@joleromedia.com");
      lines.push("DTSTAMP:" + stamp);
      var r = rangeFor(ev);
      if (r.timed) {
        // Floating local time — imports at the stated clock time in any calendar
        lines.push("DTSTART:" + r.start);
        lines.push("DTEND:" + r.end);
      } else {
        lines.push("DTSTART;VALUE=DATE:" + r.start);
        lines.push("DTEND;VALUE=DATE:" + r.end);
      }
      lines.push("SUMMARY:" + icsEscape((ev.label ? ev.label + " — " : "") + ev.title));
      if (ev.sub) lines.push("DESCRIPTION:" + icsEscape(ev.sub));
      lines.push("END:VEVENT");
    });
    lines.push("END:VCALENDAR");
    return lines.join("\r\n");
  }

  function downloadIcs() {
    var blob = new Blob([buildIcs(allEvents)], { type: "text/calendar;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "jolero-media-schedule.ics";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  /* ---------- calendar ---------- */

  function eventsOn(dateISO) {
    return allEvents.filter(function (e) { return e.date === dateISO; });
  }

  function renderCalendar() {
    document.getElementById("cal-month").textContent = MONTHS[view.m] + " " + view.y;

    var grid = document.getElementById("cal-grid");
    var html = DAYS.map(function (d) {
      return '<div class="cal-head" role="columnheader">' + d + "</div>";
    }).join("");

    // Monday-first grid, six rows so the height never jumps between months
    var first = new Date(view.y, view.m, 1);
    var offset = (first.getDay() + 6) % 7;
    var cursor = new Date(view.y, view.m, 1 - offset);

    for (var i = 0; i < 42; i++) {
      var dISO = iso(cursor);
      var outside = cursor.getMonth() !== view.m;
      var evs = eventsOn(dISO);

      var chips = evs.slice(0, 3).map(function (e, idx) {
        return '<button class="chip chip-' + e.kind + (e.done ? " is-done" : "") +
          '" data-open-event="' + dISO + "|" + idx + '"' +
          (e.kind === "invoice" || !DRAG_OK ? "" : ' draggable="true"') + ' title="' +
          esc((e.label ? e.label + " — " : "") + e.title) + '">' +
          (e.time ? '<span class="chip-time">' + esc(e.time) + "</span> " : "") +
          esc(e.title) + "</button>";
      }).join("");
      if (evs.length > 3) {
        chips += '<button class="chip-more" data-date="' + dISO + '">+' + (evs.length - 3) + " more</button>";
      }

      html += '<div class="cal-cell' + (outside ? " is-outside" : "") +
        (dISO === todayISO ? " is-today" : "") + '" role="gridcell" data-date="' + dISO + '">' +
        '<span class="cal-date">' + cursor.getDate() + "</span>" + chips + "</div>";

      cursor.setDate(cursor.getDate() + 1);
    }

    grid.innerHTML = html;
  }

  /* ---------- day detail ---------- */

  function renderDay() {
    var label = document.getElementById("day-label");
    var list = document.getElementById("day-list");

    if (!selected) {
      label.textContent = "";
      list.innerHTML = '<p class="empty-note">Pick a day in the calendar to see what\'s on.</p>';
      return;
    }

    label.textContent = "(" + fmtDate(selected) + ")";
    var evs = eventsOn(selected);
    if (!evs.length) {
      list.innerHTML = '<p class="empty-note">Nothing scheduled for ' + fmtDate(selected) + ".</p>";
      return;
    }

    list.innerHTML = evs.map(function (e, idx) {
      var actions = "";
      if (e.kind !== "invoice") {
        actions += '<button class="btn btn-ghost" type="button" data-open-event="' +
          selected + "|" + idx + '">Edit</button>';
      }
      if (e.taskId) {
        actions += '<button class="btn btn-ghost" type="button" data-toggle-task="' +
          esc(e.taskId) + '">' + (e.done ? "Mark not done" : "Mark done") + "</button>";
      }
      actions += '<a class="btn btn-ghost" href="' + esc(gcalUrl(e)) +
        '" target="_blank" rel="noopener">Add to Google Calendar</a>';

      var when = e.time ? e.time + (e.endTime ? "–" + e.endTime : "") : "All day";
      return '<div class="day-row k-' + e.kind + '">' +
        "<div><span class='d-title'>" + esc(e.title) + "</span>" +
        '<div class="d-sub">' + esc(when) + " · " + esc(e.label) +
        (e.sub ? " · " + esc(e.sub) : "") + "</div></div>" +
        '<div class="d-actions">' + actions + "</div>" +
        "</div>";
    }).join("");
  }

  /* ---------- refresh everything ---------- */

  async function refresh() {
    allEvents = await PortalStore.getScheduleEvents();
    renderCalendar();
    renderDay();
  }
  // admin.js calls this after a task edit so the calendar stays in step
  window.ScheduleRefresh = refresh;

  /* ---------- drag-and-drop rescheduling (desktop-only sugar) ----------
     Chips (except invoices) can be dragged onto another day cell to move
     the underlying record. The edit dialogs remain the keyboard/touch
     path — this never replaces them. */

  var calGrid = document.getElementById("cal-grid");
  var dragInfo = null;       // {kind, id, fromDate} while a chip is in flight
  var justDragged = false;   // suppresses the ghost click that follows a drop

  function idFor(ev) {
    return ev.eventId || ev.taskId || ev.postId || ev.projectId || "";
  }

  function clearDropTargets() {
    var marked = calGrid.querySelectorAll(".cal-cell.drop-target");
    for (var i = 0; i < marked.length; i++) marked[i].classList.remove("drop-target");
  }

  function cleanupDrag() {
    clearDropTargets();
    var ghost = calGrid.querySelector(".chip.is-dragging");
    if (ghost) ghost.classList.remove("is-dragging");
    if (dragInfo) document.body.classList.remove("dragging-" + dragInfo.kind);
    dragInfo = null;
  }

  async function applyMove(info, date) {
    if (info.kind === "event") await PortalStore.updateEvent(info.id, { date: date });
    else if (info.kind === "task") await PortalStore.updateTask(info.id, { due: date });
    else if (info.kind === "post") await PortalStore.updatePost(info.id, { date: date });
    else if (info.kind === "shoot") await PortalStore.updateProject(info.id, { shootDate: date });
    else if (info.kind === "deadline") await PortalStore.updateProject(info.id, { deadline: date });
    else return;
    await refresh();
    // Keep the task/post/project lists elsewhere on the page in step
    if (window.AdminRefresh) window.AdminRefresh();
  }

  calGrid.addEventListener("dragstart", function (e) {
    var chip = e.target.closest ? e.target.closest('.chip[draggable="true"]') : null;
    if (!chip) return;
    var parts = String(chip.dataset.openEvent || "").split("|");
    var ev = eventsOn(parts[0])[Number(parts[1])];
    if (!ev || ev.kind === "invoice") return;
    dragInfo = { kind: ev.kind, id: idFor(ev), fromDate: parts[0] };
    if (e.dataTransfer) {
      try {
        e.dataTransfer.setData("text/plain", ev.kind + "|" + dragInfo.id + "|" + parts[0]);
        e.dataTransfer.effectAllowed = "move";
      } catch (err) { /* older engines can throw on setData — drag still works */ }
    }
    chip.classList.add("is-dragging");
    document.body.classList.add("dragging-" + ev.kind);
  });

  calGrid.addEventListener("dragover", function (e) {
    if (!dragInfo) return;
    var cell = e.target.closest(".cal-cell");
    if (!cell) return;
    e.preventDefault();   // required to allow the drop
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    if (!cell.classList.contains("drop-target")) {
      clearDropTargets();
      cell.classList.add("drop-target");
    }
  });

  calGrid.addEventListener("dragleave", function (e) {
    var cell = e.target.closest ? e.target.closest(".cal-cell") : null;
    if (!cell) return;
    // Only clear when truly leaving the cell, not moving between its children.
    // WebKit reports relatedTarget as null on drag events — hit-test instead.
    var over = e.relatedTarget ||
      (typeof e.clientX === "number" ? document.elementFromPoint(e.clientX, e.clientY) : null);
    if (!over || !cell.contains(over)) cell.classList.remove("drop-target");
  });

  calGrid.addEventListener("drop", function (e) {
    e.preventDefault();
    var info = dragInfo;
    var cell = e.target.closest(".cal-cell");
    cleanupDrag();
    if (!info || !cell) return;
    var toDate = cell.dataset.date;
    if (!toDate || toDate === info.fromDate) return;   // same-day drop = no-op
    applyMove(info, toDate);
  });

  calGrid.addEventListener("dragend", function () {
    cleanupDrag();
    justDragged = true;
    setTimeout(function () { justDragged = false; }, 250);
  });

  /* ---------- editing: route each entry to the right dialog ---------- */

  var eventDialog = document.getElementById("event-dialog");
  var pdateDialog = document.getElementById("pdate-dialog");
  var eventForm = document.getElementById("event-form");
  var pdateForm = document.getElementById("pdate-form");
  // [data-close] handlers and the task dialog live in admin.js (shared)

  function openEventDialog(ev) {
    var f = eventForm;
    f.reset();
    if (ev) {
      document.getElementById("ed-title").textContent = "Edit event";
      f.elements.id.value = ev.id;
      f.elements.title.value = ev.title;
      f.elements.type.value = ev.type;
      f.elements.date.value = ev.date;
      f.elements.time.value = ev.time || "";
      f.elements.endTime.value = ev.endTime || "";
      f.elements.clientId.value = ev.clientId || "";
      f.elements.notes.value = ev.notes || "";
      document.getElementById("ed-delete").hidden = false;
    } else {
      document.getElementById("ed-title").textContent = "Add event";
      f.elements.id.value = "";
      f.elements.date.value = selected || todayISO;
      document.getElementById("ed-delete").hidden = true;
    }
    eventDialog.showModal();
  }

  async function openProjectDate(projectId, kind) {
    var data = await PortalStore.getData();
    var p = data.projects.find(function (x) { return x.id === projectId; });
    if (!p) return;
    var isShoot = kind === "shoot";
    var f = pdateForm;
    f.elements.id.value = p.id;
    f.elements.field.value = isShoot ? "shootDate" : "deadline";
    f.elements.date.value = (isShoot ? p.shootDate : p.deadline) || "";
    document.getElementById("pd2-what").innerHTML =
      "<strong>" + esc(p.title) + "</strong><br>" +
      (isShoot ? "Shoot date" : "Delivery deadline");
    pdateDialog.showModal();
  }

  // One entry point: chips in the grid and rows in the day list both send
  // "<date>|<index>", which resolves against the same sorted event list.
  document.addEventListener("click", async function (e) {
    if (justDragged) return;   // ghost click after a drag — don't open dialogs
    var opener = e.target.closest("[data-open-event]");
    if (!opener) return;
    e.stopPropagation();

    var parts = opener.dataset.openEvent.split("|");
    var evs = eventsOn(parts[0]);
    var ev = evs[Number(parts[1])];
    if (!ev) return;

    selected = parts[0];
    renderDay();

    if (ev.kind === "event") {
      openEventDialog(await PortalStore.getEvent(ev.eventId));
    } else if (ev.kind === "task") {
      window.AdminEditTask(ev.taskId);
    } else if (ev.kind === "post") {
      window.AdminEditPost(ev.postId);
    } else if (ev.kind === "shoot" || ev.kind === "deadline") {
      openProjectDate(ev.projectId, ev.kind);
    }
  }, true);

  // Clicking an empty part of a day cell adds an event on that date
  document.addEventListener("click", function (e) {
    if (justDragged) return;   // ghost click after a drag — don't open dialogs
    var cell = e.target.closest(".cal-cell");
    if (!cell || e.target.closest("[data-open-event]")) return;
    selected = cell.dataset.date;
    renderDay();
    openEventDialog(null);
  });

  document.getElementById("add-event-btn").addEventListener("click", function () {
    openEventDialog(null);
  });

  var addPostBtn = document.getElementById("add-post-btn");
  if (addPostBtn) {
    addPostBtn.addEventListener("click", function () {
      window.AdminAddPost(selected || todayISO);
    });
  }

  eventForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    var f = eventForm;
    var fields = {
      title: f.elements.title.value.trim(),
      type: f.elements.type.value,
      date: f.elements.date.value,
      time: f.elements.time.value,
      endTime: f.elements.endTime.value,
      clientId: f.elements.clientId.value,
      notes: f.elements.notes.value.trim()
    };
    if (f.elements.id.value) await PortalStore.updateEvent(f.elements.id.value, fields);
    else await PortalStore.addEvent(fields);
    eventDialog.close();
    await refresh();
  });

  document.getElementById("ed-delete").addEventListener("click", async function () {
    var id = eventForm.elements.id.value;
    if (id && confirm("Delete this event?")) {
      await PortalStore.deleteEvent(id);
      eventDialog.close();
      await refresh();
    }
  });

  pdateForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    var f = pdateForm;
    var patch = {};
    patch[f.elements.field.value] = f.elements.date.value;
    await PortalStore.updateProject(f.elements.id.value, patch);
    pdateDialog.close();
    await refresh();
  });

  /* ---------- events ---------- */

  document.getElementById("cal-prev").addEventListener("click", function () {
    view.m--; if (view.m < 0) { view.m = 11; view.y--; }
    renderCalendar();
  });
  document.getElementById("cal-next").addEventListener("click", function () {
    view.m++; if (view.m > 11) { view.m = 0; view.y++; }
    renderCalendar();
  });
  document.getElementById("cal-today-btn").addEventListener("click", function () {
    view = { y: today.getFullYear(), m: today.getMonth() };
    selected = todayISO;
    renderCalendar();
    renderDay();
  });
  document.getElementById("export-ics").addEventListener("click", downloadIcs);

  // Delegated: day/chip selection, task toggles, task delete
  document.addEventListener("click", async function (e) {
  });

  /* ---------- init ---------- */

  (async function init() {
    document.getElementById("ed-type").innerHTML =
      PortalStore.EVENT_TYPES.map(function (t) { return "<option>" + esc(t) + "</option>"; }).join("");

    var data = await PortalStore.getData();
    var clientName = {};
    data.clients.forEach(function (c) { clientName[c.id] = c.name; });


    document.getElementById("ed-client").innerHTML =
      '<option value="">— none —</option>' + data.clients.map(function (c) {
        return '<option value="' + esc(c.id) + '">' + esc(c.name) + "</option>";
      }).join("");

    selected = todayISO;
    await refresh();
  })();
})();
