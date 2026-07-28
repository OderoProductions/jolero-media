/* ============================================================
   JOLERO MEDIA — theme.js

   Wires the light/dark toggles. Applying the theme already happened
   in the inline <head> bootstrap (before first paint, so no flash);
   this handles clicks and live OS changes.

   Precedence:
     1. an explicit choice the visitor made  (localStorage jolero_theme)
     2. otherwise the OS setting             (prefers-color-scheme)
     3. otherwise dark                       (brand default, and what
                                              you get with JS disabled)

   Runs once even if the file ends up included twice, and listens at
   document level so toggles added to the page later still work.
   ============================================================ */

(function () {
  "use strict";

  if (window.__joleroThemeReady) return;   // idempotent: never double-bind
  window.__joleroThemeReady = true;

  var KEY = "jolero_theme";
  var SELECTOR = ".theme-btn, #theme-toggle";
  var root = document.documentElement;

  function isLight() { return root.classList.contains("theme-light"); }

  function relabel() {
    var btns = document.querySelectorAll(SELECTOR);
    for (var i = 0; i < btns.length; i++) {
      btns[i].setAttribute("aria-label", isLight() ? "Switch to dark mode" : "Switch to light mode");
      btns[i].setAttribute("aria-pressed", String(isLight()));
    }
  }

  function apply(light) {
    root.classList.toggle("theme-light", light);
    relabel();
  }

  document.addEventListener("click", function (e) {
    var btn = e.target.closest ? e.target.closest(SELECTOR) : null;
    if (!btn) return;
    var light = !isLight();
    apply(light);
    try { localStorage.setItem(KEY, light ? "light" : "dark"); } catch (err) {}
  });

  // Follow the OS live, but only while the visitor hasn't chosen for themselves
  try {
    var mq = window.matchMedia("(prefers-color-scheme: light)");
    var onChange = function (e) {
      var saved = null;
      try { saved = localStorage.getItem(KEY); } catch (err) {}
      if (!saved) apply(e.matches);
    };
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange);
  } catch (e) {}

  relabel();
})();
