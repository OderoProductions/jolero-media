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

  /* ---------- Google Calendar handoff ---------- */

  // Single event → Google's prefilled "create event" screen (all-day).
  function gcalUrl(ev) {
    var params = new URLSearchParams({
      action: "TEMPLATE",
      text: (ev.label ? ev.label + " — " : "") + ev.title,
      dates: compact(ev.date) + "/" + nextDayCompact(ev.date),
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
      lines.push("DTSTART;VALUE=DATE:" + compact(ev.date));
      lines.push("DTEND;VALUE=DATE:" + nextDayCompact(ev.date));
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

      var chips = evs.slice(0, 3).map(function (e) {
        return '<button class="chip chip-' + e.kind + (e.done ? " is-done" : "") +
          '" data-date="' + dISO + '" title="' + esc((e.label ? e.label + " — " : "") + e.title) + '">' +
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

    list.innerHTML = evs.map(function (e) {
      var actions = '<a class="btn btn-ghost" href="' + esc(gcalUrl(e)) +
        '" target="_blank" rel="noopener">Add to Google Calendar</a>';
      if (e.taskId) {
        actions = '<button class="btn btn-ghost" type="button" data-toggle-task="' + esc(e.taskId) + '">' +
          (e.done ? "Mark not done" : "Mark done") + "</button>" + actions;
      }
      return '<div class="day-row k-' + e.kind + '">' +
        "<div><span class='d-title'>" + esc(e.title) + "</span>" +
        '<div class="d-sub">' + esc(e.label) + (e.sub ? " · " + esc(e.sub) : "") + "</div></div>" +
        '<div class="d-actions">' + actions + "</div>" +
        "</div>";
    }).join("");
  }

  /* ---------- tasks ---------- */

  async function renderTasks() {
    var tasks = await PortalStore.getTasks();
    var data = await PortalStore.getData();
    var projectTitle = {};
    data.projects.forEach(function (p) { projectTitle[p.id] = p.title; });

    var open = tasks.filter(function (t) { return !t.done; });
    var done = tasks.filter(function (t) { return t.done; });

    function row(t) {
      var overdue = !t.done && t.due && t.due < todayISO;
      return '<div class="task-row' + (t.done ? " is-done" : "") + '">' +
        '<input type="checkbox" ' + (t.done ? "checked" : "") +
        ' data-toggle-task="' + esc(t.id) + '" aria-label="Mark ' + esc(t.title) + '">' +
        "<div><span class='t-title'>" + esc(t.title) + "</span>" +
        '<div class="t-meta">' + esc(t.type) +
        (t.projectId && projectTitle[t.projectId] ? " · " + esc(projectTitle[t.projectId]) : "") +
        "</div></div>" +
        '<span class="t-meta t-due' + (overdue ? " is-overdue" : "") + '">' +
        (overdue ? "Overdue · " : "") + fmtDate(t.due) + "</span>" +
        '<button class="task-del" type="button" data-del-task="' + esc(t.id) + '" aria-label="Delete task">&times;</button>' +
        "</div>";
    }

    document.getElementById("task-list").innerHTML =
      (open.map(row).join("") + done.map(row).join("")) ||
      '<p class="empty-note">No tasks yet — add one below.</p>';
    document.getElementById("tasks-count").textContent =
      open.length ? "(" + open.length + " open)" : "";
  }

  /* ---------- refresh everything ---------- */

  async function refresh() {
    allEvents = await PortalStore.getScheduleEvents();
    renderCalendar();
    renderDay();
    await renderTasks();
  }

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
    var cell = e.target.closest("[data-date]");
    if (cell) {
      selected = cell.dataset.date;
      renderDay();
      document.getElementById("day-h").scrollIntoView({ block: "start", behavior: "smooth" });
      return;
    }
    var toggle = e.target.closest("[data-toggle-task]");
    if (toggle) {
      await PortalStore.toggleTask(toggle.dataset.toggleTask);
      await refresh();
      return;
    }
    var del = e.target.closest("[data-del-task]");
    if (del) {
      await PortalStore.deleteTask(del.dataset.delTask);
      await refresh();
    }
  });

  document.getElementById("add-task").addEventListener("submit", async function (e) {
    e.preventDefault();
    var f = e.target;
    await PortalStore.addTask({
      title: f.elements.title.value.trim(),
      type: f.elements.type.value,
      due: f.elements.due.value,
      projectId: f.elements.projectId.value
    });
    f.reset();
    f.closest("details").open = false;
    await refresh();
  });

  /* ---------- init ---------- */

  (async function init() {
    document.getElementById("nt-type").innerHTML =
      PortalStore.TASK_TYPES.map(function (t) { return "<option>" + esc(t) + "</option>"; }).join("");

    var data = await PortalStore.getData();
    var clientName = {};
    data.clients.forEach(function (c) { clientName[c.id] = c.name; });
    document.getElementById("nt-project").innerHTML =
      '<option value="">— none —</option>' + data.projects.map(function (p) {
        return '<option value="' + esc(p.id) + '">' + esc(p.title) +
          " (" + esc(clientName[p.clientId] || "") + ")</option>";
      }).join("");

    selected = todayISO;
    await refresh();
  })();
})();
