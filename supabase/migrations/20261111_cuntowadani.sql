-- =============================================================================
-- Central Fast Food — Cuntowadani menu group
-- Adds two categories next to the fast-food ones:
--   cunto  = Cuntowadani (traditional food, e.g. Galay Caano Leh)
--   shaah  = Shaah / tea & hot drinks
-- =============================================================================

alter table public.menu_items drop constraint if exists menu_items_category_check;
alter table public.menu_items
  add constraint menu_items_category_check
  check (category in ('grill', 'plates', 'sides', 'juice', 'cunto', 'shaah'));

-- Starter items (set the real prices in Night Prices or Menu Studio)
insert into public.menu_items (id, name, price, category, icon, sort_order) values
  ('galay-caano-leh', 'Galay Caano Leh', 0, 'cunto', 'maize', 101),
  ('shaah', 'Shaah', 0, 'shaah', 'tea', 201)
on conflict (id) do nothing;
