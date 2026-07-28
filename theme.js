/* ============================================================
   JOLERO MEDIA — theme.js

   Wires the light/dark toggles. Applying the theme already happened
   in the inline <head> bootstrap (before first paint, so no flash);
   this handles clicks, live OS changes, other open tabs, and the
   browser-chrome colour on phones.

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

  /* Address-bar / status-bar colour on phones. The HTML ships a
     media-attribute pair for the no-JS case; once we know the real
     resolved theme we pin both tags to it. */
  function syncMeta() {
    var col = isLight() ? "#F5F5F3" : "#0A0A0A";
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < metas.length; i++) {
      metas[i].setAttribute("content", col);
      metas[i].removeAttribute("media");
    }
  }

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
    syncMeta();
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
    var onOs = function (e) {
      var saved = null;
      try { saved = localStorage.getItem(KEY); } catch (err) {}
      if (!saved) apply(e.matches);
    };
    if (mq.addEventListener) mq.addEventListener("change", onOs);
    else if (mq.addListener) mq.addListener(onOs);
  } catch (e) {}

  // A toggle in one tab updates every other open tab; storage events
  // only fire in the tabs that didn't make the change.
  try {
    window.addEventListener("storage", function (e) {
      if (e.key !== KEY) return;
      if (e.newValue) apply(e.newValue === "light");
      else apply(window.matchMedia("(prefers-color-scheme: light)").matches);
    });
  } catch (e) {}

  relabel();
  syncMeta();
})();
