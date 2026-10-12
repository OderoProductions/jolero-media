/* Jolero client gallery: reads one manifest from the gallery worker and
   renders it. Everything from the manifest goes in via textContent and
   every file key is checked against the same pattern the worker enforces,
   so a manifest can never inject markup or point links elsewhere.

   A gallery is either flat (items only) or has folders: manifest.folders
   lists them ({id, name, cover, zip}) and each item carries `f`, its
   folder id. Folders open in place; the back button returns to the covers. */
(() => {
  "use strict";

  const LOCAL = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  const API = LOCAL ? "http://localhost:8787" : "https://jolero-gallery.jolero-gallery-worker.workers.dev";
  const ID_RE = /^[A-Za-z0-9_-]{12,64}$/;
  const KEY_RE = /^[tpo]\/[A-Za-z0-9][A-Za-z0-9._-]{0,180}$/;

  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const svgDownload = () => {
    const ns = "http://www.w3.org/2000/svg";
    const s = document.createElementNS(ns, "svg");
    s.setAttribute("class", "icon");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("aria-hidden", "true");
    const p = document.createElementNS(ns, "path");
    p.setAttribute("d", "M12 3v12m0 0-5-5m5 5 5-5M4 20h16");
    s.appendChild(p);
    return s;
  };

  // Links look like #coach-manowar/k3J9xQ2mPa7Z: the name is only for people,
  // the code after the last slash is what finds the gallery
  const id = decodeURIComponent(location.hash.slice(1)).trim().split("/").pop();
  const slug = (s) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  const base = `${API}/g/${id}/`;
  const url = (key, download) => (KEY_RE.test(key || "") ? base + key + (download ? "?dl=1" : "") : "");

  function size(n) {
    const units = ["B", "KB", "MB", "GB", "TB"];
    let i = 0;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return `${n >= 100 || i < 2 ? Math.round(n) : n.toFixed(1)} ${units[i]}`;
  }
  function clock(sec) {
    sec = Math.round(sec || 0);
    const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = String(sec % 60).padStart(2, "0");
    return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
  }
  function day(iso) {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  }
  const stem = (name) => name.replace(/\.[^.]+$/, "");
  const pad = (n, w) => String(n).padStart(w, "0");
  const plural = (n, word) => `${n === 1 ? word : word + "s"}`;

  function setTitle(text) {
    const h = $("title");
    h.textContent = text;
    h.appendChild(el("span", "dot", "."));
  }

  function downloadLink(href, label, cls) {
    const a = el("a", cls);
    a.href = href;
    a.appendChild(svgDownload());
    if (label) a.appendChild(el("span", null, label));
    return a;
  }

  /* ---------- states ---------- */

  function showState(kind, title) {
    const copy = {
      missing: ["Gallery not found", "This link doesn't match a gallery. Check it was copied in full, or message us and we'll sort it."],
      expired: [title || "This gallery has expired", "The files are no longer online. Message us if you need them again."],
      error: ["Couldn't load the gallery", "Something went wrong on our side. Refresh the page to try again, or message us."],
    }[kind];
    setTitle(copy[0]);
    if (kind === "expired" && title) $("meta").textContent = "This gallery has expired";
    $("state-text").textContent = copy[1];
    $("state").hidden = false;
    document.title = `${copy[0]} | Jolero Media`;
  }

  async function load() {
    if (!ID_RE.test(id)) return showState("missing");
    let res;
    try {
      res = await fetch(base + "manifest.json", { cache: "no-store", referrerPolicy: "no-referrer" });
    } catch (e) {
      return showState("error");
    }
    if (res.status === 404) return showState("missing");
    if (res.status === 410) {
      const body = await res.json().catch(() => ({}));
      return showState("expired", body.title);
    }
    if (!res.ok) return showState("error");
    let man;
    try { man = await res.json(); } catch (e) { return showState("error"); }
    setup(man);
  }

  /* ---------- the gallery: covers, or one folder's contents ---------- */

  let man = null;
  let isLocked = false;
  let root = [];          // items that aren't in a folder
  let folders = [];       // [{id, name, cover, zip, items}]

  const usable = (it) => (it.type === "photo" || it.type === "video") ? url(it.t) && url(it.p) : url(it.o);

  function setup(m) {
    man = m;
    isLocked = !!man.locked;
    const items = (Array.isArray(man.items) ? man.items : []).filter(usable);
    const list = Array.isArray(man.folders) ? man.folders : [];
    folders = list
      .map((f) => ({ ...f, items: items.filter((it) => it.f === f.id) }))
      .filter((f) => f.items.length);
    const known = new Set(folders.map((f) => f.id));
    root = items.filter((it) => !known.has(it.f));
    // A single folder with nothing beside it is just a gallery: skip the cover step
    if (folders.length === 1 && !root.length) {
      root = folders[0].items;
      if (!man.zip) man.zip = folders[0].zip;
      folders = [];
    }

    document.title = `${man.title || "Your gallery"} | Jolero Media`;
    const name = slug(man.title || "");
    if (name && location.hash.slice(1) !== `${name}/${id}`) {
      history.replaceState(history.state, "", `#${name}/${id}`);
    }
    $("notice").hidden = !isLocked;
    $("usage").hidden = false;
    setupReview();
    route(history.state);
  }

  function route(state) {
    const f = state && state.folder && folders.find((x) => x.id === state.folder);
    if (f) showFolder(f);
    else showHome();
  }

  function counts(items) {
    const out = [];
    for (const type of ["photo", "video", "file"]) {
      const n = items.filter((it) => (type === "file" ? it.type !== "photo" && it.type !== "video" : it.type === type)).length;
      if (n) out.push([pad(n, 2), plural(n, type)]);
    }
    return out;
  }

  function setOsd(parts) {
    const osd = $("meta");
    osd.textContent = "";
    for (const [strong, rest] of parts) {
      const s = el("span");
      if (strong) s.appendChild(el("b", null, strong));
      if (rest) s.appendChild(document.createTextNode(strong ? ` ${rest}` : rest));
      osd.appendChild(s);
    }
  }

  function setDownloadAll(zip, count) {
    const all = $("download-all");
    if (zip && url(zip.o) && !isLocked && count > 1) {
      all.href = url(zip.o, true);
      $("download-all-size").textContent = size(zip.bytes || 0);
      all.hidden = false;
    } else {
      all.hidden = true;
      all.removeAttribute("href");
    }
  }

  function showHome() {
    const all = folders.flatMap((f) => f.items).concat(root);
    setTitle(man.title || "Your gallery");
    $("crumb").hidden = true;
    const parts = [];
    if (man.client) parts.push([man.client, ""]);
    if (folders.length) parts.push([pad(folders.length, 2), plural(folders.length, "folder")]);
    parts.push(...counts(all));
    if (man.expires) parts.push(["", `Available until ${day(man.expires)}`]);
    setOsd(parts);
    const note = typeof man.message === "string" ? man.message.trim() : "";
    $("message").textContent = note;
    $("message").hidden = !note;
    setDownloadAll(folders.length ? null : man.zip, root.length);
    renderFolders();
    renderItems(root);
  }

  function showFolder(f) {
    setTitle(f.name || "Folder");
    $("crumb").hidden = false;
    $("crumb-text").textContent = man.title || "All folders";
    const parts = counts(f.items);
    if (man.expires) parts.push(["", `Available until ${day(man.expires)}`]);
    setOsd(parts);
    $("message").hidden = true;
    setDownloadAll(f.zip, f.items.length);
    $("folders").hidden = true;
    renderItems(f.items);
  }

  function openFolder(f) {
    history.pushState({ folder: f.id }, "");
    showFolder(f);
    window.scrollTo(0, 0);
    $("crumb").focus({ preventScroll: true });
  }

  $("crumb").addEventListener("click", () => {
    if (history.state && history.state.folder) history.back();
    else { showHome(); window.scrollTo(0, 0); }
  });

  /* ---------- folder covers ---------- */

  function renderFolders() {
    const grid = $("folder-grid");
    grid.textContent = "";
    $("folders").hidden = !folders.length;
    if (!folders.length) return;
    $("folders-count").textContent = pad(folders.length, 2);
    folders.forEach((f, i) => {
      const card = el("article", "folder");
      card.style.setProperty("--i", Math.min(i, 12));
      const open = el("button", "folder-open");
      open.type = "button";
      open.setAttribute("aria-label", `Open ${f.name}`);
      const cover = el("span", "folder-cover");
      const coverKey = url(f.cover) ? f.cover : (f.items.find((it) => url(it.t)) || {}).t;
      if (url(coverKey)) {
        const img = document.createElement("img");
        img.alt = "";
        img.decoding = "async";
        img.addEventListener("load", () => img.classList.add("is-loaded"), { once: true });
        img.src = url(coverKey);
        if (img.complete) img.classList.add("is-loaded");
        cover.appendChild(img);
      }
      open.appendChild(cover);
      open.appendChild(el("span", "folder-index", `${pad(i + 1, 2)} / ${pad(folders.length, 2)}`));
      const label = el("span", "folder-label");
      const nm = el("span", "folder-name", f.name || "Folder");
      nm.appendChild(el("span", "dot", "."));
      label.appendChild(nm);
      const bytes = f.items.reduce((n, it) => n + (it.bytes || 0), 0);
      label.appendChild(el("span", "folder-meta",
        counts(f.items).map(([n, w]) => `${Number(n)} ${w}`).concat(size(bytes)).join("  ·  ")));
      open.appendChild(label);
      open.addEventListener("click", () => openFolder(f));
      card.appendChild(open);
      if (f.zip && url(f.zip.o) && !isLocked && f.items.length > 1) {
        const dl = downloadLink(url(f.zip.o, true), "Download all", "folder-dl");
        dl.appendChild(el("span", "btn-meta", size(f.zip.bytes || 0)));
        card.appendChild(dl);
      }
      grid.appendChild(card);
    });
  }

  /* ---------- a list of items: videos, photos, other files ---------- */

  function renderItems(items) {
    const photos = items.filter((it) => it.type === "photo");
    const videos = items.filter((it) => it.type === "video");
    const files = items.filter((it) => it.type !== "photo" && it.type !== "video");
    renderVideos(videos);
    renderPhotos(photos);
    renderFiles(files);
  }

  function renderVideos(videos) {
    const row = $("video-row");
    row.textContent = "";
    $("videos").hidden = !videos.length;
    $("videos-count").textContent = pad(videos.length, 2);
    for (const it of videos) {
      const card = el("article", "vcard");
      const ar = it.w && it.h ? Math.min(Math.max(it.w / it.h, 0.4), 2.6) : 16 / 9;
      card.style.setProperty("--ar", ar.toFixed(4));
      const frame = el("div", "vframe");
      const v = document.createElement("video");
      v.controls = true;
      v.preload = "none";
      v.playsInline = true;
      v.poster = url(it.t);
      v.src = url(it.p);
      v.setAttribute("controlslist", "nodownload");
      frame.appendChild(v);
      card.appendChild(frame);

      const info = el("div", "vinfo");
      const text = el("div");
      text.appendChild(el("h3", "vname", stem(it.name || "Video")));
      const meta = [clock(it.dur)];
      if (it.w && it.h) meta.push(`${it.w}×${it.h}`);
      meta.push(size(it.bytes || 0));
      text.appendChild(el("p", "vmeta", meta.join("  ·  ")));
      info.appendChild(text);
      if (!isLocked) info.appendChild(downloadLink(url(it.o, true), "Download", "btn btn-ghost btn-sm"));
      card.appendChild(info);
      row.appendChild(card);
    }
  }

  /* ---------- photos: justified rows ---------- */

  let tiles = [];
  let shown = [];

  function renderPhotos(photos) {
    shown = photos;
    const grid = $("grid");
    grid.textContent = "";
    $("photos").hidden = !photos.length;
    $("photos-count").textContent = pad(photos.length, 2);
    tiles = photos.map((it, i) => {
      const fig = el("figure", "tile");
      fig.style.margin = "0";
      fig.style.setProperty("--i", Math.min(i, 24));
      const open = el("button", "tile-open");
      open.type = "button";
      open.setAttribute("aria-label", `Open ${it.name || "photo"}`);
      const img = document.createElement("img");
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      img.addEventListener("load", () => img.classList.add("is-loaded"), { once: true });
      img.src = url(it.t);
      if (img.complete) img.classList.add("is-loaded");
      open.appendChild(img);
      open.addEventListener("click", () => openBox(i));
      fig.appendChild(open);
      if (!isLocked) {
        const dl = downloadLink(url(it.o, true), null, "tile-dl");
        dl.setAttribute("aria-label", `Download ${it.name || "photo"}`);
        fig.appendChild(dl);
      }
      grid.appendChild(fig);
      const ar = it.w && it.h ? it.w / it.h : 1.5;
      return { el: fig, ar: Math.min(Math.max(ar, 0.4), 3) };
    });
    layout();
  }

  function layout() {
    const grid = $("grid");
    const W = grid.clientWidth - 1; // a pixel of slack so rounding never wraps a row
    if (W <= 0) return;
    const gap = W < 640 ? 4 : 8;
    const target = W < 640 ? 150 : W < 1000 ? 210 : 270;
    grid.style.setProperty("--gap", `${gap}px`);
    let row = [];
    let sum = 0;
    const flush = (last) => {
      const free = W - gap * (row.length - 1);
      const h = last ? Math.min(target, free / sum) : free / sum;
      for (const t of row) {
        t.el.style.width = `${Math.floor(t.ar * h * 100) / 100}px`;
        t.el.style.height = `${Math.round(h)}px`;
      }
      row = [];
      sum = 0;
    };
    for (const t of tiles) {
      row.push(t);
      sum += t.ar;
      if (sum * target + gap * (row.length - 1) >= W) flush(false);
    }
    if (row.length) flush(true);
  }

  let resizeFrame = 0;
  new ResizeObserver(() => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(layout);
  }).observe($("grid"));

  /* ---------- lightbox ---------- */

  const box = $("lightbox");
  const boxImg = $("lb-img");
  let current = -1;
  let opener = null;
  let skipPop = false;

  function openBox(i) {
    opener = document.activeElement;
    box.hidden = false;
    document.documentElement.classList.add("is-locked");
    history.pushState({ ...(history.state || {}), lightbox: true }, "");
    show(i);
    $("lb-close").focus();
  }

  function closeBox(viaHistory) {
    if (box.hidden) return;
    box.hidden = true;
    current = -1;
    boxImg.removeAttribute("src");
    document.documentElement.classList.remove("is-locked");
    if (!viaHistory && history.state && history.state.lightbox) {
      skipPop = true; // undo our own history entry without re-rendering the page
      history.back();
    }
    if (opener) opener.focus();
  }

  function show(i) {
    if (i < 0 || i >= shown.length) return;
    current = i;
    const it = shown[i];
    $("lb-count").textContent = `${pad(i + 1, 3)} / ${pad(shown.length, 3)}`;
    $("lb-name").textContent = it.name || "";
    const dl = $("lb-dl");
    dl.hidden = isLocked;
    dl.href = url(it.o, true);
    $("lb-prev").disabled = i === 0;
    $("lb-next").disabled = i === shown.length - 1;

    // Thumb straight away (already cached), the sharp preview once it lands
    boxImg.src = url(it.t);
    const sharp = new Image();
    sharp.onload = () => { if (current === i) boxImg.src = sharp.src; };
    sharp.src = url(it.p);
    for (const n of [i - 1, i + 1]) {
      if (shown[n]) new Image().src = url(shown[n].p);
    }
  }

  $("lb-close").addEventListener("click", () => closeBox(false));
  $("lb-prev").addEventListener("click", () => show(current - 1));
  $("lb-next").addEventListener("click", () => show(current + 1));
  $("lb-stage").addEventListener("click", (e) => { if (e.target === e.currentTarget) closeBox(false); });

  window.addEventListener("popstate", (e) => {
    if (skipPop) { skipPop = false; return; }
    if (!box.hidden) { closeBox(true); return; }
    if (man) { route(e.state); window.scrollTo(0, 0); }
  });

  document.addEventListener("keydown", (e) => {
    if (box.hidden) return;
    if (e.key === "Escape") closeBox(false);
    else if (e.key === "ArrowLeft") show(current - 1);
    else if (e.key === "ArrowRight") show(current + 1);
    else if (e.key === "Tab") {
      // keep focus inside the viewer
      const focusable = [...box.querySelectorAll("a[href]:not([hidden]), button:not([disabled])")]
        .filter((n) => n.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
      else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
    }
  });

  let touchX = null;
  let touchY = null;
  box.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) { touchX = null; return; }
    touchX = e.touches[0].clientX;
    touchY = e.touches[0].clientY;
  }, { passive: true });
  box.addEventListener("touchend", (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    const dy = e.changedTouches[0].clientY - touchY;
    touchX = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) show(current + (dx < 0 ? 1 : -1));
    else if (dy > 90 && Math.abs(dy) > Math.abs(dx) * 1.5) closeBox(false);
  }, { passive: true });

  /* ---------- review form: stars and a few words, sent privately to us ---------- */

  const reviewKey = `jolero_review_${id}`;

  function setupReview() {
    $("review").hidden = false;
    let sent = null;
    try { sent = JSON.parse(localStorage.getItem(reviewKey) || "null"); } catch (e) { /* storage blocked */ }
    if (sent) return showThanks(sent);

    $("review-name").value = man.client || "";
    const inputs = [...document.querySelectorAll("#stars input")];
    let chosen = 0;
    const paint = (n) => inputs.forEach((inp, i) => inp.parentElement.classList.toggle("is-on", i < n));
    inputs.forEach((inp, i) => {
      inp.addEventListener("change", () => {
        chosen = i + 1;
        paint(chosen);
        $("review-send").disabled = false;
      });
      inp.parentElement.addEventListener("mouseenter", () => paint(i + 1));
      inp.parentElement.addEventListener("mouseleave", () => paint(chosen));
    });

    $("review-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!chosen) return;
      const send = $("review-send");
      const error = $("review-error");
      send.disabled = true;
      send.textContent = "Sending…";
      error.hidden = true;
      const name = $("review-name").value.trim();
      try {
        const res = await fetch(base + "review", {
          method: "POST",
          headers: { "content-type": "application/json" },
          referrerPolicy: "no-referrer",
          body: JSON.stringify({
            stars: chosen,
            text: $("review-text").value.trim(),
            name,
            consent: $("review-consent").checked,
          }),
        });
        if (!res.ok) throw new Error(String(res.status));
        const record = { stars: chosen, name };
        try { localStorage.setItem(reviewKey, JSON.stringify(record)); } catch (e2) { /* fine without */ }
        showThanks(record);
      } catch (err) {
        error.textContent = "That didn't send. Please try again, or message us on Instagram.";
        error.hidden = false;
        send.disabled = false;
        send.textContent = "Send review";
      }
    });
  }

  function showThanks(record) {
    $("review-form").hidden = true;
    $("review-thanks").hidden = false;
    const n = Math.min(Math.max(Number(record.stars) || 0, 0), 5);
    $("thanks-stars").textContent = "★".repeat(n) + "☆".repeat(5 - n);
    const first = String(record.name || "").trim().split(/\s+/)[0];
    const title = $("thanks-title");
    title.textContent = first ? `Thank you, ${first}` : "Thank you";
    title.appendChild(el("span", "dot", "."));
  }

  /* ---------- other files ---------- */

  function renderFiles(files) {
    const list = $("file-list");
    list.textContent = "";
    $("files").hidden = !files.length;
    $("files-count").textContent = pad(files.length, 2);
    for (const it of files) {
      const li = el("li", "file-row");
      li.appendChild(el("span", "file-name", it.name || "File"));
      li.appendChild(el("span", "file-size", size(it.bytes || 0)));
      if (!isLocked) li.appendChild(downloadLink(url(it.o, true), "Download", "btn btn-ghost btn-sm"));
      list.appendChild(li);
    }
  }

  window.addEventListener("hashchange", () => location.reload());
  load();
})();
