/* ============================================================
   JOLERO MEDIA PORTAL — pdf.js

   Builds real, self-contained PDFs in the browser — no libraries,
   no server. Files are assembled byte by byte to the PDF 1.4 spec:
   Helvetica for headings, Courier where column alignment matters,
   A4 pages with automatic pagination.

   Two templates share one document assembler:
     window.ContractPDF.download(contract, clientName)  — signed contracts
     window.InvoicePDF.download(invoice, client)        — branded invoices
   ============================================================ */

(function () {
  "use strict";

  var W = 595, H = 842;          // A4 in points
  var M = 56;                    // margin
  var BOTTOM = 72;               // pagination limit

  /* ---- text handling (PDF strings are Latin-1) ---- */

  function sanitize(s) {
    return String(s == null ? "" : s)
      .replace(/[‘’‚]/g, "'")
      .replace(/[“”„]/g, '"')
      .replace(/[–—]/g, "-")
      .replace(/•/g, "-")
      .replace(/…/g, "...")
      .replace(/[^\x00-\xFF]/g, "?");
  }

  function escText(s) {
    return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  }

  // Word-wrap for monospaced/approximate layouts; hard-breaks long words
  function rebuild(text, maxChars) {
    var words = text.split(/\s+/).filter(Boolean);
    var lines = [], line = "";
    words.forEach(function (w) {
      while (w.length > maxChars) {
        if (line) { lines.push(line); line = ""; }
        lines.push(w.slice(0, maxChars));
        w = w.slice(maxChars);
      }
      var next = line ? line + " " + w : w;
      if (next.length <= maxChars) line = next;
      else { lines.push(line); line = w; }
    });
    if (line) lines.push(line);
    return lines.length ? lines : [""];
  }

  function fmt(iso) {
    if (!iso) return "-";
    var p = String(iso).split("-");
    var MN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return Number(p[2]) + " " + (MN[Number(p[1]) - 1] || "?") + " " + p[0];
  }

  // "£450.00" — 0xA3 is £ in WinAnsiEncoding, which all three fonts declare
  function money(n) {
    var s = Number(n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return "\xA3" + s;
  }

  /* ---- shared document assembler ----
     A doc is a cursor-based command builder: pages of raw content-
     stream commands plus a y cursor that text/gap/rule move down,
     paginating automatically past BOTTOM. */

  function makeDoc() {
    var pages = [[]];             // array of command-string arrays
    var y = H - M - 6;

    function page() { return pages[pages.length - 1]; }
    function need(h) {
      if (y - h < BOTTOM) { pages.push([]); y = H - M - 6; }
    }
    function text(font, size, rgb, str, leading) {
      need(leading || size + 4);
      page().push(rgb + " rg BT /" + font + " " + size + " Tf " + M + " " + y.toFixed(1) + " Td (" + escText(str) + ") Tj ET");
      y -= (leading || size + 4);
    }
    // Absolute placement — does not move the cursor
    function textAt(font, size, rgb, str, x, yPos) {
      page().push(rgb + " rg BT /" + font + " " + size + " Tf " + Number(x).toFixed(1) + " " + Number(yPos).toFixed(1) + " Td (" + escText(str) + ") Tj ET");
    }
    function gap(h) { y -= h; }
    function rule() {
      need(14);
      page().push("0.62 0.62 0.62 RG 0.5 w " + M + " " + y.toFixed(1) + " m " + (W - M) + " " + y.toFixed(1) + " l S");
      y -= 14;
    }

    return {
      pages: pages,
      push: function (cmd) { page().push(cmd); },
      need: need,
      text: text,
      textAt: textAt,
      gap: gap,
      rule: rule,
      y: function () { return y; }
    };
  }

  // Brand row: red record square + wordmark (shared by both templates)
  function brandRow(doc) {
    var y0 = doc.y();
    doc.push("0.84 0.16 0.13 rg " + M + " " + (y0 - 1).toFixed(1) + " 7 7 re f");
    doc.push("0 0 0 rg BT /F2 12 Tf " + (M + 14) + " " + y0.toFixed(1) + " Td (JOLERO MEDIA) Tj ET");
    doc.gap(30);
  }

  /* ---- serialise pages of commands to PDF bytes ---- */

  function serialize(pages) {
    var objects = [];             // 1-indexed object bodies (without "N 0 obj")
    var pageObjIds = [];
    var fontIds = { F1: 0, F2: 0, F3: 0 };

    objects.push("<< /Type /Catalog /Pages 2 0 R >>");                       // 1
    objects.push("PAGES_PLACEHOLDER");                                       // 2
    ["Helvetica", "Helvetica-Bold", "Courier"].forEach(function (base, i) {
      objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /" + base + " /Encoding /WinAnsiEncoding >>");
      fontIds[["F1", "F2", "F3"][i]] = objects.length;
    });

    pages.forEach(function (cmds) {
      var stream = cmds.join("\n");
      objects.push("<< /Length " + stream.length + " >>\nstream\n" + stream + "\nendstream");
      var contentId = objects.length;
      objects.push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + W + " " + H + "] " +
        "/Resources << /Font << /F1 " + fontIds.F1 + " 0 R /F2 " + fontIds.F2 + " 0 R /F3 " + fontIds.F3 + " 0 R >> >> " +
        "/Contents " + contentId + " 0 R >>");
      pageObjIds.push(objects.length);
    });

    objects[1] = "<< /Type /Pages /Kids [" +
      pageObjIds.map(function (id) { return id + " 0 R"; }).join(" ") +
      "] /Count " + pageObjIds.length + " >>";

    var head = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
    var out = head;
    var offsets = [];
    objects.forEach(function (bodyStr, i) {
      offsets.push(out.length);
      out += (i + 1) + " 0 obj\n" + bodyStr + "\nendobj\n";
    });
    var xrefStart = out.length;
    out += "xref\n0 " + (objects.length + 1) + "\n0000000000 65535 f \n";
    offsets.forEach(function (o) {
      out += ("0000000000" + o).slice(-10) + " 00000 n \n";
    });
    out += "trailer\n<< /Size " + (objects.length + 1) + " /Root 1 0 R >>\nstartxref\n" + xrefStart + "\n%%EOF";

    var bytes = new Uint8Array(out.length);
    for (var i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xFF;
    return bytes;
  }

  /* ================= CONTRACT TEMPLATE ================= */

  function buildContract(contract, clientName) {
    var doc = makeDoc();
    var text = doc.text, gap = doc.gap, rule = doc.rule;

    var title = sanitize(contract.title);
    var body = sanitize(contract.body || "");
    var signer = sanitize(contract.signerName || "");
    var client = sanitize(clientName || "");

    brandRow(doc);

    rebuild(title.toUpperCase(), 52).forEach(function (l) { text("F2", 16, "0 0 0", l, 20); });
    gap(2);
    text("F1", 9.5, "0.4 0.4 0.4", "Between Jolero Media and " + client, 13);
    text("F1", 9.5, "0.4 0.4 0.4", "Sent " + fmt(contract.sentDate) + "  -  Signed " + fmt(contract.signedDate), 13);
    gap(4);
    rule();
    gap(6);

    body.split(/\n/).forEach(function (para) {
      if (!para.trim()) { gap(7); return; }
      rebuild(para.trim(), 88).forEach(function (l) { text("F3", 9, "0.1 0.1 0.1", l, 12.5); });
      gap(2);
    });

    gap(10);
    rule();
    text("F2", 11, "0 0 0", "Signed", 17);
    text("F1", 10, "0 0 0", "Name:  " + signer, 15);
    text("F1", 10, "0 0 0", "Date:  " + fmt(contract.signedDate), 15);
    text("F1", 10, "0 0 0", "For:   " + client, 15);
    gap(6);
    text("F1", 8, "0.45 0.45 0.45", "Signature captured electronically via the Jolero Media client portal.", 11);
    text("F1", 8, "0.45 0.45 0.45", "Preview build - Phase 2 adds verified e-sign identity and an audit trail.", 11);

    // Footer with page numbers
    var total = doc.pages.length;
    var footTitle = title.length > 58 ? title.slice(0, 55) + "..." : title;
    doc.pages.forEach(function (cmds, i) {
      cmds.push("0.55 0.55 0.55 rg BT /F1 8 Tf " + M + " 44 Td (" +
        escText("Jolero Media  -  " + footTitle + "  -  Page " + (i + 1) + " of " + total) + ") Tj ET");
    });

    return serialize(doc.pages);
  }

  /* ================= INVOICE TEMPLATE ================= */

  var ACCENT = "0.84 0.16 0.13";
  var GRAY = "0.4 0.4 0.4";
  var INKC = "0.1 0.1 0.1";

  // Right-align via Courier: width is computable (charW = 0.6 * size)
  function amountRight(doc, size, rgb, str, yPos) {
    var x = W - M - str.length * (0.6 * size);
    doc.textAt("F3", size, rgb, str, x, yPos);
  }

  function buildInvoice(invoice, client) {
    invoice = invoice || {};
    client = client || {};
    var doc = makeDoc();

    var number = sanitize(invoice.number || "");
    var paid = invoice.status === "paid";
    var amount = money(invoice.amount);

    brandRow(doc);

    // PAID marker: outlined accent rect near the top right (absolute)
    if (paid) {
      var psz = 13;
      var pw = 4 * 0.55 * psz;              // approx Helvetica-Bold width of "PAID"
      var rw = pw + 20, rh = 26;
      var rx = W - M - rw, ry = 746;
      doc.push(ACCENT + " RG 1.2 w " + rx.toFixed(1) + " " + ry + " " + rw.toFixed(1) + " " + rh + " re S");
      doc.textAt("F2", psz, ACCENT, "PAID", rx + (rw - pw) / 2, ry + 8.3);
    }

    doc.text("F2", 20, "0 0 0", "INVOICE", 26);
    doc.text("F1", 10, GRAY, number, 14);
    doc.gap(16);

    // Two meta columns as stacked lines
    var left = [["F2", 8.5, GRAY, "BILLED TO"]];
    if (client.name) left.push(["F1", 10, INKC, sanitize(client.name)]);
    if (client.contactName) left.push(["F1", 10, INKC, sanitize(client.contactName)]);
    if (client.email) left.push(["F1", 10, INKC, sanitize(client.email)]);

    var right = [["F2", 8.5, GRAY, "DATES"]];
    right.push(["F1", 10, INKC, "Issued " + fmt(invoice.issued)]);
    right.push(["F1", 10, INKC, "Due " + fmt(invoice.due)]);
    if (paid) right.push(["F1", 10, INKC, "Paid " + fmt(invoice.paidDate)]);

    var lead = 14;
    var rows = Math.max(left.length, right.length);
    var startY = doc.y();
    for (var r = 0; r < rows; r++) {
      var yy = startY - r * lead;
      if (left[r]) doc.textAt(left[r][0], left[r][1], left[r][2], left[r][3], M, yy);
      if (right[r]) doc.textAt(right[r][0], right[r][1], right[r][2], right[r][3], M + 260, yy);
    }
    doc.gap(rows * lead + 8);

    doc.rule();
    doc.gap(6);

    // Line-item table
    var itemY = doc.y();
    doc.textAt("F1", 10, INKC, "Sports media services - " + number, M, itemY);
    amountRight(doc, 10, INKC, amount, itemY);
    doc.gap(20);
    doc.rule();
    doc.gap(2);

    var totalY = doc.y();
    doc.textAt("F2", 11, "0 0 0", "TOTAL", M, totalY);
    amountRight(doc, 11, "0 0 0", amount, totalY);
    doc.gap(26);

    // Status line
    if (paid) {
      doc.text("F1", 9.5, GRAY, "Paid " + fmt(invoice.paidDate), 13);
    } else {
      doc.text("F1", 9.5, GRAY, "Payment due by " + fmt(invoice.due), 13);
    }

    // Footer (absolute)
    // <!-- TODO: replace "Payment details on request." with real bank
    //      details (account name, sort code, account number) before
    //      sending invoices to clients. -->
    doc.push("0.55 0.55 0.55 rg BT /F1 8 Tf " + M + " 56 Td (" +
      escText("Jolero Media - Worthing, West Sussex - info@joleromedia.com") + ") Tj ET");
    doc.push("0.55 0.55 0.55 rg BT /F1 8 Tf " + M + " 44 Td (Payment details on request.) Tj ET");

    return serialize(doc.pages);
  }

  /* ---- public API ---- */

  function slug(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "contract";
  }

  function save(bytes, filename) {
    var blob = new Blob([bytes], { type: "application/pdf" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  window.ContractPDF = {
    build: buildContract,
    download: function (contract, clientName) {
      save(buildContract(contract, clientName), slug(contract.title) + "-signed.pdf");
    }
  };

  window.InvoicePDF = {
    build: buildInvoice,
    download: function (invoice, client) {
      save(buildInvoice(invoice, client), slug("invoice-" + ((invoice && invoice.number) || "")) + ".pdf");
    }
  };
})();
