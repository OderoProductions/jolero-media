/* ============================================================
   JOLERO MEDIA — reveal.js  (project pages)

   Things ease in as they arrive: the hero title and its footage settle on
   load, then text, films, clip rails and photos rise and fade in as you
   scroll to them. Photos in a grid arrive a beat apart, left to right;
   clips in a rail arrive together as a row, so a sideways rail never
   leaves half its clips hidden off to the right.

   Loaded in <head> (not deferred) so the hidden starting state is set
   before the page first paints, with no flash of content. Nothing is ever
   hidden without JavaScript, with reduced motion on, in a browser without
   IntersectionObserver, or if anything below fails.
   ============================================================ */

(function () {
  "use strict";
  var root = document.documentElement;
  if (!("IntersectionObserver" in window)) return;
  if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  root.classList.add("pr");

  // Belt and braces: if the page never wires up, show everything anyway
  var failsafe = setTimeout(function () { root.classList.remove("pr"); }, 6000);

  function setup() {
    var main = document.querySelector(".project-page");
    if (!main) { root.classList.remove("pr"); clearTimeout(failsafe); return; }

    // [selector, how far apart its items arrive, how many per row before the delay restarts]
    var groups = [
      { items: ".project-hero-inner > *", trigger: ".project-hero", step: 0.1, start: 0.15 },
      { items: ".clip", trigger: ".clip-rail", step: 0.1 },
      { items: ".project-gallery .work-tile", step: 0.06, wrap: 5 },
      { items: ".legal-inner > *" },
      { items: ".project-video" },
      { items: ".project-next" }
    ];

    var byTrigger = new Map();
    groups.forEach(function (g) {
      var seen = new Map();
      main.querySelectorAll(g.items).forEach(function (el) {
        var trigger = g.trigger ? el.closest(g.trigger) || el : el;
        var siblings = el.parentNode;
        var i = seen.get(siblings) || 0;
        seen.set(siblings, i + 1);
        var delay = (g.start || 0) + (g.step ? (g.wrap ? i % g.wrap : i) * g.step : 0);
        el.classList.add("pr-item");
        if (delay) el.style.setProperty("--pr-delay", delay.toFixed(2) + "s");
        if (!byTrigger.has(trigger)) byTrigger.set(trigger, []);
        byTrigger.get(trigger).push(el);
      });
    });

    // The hero footage settles from a slight zoom as the page opens
    var heroMedia = main.querySelector(".project-hero-img");
    if (heroMedia) {
      main.querySelectorAll(".project-hero-img").forEach(function (m) { m.classList.add("pr-zoom"); });
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          main.querySelectorAll(".pr-zoom").forEach(function (m) { m.classList.add("in"); });
        });
      });
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        (byTrigger.get(e.target) || []).forEach(function (el) { el.classList.add("in"); });
        io.unobserve(e.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    byTrigger.forEach(function (_, trigger) { io.observe(trigger); });
    clearTimeout(failsafe);
  }

  function safeSetup() {
    try { setup(); } catch (err) { root.classList.remove("pr"); clearTimeout(failsafe); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", safeSetup);
  else safeSetup();
})();
