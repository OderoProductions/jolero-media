/* ============================================================
   JOLERO MEDIA PORTAL — invoice-builder.js  (admin/invoices.html)

   New invoices are built from lines (what it's for, how many, how much),
   totalled as you type, previewed as the real PDF, then saved. Saving
   keeps the lines, the note and the payment details on the invoice
   itself, so the PDF the client downloads from their portal always
   matches the one you sent, even after the bank details change.

   "Email" on any invoice downloads its PDF and opens a ready-written
   email to the client in your mail app. Browsers can't attach files to
   an email for you, so drag the PDF in from your downloads.
   ============================================================ */

(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var form = $("build-invoice");
  if (!form) return;

  var TERMS_DAYS = 14;
  var PRESETS = [
    "Matchday shoot, photo and video",
    "Half-day shoot",
    "Full-day shoot",
    "Highlight reel, edited",
    "Short-form edits for Reels and TikTok",
    "Photo editing and private gallery delivery",
    "Monthly content package",
    "Rush delivery, within 48 hours",
    "Travel"
  ];

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function plusDays(iso, n) {
    var d = new Date(iso + "T12:00:00");
    d.setDate(d.getDate() + n);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function money(n) {
    return "£" + Number(n || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function say(text, bad) {
    var m = $("bi-msg");
    m.hidden = !text;
    m.textContent = text || "";
    m.classList.toggle("is-error", !!bad);
  }

  /* ---------- the lines ---------- */

  function addLine(description, qty, price) {
    var row = document.createElement("div");
    row.className = "inv-line";
    row.innerHTML =
      '<input class="inv-desc" type="text" placeholder="What it\'s for" aria-label="Description">' +
      '<input class="inv-qty" type="number" min="0" step="0.5" value="1" aria-label="Quantity">' +
      '<span class="inv-x" aria-hidden="true">×</span>' +
      '<input class="inv-price" type="number" min="0" step="0.01" placeholder="0.00" aria-label="Price each in pounds">' +
      '<span class="inv-sum">£0.00</span>' +
      '<button class="inv-del" type="button" aria-label="Remove this line">×</button>';
    row.querySelector(".inv-desc").value = description || "";
    if (qty != null) row.querySelector(".inv-qty").value = qty;
    if (price != null) row.querySelector(".inv-price").value = price;
    $("bi-items").appendChild(row);
    total();
    return row;
  }

  function lines() {
    return Array.prototype.map.call($("bi-items").querySelectorAll(".inv-line"), function (row) {
      return {
        description: row.querySelector(".inv-desc").value.trim(),
        qty: Number(row.querySelector(".inv-qty").value) || 0,
        price: Math.round((Number(row.querySelector(".inv-price").value) || 0) * 100) / 100
      };
    }).filter(function (it) { return it.description || it.price; });
  }

  function total() {
    var t = 0;
    $("bi-items").querySelectorAll(".inv-line").forEach(function (row) {
      var q = Number(row.querySelector(".inv-qty").value) || 0;
      var p = Number(row.querySelector(".inv-price").value) || 0;
      row.querySelector(".inv-sum").textContent = money(q * p);
      t += q * p;
    });
    $("bi-total").textContent = money(t);
    return Math.round(t * 100) / 100;
  }

  $("bi-items").addEventListener("input", total);
  $("bi-items").addEventListener("click", function (e) {
    var b = e.target.closest(".inv-del");
    if (!b) return;
    b.closest(".inv-line").remove();
    if (!$("bi-items").children.length) addLine();
    total();
  });
  $("bi-add").addEventListener("click", function () { addLine().querySelector(".inv-desc").focus(); });

  $("bi-preset").innerHTML += PRESETS.map(function (p) {
    return "<option>" + PortalUtil.esc(p) + "</option>";
  }).join("");
  $("bi-preset").addEventListener("change", function () {
    var v = this.value;
    this.value = "";
    if (!v) return;
    // fill an empty line before adding another
    var empty = Array.prototype.find.call($("bi-items").querySelectorAll(".inv-line"), function (row) {
      return !row.querySelector(".inv-desc").value.trim() && !row.querySelector(".inv-price").value;
    });
    var row = empty || addLine();
    row.querySelector(".inv-desc").value = v;
    row.querySelector(".inv-price").focus();
  });

  /* ---------- defaults: next number, today, due in 14 days ---------- */

  async function nextNumber() {
    var data = await PortalStore.getData();
    var year = new Date().getFullYear();
    var re = new RegExp("^JM-" + year + "-(\\d+)$", "i");
    var top = 0;
    (data.invoices || []).forEach(function (i) {
      var m = re.exec(String(i.number || "").trim());
      if (m) top = Math.max(top, Number(m[1]));
    });
    return "JM-" + year + "-" + String(top + 1).padStart(3, "0");
  }

  async function fresh() {
    $("bi-items").textContent = "";
    addLine();
    $("bi-notes").value = "";
    $("bi-issued").value = todayISO();
    $("bi-due").value = plusDays(todayISO(), TERMS_DAYS);
    $("bi-number").value = await nextNumber();
    var settings = await PortalStore.getSettings();
    $("bi-payment").value = settings.invoicePayment || "";
    $("bi-save-payment").checked = false;
    say("");
  }

  $("bi-issued").addEventListener("change", function () {
    if (this.value) $("bi-due").value = plusDays(this.value, TERMS_DAYS);
  });

  // the client list arrives with the rest of the page's data
  async function fillClients() {
    var data = await PortalStore.getData();
    var sel = $("bi-client");
    var keep = sel.value;
    sel.innerHTML = '<option value="">Choose a client</option>' + data.clients.map(function (c) {
      return '<option value="' + PortalUtil.esc(c.id) + '">' + PortalUtil.esc(c.name) + "</option>";
    }).join("");
    if (keep) sel.value = keep;
  }

  $("inv-builder").addEventListener("toggle", function () {
    if (this.open) { fillClients(); fresh(); }
  });

  /* ---------- preview and save ---------- */

  function draft() {
    return {
      clientId: $("bi-client").value,
      number: $("bi-number").value.trim(),
      issued: $("bi-issued").value,
      due: $("bi-due").value,
      items: lines(),
      amount: total(),
      notes: $("bi-notes").value.trim(),
      payment: $("bi-payment").value.trim(),
      status: "unpaid"
    };
  }

  async function clientOf(id) {
    var data = await PortalStore.getData();
    return data.clients.find(function (c) { return c.id === id; }) || {};
  }

  $("bi-preview").addEventListener("click", async function () {
    var d = draft();
    window.InvoicePDF.download(d, await clientOf(d.clientId));
  });

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    var d = draft();
    if (!d.clientId) return say("Choose who the invoice is for.", true);
    if (!d.number) return say("Give it an invoice number.", true);
    if (!d.items.length || !d.amount) return say("Add at least one line with a price.", true);
    var data = await PortalStore.getData();
    if ((data.invoices || []).some(function (i) { return String(i.number).trim().toLowerCase() === d.number.toLowerCase(); })) {
      return say("There's already an invoice " + d.number + ". Use the next number.", true);
    }

    var btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    var note = "";
    try {
      try {
        await PortalStore.addInvoice(d);
      } catch (err) {
        // the database hasn't had the invoice lines added yet (see
        // supabase/run-2026-11-08.sql): save the basics so nothing is lost
        if (!/items|notes|payment|column/i.test(String(err && err.message))) throw err;
        await PortalStore.addInvoice({ clientId: d.clientId, number: d.number, amount: d.amount, issued: d.issued, due: d.due });
        note = " The lines weren't stored, because the database update hasn't been run yet, so download this one now.";
      }
      if ($("bi-save-payment").checked) await PortalStore.updateSettings({ invoicePayment: d.payment });
      if (window.AdminRefresh) await window.AdminRefresh();
      window.InvoicePDF.download(d, await clientOf(d.clientId));
      $("inv-builder").open = false;
      flashRow(d.number, "Saved " + d.number + " and downloaded the PDF. Use Email on its row to send it." + note);
    } catch (err) {
      say("Couldn't save: " + (err && err.message ? err.message : err), true);
    }
    btn.disabled = false;
  });

  function flashRow(number, text) {
    var host = $("invoice-table");
    var p = document.createElement("p");
    p.className = "inv-flash";
    p.textContent = text;
    host.parentNode.insertBefore(p, host);
    setTimeout(function () { p.remove(); }, 9000);
  }

  /* ---------- email an invoice ---------- */

  document.addEventListener("click", async function (e) {
    var b = e.target.closest("[data-invoice-email]");
    if (!b) return;
    var data = await PortalStore.getData();
    var inv = (data.invoices || []).find(function (x) { return x.id === b.dataset.invoiceEmail; });
    if (!inv) return;
    var client = data.clients.find(function (c) { return c.id === inv.clientId; }) || {};
    window.InvoicePDF.download(inv, client);

    var first = String(client.contactName || client.name || "there").trim().split(/\s+/)[0];
    var amount = money(window.InvoicePDF.total(inv));
    var due = new Date(inv.due + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    var pay = String(inv.payment || "").trim();
    var body = inv.status === "paid"
      ? "Hi " + first + ",\n\nAttached is invoice " + inv.number + " for " + amount + ", marked as paid. Thank you.\n\n"
      : "Hi " + first + ",\n\nPlease find invoice " + inv.number + " attached, for " + amount + ", due by " + due + ".\n\n" +
        (pay ? pay + "\nReference: " + inv.number + "\n\n" : "Bank details will follow shortly.\n\n") +
        "Any questions, just reply to this email.\n\n";
    body += "Thanks,\nJolero Media";
    var subject = "Invoice " + inv.number + " from Jolero Media";
    location.href = "mailto:" + encodeURIComponent(client.email || "") +
      "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
  });
})();
