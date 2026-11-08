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

-- =============================================================
-- 10. DRAWN SIGNATURES (2026-11-08)
--
-- Clients sign contracts by typing their name AND drawing their
-- signature on screen. The drawing is kept as pen strokes (small
-- JSON, not an image), with the exact time it was signed, and goes
-- into the signed PDF. Only the client the contract belongs to can
-- sign it, once, and signing can't change the contract's wording.
-- =============================================================

alter table public.contracts add column if not exists signature jsonb;
alter table public.contracts add column if not exists signed_at timestamptz;

alter table public.contracts drop constraint if exists contracts_signature_size;
alter table public.contracts add constraint contracts_signature_size
  check (signature is null or octet_length(signature::text) <= 60000);

create or replace function public.sign_contract_drawn(p_contract_id uuid, p_signer_name text, p_signature jsonb)
  returns public.contracts
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  mine uuid := public.my_client_id();
  row_out public.contracts;
begin
  if mine is null then raise exception 'not a client'; end if;
  if coalesce(trim(p_signer_name), '') = '' then raise exception 'name required'; end if;
  if p_signature is null or jsonb_typeof(p_signature -> 'strokes') <> 'array'
     or jsonb_array_length(p_signature -> 'strokes') = 0 then
    raise exception 'signature required';
  end if;
  if octet_length(p_signature::text) > 60000 then raise exception 'signature too large'; end if;

  update public.contracts c
     set status = 'signed', signed_date = current_date, signed_at = now(),
         signer_name = trim(p_signer_name), signature = p_signature
   where c.id = p_contract_id
     and c.client_id = mine
     and c.status = 'sent'
  returning * into row_out;

  if row_out.id is null then raise exception 'contract not found or already signed'; end if;

  insert into public.notifications (text)
  values ('Contract signed: ' || row_out.title);

  insert into public.activity (client_id, text)
  values (mine, 'You signed ' || row_out.title);

  return row_out;
end;
$$;

revoke execute on function public.sign_contract_drawn(uuid, text, jsonb) from public, anon;
grant execute on function public.sign_contract_drawn(uuid, text, jsonb) to authenticated;

notify pgrst, 'reload schema';
