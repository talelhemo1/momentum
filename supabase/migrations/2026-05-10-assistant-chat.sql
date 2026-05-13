-- ──────────────────────────────────────────────────────────────────────────
-- Assistant chat log + per-user daily quota
-- R8 — adds an audit trail for every user/assistant turn so we can:
--   (a) count today's messages per user_id  →  enforce daily quota
--   (b) review token usage / cost for tuning the model
--   (c) let the user replay their own history (RLS scoped to auth.uid())
-- ──────────────────────────────────────────────────────────────────────────

create table if not exists assistant_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  -- Free-form event id; not a foreign key because the app currently keeps
  -- events in localStorage. When events move server-side we'll add an FK.
  event_id text,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  -- Token usage + cost copied from OpenAI's `usage` block. Stored as integers
  -- (cents, integer tokens) so analytic queries don't drift on float math.
  tokens_input int default 0,
  tokens_output int default 0,
  cost_cents int default 0,
  created_at timestamptz default now()
);

-- Quota query is "count rows for user_id since today 00:00". An index on
-- (user_id, created_at desc) covers it cheaply.
create index if not exists assistant_messages_user_day_idx
  on assistant_messages(user_id, created_at desc);

-- RLS: only the row's owner sees it / inserts on their own behalf.
alter table assistant_messages enable row level security;

-- Drop-and-recreate so the migration is re-runnable without `if not exists`
-- (Postgres doesn't support that for policies). Catch the "does not exist"
-- error on first run.
drop policy if exists "users see their own messages" on assistant_messages;
create policy "users see their own messages" on assistant_messages
  for select using (auth.uid() = user_id);

drop policy if exists "users insert their own messages" on assistant_messages;
create policy "users insert their own messages" on assistant_messages
  for insert with check (auth.uid() = user_id);
