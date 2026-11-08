-- Paste ALL of this into Supabase > SQL Editor > New query, then Run.
-- Safe to run more than once.

-- =============================================================
-- 9. INVOICE LINES (2026-11-08)
--
-- Invoices now carry what they're for, line by line, plus a note to
-- the client and the payment details as they were when it was sent.
-- Existing invoices keep working: with no lines, the PDF shows one.
-- =============================================================

alter table public.invoices add column if not exists items   jsonb not null default '[]'::jsonb;
alter table public.invoices add column if not exists notes   text default '';
alter table public.invoices add column if not exists payment text default '';

-- PostgREST caches the table shape; tell it to look again
notify pgrst, 'reload schema';
