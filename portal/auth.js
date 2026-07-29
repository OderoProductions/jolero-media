/* ============================================================
   JOLERO MEDIA PORTAL — auth.js

   Magic-link sign in, session handling and the page guard.

   Talks to Supabase's REST endpoints directly rather than pulling in
   their JavaScript SDK. That keeps the site dependency-free, keeps
   the Content-Security-Policy tight (no third-party script to
   allow), and means nothing here can change under us without us
   choosing it.

   HOW A SIGN IN GOES
     1. Someone types their email on login.html.
     2. We POST it to /auth/v1/otp and Supabase emails a one-time link.
     3. They click it. Supabase bounces them back to login.html with
        tokens in the URL fragment (#access_token=...).
     4. We store the tokens, wipe them out of the address bar, read
        the person's profile, and send them to the right place:
        admins to admin/, clients to the client page.

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
      throw new Error(json.error_description || json.msg || json.error || ("Sign-in failed (" + res.status + ")"));
    }
    return json;
  }

  async function refresh(session) {
    if (!session || !session.refreshToken) return null;
    try {
      var data = await authFetch("/token?grant_type=refresh_token", {
        body: { refresh_token: session.refreshToken }
      });
      return storeTokens(data);
    } catch (e) {
      writeSession(null);          // refresh token dead: treat as signed out
      return null;
    }
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

  async function getProfile(force) {
    if (cachedProfile && !force) return cachedProfile;
    var token = await getToken();
    if (!token) return null;
    var res = await fetch(cfg().url + "/rest/v1/profiles?select=id,email,role,client_id", {
      headers: {
        "apikey": cfg().anonKey,
        "Authorization": "Bearer " + token,
        "Accept": "application/json"
      }
    });
    if (!res.ok) return null;
    var rows = await res.json();
    cachedProfile = rows && rows.length ? rows[0] : null;   // RLS returns only your own row
    return cachedProfile;
  }

  /* ---------- public actions ---------- */

  async function signIn(email, redirectTo) {
    if (!configured()) throw new Error("Supabase isn't connected yet — fill in portal/supabase-config.js.");
    var target = redirectTo || (location.origin + location.pathname);
    await authFetch("/otp", {
      body: { email: String(email).trim(), create_user: true, options: { email_redirect_to: target } }
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
    document.documentElement.classList.add("is-authed");
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
    signOut: signOut,
    getSession: getSession,
    getToken: getToken,
    getProfile: getProfile,
    consumeCallback: consumeCallback,
    guard: guard
  };

  guard();
})();
