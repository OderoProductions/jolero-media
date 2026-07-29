/* ============================================================
   JOLERO MEDIA PORTAL — Supabase connection

   FILL IN THE TWO VALUES BELOW after creating the project.
   Supabase dashboard -> Project Settings -> API:

     url     = Project URL
     anonKey = the PUBLISHABLE key (sb_publishable_...), which Supabase
               used to call the "anon / public" key

   This key is MEANT to be public — it ships inside this file on a
   public site and that is by design. It grants nothing on its own:
   every table is locked by the row-level rules in supabase/schema.sql,
   so it only ever returns rows the logged-in person is allowed to see.

   The SECRET key (sb_secret_...) is the opposite. It bypasses every
   rule. NEVER put it in this file, this repo, or any message. It
   belongs only in server-side settings, and we have no server.
   ============================================================ */

window.SUPABASE_CONFIG = {
  url: "https://hrdjikuadcqrddbeszzb.supabase.co",
  anonKey: "sb_publishable_Xvpu43EstE8WNZKei6yRnA_ug3hcdLF"
};
