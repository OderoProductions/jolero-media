/* ============================================================
   JOLERO MEDIA PORTAL — signature-pad.js

   A box to sign in with a finger, stylus or mouse. What's kept is the
   pen strokes, not a picture: { w, h, strokes: [[x, y, x, y, ...], ...] }
   in a 1000-wide grid, so it's small, scales to any size, and pdf.js
   can draw it straight into the signed contract as crisp lines.

     var pad = SignaturePad(canvasElement);
     pad.isEmpty()   pad.clear()   pad.data()   pad.onchange = fn
   ============================================================ */

(function () {
  "use strict";

  var GRID = 1000;

  window.SignaturePad = function (canvas) {
    var ctx = canvas.getContext("2d");
    var strokes = [];         // in GRID units
    var current = null;
    var api = { onchange: null };

    function size() {
      var r = canvas.getBoundingClientRect();
      var dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      redraw();
    }

    function scale() { return canvas.width / GRID; }

    function ink() {
      return getComputedStyle(canvas).color || "#111";
    }

    function redraw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      var k = scale();
      ctx.lineWidth = Math.max(2, 2.6 * (window.devicePixelRatio || 1));
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = ink();
      strokes.forEach(function (s) {
        ctx.beginPath();
        ctx.moveTo(s[0] * k, s[1] * k);
        if (s.length === 2) ctx.lineTo(s[0] * k + 0.1, s[1] * k);   // a dot
        for (var i = 2; i < s.length; i += 2) ctx.lineTo(s[i] * k, s[i + 1] * k);
        ctx.stroke();
      });
    }

    function point(e) {
      var r = canvas.getBoundingClientRect();
      var u = GRID / r.width;
      return [Math.round((e.clientX - r.left) * u), Math.round((e.clientY - r.top) * u)];
    }

    canvas.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      current = point(e);
      strokes.push(current);
      redraw();
    });
    canvas.addEventListener("pointermove", function (e) {
      if (!current) return;
      e.preventDefault();
      var p = point(e);
      var n = current.length;
      // skip points closer than ~2 units to the last, to keep it small
      if (Math.abs(p[0] - current[n - 2]) + Math.abs(p[1] - current[n - 1]) < 3) return;
      current.push(p[0], p[1]);
      redraw();
    });
    function end() {
      if (!current) return;
      current = null;
      if (api.onchange) api.onchange();
    }
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    canvas.style.touchAction = "none";      // no page scroll while signing

    window.addEventListener("resize", size);

    api.resize = size;
    api.isEmpty = function () { return !strokes.length; };
    api.clear = function () { strokes = []; redraw(); if (api.onchange) api.onchange(); };
    api.data = function () {
      return { w: GRID, h: Math.round(GRID * canvas.height / canvas.width), strokes: strokes.map(function (s) { return s.slice(); }) };
    };
    size();
    return api;
  };
})();
