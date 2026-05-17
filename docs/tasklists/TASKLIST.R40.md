# TASKLIST · R40 — Hotfix: short-link creation via RPC

**Date:** 2026-05-18 · `tsc` ✅ · `lint` ✅ (0 err) · `build` ✅ · `test` ✅ 9/9 · no migration in-repo (SQL already run in Supabase)

R36 dropped the public SELECT on `short_links`, so `createShortLink`'s
dedup SELECT silently returned null under RLS → every INSERT hit the
R30 `(event_id,long_path)` unique index → all retries failed → creation
returned null → callers shipped the long, image-less URL again.

**Fix:** `createShortLink` now calls the SECURITY DEFINER RPC
`create_or_get_short_link(p_long_path, p_event_id)` which dedups +
inserts atomically server-side. Fail path unchanged (null → long-URL
fallback, never breaks the invite flow).
