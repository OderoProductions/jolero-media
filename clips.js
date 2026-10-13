/* Project page clips (self-hosted on the gallery worker, see the
   jolero-gallery README). Each <video> inside [data-clips] gets its own
   controls: play/pause, a playhead you can drag, the time and (if the
   clip has sound) a speaker button. Clips play silently while they're on
   screen and pause when they're not, unless someone has paused one
   themselves, in which case it stays paused until they press play.
   Desktop: hover shows the bar and a click on the clip plays or pauses it.
   Touch: a tap shows the bar for a few seconds.
   A [data-carousel] rail also gets previous/next buttons and a count from
   the .rail-controls block right after it.
   Without JavaScript the videos keep their native controls; with reduced
   motion on, nothing plays by itself. */
(() => {
  "use strict";
  const videos = [...document.querySelectorAll("[data-clips] video")];
  if (!videos.length) return;

  const autoplay = !matchMedia("(prefers-reduced-motion: reduce)").matches;
  const touch = matchMedia("(hover: none)").matches;
  const pad = (n) => String(n).padStart(2, "0");
  const clock = (s) => {
    s = Math.max(0, Math.floor(s || 0));
    return `${Math.floor(s / 60)}:${pad(s % 60)}`;
  };
  const svg = (paths) =>
    `<svg class="icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${paths}</svg>`;
  const PLAY = svg('<path d="M8 5.5v13l11-6.5z"/>');
  const PAUSE = svg('<rect x="6.5" y="5" width="4" height="14" rx="1"/><rect x="13.5" y="5" width="4" height="14" rx="1"/>');

  const clips = videos.map((v) => {
    const clip = v.closest(".clip");
    const frame = clip.querySelector(".clip-frame");
    v.controls = false;
    v.muted = true;

    const bar = document.createElement("div");
    bar.className = "clip-bar";
    bar.innerHTML = `
      <button class="clip-play" type="button" aria-label="Play">${PLAY}</button>
      <div class="clip-track" role="slider" tabindex="0" aria-label="Playhead" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-valuetext="0:00">
        <span class="clip-fill"></span><span class="clip-head"></span>
      </div>
      <span class="clip-time">0:00</span>`;
    const sound = clip.querySelector(".clip-sound");
    if (sound) { sound.hidden = false; bar.appendChild(sound); }
    frame.appendChild(bar);

    const c = {
      v, clip, frame, bar, sound,
      play: bar.querySelector(".clip-play"),
      track: bar.querySelector(".clip-track"),
      time: bar.querySelector(".clip-time"),
      held: !autoplay,   // paused by the viewer (or never auto-started)
      visible: false,
      hideTimer: 0,
    };
    clip.classList.toggle("is-held", c.held);
    return c;
  });
  const byVideo = new Map(clips.map((c) => [c.v, c]));

  /* ---------- progress: one animation loop for whatever is playing ---------- */

  function paint(c) {
    const d = c.v.duration;
    const p = d ? Math.min(c.v.currentTime / d, 1) : 0;
    c.frame.style.setProperty("--p", `${(p * 100).toFixed(2)}%`);
    c.time.textContent = d ? `${clock(c.v.currentTime)} / ${clock(d)}` : clock(c.v.currentTime);
    c.track.setAttribute("aria-valuenow", String(Math.round(p * 100)));
    c.track.setAttribute("aria-valuetext", clock(c.v.currentTime));
  }
  let loop = 0;
  function tick() {
    let any = false;
    for (const c of clips) if (!c.v.paused) { paint(c); any = true; }
    loop = any ? requestAnimationFrame(tick) : 0;
  }
  const kick = () => { if (!loop) loop = requestAnimationFrame(tick); };

  /* ---------- play / pause ---------- */

  function setPlayIcon(c) {
    const playing = !c.v.paused;
    c.play.innerHTML = playing ? PAUSE : PLAY;
    c.play.setAttribute("aria-label", playing ? "Pause" : "Play");
    c.clip.classList.toggle("is-playing", playing);
  }

  function toggle(c) {
    if (c.v.paused) {
      c.held = false;
      c.v.play().catch(() => {});
    } else {
      c.held = true;
      c.v.pause();
    }
    c.clip.classList.toggle("is-held", c.held);
  }

  for (const c of clips) {
    c.v.addEventListener("play", () => { setPlayIcon(c); kick(); });
    c.v.addEventListener("pause", () => { setPlayIcon(c); paint(c); });
    c.v.addEventListener("loadedmetadata", () => paint(c));
    c.v.addEventListener("seeked", () => paint(c));

    c.play.addEventListener("click", (e) => { e.stopPropagation(); toggle(c); showBar(c); });
    c.bar.addEventListener("click", (e) => e.stopPropagation());

    // Click on the picture: desktop plays/pauses, touch shows the bar
    c.v.addEventListener("click", () => {
      if (touch) {
        if (c.clip.classList.contains("show-bar")) hideBar(c);
        else showBar(c);
      } else {
        toggle(c);
      }
    });
  }

  function showBar(c) {
    c.clip.classList.add("show-bar");
    clearTimeout(c.hideTimer);
    if (touch) c.hideTimer = setTimeout(() => { if (!c.v.paused) hideBar(c); }, 3000);
  }
  function hideBar(c) {
    clearTimeout(c.hideTimer);
    c.clip.classList.remove("show-bar");
  }

  /* ---------- playhead: drag, click or arrow keys ---------- */

  for (const c of clips) {
    let dragging = false;
    const seekTo = (clientX) => {
      const r = c.track.getBoundingClientRect();
      const ratio = Math.min(Math.max((clientX - r.left) / r.width, 0), 1);
      const go = () => {
        c.v.currentTime = ratio * c.v.duration;
        paint(c);
      };
      if (c.v.duration) go();
      else {
        // nothing loaded yet: load, then jump
        c.v.preload = "metadata";
        c.v.addEventListener("loadedmetadata", go, { once: true });
        c.v.load();
      }
    };
    c.track.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      dragging = true;
      c.track.setPointerCapture(e.pointerId);
      c.clip.classList.add("is-scrubbing");
      seekTo(e.clientX);
      showBar(c);
    });
    c.track.addEventListener("pointermove", (e) => { if (dragging) seekTo(e.clientX); });
    const end = () => { dragging = false; c.clip.classList.remove("is-scrubbing"); showBar(c); };
    c.track.addEventListener("pointerup", end);
    c.track.addEventListener("pointercancel", end);
    c.track.addEventListener("keydown", (e) => {
      if (!c.v.duration) return;
      const step = e.shiftKey ? 5 : 1;
      if (e.key === "ArrowRight") c.v.currentTime = Math.min(c.v.duration, c.v.currentTime + step);
      else if (e.key === "ArrowLeft") c.v.currentTime = Math.max(0, c.v.currentTime - step);
      else if (e.key === "Home") c.v.currentTime = 0;
      else return;
      e.preventDefault();
      paint(c);
    });
  }

  /* ---------- sound: one clip at a time ---------- */

  function markSound(c) {
    if (!c.sound) return;
    c.sound.classList.toggle("is-on", !c.v.muted);
    c.sound.setAttribute("aria-pressed", String(!c.v.muted));
    c.sound.setAttribute("aria-label", c.v.muted ? "Turn sound on" : "Turn sound off");
  }
  for (const c of clips) {
    if (!c.sound) continue;
    c.sound.addEventListener("click", (e) => {
      e.stopPropagation();
      const turnOn = c.v.muted;
      for (const o of clips) if (o !== c && !o.v.muted) { o.v.muted = true; markSound(o); }
      c.v.muted = !turnOn;
      if (turnOn && c.v.paused) { c.held = false; c.clip.classList.remove("is-held"); c.v.play().catch(() => {}); }
      markSound(c);
      showBar(c);
    });
  }

  /* ---------- play what's on screen, pause what isn't ---------- */

  const watcher = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const c = byVideo.get(e.target);
      c.visible = e.isIntersecting && e.intersectionRatio >= 0.6;
      if (c.visible && !c.held) c.v.play().catch(() => {});
      else if (!c.visible) c.v.pause();
    }
  }, { threshold: [0, 0.6] });
  clips.forEach((c) => watcher.observe(c.v));

  /* ---------- carousels ---------- */

  document.querySelectorAll("[data-carousel]").forEach((rail) => {
    const controls = rail.nextElementSibling;
    if (!controls || !controls.classList.contains("rail-controls")) return;
    const slides = [...rail.children];
    const [prev, next] = controls.querySelectorAll("button");
    const count = controls.querySelector(".rail-count");
    let index = 0;
    controls.hidden = false;

    const go = (i) => {
      const s = slides[Math.max(0, Math.min(slides.length - 1, i))];
      rail.scrollTo({ left: s.offsetLeft - rail.offsetLeft - (rail.clientWidth - s.clientWidth) / 2, behavior: "smooth" });
    };
    prev.addEventListener("click", () => go(index - 1));
    next.addEventListener("click", () => go(index + 1));

    // A click on a clip peeking in from the side brings it to the middle
    slides.forEach((s, i) => {
      s.addEventListener("click", (e) => {
        if (i === index) return;
        e.stopPropagation();
        e.preventDefault();
        go(i);
      }, true);
    });

    const seen = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        index = slides.indexOf(e.target);
        count.textContent = `${pad(index + 1)} / ${pad(slides.length)}`;
        prev.disabled = index === 0;
        next.disabled = index === slides.length - 1;
      }
    }, { root: rail, threshold: 0.6 });
    slides.forEach((s) => seen.observe(s));
  });
})();
