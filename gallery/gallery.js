/* Jolero client gallery: reads one manifest from the gallery worker and
   renders it. Everything from the manifest goes in via textContent and
   every file key is checked against the same pattern the worker enforces,
   so a manifest can never inject markup or point links elsewhere. */
(() => {
  "use strict";

  const LOCAL = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  const API = LOCAL ? "http://localhost:8787" : "https://jolero-gallery.jolero-gallery-worker.workers.dev";
  const ID_RE = /^[A-Za-z0-9_-]{16,64}$/;
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

  const id = decodeURIComponent(location.hash.slice(1)).trim();
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
    render(man);
  }

  /* ---------- render ---------- */

  function render(man) {
    const items = Array.isArray(man.items) ? man.items : [];
    const photos = items.filter((it) => it.type === "photo" && url(it.t) && url(it.p));
    const videos = items.filter((it) => it.type === "video" && url(it.t) && url(it.p));
    const files = items.filter((it) => !photos.includes(it) && !videos.includes(it) && url(it.o));
    const locked = !!man.locked;
    isLocked = locked;

    document.title = `${man.title || "Your gallery"} | Jolero Media`;
    setTitle(man.title || "Your gallery");

    const osd = $("meta");
    const bit = (strong, rest) => {
      const s = el("span");
      if (strong) s.appendChild(el("b", null, strong));
      if (rest) s.appendChild(document.createTextNode(strong ? ` ${rest}` : rest));
      osd.appendChild(s);
    };
    if (man.client) bit(man.client);
    if (photos.length) bit(pad(photos.length, 2), photos.length === 1 ? "photo" : "photos");
    if (videos.length) bit(pad(videos.length, 2), videos.length === 1 ? "video" : "videos");
    if (files.length) bit(pad(files.length, 2), files.length === 1 ? "file" : "files");
    if (man.expires) bit("", `Available until ${day(man.expires)}`);
    $("notice").hidden = !locked;
    if (typeof man.message === "string" && man.message.trim()) {
      $("message").textContent = man.message.trim();
      $("message").hidden = false;
    }
    $("usage").hidden = false;

    if (man.zip && url(man.zip.o) && !locked && items.length > 1) {
      const all = $("download-all");
      all.href = url(man.zip.o, true);
      $("download-all-size").textContent = size(man.zip.bytes || 0);
      all.hidden = false;
    }

    if (videos.length) renderVideos(videos, locked);
    if (photos.length) renderPhotos(photos, locked);
    if (files.length) renderFiles(files, locked);
  }

  function renderVideos(videos, locked) {
    $("videos").hidden = false;
    $("videos-count").textContent = pad(videos.length, 2);
    const row = $("video-row");
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
      if (!locked) info.appendChild(downloadLink(url(it.o, true), "Download", "btn btn-ghost btn-sm"));
      card.appendChild(info);
      row.appendChild(card);
    }
  }

  /* ---------- photos: justified rows ---------- */

  let tiles = [];
  let shown = [];
  let isLocked = false;

  function renderPhotos(photos, locked) {
    shown = photos;
    $("photos").hidden = false;
    $("photos-count").textContent = pad(photos.length, 2);
    const grid = $("grid");
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
      if (!locked) {
        const dl = downloadLink(url(it.o, true), null, "tile-dl");
        dl.setAttribute("aria-label", `Download ${it.name || "photo"}`);
        fig.appendChild(dl);
      }
      grid.appendChild(fig);
      const ar = it.w && it.h ? it.w / it.h : 1.5;
      return { el: fig, ar: Math.min(Math.max(ar, 0.4), 3) };
    });
    layout();
    let frame = 0;
    new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(layout);
    }).observe(grid);
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

  /* ---------- lightbox ---------- */

  const box = $("lightbox");
  const boxImg = $("lb-img");
  let current = -1;
  let opener = null;
  let fromHistory = false;

  function openBox(i) {
    opener = document.activeElement;
    box.hidden = false;
    document.documentElement.classList.add("is-locked");
    history.pushState({ lightbox: true }, "");
    show(i);
    $("lb-close").focus();
  }

  function closeBox() {
    if (box.hidden) return;
    box.hidden = true;
    current = -1;
    boxImg.removeAttribute("src");
    document.documentElement.classList.remove("is-locked");
    if (!fromHistory && history.state && history.state.lightbox) history.back();
    fromHistory = false;
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

  $("lb-close").addEventListener("click", closeBox);
  $("lb-prev").addEventListener("click", () => show(current - 1));
  $("lb-next").addEventListener("click", () => show(current + 1));
  $("lb-stage").addEventListener("click", (e) => { if (e.target === e.currentTarget) closeBox(); });
  window.addEventListener("popstate", () => { fromHistory = true; closeBox(); });

  document.addEventListener("keydown", (e) => {
    if (box.hidden) return;
    if (e.key === "Escape") closeBox();
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
    else if (dy > 90 && Math.abs(dy) > Math.abs(dx) * 1.5) closeBox();
  }, { passive: true });

  /* ---------- other files ---------- */

  function renderFiles(files, locked) {
    $("files").hidden = false;
    $("files-count").textContent = pad(files.length, 2);
    const list = $("file-list");
    for (const it of files) {
      const li = el("li", "file-row");
      li.appendChild(el("span", "file-name", it.name || "File"));
      li.appendChild(el("span", "file-size", size(it.bytes || 0)));
      if (!locked) li.appendChild(downloadLink(url(it.o, true), "Download", "btn btn-ghost btn-sm"));
      list.appendChild(li);
    }
  }

  window.addEventListener("hashchange", () => location.reload());
  load();
})();
