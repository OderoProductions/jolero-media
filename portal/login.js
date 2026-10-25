/* ============================================================
   JOLERO MEDIA PORTAL — login.js

   Drives login.html. Code sign-in in two steps: type your email and
   we email a 6-digit code; type the code and you're in. The same
   email carries a one-tap link too, so this also handles the return
   trip from that link. Then it routes people to the right page once
   we know who they are. No passwords anywhere.
   ============================================================ */

(function () {
  "use strict";

  var form = document.getElementById("login-form");
  var email = document.getElementById("login-email");
  var emailField = email.closest(".field");
  var submit = document.getElementById("login-submit");
  var msg = document.getElementById("login-msg");
  var intro = document.getElementById("login-intro");
  var title = document.getElementById("login-title");
  var label = document.getElementById("login-label");
  var toAdmin = document.getElementById("to-admin");
  var toClient = document.getElementById("to-client");
  var codeField = document.getElementById("code-field");
  var code = document.getElementById("login-code");
  var alt = document.getElementById("login-alt");
  var resend = document.getElementById("resend-code");
  var changeEmail = document.getElementById("change-email");

  var TEAM_EMAIL = "info@joleromedia.com";
  var step = "email";        // "email" or "code"
  var sentTo = "";
  var cooldownTimer = 0;

  /* ---------- the two modes ----------
     Cosmetic only. Nothing here grants anything: once signed in,
     routeIn() reads the role from the database and sends the person
     wherever they actually belong. Using the team form does not make you
     an admin, and using the client form does not stop you being one. */

  var COPY = {
    client: {
      title: "Client portal",
      intro: "Enter the email address we set your account up with and we'll email " +
             "you a 6-digit code. No password needed.",
      label: "Email address",
      placeholder: "you@yourclub.com"
    },
    team: {
      title: "Admin login",
      intro: "Jolero Media team. We'll email a 6-digit code to the admin inbox.",
      label: "Admin email",
      placeholder: TEAM_EMAIL
    }
  };

  function setMode(mode, pushUrl) {
    var c = COPY[mode] || COPY.client;
    title.textContent = c.title;
    intro.textContent = c.intro;
    label.textContent = c.label;
    email.placeholder = c.placeholder;
    if (mode === "team" && !email.value) email.value = TEAM_EMAIL;
    if (mode !== "team" && email.value === TEAM_EMAIL) email.value = "";
    toAdmin.hidden = mode === "team";
    toClient.hidden = mode !== "team";
    document.title = c.title + " | Jolero Media Portal";
    if (pushUrl) {
      // keep it bookmarkable without a reload
      history.replaceState(null, "", mode === "team" ? "?admin=1" : location.pathname);
    }
  }

  function currentMode() {
    try { return new URLSearchParams(location.search).get("admin") ? "team" : "client"; }
    catch (e) { return "client"; }
  }

  function say(text, kind) {
    msg.textContent = text;
    msg.className = "login-msg" + (kind ? " is-" + kind : "");
    msg.hidden = false;
  }

  function showStep(next) {
    step = next;
    var codeStep = next === "code";
    emailField.hidden = codeStep;
    codeField.hidden = !codeStep;
    alt.hidden = !codeStep;
    code.required = codeStep;
    submit.textContent = codeStep ? "Sign in" : "Email me a code";
    submit.disabled = false;
    if (codeStep) { code.value = ""; code.focus(); }
    else { email.focus(); }
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
    showStep("email");
    return false;
  }

  // Supabase lets one code go out per email per minute
  function startCooldown() {
    var left = 60;
    resend.disabled = true;
    clearInterval(cooldownTimer);
    var tick = function () {
      resend.textContent = left > 0 ? "Send a new code (" + left + "s)" : "Send a new code";
      resend.disabled = left > 0;
      if (left-- <= 0) clearInterval(cooldownTimer);
    };
    tick();
    cooldownTimer = setInterval(tick, 1000);
  }

  async function sendCode(address) {
    await PortalAuth.signIn(address, location.origin + location.pathname);
    sentTo = address;
    showStep("code");
    startCooldown();
    say("Check your email at " + address + ". Type the 6-digit code here, " +
        "or tap the sign-in link in the email.", "ok");
  }

  toAdmin.addEventListener("click", function () { setMode("team", true); showStep("email"); });
  toClient.addEventListener("click", function () { setMode("client", true); showStep("email"); });
  changeEmail.addEventListener("click", function () { msg.hidden = true; showStep("email"); });
  resend.addEventListener("click", async function () {
    if (!sentTo) return;
    resend.disabled = true;
    try { await sendCode(sentTo); }
    catch (err) { say(err.message || "Couldn't send a new code. Try again in a moment.", "error"); resend.disabled = false; }
  });

  // Paste or type: once six digits are in, sign straight in
  code.addEventListener("input", function () {
    var digits = code.value.replace(/\D/g, "");
    if (digits !== code.value) code.value = digits;
    if (digits.length === 6 && !submit.disabled) form.requestSubmit();
  });

  (async function init() {
    setMode(currentMode(), false);
    showStep("email");

    if (!PortalAuth.configured()) {
      form.hidden = true;
      intro.textContent = "";
      say("Sign-in isn't switched on yet. The portal is still in preview. " +
          "Fill in portal/supabase-config.js to enable it.", "warn");
      return;
    }

    // Came back from the link in the email?
    var cb = PortalAuth.consumeCallback();
    if (cb && cb.error) {
      say(cb.error + " Links expire quickly, so ask for a fresh code below.", "error");
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
    var original = submit.textContent;

    if (step === "email") {
      var address = email.value.trim();
      if (!address || address.indexOf("@") === -1) {
        say("Enter the email address your account uses.", "error");
        email.focus();
        return;
      }
      submit.disabled = true;
      submit.textContent = "Sending…";
      try {
        await sendCode(address);
      } catch (err) {
        say(err.message || "Couldn't send a code. Try again in a moment.", "error");
        submit.disabled = false;
        submit.textContent = original;
      }
      return;
    }

    var digits = code.value.replace(/\D/g, "");
    if (digits.length < 6) {
      say("Enter the 6-digit code from the email.", "error");
      code.focus();
      return;
    }
    submit.disabled = true;
    submit.textContent = "Signing in…";
    try {
      await PortalAuth.verifyCode(sentTo, digits);
      say("Signed in. Taking you through…", "ok");
      await routeIn();
    } catch (err) {
      // Supabase says "Token has expired or is invalid" for both cases
      say(/expired|invalid/i.test(err.message || "")
            ? "That code didn't work. Check it, or send a new one."
            : (err.message || "Couldn't sign you in. Try again in a moment."),
          "error");
      submit.disabled = false;
      submit.textContent = original;
      code.select();
    }
  });
})();
