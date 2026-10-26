/* ============================================================
   JOLERO MEDIA PORTAL — auth.js

   Code sign in (an emailed 6-digit code, with a one-tap link in the same
   email as a fallback), session handling and the page guard.

   Talks to Supabase's REST endpoints directly rather than pulling in
   their JavaScript SDK. That keeps the site dependency-free, keeps
   the Content-Security-Policy tight (no third-party script to
   allow), and means nothing here can change under us without us
   choosing it.

   HOW A SIGN IN GOES
     1. Someone types their email on login.html.
     2. We POST it to /auth/v1/otp and Supabase emails a 6-digit code
        (and a one-tap link, for anyone who prefers to tap).
     3. They type the code; we POST it to /auth/v1/verify and get a
        session back. (Or they tap the link and come back to login.html
        with tokens in the URL fragment, #access_token=....)
     4. We store the tokens, read the person's profile, and send them to
        the right place: admins to admin/, clients to the client page.
     The code works in whatever browser asked for it, which the link
     doesn't always: on a phone, Gmail opens links in its own browser.

   WHAT THE GUARD DOES
     Any portal page carrying <meta name="portal-role" content="admin">
     (or "client") is protected. On load we check for a valid session
     and the right role, and bounce to login.html if either is missing.

   The guard is CONVENIENCE, NOT SECURITY. Someone can edit the
   JavaScript in their own browser and get past it — and see nothing,
   because the database refuses to return rows they aren't entitled
   to. The real protection is in supabase/schema.sql. This just means
   the right people see the right screen.
   ============================================================ */

