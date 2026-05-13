-- ──────────────────────────────────────────────────────────────────────────
-- Momentum Vendor Studio — R11 audit fixes (2026-05-13).
--
-- The R11 spec called for an `alter table vendors`. In this project the
-- landing-data table is `vendor_landings` (created in
-- 2026-05-12-vendor-studio.sql) — `vendors` doesn't exist in Supabase.
-- This migration adds the missing unique constraint on owner_user_id so
-- rapid double-saves in the studio editor can't create two landing rows
-- for the same vendor account.
-- ──────────────────────────────────────────────────────────────────────────

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_name = 'vendor_landings'
      and column_name = 'owner_user_id'
  ) then
    -- Drop rows older than the newest one per owner — if a double-save
    -- already snuck through before this migration ran, keep the most
    -- recent (which carries the user's latest edits).
    delete from vendor_landings v1
    where exists (
      select 1
      from vendor_landings v2
      where v2.owner_user_id = v1.owner_user_id
        and v2.created_at > v1.created_at
    );

    -- Idempotent: skip if the constraint already exists.
    if not exists (
      select 1
      from pg_constraint
      where conname = 'vendor_landings_owner_user_id_unique'
    ) then
      alter table vendor_landings
        add constraint vendor_landings_owner_user_id_unique unique (owner_user_id);
    end if;
  end if;
end $$;
