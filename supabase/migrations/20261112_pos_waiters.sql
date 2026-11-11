-- =============================================================================
-- Central Fast Food — POS orders + waiters
--   * waiters: shared list of waiter names (who served the shaah)
--   * nights.orders: every POS sale of the night (time, lines, waiter)
--   * save_night now stores the orders too
-- =============================================================================

create table if not exists public.waiters (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists waiters_name_unique on public.waiters (lower(name));

alter table public.waiters enable row level security;

drop policy if exists "waiters_all_auth" on public.waiters;
create policy "waiters_all_auth"
on public.waiters for all to authenticated
using (true) with check (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'waiters'
  ) then
    alter publication supabase_realtime add table public.waiters;
  end if;
end;
$$;

alter table public.nights add column if not exists orders jsonb not null default '[]'::jsonb;

create or replace function public.save_night(p jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id text := p->>'id';
  v_breakdown jsonb := coalesce(p->'expenseBreakdown', '{}'::jsonb);
begin
  if v_id is null or v_id = '' then
    raise exception 'night id is required';
  end if;

  insert into public.nights (
    id, service_date, date_label, day_label, time_label, status,
    total_sales, loan_amount, cash_sales, expenses_total, net_profit,
    covers, loan_covers,
    expense_chicken, expense_wholesaler, expense_grocery_spices, expense_other,
    orders, created_by
  ) values (
    v_id,
    coalesce((p->>'serviceDate')::date, (timezone('utc', now()))::date),
    coalesce(p->>'date', ''),
    coalesce(p->>'dayLabel', 'Night Service'),
    p->>'timeLabel',
    coalesce(p->>'status', 'SALES'),
    coalesce((p->>'totalSales')::numeric, 0),
    coalesce((p->>'loanAmount')::numeric, 0),
    coalesce((p->>'cashSales')::numeric, 0),
    coalesce((p->>'expenses')::numeric, 0),
    coalesce((p->>'netProfit')::numeric, 0),
    coalesce(round((p->>'covers')::numeric)::int, 0),
    coalesce(round((p->>'loanCovers')::numeric)::int, 0),
    coalesce((v_breakdown->>'chicken')::numeric, 0),
    coalesce((v_breakdown->>'wholesaler')::numeric, 0),
    coalesce((v_breakdown->>'grocerySpices')::numeric, 0),
    coalesce((v_breakdown->>'other')::numeric, 0),
    coalesce(p->'orders', '[]'::jsonb),
    auth.uid()
  )
  on conflict (id) do update set
    service_date = excluded.service_date,
    date_label = excluded.date_label,
    day_label = excluded.day_label,
    time_label = excluded.time_label,
    status = excluded.status,
    total_sales = excluded.total_sales,
    loan_amount = excluded.loan_amount,
    cash_sales = excluded.cash_sales,
    expenses_total = excluded.expenses_total,
    net_profit = excluded.net_profit,
    covers = excluded.covers,
    loan_covers = excluded.loan_covers,
    expense_chicken = excluded.expense_chicken,
    expense_wholesaler = excluded.expense_wholesaler,
    expense_grocery_spices = excluded.expense_grocery_spices,
    expense_other = excluded.expense_other,
    orders = excluded.orders;

  delete from public.night_item_sales where night_id = v_id;
  insert into public.night_item_sales (night_id, item_id, item_name, qty, unit_price, line_total)
  select
    v_id,
    m.id,
    coalesce(x->>'itemName', ''),
    greatest(0, round(coalesce((x->>'qty')::numeric, 0))::int),
    greatest(0, coalesce((x->>'unitPrice')::numeric, 0)),
    greatest(0, coalesce((x->>'value')::numeric, 0))
  from jsonb_array_elements(coalesce(p->'itemSales', '[]'::jsonb)) as x
  left join public.menu_items m on m.id = x->>'itemId';

  delete from public.night_loans where night_id = v_id;
  insert into public.night_loans (
    id, night_id, person_name, phone_number, item_id, item_name, qty, unit_price, loan_value
  )
  select
    coalesce(nullif(x->>'id', ''), gen_random_uuid()::text),
    v_id,
    coalesce(x->>'personName', ''),
    coalesce(x->>'phoneNumber', ''),
    x->>'itemId',
    coalesce(x->>'itemName', ''),
    greatest(1, round(coalesce((x->>'qty')::numeric, 1))::int),
    greatest(0, coalesce((x->>'unitPrice')::numeric, 0)),
    greatest(0, coalesce((x->>'value')::numeric, 0))
  from jsonb_array_elements(coalesce(p->'loans', '[]'::jsonb)) as x
  on conflict (id) do update set
    night_id = excluded.night_id,
    person_name = excluded.person_name,
    phone_number = excluded.phone_number,
    item_id = excluded.item_id,
    item_name = excluded.item_name,
    qty = excluded.qty,
    unit_price = excluded.unit_price,
    loan_value = excluded.loan_value;

  delete from public.night_staff_salaries where night_id = v_id;
  insert into public.night_staff_salaries (night_id, staff_name, salary)
  select
    v_id,
    coalesce(x->>'name', ''),
    greatest(0, coalesce((x->>'salary')::numeric, 0))
  from jsonb_array_elements(coalesce(v_breakdown->'staff', '[]'::jsonb)) as x;
end;
$$;

revoke execute on function public.save_night(jsonb) from public, anon;
grant execute on function public.save_night(jsonb) to authenticated;
