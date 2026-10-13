/* Project page clips (self-hosted on the gallery worker, see the
   jolero-gallery README): each <video> inside [data-clips] plays silently
   while it's on screen and pauses when it isn't. A speaker button turns the
   sound on for one clip at a time. A [data-carousel] rail gets previous/next
   buttons and a count, from the .rail-controls block right after it.
   Without JavaScript, or with reduced motion on, the videos keep their
   native controls and nothing plays by itself. */
(() => {
  "use strict";
  const videos = [...document.querySelectorAll("[data-clips] video")];
  if (!videos.length || matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const pad = (n) => String(n).padStart(2, "0");

  videos.forEach((v) => {
    v.controls = false;
    v.muted = true;
  });

  const watcher = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting && e.intersectionRatio >= 0.6) e.target.play().catch(() => {});
      else e.target.pause();
    }
  }, { threshold: [0, 0.6] });
  videos.forEach((v) => watcher.observe(v));

  function mark(v) {
    const b = v.closest(".clip").querySelector(".clip-sound");
    if (!b) return;
    b.classList.toggle("is-on", !v.muted);
    b.setAttribute("aria-pressed", String(!v.muted));
    b.setAttribute("aria-label", v.muted ? "Turn sound on" : "Turn sound off");
  }

  document.querySelectorAll(".clip-sound").forEach((btn) => {
    const v = btn.closest(".clip").querySelector("video");
    btn.hidden = false;
    btn.addEventListener("click", () => {
      const turnOn = v.muted;
      videos.forEach((o) => { if (o !== v && !o.muted) { o.muted = true; mark(o); } });
      v.muted = !turnOn;
      if (turnOn) v.play().catch(() => {});
      mark(v);
    });
  });

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