(function () {
  "use strict";

  // Refuse to run inside another site's frame (clickjacking). GitHub Pages
  // can't send frame-ancestors / X-Frame-Options, so the guard lives here.
  if (window.top !== window.self) { document.documentElement.style.display = "none"; return; }

  var SESSION_KEY = "jolero_session";
  var LOGIN_PAGE = "login.html";

  /* Read the config live rather than capturing it at load, so this
     doesn't depend on script order. */
  function cfg() {
    return window.SUPABASE_CONFIG || { url: "", anonKey: "" };
  }

  function configured() {
    var c = cfg();
    return !!(c.url && c.anonKey);
  }

  /* ---------- session storage ----------
     Tokens live in localStorage so a refresh or a new tab keeps you
     signed in. That is readable by any script running on this origin,
     which is exactly why the site ships no third-party scripts and a
     CSP that blocks them. */

  function readSession() {
    try {
      var raw = localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function writeSession(s) {
    try {
      if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
      else localStorage.removeItem(SESSION_KEY);
    } catch (e) {}
  }

  function storeTokens(data) {
    if (!data || !data.access_token) return null;
    var s = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || "",
      // refresh a minute early so a request never rides an expiring token
      expiresAt: Date.now() + ((Number(data.expires_in) || 3600) - 60) * 1000
    };
    writeSession(s);
    return s;
  }

  /* ---------- raw calls ---------- */

  async function authFetch(path, options) {
    options = options || {};
    var headers = Object.assign({
      "apikey": cfg().anonKey,
      "Content-Type": "application/json"
    }, options.headers || {});
    var res = await fetch(cfg().url + "/auth/v1" + path, {
      method: options.method || "POST",
      headers: headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    var text = await res.text();
    var json = text ? JSON.parse(text) : {};
    if (!res.ok) {
      var err = new Error(json.error_description || json.msg || json.error || ("Sign-in failed (" + res.status + ")"));
      err.status = res.status;
      throw err;
    }
    return json;
  }

  /* Swap the refresh token for a new access token (about once an hour).
     Only one refresh runs at a time, even when several calls ask at once,
     and if another tab has already refreshed we use its tokens. Only
     Supabase REJECTING the refresh token signs you out; a dropped
     connection or a Supabase hiccup keeps the stored session so the
     next attempt can succeed. (Wiping it on any error was what kept
     signing people out.) */
  var refreshing = null;

  async function refresh(session) {
    if (!session || !session.refreshToken) return null;
    if (refreshing) return refreshing;
    refreshing = (async function () {
      var latest = readSession() || session;
      if (latest.refreshToken !== session.refreshToken && Date.now() < latest.expiresAt) return latest;
      for (var attempt = 0; attempt < 2; attempt++) {
        try {
          var data = await authFetch("/token?grant_type=refresh_token", {
            body: { refresh_token: latest.refreshToken }
          });
          return storeTokens(data);
        } catch (e) {
          if (e.status === 400 || e.status === 401 || e.status === 403) {
            writeSession(null);    // refresh token rejected: genuinely signed out
            return null;
          }
          await new Promise(function (r) { setTimeout(r, 1500); });
        }
      }
      return null;                 // still offline: keep the session for next time
    })();
    try { return await refreshing; } finally { refreshing = null; }
  }

  /* Current session, refreshed if it is close to expiry. Returns null
     when there is no usable session. */
  async function getSession() {
    var s = readSession();
    if (!s) return null;
    if (Date.now() >= s.expiresAt) return await refresh(s);
    return s;
  }

  /* An access token ready for a database call, or null. */
  async function getToken() {
    var s = await getSession();
    return s ? s.accessToken : null;
  }

  /* ---------- profile ---------- */

  var cachedProfile = null;

  /* The signed-in user's id, read out of the token. Supabase checks the
     token's signature on every call, so a tampered id wouldn't be accepted
     there; this only picks which row to ask for. */
  function tokenSub(token) {
    try {
      var part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      var sub = JSON.parse(atob(part + "===".slice((part.length + 3) % 4))).sub;
      return /^[0-9a-f-]{36}$/i.test(sub || "") ? sub : "";
    } catch (e) { return ""; }
  }

  async function getProfile(force) {
    if (cachedProfile && !force) return cachedProfile;
    var token = await getToken();
    if (!token) return null;
    // Ask for this person's own row by id: an admin may read every profile,
    // so "whatever I can see" would return a row per person once more than
    // one has signed in, and the first of those may be somebody else.
    var sub = tokenSub(token);
    if (!sub) return null;
    var res = await fetch(cfg().url + "/rest/v1/profiles?select=id,email,role,client_id&id=eq." + sub, {
      headers: {
        "apikey": cfg().anonKey,
        "Authorization": "Bearer " + token,
        "Accept": "application/json"
      }
    });
    if (!res.ok) return null;
    var rows = await res.json();
    cachedProfile = rows && rows.length === 1 ? rows[0] : null;
    return cachedProfile;
  }

  /* ---------- public actions ---------- */

  async function signIn(email, redirectTo) {
    if (!configured()) throw new Error("Supabase isn't connected yet. Fill in portal/supabase-config.js.");
    var target = redirectTo || (location.origin + location.pathname);
    // redirect_to is a QUERY parameter on this endpoint. Nesting it in
    // the body as options.email_redirect_to is the JS SDK's shape, not
    // the REST API's — it gets ignored, and the emailed link silently
    // falls back to the project's Site URL instead of coming back here.
    await authFetch("/otp?redirect_to=" + encodeURIComponent(target), {
      body: { email: String(email).trim(), create_user: true }
    });
    return true;
  }

  /* Step two of a code sign-in: the 6-digit code from the email. */
  async function verifyCode(email, code) {
    if (!configured()) throw new Error("Supabase isn't connected yet.");
    var data = await authFetch("/verify", {
      body: { type: "email", email: String(email).trim(), token: String(code).replace(/\D/g, "") }
    });
    cachedProfile = null;
    var s = storeTokens(data);
    if (!s) throw new Error("That code didn't sign you in. Send a new one and try again.");
    return s;
  }

  /* Password sign-in. No longer offered on login.html (codes replaced it);
     kept so an existing admin password still works if it's ever needed. Admins only in practice: clients never get a password
     set, so this endpoint has nothing to match for them and they stay on
     magic links. Supabase rate-limits this endpoint, and a wrong password
     returns the same generic message as an unknown account so it can't be
     used to discover which addresses exist. */
  async function signInWithPassword(email, password) {
    if (!configured()) throw new Error("Supabase isn't connected yet.");
    var data = await authFetch("/token?grant_type=password", {
      body: { email: String(email).trim(), password: password }
    });
    cachedProfile = null;
    return storeTokens(data);
  }

  /* Sets a password on the CURRENTLY SIGNED-IN account. Requires a live
     session, so it can only ever change your own — there is no way to set
     someone else's from here. */
  async function setPassword(password) {
    var token = await getToken();
    if (!token) throw new Error("Not signed in.");
    await authFetch("/user", {
      method: "PUT",
      headers: { "Authorization": "Bearer " + token },
      body: { password: password }
    });
    return true;
  }

  async function signOut() {
    var token = await getToken();
    if (token) {
      try {
        await authFetch("/logout", { headers: { "Authorization": "Bearer " + token } });
      } catch (e) { /* signing out locally matters more than the round trip */ }
    }
    cachedProfile = null;
    writeSession(null);
  }

  /* Tokens arrive in the URL fragment after the emailed link is
     clicked. Consume them and scrub the address bar so the token
     isn't sitting in history or a shared screenshot. */
  function consumeCallback() {
    if (!location.hash || location.hash.indexOf("access_token") === -1) {
      // Supabase reports failures as query params instead
      var q = new URLSearchParams(location.search);
      if (q.get("error_description")) return { error: q.get("error_description") };
      return null;
    }
    var params = new URLSearchParams(location.hash.slice(1));
    var session = storeTokens({
      access_token: params.get("access_token"),
      refresh_token: params.get("refresh_token"),
      expires_in: params.get("expires_in")
    });
    history.replaceState(null, "", location.pathname + location.search);
    return session ? { session: session } : { error: "That link didn't carry a valid session." };
  }

  /* ---------- page guard ---------- */

  function pageRole() {
    var m = document.querySelector('meta[name="portal-role"]');
    return m ? m.getAttribute("content") : null;
  }

  function loginUrl() {
    // admin pages sit one level deeper than the client page
    return (location.pathname.indexOf("/admin/") !== -1 ? "../" : "") + LOGIN_PAGE;
  }

  async function guard() {
    var needed = pageRole();
    if (!needed) return;                 // page isn't protected
    if (!configured()) return;           // pre-Phase-2 preview: leave it alone

    var profile = await getProfile();
    if (!profile) { location.replace(loginUrl()); return; }

    if (needed === "admin" && profile.role !== "admin") {
      location.replace(loginUrl() + "?denied=1");
      return;
    }
    if (needed === "client" && profile.role !== "client" && profile.role !== "admin") {
      location.replace(loginUrl() + "?denied=1");
      return;
    }
    // is-admin shows the admin-only bits (the client switcher, the Admin
    // link); a client never gets them, even on the same page
    document.documentElement.classList.add("is-authed", profile.role === "admin" ? "is-admin" : "is-client");
  }

  /* If a page starts loading data before the guard has finished
     redirecting, store.js throws "Not signed in." Rather than let that
     surface as an unhandled rejection and a blank page, treat it as
     what it is: go and sign in. */
  window.addEventListener("unhandledrejection", function (e) {
    var msg = e && e.reason && e.reason.message;
    if (msg === "Not signed in." && pageRole()) {
      e.preventDefault();
      location.replace(loginUrl());
    }
  });

  window.PortalAuth = {
    configured: configured,
    signIn: signIn,
    verifyCode: verifyCode,
    signInWithPassword: signInWithPassword,
    setPassword: setPassword,
    signOut: signOut,
    getSession: getSession,
    getToken: getToken,
    getProfile: getProfile,
    consumeCallback: consumeCallback,
    guard: guard
  };

  guard();
})();
