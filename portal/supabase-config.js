/* ============================================================
   JOLERO MEDIA PORTAL — Supabase connection

   FILL IN THE TWO VALUES BELOW after creating the project.
   Supabase dashboard -> Project Settings -> API:

     url     = "Project URL"          e.g. https://abcdefgh.supabase.co
     anonKey = "anon / public" key    (the long one labelled public)

   The anon key is MEANT to be public — it ships inside this file on
   a public site and that is by design. It grants nothing on its own:
   every table is locked by the row-level rules in supabase/schema.sql,
   so the key only ever returns rows the logged-in person is allowed
   to see.

   The "service_role" key is the opposite. It bypasses every rule.
   NEVER put it in this file, this repo, or any message. It belongs
   only in server-side settings, and we have no server.
   ============================================================ */

window.SUPABASE_CONFIG = {
  url: "",       // <-- paste Project URL here
  anonKey: ""    // <-- paste the anon / public key here
};
