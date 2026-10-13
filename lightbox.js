/* Project page photo viewer. Any .project-gallery on a page becomes
   clickable: a photo opens full screen, photos slide (drag, swipe, arrows,
   arrow keys), and a filmstrip of the whole gallery runs along the bottom.
   There's no download button, and right-click / drag-to-save are switched
   off on gallery photos. That stops casual saving; nothing on a web page
   can stop a screenshot.
   Same viewer as the client gallery page (gallery/gallery.js), restyled for
   the site; the markup is built here so a page only needs the script tag. */
(() => {
  "use strict";
  const galleries = [...document.querySelectorAll(".project-gallery")];
  if (!galleries.length) return;

  const pad = (n) => String(n).padStart(2, "0");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const icon = (d) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;

  /* ---------- the viewer, built once ---------- */

  const box = document.createElement("div");
  box.className = "plb";
  box.hidden = true;
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-label", "Photo viewer");
  box.innerHTML = `
    <div class="plb-bar">
      <span class="plb-count"></span>
      <span class="plb-caption"></span>
      <button class="plb-btn plb-close" type="button" aria-label="Close">${icon("M6 6l12 12M18 6 6 18")}</button>
    </div>
    <div class="plb-stage">
      <div class="plb-track">
        <div class="plb-slide"><img alt="" draggable="false"></div>
        <div class="plb-slide"><img alt="" draggable="false"></div>
        <div class="plb-slide"><img alt="" draggable="false"></div>
      </div>
    </div>
    <button class="plb-btn plb-nav plb-prev" type="button" aria-label="Previous photo">${icon("M15 5l-7 7 7 7")}</button>
    <button class="plb-btn plb-nav plb-next" type="button" aria-label="Next photo">${icon("M9 5l7 7-7 7")}</button>
    <div class="plb-strip" aria-label="All photos"></div>`;
  document.body.appendChild(box);

  const $ = (sel) => box.querySelector(sel);
  const stage = $(".plb-stage");
  const track = $(".plb-track");
  const strip = $(".plb-strip");
  const slides = [...track.children];
  let order = [0, 1, 2];           // which slide element is previous, current, next
  let photos = [];                 // [{src, alt}] for the gallery that's open
  let current = -1;
  let sliding = false;
  let opener = null;
  let skipPop = false;

  // No saving from the viewer or the gallery tiles
  const noSave = (e) => { if (e.target.tagName === "IMG") e.preventDefault(); };
  box.addEventListener("contextmenu", noSave);
  box.addEventListener("dragstart", noSave);

  function fill(el, i) {
    const img = el.querySelector("img");
    if (i < 0 || i >= photos.length) { img.removeAttribute("src"); img.alt = ""; return; }
    img.src = photos[i].src;
    img.alt = photos[i].alt;
  }
  function place() {
    order.forEach((n, pos) => { slides[n].style.transform = `translateX(${(pos - 1) * 100}%)`; });
  }
  function setTrack(px, animate) {
    track.classList.toggle("is-sliding", !!animate && !reduceMotion);
    track.style.transform = `translateX(${px}px)`;
  }
  function deal(i) {
    current = i;
    fill(slides[order[0]], i - 1);
    fill(slides[order[1]], i);
    fill(slides[order[2]], i + 1);
    place();
    setTrack(0, false);
    meta();
  }
  function meta() {
    $(".plb-count").textContent = `${pad(current + 1)} / ${pad(photos.length)}`;
    $(".plb-caption").textContent = photos[current].alt || "";
    $(".plb-prev").disabled = current === 0;
    $(".plb-next").disabled = current === photos.length - 1;
    const thumbs = strip.children;
    for (let n = 0; n < thumbs.length; n++) thumbs[n].classList.toggle("is-current", n === current);
    const t = thumbs[current];
    if (t) strip.scrollTo({ left: t.offsetLeft - (strip.clientWidth - t.offsetWidth) / 2, behavior: reduceMotion ? "auto" : "smooth" });
  }

  // Slide one photo along: dir +1 = next, -1 = previous
  function go(dir) {
    const target = current + dir;
    if (sliding) return;
    if (target < 0 || target >= photos.length) { setTrack(0, true); return; }
    const finish = () => {
      order = dir > 0 ? [order[1], order[2], order[0]] : [order[2], order[0], order[1]];
      current = target;
      fill(slides[dir > 0 ? order[2] : order[0]], current + dir);
      place();
      setTrack(0, false);
      sliding = false;
      meta();
    };
    if (reduceMotion) { finish(); return; }
    sliding = true;
    setTrack(-dir * stage.clientWidth, true);
    let done = false;
    const end = () => { if (!done) { done = true; finish(); } };
    track.addEventListener("transitionend", end, { once: true });
    setTimeout(end, 420); // in case transitionend never fires
  }
  function jump(i) {
    if (i === current || sliding) return;
    if (Math.abs(i - current) === 1) { go(i - current); return; }
    deal(i);
    const img = slides[order[1]].querySelector("img");
    img.classList.remove("is-jump");
    void img.offsetWidth; // restart the fade
    img.classList.add("is-jump");
  }

  function open(list, i) {
    photos = list;
    strip.textContent = "";
    photos.forEach((p, n) => {
      const b = document.createElement("button");
      b.className = "plb-thumb";
      b.type = "button";
      b.setAttribute("aria-label", `Photo ${n + 1}`);
      const img = document.createElement("img");
      img.src = p.src;
      img.alt = "";
      img.loading = "lazy";
      img.draggable = false;
      b.appendChild(img);
      b.addEventListener("click", () => jump(n));
      strip.appendChild(b);
    });
    opener = document.activeElement;
    box.hidden = false;
    document.documentElement.classList.add("plb-open");
    history.pushState({ ...(history.state || {}), plb: true }, "");
    order = [0, 1, 2];
    deal(i);
    $(".plb-close").focus();
  }
  function close(viaHistory) {
    if (box.hidden) return;
    box.hidden = true;
    sliding = false;
    slides.forEach((s) => s.querySelector("img").removeAttribute("src"));
    document.documentElement.classList.remove("plb-open");
    if (!viaHistory && history.state && history.state.plb) { skipPop = true; history.back(); }
    if (opener) opener.focus();
  }

  $(".plb-close").addEventListener("click", () => close(false));
  $(".plb-prev").addEventListener("click", () => go(-1));
  $(".plb-next").addEventListener("click", () => go(1));
  window.addEventListener("popstate", () => {
    if (skipPop) { skipPop = false; return; }
    close(true);
  });
  document.addEventListener("keydown", (e) => {
    if (box.hidden) return;
    if (e.key === "Escape") close(false);
    else if (e.key === "ArrowLeft") go(-1);
    else if (e.key === "ArrowRight") go(1);
    else if (e.key === "Tab") {
      const f = [...box.querySelectorAll("button:not([disabled])")].filter((n) => n.offsetParent !== null);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { f[f.length - 1].focus(); e.preventDefault(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { f[0].focus(); e.preventDefault(); }
    }
  });

  /* Drag with a finger or the mouse: the photo follows, and letting go past a
     fifth of the width, or with a quick flick, slides to the neighbour. */
  let drag = null;
  stage.addEventListener("pointerdown", (e) => {
    if (sliding || (e.pointerType === "mouse" && e.button !== 0)) return;
    drag = { x: e.clientX, y: e.clientY, t: performance.now(), dx: 0, moving: false, id: e.pointerId };
  });
  stage.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.moving && Math.abs(drag.dx) > 8 && Math.abs(drag.dx) > Math.abs(dy)) {
      drag.moving = true;
      stage.setPointerCapture(e.pointerId);
    }
    if (drag.moving) {
      const atEnd = (drag.dx > 0 && current === 0) || (drag.dx < 0 && current === photos.length - 1);
      setTrack(atEnd ? drag.dx / 3 : drag.dx, false);
    }
  });
  const release = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (!d.moving) return;
    stage.dataset.dragged = "1"; // so the click that follows doesn't close the viewer
    const v = d.dx / Math.max(performance.now() - d.t, 1);
    const w = stage.clientWidth;
    if (d.dx < -w * 0.2 || v < -0.45) go(1);
    else if (d.dx > w * 0.2 || v > 0.45) go(-1);
    else setTrack(0, true);
  };
  stage.addEventListener("pointerup", release);
  stage.addEventListener("pointercancel", release);

  // Swipe down to close, like a phone's photo app (touch events, because the
  // browser may claim a vertical pan and cancel the pointer events)
  let t0 = null;
  stage.addEventListener("touchstart", (e) => {
    t0 = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
  }, { passive: true });
  stage.addEventListener("touchend", (e) => {
    if (!t0) return;
    const dx = e.changedTouches[0].clientX - t0.x;
    const dy = e.changedTouches[0].clientY - t0.y;
    t0 = null;
    if (dy > 90 && dy > Math.abs(dx) * 1.5) close(false);
  }, { passive: true });
  stage.addEventListener("click", (e) => {
    if (stage.dataset.dragged) { delete stage.dataset.dragged; return; }
    if (e.target.classList.contains("plb-slide")) close(false); // a click beside the photo closes
  });

  /* ---------- wire up each gallery on the page ---------- */

  galleries.forEach((gallery) => {
    const tiles = [...gallery.querySelectorAll(".work-tile")].filter((t) => t.querySelector("img"));
    const list = tiles.map((t) => {
      const img = t.querySelector("img");
      return { src: img.currentSrc || img.src, alt: img.alt || "" };
    });
    tiles.forEach((t, i) => {
      const img = t.querySelector("img");
      img.draggable = false;
      t.classList.add("is-viewable");
      t.tabIndex = 0;
      t.setAttribute("role", "button");
      t.setAttribute("aria-label", `View photo ${i + 1} of ${tiles.length}${img.alt ? `: ${img.alt}` : ""}`);
      const start = () => open(list.map((p, n) => ({ ...p, src: tiles[n].querySelector("img").currentSrc || p.src })), i);
      t.addEventListener("click", start);
      t.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); start(); }
      });
      t.addEventListener("contextmenu", noSave);
    });
  });
})();
