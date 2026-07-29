/* ============================================================
   JOLERO MEDIA PORTAL — login.js

   Drives login.html. Three jobs: send the magic link, handle the
   return trip when someone clicks it, and route them to the right
   page once we know who they are.
   ============================================================ */

(function () {
  "use strict";

  var form = document.getElementById("login-form");
  var email = document.getElementById("login-email");
  var submit = document.getElementById("login-submit");
  var msg = document.getElementById("login-msg");
  var intro = document.getElementById("login-intro");

  function say(text, kind) {
    msg.textContent = text;
    msg.className = "login-msg" + (kind ? " is-" + kind : "");
    msg.hidden = false;
  }

  function destinationFor(profile) {
    if (!profile) return null;
    if (profile.role === "admin") return "admin/";
    if (profile.role === "client") return "index.html";
    return null;
  }

  async function routeIn() {
    var profile = await PortalAuth.getProfile(true);
    var to = destinationFor(profile);
    if (to) { location.replace(to); return true; }

    // Signed in, but not invited to anything yet.
    say("You're signed in, but this email isn't linked to an account yet. " +
        "Email info@joleromedia.com and we'll add you.", "warn");
    await PortalAuth.signOut();
    return false;
  }

  (async function init() {
    if (!PortalAuth.configured()) {
      form.hidden = true;
      intro.textContent = "";
      say("Sign-in isn't switched on yet — the portal is still in preview. " +
          "Fill in portal/supabase-config.js to enable it.", "warn");
      return;
    }

    // Came back from a magic link?
    var cb = PortalAuth.consumeCallback();
    if (cb && cb.error) {
      say(cb.error + " Links expire quickly — send yourself a fresh one.", "error");
    } else if (cb && cb.session) {
      say("Signed in. Taking you through…", "ok");
      await routeIn();
      return;
    }

    // Already signed in from a previous visit?
    if (await PortalAuth.getSession()) {
      if (await routeIn()) return;
    }

    if (new URLSearchParams(location.search).get("denied")) {
      say("That account doesn't have access to the page you tried to open.", "warn");
    }
  })();

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    var address = email.value.trim();
    if (!address || address.indexOf("@") === -1) {
      say("Enter the email address your account uses.", "error");
      email.focus();
      return;
    }

    submit.disabled = true;
    var original = submit.textContent;
    submit.textContent = "Sending…";

    try {
      await PortalAuth.signIn(address, location.origin + location.pathname);
      form.hidden = true;
      intro.textContent = "";
      say("Check your inbox — we've sent a sign-in link to " + address +
          ". It's good for one use and expires within the hour.", "ok");
    } catch (err) {
      say(err.message || "Couldn't send that link. Try again in a moment.", "error");
      submit.disabled = false;
      submit.textContent = original;
    }
  });
})();
