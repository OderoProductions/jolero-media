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
  const KEY_RE = /^[tpov]\/[A-Za-z0-9][A-Za-z0-9._-]{0,180}$/; // v/ = a video that is its own preview

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
  let flat = null;        // the one folder, when a gallery is a single folder shown flat

  const usable = (it) => (it.type === "photo" || it.type === "video") ? url(it.t) && url(it.p) : url(it.o);

  function setup(m) {
    man = m;
    flat = null;
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
      flat = folders[0];
      root = flat.items;
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
    maybeAdmin();
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

  /* Download all: built on the fly by the worker from the originals when
     every file in it has a CRC in the manifest (galleries made since
     October 2026, and older ones once they've been edited), otherwise the
     zip stored with the gallery. One zip stays under 4 GB. */
  const ZIP_MAX = 4 * 1024 ** 3 - 64 * 1024 ** 2;
  function zipFor(items, scope, stored) {
    if (isLocked || items.length < 2) return null;
    if (items.every((it) => Number.isInteger(it.crc) && url(it.o))) {
      const bytes = items.reduce((n, it) => n + (it.bytes || 0), 0);
      return bytes < ZIP_MAX ? { href: `${API}/g/${id}/zip/${scope}.zip?dl=1`, bytes } : null;
    }
    return stored && url(stored.o) ? { href: url(stored.o, true), bytes: stored.bytes || 0 } : null;
  }

  function setDownloadAll(zip) {
    const all = $("download-all");
    if (zip) {
      all.href = zip.href;
      $("download-all-size").textContent = size(zip.bytes);
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
    // the client's name, unless it just repeats the title (e.g. Coach Manowar)
    if (man.client && slug(man.client) !== slug(man.title || "")) parts.push([man.client, ""]);
    if (folders.length) parts.push([pad(folders.length, 2), plural(folders.length, "folder")]);
    parts.push(...counts(all));
    if (man.expires) parts.push(["", `Available until ${day(man.expires)}`]);
    setOsd(parts);
    const note = typeof man.message === "string" ? man.message.trim() : "";
    $("message").textContent = note;
    $("message").hidden = !note;
    setDownloadAll(folders.length ? zipFor(all, "all", null)
      : flat ? zipFor(root, flat.id, flat.zip) : zipFor(root, "all", man.zip));
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
    setDownloadAll(zipFor(f.items, f.id, f.zip));
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
      const fz = zipFor(f.items, f.id, f.zip);
      if (fz) {
        const dl = downloadLink(fz.href, "Download all", "folder-dl");
        dl.appendChild(el("span", "btn-meta", size(fz.bytes)));
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

  /* ---------- lightbox: sliding photos and a filmstrip ---------- */

  const box = $("lightbox");
  const stage = $("lb-stage");
  const track = $("lb-track");
  const strip = $("lb-strip");
  const slides = [...track.children];          // three slide elements
  let order = [0, 1, 2];                         // which element is previous, current, next
  let current = -1;
  let opener = null;
  let skipPop = false;
  let sliding = false;
  let stripFor = null;                           // the photo list the strip was built for
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  function fillSlide(el, i) {
    const img = el.querySelector("img");
    el.dataset.i = String(i);
    if (i < 0 || i >= shown.length) { img.removeAttribute("src"); return; }
    const it = shown[i];
    img.src = url(it.t); // the thumbnail is already cached, so something shows at once
    const sharp = new Image();
    sharp.onload = () => { if (el.dataset.i === String(i)) img.src = sharp.src; };
    sharp.src = url(it.p);
  }

  function place() {
    order.forEach((n, pos) => { slides[n].style.transform = `translateX(${(pos - 1) * 100}%)`; });
  }

  function setTrack(px, animate) {
    track.classList.toggle("is-sliding", !!animate && !reduceMotion);
    track.style.transform = `translateX(${px}px)`;
  }

  function dealAround(i) {
    current = i;
    fillSlide(slides[order[0]], i - 1);
    fillSlide(slides[order[1]], i);
    fillSlide(slides[order[2]], i + 1);
    place();
    setTrack(0, false);
    updateMeta();
  }

  function updateMeta() {
    const it = shown[current];
    $("lb-count").textContent = `${pad(current + 1, 3)} / ${pad(shown.length, 3)}`;
    $("lb-name").textContent = it.name || "";
    const dl = $("lb-dl");
    dl.hidden = isLocked;
    dl.href = url(it.o, true);
    $("lb-prev").disabled = current === 0;
    $("lb-next").disabled = current === shown.length - 1;
    for (const n of [current + 2, current - 2]) if (shown[n]) new Image().src = url(shown[n].p);
    markStrip();
  }

  // Slide one photo along: dir +1 = next, -1 = previous
  function go(dir) {
    const target = current + dir;
    if (sliding) return;
    if (target < 0 || target >= shown.length) { setTrack(0, true); return; }
    const width = stage.clientWidth;
    const finish = () => {
      order = dir > 0 ? [order[1], order[2], order[0]] : [order[2], order[0], order[1]];
      current = target;
      fillSlide(slides[dir > 0 ? order[2] : order[0]], current + dir);
      place();
      setTrack(0, false);
      sliding = false;
      updateMeta();
    };
    if (reduceMotion) { finish(); return; }
    sliding = true;
    setTrack(-dir * width, true);
    let done = false;
    const end = () => { if (!done) { done = true; finish(); } };
    track.addEventListener("transitionend", end, { once: true });
    setTimeout(end, 420); // in case transitionend never fires
  }

  // Jump straight to a photo picked from the strip
  function jump(i) {
    if (i === current || sliding) return;
    if (Math.abs(i - current) === 1) { go(i - current); return; }
    dealAround(i);
    const img = slides[order[1]].querySelector("img");
    img.classList.remove("is-jump");
    void img.offsetWidth; // restart the fade
    img.classList.add("is-jump");
  }

  function buildStrip() {
    if (stripFor === shown) return;
    stripFor = shown;
    strip.textContent = "";
    shown.forEach((it, i) => {
      const b = el("button", "lb-thumb");
      b.type = "button";
      b.setAttribute("aria-label", `Photo ${i + 1}: ${it.name || ""}`);
      const img = document.createElement("img");
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      img.src = url(it.t);
      b.appendChild(img);
      b.addEventListener("click", () => jump(i));
      strip.appendChild(b);
    });
  }

  function markStrip() {
    const thumbs = strip.children;
    for (let n = 0; n < thumbs.length; n++) thumbs[n].classList.toggle("is-current", n === current);
    const t = thumbs[current];
    if (t) {
      const left = t.offsetLeft - (strip.clientWidth - t.offsetWidth) / 2;
      strip.scrollTo({ left, behavior: reduceMotion ? "auto" : "smooth" });
    }
  }

  function openBox(i) {
    opener = document.activeElement;
    box.hidden = false;
    document.documentElement.classList.add("is-locked");
    history.pushState({ ...(history.state || {}), lightbox: true }, "");
    buildStrip();
    order = [0, 1, 2];
    dealAround(i);
    $("lb-close").focus();
  }

  function closeBox(viaHistory) {
    if (box.hidden) return;
    box.hidden = true;
    current = -1;
    sliding = false;
    slides.forEach((s) => { s.querySelector("img").removeAttribute("src"); s.dataset.i = ""; });
    document.documentElement.classList.remove("is-locked");
    if (!viaHistory && history.state && history.state.lightbox) {
      skipPop = true; // undo our own history entry without re-rendering the page
      history.back();
    }
    if (opener) opener.focus();
  }

  $("lb-close").addEventListener("click", () => closeBox(false));
  $("lb-prev").addEventListener("click", () => go(-1));
  $("lb-next").addEventListener("click", () => go(1));

  window.addEventListener("popstate", (e) => {
    if (skipPop) { skipPop = false; return; }
    if (!box.hidden) { closeBox(true); return; }
    if (man) { route(e.state); window.scrollTo(0, 0); }
  });

  document.addEventListener("keydown", (e) => {
    if (box.hidden) return;
    if (e.key === "Escape") closeBox(false);
    else if (e.key === "ArrowLeft") go(-1);
    else if (e.key === "ArrowRight") go(1);
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

  /* Drag with a finger (or the mouse): the photo follows, and letting go past a
     fifth of the width, or with a quick flick, slides to the neighbour. A
     downward swipe closes the viewer, like a phone's photo app. */
  let drag = null;
  stage.addEventListener("pointerdown", (e) => {
    if (sliding || (e.pointerType === "mouse" && e.button !== 0)) return;
    drag = { x: e.clientX, y: e.clientY, t: performance.now(), dx: 0, dy: 0, moving: false, id: e.pointerId };
  });
  stage.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.dx = e.clientX - drag.x;
    drag.dy = e.clientY - drag.y;
    if (!drag.moving && Math.abs(drag.dx) > 8 && Math.abs(drag.dx) > Math.abs(drag.dy)) {
      drag.moving = true;
      stage.setPointerCapture(e.pointerId);
    }
    if (drag.moving) {
      const atEnd = (drag.dx > 0 && current === 0) || (drag.dx < 0 && current === shown.length - 1);
      setTrack(atEnd ? drag.dx / 3 : drag.dx, false); // resist past the first and last photo
    }
  });
  const release = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (d.moving) {
      stage.dataset.dragged = "1"; // so the click that follows doesn't close the viewer
      const v = d.dx / Math.max(performance.now() - d.t, 1); // px per ms
      const w = stage.clientWidth;
      if (d.dx < -w * 0.2 || v < -0.45) go(1);
      else if (d.dx > w * 0.2 || v > 0.45) go(-1);
      else setTrack(0, true);
    }
  };
  stage.addEventListener("pointerup", release);
  stage.addEventListener("pointercancel", release);
  // Swipe down to close. Touch events, because the browser may claim a vertical
  // pan for itself and cancel the pointer events partway through.
  let touch0 = null;
  stage.addEventListener("touchstart", (e) => {
    touch0 = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
  }, { passive: true });
  stage.addEventListener("touchend", (e) => {
    if (!touch0) return;
    const dx = e.changedTouches[0].clientX - touch0.x;
    const dy = e.changedTouches[0].clientY - touch0.y;
    touch0 = null;
    if (dy > 90 && dy > Math.abs(dx) * 1.5) closeBox(false);
  }, { passive: true });
  stage.addEventListener("click", (e) => {
    if (stage.dataset.dragged) { delete stage.dataset.dragged; return; }
    if (e.target.classList.contains("lb-slide")) closeBox(false); // a click beside the photo closes
  });

  /* ---------- review form: stars and a few words, sent privately to us ---------- */

  const reviewKey = `jolero_review_${id}`;
  let reviewWired = false;

  function setupReview() {
    $("review").hidden = false;
    if (reviewWired) return; // already set up (the page re-renders after an edit)
    reviewWired = true;
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

  /* ---------- admin: the Edit tab ----------
     Only for someone signed into the portal as an admin in this browser, on
     this same site: the portal keeps its sign-in in this origin's storage,
     so a client's browser never has one and never loads any of this. The
     worker checks the sign-in again on every change anyway. */
  let adminLoaded = false;
  function maybeAdmin() {
    if (adminLoaded) { if (window.JoleroGalleryAdmin) window.JoleroGalleryAdmin.refresh(); return; }
    let signedIn = null;
    try { signedIn = localStorage.getItem("jolero_session"); } catch (e) { /* storage blocked */ }
    if (!signedIn) return;
    adminLoaded = true;
    window.JoleroGallery = {
      id,
      api: API,
      url,
      size,
      slug,
      // the editor saves, then hands the new manifest back to be shown
      show(m) {
        setup(JSON.parse(JSON.stringify(m)));
      },
      route: () => route(history.state),
    };
    const add = (src) => new Promise((resolve, reject) => {
      const tag = document.createElement("script");
      tag.src = src;
      tag.onload = resolve;
      tag.onerror = reject;
      document.head.appendChild(tag);
    });
    add("../portal/supabase-config.js?v=20261014")
      .then(() => add("../portal/auth.js?v=20261014"))
      .then(() => add("gallery-admin.js?v=1"))
      .catch(() => { /* no portal on this site: nothing to edit with */ });
  }

  window.addEventListener("hashchange", () => location.reload());
  load();
})();
