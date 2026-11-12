-- =============================================================================
-- Central Fast Food — business day cut-off
-- A selling day runs until this time after midnight (default 01:30).
-- At the cut-off the app saves the day to History and starts the next one.
-- =============================================================================

alter table public.kitchen_settings add column if not exists day_cutoff text not null default '01:30';
