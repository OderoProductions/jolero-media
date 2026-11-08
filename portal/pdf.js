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

  // The Jolero mark, traced from assets/logo.svg (its path, in the SVG's
  // own units). Drawn through a cm matrix so it can sit at any size.
  var LOGO_PATH = "7673 15563 m 7646 15553 7661 15521 7708 15491 c 7817 15420 7839 15402 7938 15306 c 8041 15206 8094 15139 8142 15044 c 8189 14953 8230 14860 8230 14846 c 8230 14839 8237 14816 8245 14797 c 8253 14777 8260 14747 8260 14730 c 8260 14713 8265 14689 8271 14678 c 8282 14658 8292 14587 8309 14405 c 8321 14286 8321 8057 8310 7960 c 8294 7828 8283 7764 8271 7742 c 8265 7731 8260 7710 8260 7697 c 8260 7670 8186 7495 8138 7410 c 8041 7236 7907 7107 7731 7020 c 7642 6975 7577 6950 7535 6944 c 7519 6941 7470 6932 7428 6923 c 7361 6909 7337 6908 7258 6919 c 7118 6937 7068 6946 7030 6960 c 6932 6996 6842 7036 6813 7057 c 6796 7070 6779 7080 6775 7080 c 6761 7080 6612 7201 6570 7246 c 6417 7410 6298 7623 6211 7886 c 6168 8017 6136 8051 6086 8020 c 6075 8013 6046 7997 6021 7984 c 5997 7971 5972 7956 5966 7951 c 5960 7947 5928 7928 5895 7910 c 5862 7892 5822 7868 5805 7858 c 5789 7848 5768 7837 5760 7833 c 5752 7830 5712 7807 5673 7783 c 5633 7760 5597 7740 5593 7740 c 5590 7740 5579 7734 5571 7726 c 5562 7719 5528 7698 5495 7680 c 5462 7663 5422 7640 5405 7629 c 5389 7619 5365 7606 5352 7600 c 5340 7595 5304 7574 5273 7554 c 5242 7535 5208 7514 5196 7509 c 5184 7504 5153 7486 5125 7470 c 5098 7453 5066 7435 5055 7430 c 5044 7424 5028 7416 5020 7410 c 4966 7376 4801 7280 4795 7280 c 4791 7280 4774 7270 4757 7258 c 4739 7245 4716 7230 4704 7224 c 4693 7218 4654 7197 4619 7178 c 4584 7158 4539 7134 4520 7124 c 4501 7113 4483 7103 4480 7100 c 4477 7097 4457 7086 4435 7075 c 4389 7052 4345 7024 4313 6996 c 4273 6962 4280 6933 4389 6675 c 4394 6664 4406 6633 4415 6605 c 4425 6578 4446 6530 4461 6500 c 4477 6470 4490 6440 4490 6433 c 4490 6423 4553 6297 4618 6175 c 4824 5794 5176 5394 5581 5082 c 5618 5054 5651 5030 5653 5030 c 5655 5030 5714 4992 5784 4945 c 5853 4898 5912 4860 5915 4860 c 5917 4860 5942 4846 5971 4830 c 6162 4717 6444 4594 6660 4529 c 6696 4519 6739 4506 6755 4501 c 6809 4484 6913 4462 7010 4446 c 7062 4438 7137 4426 7175 4420 c 7277 4402 7780 4395 7866 4410 c 7904 4416 7967 4425 8005 4430 c 8264 4460 8528 4532 8780 4641 c 8906 4695 9240 4875 9260 4900 c 9263 4903 9301 4930 9345 4960 c 9473 5046 9564 5123 9734 5289 c 9978 5529 10158 5757 10327 6040 c 10393 6151 10540 6445 10540 6466 c 10540 6469 10546 6486 10554 6503 c 10602 6615 10674 6848 10725 7058 c 10733 7093 10740 7131 10740 7142 c 10740 7153 10747 7192 10755 7229 c 10762 7265 10777 7351 10787 7420 c 10804 7535 10805 7649 10805 8895 c 10805 9638 10807 11425 10808 12866 c 10810 14308 10808 15499 10805 15513 c 10801 15526 10786 15543 10772 15550 c 10751 15559 10395 15563 9215 15565 c 8374 15566 7679 15566 7673 15563 c h 11537 14633 m 11521 14615 11520 14530 11520 13198 c 11520 11814 11520 11783 11539 11766 c 11550 11756 11586 11745 11622 11740 c 11723 11726 11813 11709 11835 11700 c 11846 11695 11882 11684 11915 11675 c 11985 11655 12071 11622 12085 11609 c 12090 11604 12100 11600 12107 11600 c 12126 11600 12350 11462 12392 11425 c 12412 11407 12439 11386 12452 11379 c 12507 11350 12673 11181 12759 11065 c 12834 10965 12928 10816 12954 10755 c 12964 10733 12977 10702 12984 10685 c 12991 10669 13005 10638 13014 10617 c 13023 10596 13030 10573 13030 10565 c 13030 10557 13036 10536 13044 10518 c 13061 10478 13079 10404 13091 10330 c 13095 10300 13104 10250 13109 10220 c 13121 10150 13122 9845 13110 9760 c 13087 9598 13080 9559 13070 9541 c 13065 9530 13060 9509 13060 9495 c 13060 9480 13054 9454 13047 9437 c 13039 9419 13025 9380 13015 9350 c 12959 9177 12804 8910 12685 8781 c 12531 8613 12446 8538 12310 8448 c 12081 8297 11913 8228 11660 8183 c 11557 8165 11555 8163 11538 8130 c 11521 8098 11520 8045 11519 7490 c 11518 7157 11514 6840 11510 6785 c 11495 6602 11480 6482 11470 6455 c 11465 6441 11460 6411 11460 6389 c 11460 6367 11453 6333 11445 6313 c 11437 6294 11430 6266 11430 6253 c 11430 6239 11424 6207 11416 6181 c 11408 6156 11387 6090 11370 6035 c 11353 5980 11335 5927 11330 5918 c 11324 5908 11320 5895 11320 5889 c 11320 5879 11311 5856 11275 5775 c 11216 5640 11114 5445 11059 5359 c 11043 5334 11030 5308 11030 5302 c 11030 5295 11026 5290 11021 5290 c 11007 5290 10998 5253 11005 5229 c 11012 5208 11016 5208 11104 5214 c 11390 5233 11438 5237 11448 5243 c 11454 5247 11512 5254 11577 5260 c 11642 5265 11731 5276 11775 5285 c 11819 5294 11883 5305 11917 5310 c 11952 5315 11989 5324 11999 5330 c 12010 5335 12029 5340 12042 5340 c 12055 5340 12085 5346 12110 5354 c 12135 5362 12187 5378 12225 5389 c 12264 5400 12309 5413 12325 5418 c 12342 5424 12380 5436 12410 5445 c 12440 5454 12474 5465 12485 5470 c 12496 5475 12534 5487 12570 5498 c 12628 5516 12698 5544 12850 5612 c 12922 5644 12965 5665 12970 5670 c 12973 5673 13007 5690 13045 5709 c 13084 5728 13161 5770 13217 5802 c 13273 5834 13322 5860 13325 5860 c 13328 5860 13357 5877 13388 5897 c 13419 5918 13450 5937 13455 5940 c 13492 5958 13685 6092 13789 6171 c 13857 6223 13924 6272 13937 6281 c 13970 6303 14156 6467 14259 6565 c 14421 6720 14650 6988 14808 7210 c 14853 7273 14893 7330 14898 7335 c 14902 7341 14930 7385 14960 7433 c 14990 7481 15023 7533 15032 7548 c 15070 7610 15153 7763 15209 7875 c 15269 7996 15302 8068 15330 8141 c 15341 8171 15355 8204 15360 8215 c 15373 8242 15417 8361 15442 8440 c 15454 8476 15469 8519 15476 8537 c 15484 8554 15490 8573 15490 8580 c 15490 8596 15519 8691 15531 8712 c 15536 8722 15540 8740 15540 8752 c 15540 8765 15546 8795 15554 8820 c 15583 8910 15618 9062 15631 9150 c 15635 9186 15644 9233 15650 9255 c 15655 9277 15660 9321 15660 9352 c 15660 9383 15665 9421 15670 9436 c 15684 9473 15704 9807 15704 10000 c 15704 10191 15684 10533 15670 10580 c 15665 10599 15660 10637 15660 10665 c 15660 10692 15653 10742 15645 10775 c 15637 10808 15631 10850 15630 10868 c 15630 10887 15624 10925 15616 10953 c 15609 10982 15595 11039 15586 11080 c 15555 11217 15496 11426 15471 11485 c 15457 11519 15439 11574 15430 11605 c 15423 11635 15375 11752 15299 11925 c 15238 12067 15127 12281 15053 12405 c 15046 12416 15038 12432 15034 12440 c 15030 12448 15021 12462 15015 12470 c 15008 12478 14994 12501 14983 12520 c 14932 12616 14758 12857 14586 13071 c 14507 13169 14189 13485 14070 13585 c 14018 13629 13964 13675 13950 13687 c 13936 13700 13922 13710 13919 13710 c 13916 13710 13900 13721 13884 13735 c 13868 13749 13837 13773 13815 13788 c 13793 13803 13773 13817 13770 13820 c 13759 13831 13691 13880 13686 13880 c 13684 13880 13642 13906 13593 13939 c 13416 14056 13426 14050 13170 14185 c 13156 14193 13118 14211 13085 14225 c 13052 14240 13007 14260 12985 14270 c 12858 14327 12829 14340 12823 14340 c 12820 14340 12767 14360 12706 14384 c 12645 14408 12568 14435 12535 14445 c 12502 14455 12466 14466 12455 14471 c 12444 14475 12408 14486 12375 14495 c 12342 14504 12293 14517 12265 14525 c 12209 14540 12124 14560 12005 14585 c 11961 14594 11907 14607 11885 14612 c 11843 14623 11744 14636 11625 14646 c 11564 14651 11553 14649 11537 14633 c h";

  // the mark, `size` points tall, top left corner at (x, top)
  function logo(doc, x, top, size) {
    var k = size / 1148;
    doc.push("q " + (0.1 * k).toFixed(6) + " 0 0 " + (0.1 * k).toFixed(6) + " " +
      (x - 413 * k).toFixed(2) + " " + (top - 1573 * k).toFixed(2) + " cm 0.07 0.07 0.07 rg " + LOGO_PATH + " f Q");
    // the red dot
    var cx = x + (1157 - 413) * k, cy = top - (1001.5 - 427) * k, r = 51 * k, c = r * 0.5523;
    doc.push("0.796 0.263 0.216 rg " +
      (cx + r).toFixed(2) + " " + cy.toFixed(2) + " m " +
      (cx + r).toFixed(2) + " " + (cy + c).toFixed(2) + " " + (cx + c).toFixed(2) + " " + (cy + r).toFixed(2) + " " + cx.toFixed(2) + " " + (cy + r).toFixed(2) + " c " +
      (cx - c).toFixed(2) + " " + (cy + r).toFixed(2) + " " + (cx - r).toFixed(2) + " " + (cy + c).toFixed(2) + " " + (cx - r).toFixed(2) + " " + cy.toFixed(2) + " c " +
      (cx - r).toFixed(2) + " " + (cy - c).toFixed(2) + " " + (cx - c).toFixed(2) + " " + (cy - r).toFixed(2) + " " + cx.toFixed(2) + " " + (cy - r).toFixed(2) + " c " +
      (cx + c).toFixed(2) + " " + (cy - r).toFixed(2) + " " + (cx + r).toFixed(2) + " " + (cy - c).toFixed(2) + " " + (cx + r).toFixed(2) + " " + cy.toFixed(2) + " c f");
  }

  // Courier, right aligned to xRight (every Courier glyph is 0.6 em wide)
  function rightAt(doc, font, size, rgb, str, xRight) {
    doc.textAt(font, size, rgb, str, xRight - sanitize(str).length * 0.6 * size, doc.y());
  }

  // Brand row: the mark and wordmark, the address on the right (both templates)
  function brandRow(doc) {
    var top = doc.y() + 10;
    logo(doc, M, top, 30);
    doc.textAt("F2", 13, "0 0 0", "JOLERO MEDIA", M + 38, top - 20);
    var ry = top - 9;
    ["info@joleromedia.com", "joleromedia.com", "West Sussex, UK"].forEach(function (l) {
      doc.textAt("F3", 7.5, "0.45 0.45 0.45", l, W - M - l.length * 0.6 * 7.5, ry);
      ry -= 10;
    });
    doc.gap(58);
  }

  /* ---- serialise pages of commands to PDF bytes ---- */

  function serialize(pages) {
    var objects = [];             // 1-indexed object bodies (without "N 0 obj")
    var pageObjIds = [];
    var fontIds = { F1: 0, F2: 0, F3: 0, F4: 0 };

    objects.push("<< /Type /Catalog /Pages 2 0 R >>");                       // 1
    objects.push("PAGES_PLACEHOLDER");                                       // 2
    ["Helvetica", "Helvetica-Bold", "Courier", "Courier-Bold"].forEach(function (base, i) {
      objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /" + base + " /Encoding /WinAnsiEncoding >>");
      fontIds[["F1", "F2", "F3", "F4"][i]] = objects.length;
    });

    pages.forEach(function (cmds) {
      var stream = cmds.join("\n");
      objects.push("<< /Length " + stream.length + " >>\nstream\n" + stream + "\nendstream");
      var contentId = objects.length;
      objects.push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + W + " " + H + "] " +
        "/Resources << /Font << /F1 " + fontIds.F1 + " 0 R /F2 " + fontIds.F2 + " 0 R /F3 " + fontIds.F3 + " 0 R /F4 " + fontIds.F4 + " 0 R >> >> " +
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
    text("F1", 8, "0.45 0.45 0.45", "Signed electronically through the Jolero Media client portal, by typing the name above.", 11);

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

  // The short terms printed on every invoice. The full terms and usage
  // licence live in the contract each client signs.
  var INVOICE_TERMS = [
    "Payment is due by the date above. Please use the invoice number as your payment reference.",
    "Content is licensed for your own promotion and social channels once this invoice is paid in full.",
    "Resale, sublicensing or paid advertising use needs our written agreement first.",
    "Late payments by businesses may incur interest under the Late Payment of Commercial Debts Act 1998."
  ];

  // Older invoices have one amount and no items: show them as one line
  function invoiceItems(invoice) {
    var items = Array.isArray(invoice.items) ? invoice.items.filter(function (it) {
      return it && (it.description || Number(it.price));
    }) : [];
    if (!items.length) return [{ description: "Sports media services", qty: 1, price: Number(invoice.amount) || 0 }];
    return items.map(function (it) {
      return { description: String(it.description || ""), qty: Number(it.qty) || 1, price: Number(it.price) || 0 };
    });
  }

  function buildInvoice(invoice, client) {
    invoice = invoice || {};
    client = client || {};
    var doc = makeDoc();
    var number = sanitize(invoice.number || "");
    var paid = invoice.status === "paid";
    var items = invoiceItems(invoice);
    var total = items.reduce(function (t, it) { return t + it.qty * it.price; }, 0);

    brandRow(doc);

    // PAID stamp, top right under the address
    if (paid) {
      var psz = 13, pw = 4 * 0.55 * psz, rw = pw + 20, rh = 26;
      var rx = W - M - rw, ry = doc.y() - 30;
      doc.push(ACCENT + " RG 1.2 w " + rx.toFixed(1) + " " + ry.toFixed(1) + " " + rw.toFixed(1) + " " + rh + " re S");
      doc.textAt("F2", psz, ACCENT, "PAID", rx + (rw - pw) / 2, ry + 8.3);
    }

    doc.text("F2", 24, "0 0 0", "INVOICE", 28);
    doc.text("F1", 10, GRAY, number, 14);
    doc.gap(18);

    // three columns: from, billed to, details
    function clamp(str, n) {
      str = sanitize(str);
      return str.length > n ? str.slice(0, n - 1) + "\x85" : str;
    }
    var cols = [
      { x: M, lines: [["F2", 8, GRAY, "FROM"], ["F1", 9.5, INKC, "Jolero Media"], ["F1", 9.5, INKC, "West Sussex, UK"], ["F1", 9.5, INKC, "info@joleromedia.com"]] },
      { x: M + 170, lines: [["F2", 8, GRAY, "BILLED TO"]] },
      { x: M + 340, lines: [["F2", 8, GRAY, "DETAILS"], ["F1", 9.5, INKC, "Invoice " + number],
        ["F1", 9.5, INKC, "Issued " + fmt(invoice.issued)], ["F1", 9.5, INKC, "Due " + fmt(invoice.due)]] }
    ];
    if (client.name) cols[1].lines.push(["F1", 9.5, INKC, clamp(client.name, 30)]);
    if (client.contactName) cols[1].lines.push(["F1", 9.5, INKC, clamp(client.contactName, 30)]);
    if (client.email) cols[1].lines.push(["F1", 9.5, INKC, clamp(client.email, 30)]);
    if (paid) cols[2].lines.push(["F1", 9.5, INKC, "Paid " + fmt(invoice.paidDate)]);
    var rows = Math.max(cols[0].lines.length, cols[1].lines.length, cols[2].lines.length);
    var top = doc.y();
    cols.forEach(function (c) {
      c.lines.forEach(function (l, i) { doc.textAt(l[0], l[1], l[2], l[3], c.x, top - i * 14); });
    });
    doc.gap(rows * 14 + 16);

    // items table
    var QX = M + 318, UX = M + 404, AX = W - M;
    doc.need(30);
    doc.push("0.94 0.94 0.94 rg " + M + " " + (doc.y() - 7).toFixed(1) + " " + (W - 2 * M) + " 20 re f");
    doc.textAt("F2", 8, GRAY, "DESCRIPTION", M + 8, doc.y());
    rightAt(doc, "F2", 8, GRAY, "QTY", QX);
    rightAt(doc, "F2", 8, GRAY, "UNIT", UX);
    rightAt(doc, "F2", 8, GRAY, "AMOUNT", AX - 8);
    doc.gap(26);

    items.forEach(function (it) {
      var lines = rebuild(sanitize(it.description), 50);
      doc.need(lines.length * 13 + 12);
      lines.forEach(function (l, i) {
        doc.textAt("F1", 10, INKC, l, M + 8, doc.y() - i * 13);
      });
      rightAt(doc, "F3", 9.5, INKC, String(it.qty), QX);
      rightAt(doc, "F3", 9.5, INKC, money(it.price), UX);
      rightAt(doc, "F3", 9.5, INKC, money(it.qty * it.price), AX - 8);
      doc.gap(lines.length * 13 + 4);
      doc.push("0.85 0.85 0.85 RG 0.5 w " + M + " " + (doc.y() + 4).toFixed(1) + " m " + (W - M) + " " + (doc.y() + 4).toFixed(1) + " l S");
      doc.gap(10);
    });

    // total
    doc.gap(4);
    doc.need(40);
    doc.textAt("F1", 9, GRAY, "No VAT charged", M + 8, doc.y());
    doc.textAt("F2", 12, "0 0 0", "TOTAL DUE", UX - 90, doc.y());
    rightAt(doc, "F4", 12, "0 0 0", paid ? money(0) : money(total), AX - 8);
    if (paid) { doc.gap(16); doc.textAt("F1", 9, GRAY, "Paid in full, " + money(total) + ", thank you.", UX - 90, doc.y()); }
    doc.gap(30);

    if (invoice.notes) {
      doc.text("F2", 8, GRAY, "NOTES", 13);
      sanitize(invoice.notes).split(/\n/).forEach(function (para) {
        rebuild(para, 95).forEach(function (l) { doc.text("F1", 9.5, INKC, l, 13); });
      });
      doc.gap(12);
    }

    // how to pay
    if (!paid) {
      var pay = sanitize(invoice.payment || "").split(/\n/).filter(function (l) { return l.trim(); });
      if (!pay.length) pay = ["Bank details to follow. Please get in touch before paying."];
      doc.need(pay.length * 13 + 40);
      var boxTop = doc.y() + 12, boxH = pay.length * 13 + 34;
      doc.push("0.97 0.97 0.97 rg " + M + " " + (boxTop - boxH).toFixed(1) + " " + (W - 2 * M) + " " + boxH + " re f");
      doc.push(ACCENT + " rg " + M + " " + (boxTop - boxH).toFixed(1) + " 2.5 " + boxH + " re f");
      doc.textAt("F2", 8, GRAY, "HOW TO PAY", M + 14, doc.y());
      doc.gap(15);
      pay.forEach(function (l) { doc.textAt("F1", 9.5, INKC, l, M + 14, doc.y()); doc.gap(13); });
      doc.textAt("F1", 9.5, INKC, "Reference: " + number, M + 14, doc.y());
      doc.gap(30);
    }

    doc.text("F2", 8, GRAY, "TERMS", 13);
    INVOICE_TERMS.forEach(function (t) {
      rebuild(t, 100).forEach(function (l) { doc.text("F1", 8.5, "0.3 0.3 0.3", l, 11.5); });
      doc.gap(2);
    });

    doc.pages.forEach(function (cmds, i) {
      cmds.push("0.55 0.55 0.55 rg BT /F1 8 Tf " + M + " 40 Td (" +
        escText("Jolero Media  -  Sports media, West Sussex  -  Thank you for working with us" +
          (doc.pages.length > 1 ? "  -  Page " + (i + 1) + " of " + doc.pages.length : "")) + ") Tj ET");
    });

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
    total: function (invoice) {
      return invoiceItems(invoice || {}).reduce(function (t, it) { return t + it.qty * it.price; }, 0);
    },
    download: function (invoice, client) {
      save(buildInvoice(invoice, client), slug("invoice-" + ((invoice && invoice.number) || "")) + ".pdf");
    }
  };
})();
