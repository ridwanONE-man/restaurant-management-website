-- =============================================================================
-- Central Fast Food — tea cash confirmations per waiter
--   nights.tea_settlements: [{ waiter, cups, expected, missingCups, owed, received, at, time }]
--   The owner confirms the shaah money each waiter hands in; missing cups are
--   signed to that waiter as money owed.
--   save_night (applied live) now also writes p->'teaSettlements' into this column,
--   in the insert list and in the "on conflict do update" list, next to orders.
-- =============================================================================

alter table public.nights add column if not exists tea_settlements jsonb not null default '[]'::jsonb;
