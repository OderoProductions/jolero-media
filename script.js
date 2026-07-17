/* ============================================================
   PRIME TAPES — script.js
   Vanilla JS only. Everything degrades gracefully with JS off:
   the form falls back to a normal Formspree POST, nav links are
   plain anchors, and content is visible without animations.
   ============================================================ */

(function () {
  "use strict";

  // Signals that JS is live — reveal-on-scroll styles only apply with this class
  document.documentElement.classList.add("js");

  var prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Sticky nav: solid background after leaving the hero top ---------- */

  var nav = document.querySelector(".nav");
  var onScroll = function () {
    nav.classList.toggle("is-scrolled", window.scrollY > 24);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- Mobile menu ---------- */

  var toggle = document.querySelector(".nav-toggle");
  var menu = document.getElementById("mobile-menu");

  function setMenu(open) {
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    menu.hidden = !open;
    document.body.style.overflow = open ? "hidden" : "";
  }

  toggle.addEventListener("click", function () {
    setMenu(toggle.getAttribute("aria-expanded") !== "true");
  });

  // Close the menu when a link inside it is chosen, or on Escape
  menu.addEventListener("click", function (e) {
    if (e.target.closest("a")) setMenu(false);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !menu.hidden) {
      setMenu(false);
      toggle.focus();
    }
  });

  /* ---------- Hero timecode (viewfinder chrome) ---------- */

  var tc = document.getElementById("timecode");
  if (tc && !prefersReducedMotion) {
    var frames = 0;
    var pad = function (n) { return String(n).padStart(2, "0"); };
    setInterval(function () {
      frames = (frames + 1) % (24 * 60 * 60 * 24);
      var f = frames % 24;
      var s = Math.floor(frames / 24) % 60;
      var m = Math.floor(frames / (24 * 60)) % 60;
      var h = Math.floor(frames / (24 * 60 * 60));
      tc.textContent = pad(h) + ":" + pad(m) + ":" + pad(s) + ":" + pad(f);
    }, 1000 / 24);
  }

  /* ---------- Reveal on scroll ---------- */

  var revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !prefersReducedMotion) {
    var revealObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    revealEls.forEach(function (el) { revealObserver.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add("in"); });
  }

  /* ---------- Inline work videos: play only while on screen ----------
     (No .work-video elements exist yet — this activates automatically
     when a portfolio tile's <img> is swapped for a <video class="work-video">.) */

  var workVideos = document.querySelectorAll(".work-video");
  if (workVideos.length && "IntersectionObserver" in window && !prefersReducedMotion) {
    var videoObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) entry.target.play();
        else entry.target.pause();
      });
    }, { threshold: 0.4 });
    workVideos.forEach(function (v) { videoObserver.observe(v); });
  }

  /* ---------- Hero video: respect reduced motion (phase 2) ---------- */

  var heroVideo = document.querySelector(".hero-media video");
  if (heroVideo && prefersReducedMotion) {
    heroVideo.removeAttribute("autoplay");
    heroVideo.pause();
  }

  /* ---------- Work filter ---------- */

  var filterBtns = document.querySelectorAll(".filter-btn");
  var tiles = document.querySelectorAll(".work-tile");
  var emptyNote = document.getElementById("work-empty");

  filterBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var filter = btn.dataset.filter;

      filterBtns.forEach(function (b) {
        var active = b === btn;
        b.classList.toggle("is-active", active);
        b.setAttribute("aria-pressed", String(active));
      });

      var visible = 0;
      tiles.forEach(function (tile) {
        var show = filter === "all" || tile.dataset.sport === filter;
        tile.classList.toggle("is-hidden", !show);
        if (show) {
          visible++;
          tile.classList.add("in"); // never leave a filtered-in tile pre-reveal
        }
      });
      emptyNote.hidden = visible > 0;
    });
  });

  /* ---------- Contact form (Formspree via fetch) ----------
     Works once YOUR_FORM_ID in index.html is replaced — see the
     FORMSPREE SETUP comment above the <form>. */

  var form = document.getElementById("contact-form");
  var success = document.getElementById("form-success");
  var errorNote = document.getElementById("form-error");
  var submitBtn = document.getElementById("form-submit");

  form.addEventListener("submit", function (e) {
    // Let the browser surface native validation messages first
    if (!form.checkValidity()) {
      e.preventDefault();
      form.reportValidity();
      return;
    }

    e.preventDefault();
    errorNote.hidden = true;
    submitBtn.disabled = true;
    submitBtn.textContent = "Sending…";

    fetch(form.action, {
      method: "POST",
      body: new FormData(form),
      headers: { Accept: "application/json" }
    })
      .then(function (res) {
        if (!res.ok) throw new Error("Form endpoint returned " + res.status);
        form.hidden = true;
        success.hidden = false;
        success.classList.add("in");
        success.focus();
      })
      .catch(function () {
        errorNote.hidden = false;
        submitBtn.disabled = false;
        submitBtn.textContent = "Send enquiry";
      });
  });
})();
