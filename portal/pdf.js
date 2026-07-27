/* ============================================================
   JOLERO MEDIA PORTAL — pdf.js

   Builds a real, self-contained PDF of a signed contract in the
   browser — no libraries, no server. The file is assembled byte by
   byte to the PDF 1.4 spec: Helvetica for headings, Courier for the
   agreement text, A4 pages with automatic pagination and page
   numbers.

   Used by both the client view and the admin Contracts page via
   window.ContractPDF.download(contract, clientName).
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

  /* ---- document assembly ---- */

  function build(contract, clientName) {
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
    function gap(h) { y -= h; }
    function rule() {
      need(14);
      page().push("0.62 0.62 0.62 RG 0.5 w " + M + " " + y.toFixed(1) + " m " + (W - M) + " " + y.toFixed(1) + " l S");
      y -= 14;
    }

    var title = sanitize(contract.title);
    var body = sanitize(contract.body || "");
    var signer = sanitize(contract.signerName || "");
    var client = sanitize(clientName || "");

    // Brand row: red record square + wordmark
    page().push("0.84 0.16 0.13 rg " + M + " " + (y - 1).toFixed(1) + " 7 7 re f");
    page().push("0 0 0 rg BT /F2 12 Tf " + (M + 14) + " " + y.toFixed(1) + " Td (JOLERO MEDIA) Tj ET");
    y -= 30;

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
    var total = pages.length;
    var footTitle = title.length > 58 ? title.slice(0, 55) + "..." : title;
    pages.forEach(function (cmds, i) {
      cmds.push("0.55 0.55 0.55 rg BT /F1 8 Tf " + M + " 44 Td (" +
        escText("Jolero Media  -  " + footTitle + "  -  Page " + (i + 1) + " of " + total) + ") Tj ET");
    });

    /* ---- serialise to PDF bytes ---- */

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

  function slug(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "contract";
  }

  window.ContractPDF = {
    build: build,
    download: function (contract, clientName) {
      var blob = new Blob([build(contract, clientName)], { type: "application/pdf" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = slug(contract.title) + "-signed.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }
  };
})();
