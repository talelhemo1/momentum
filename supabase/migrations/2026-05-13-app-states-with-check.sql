-- ──────────────────────────────────────────────────────────────────────────
-- R13 — app_states UPDATE policy missing WITH CHECK (2026-05-13).
--
-- The original schema.sql created the UPDATE policy with only a USING
-- clause:
--   create policy "Users update own state" on public.app_states
--     for update using (auth.uid() = user_id);
--
-- USING is evaluated against the OLD row (the row being targeted). Without
-- a WITH CHECK clause, an authenticated user could craft an UPDATE that
-- rewrites their row's user_id to another user's id and effectively
-- overwrite that user's entire AppState payload (the table stores the
-- full app state in `payload`).
--
-- WITH CHECK is evaluated against the NEW row, so this migration adds it
-- and locks the column.
-- ──────────────────────────────────────────────────────────────────────────

drop policy if exists "Users update own state" on public.app_states;
create policy "Users update own state" on public.app_states
  for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
