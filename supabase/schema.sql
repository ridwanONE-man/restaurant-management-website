-- =============================================================================
-- GRILL & GRAIN — full database schema for Supabase
-- =============================================================================
-- How to use:
-- 1. Open Supabase → SQL Editor → New query
-- 2. Paste this entire file
-- 3. Click Run
--
-- Admin login (created at the bottom):
--   email:    dozka@gmail.com
--   password: 12121212
-- =============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles (linked to Supabase Auth)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text unique,
  full_name text not null default 'Shift Manager',
  role text not null default 'Kitchen Admin',
  is_admin boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- Auto-create profile when a user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, is_admin)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', 'Shift Manager'),
    coalesce(new.raw_user_meta_data->>'role', 'Kitchen Admin'),
    coalesce((new.raw_user_meta_data->>'is_admin')::boolean, false)
  )
  on conflict (id) do update
    set email = excluded.email,
        updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Kitchen / app settings (one row per kitchen)
-- ---------------------------------------------------------------------------
create table if not exists public.kitchen_settings (
  id uuid primary key default gen_random_uuid(),
  kitchen_name text not null default 'GRILL & GRAIN',
  manager_name text not null default 'Shift Manager',
  role_label text not null default 'Kitchen Admin',
  shift_label text not null default 'Night Service',
  compact_tables boolean not null default false,
  confirm_before_clear boolean not null default true,
  currency_code text not null default 'SLSH',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists kitchen_settings_set_updated_at on public.kitchen_settings;
create trigger kitchen_settings_set_updated_at
before update on public.kitchen_settings
for each row execute function public.set_updated_at();

insert into public.kitchen_settings (kitchen_name, manager_name, role_label, shift_label)
select 'GRILL & GRAIN', 'Shift Manager', 'Kitchen Admin', 'Night Service'
where not exists (select 1 from public.kitchen_settings);

-- ---------------------------------------------------------------------------
-- Menu items (Menu Studio)
-- ---------------------------------------------------------------------------
create table if not exists public.menu_items (
  id text primary key,
  name text not null,
  price numeric(14, 2) not null check (price >= 0),
  category text not null check (category in ('grill', 'plates', 'sides', 'juice')),
  icon text not null default 'star',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists menu_items_set_updated_at on public.menu_items;
create trigger menu_items_set_updated_at
before update on public.menu_items
for each row execute function public.set_updated_at();

create index if not exists menu_items_category_idx on public.menu_items (category);
create index if not exists menu_items_active_idx on public.menu_items (is_active);

-- Seed default menu
insert into public.menu_items (id, name, price, category, icon, sort_order) values
  ('sandwich', 'Sandwich', 15400, 'grill', 'sandwich', 1),
  ('shawarma', 'Shawarma', 18700, 'grill', 'shawarma', 2),
  ('shawarma-special', 'Shawarma Special', 22000, 'grill', 'shawarmaSpecial', 3),
  ('rice', 'Rice', 7700, 'plates', 'rice', 4),
  ('rice-chicken', 'Rice with Chicken', 18700, 'plates', 'riceChicken', 5),
  ('chips', 'Chips', 7700, 'sides', 'chips', 6),
  ('mango', 'Mango Juice', 13200, 'juice', 'mango', 7),
  ('strawberry', 'Strawberry Juice', 16500, 'juice', 'strawberry', 8),
  ('banana', 'Banana Juice', 11000, 'juice', 'banana', 9),
  ('mushakal', 'Mushakal Juice', 15400, 'juice', 'mushakal', 10)
on conflict (id) do update
  set name = excluded.name,
      price = excluded.price,
      category = excluded.category,
      icon = excluded.icon,
      sort_order = excluded.sort_order,
      updated_at = timezone('utc', now());

-- ---------------------------------------------------------------------------
-- Night entries (History / New Entry / Expenses)
-- ---------------------------------------------------------------------------
create table if not exists public.nights (
  id text primary key,
  service_date date not null default (timezone('utc', now())::date),
  date_label text not null,
  day_label text not null,
  time_label text,
  status text not null default 'SALES'
    check (status in ('SALES', 'REVIEW', 'FINALIZED')),
  total_sales numeric(14, 2) not null default 0,
  loan_amount numeric(14, 2) not null default 0,
  cash_sales numeric(14, 2) not null default 0,
  expenses_total numeric(14, 2) not null default 0,
  net_profit numeric(14, 2) not null default 0,
  covers integer not null default 0,
  loan_covers integer not null default 0,
  -- expense breakdown (operational)
  expense_chicken numeric(14, 2) not null default 0,
  expense_wholesaler numeric(14, 2) not null default 0,
  expense_grocery_spices numeric(14, 2) not null default 0,
  expense_other numeric(14, 2) not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists nights_set_updated_at on public.nights;
create trigger nights_set_updated_at
before update on public.nights
for each row execute function public.set_updated_at();

create index if not exists nights_service_date_idx on public.nights (service_date desc);
create index if not exists nights_status_idx on public.nights (status);

-- Item sales lines for a night
create table if not exists public.night_item_sales (
  id uuid primary key default gen_random_uuid(),
  night_id text not null references public.nights (id) on delete cascade,
  item_id text references public.menu_items (id) on delete set null,
  item_name text not null,
  qty integer not null check (qty >= 0),
  unit_price numeric(14, 2) not null check (unit_price >= 0),
  line_total numeric(14, 2) not null check (line_total >= 0),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists night_item_sales_night_idx on public.night_item_sales (night_id);

-- Loans (name + phone)
create table if not exists public.night_loans (
  id text primary key,
  night_id text not null references public.nights (id) on delete cascade,
  person_name text not null,
  phone_number text not null default '',
  item_id text,
  item_name text not null,
  qty integer not null check (qty > 0),
  unit_price numeric(14, 2) not null check (unit_price >= 0),
  loan_value numeric(14, 2) not null check (loan_value >= 0),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists night_loans_night_idx on public.night_loans (night_id);
create index if not exists night_loans_person_idx on public.night_loans (person_name);

-- Staff salaries for a night
create table if not exists public.night_staff_salaries (
  id uuid primary key default gen_random_uuid(),
  night_id text not null references public.nights (id) on delete cascade,
  staff_name text not null,
  salary numeric(14, 2) not null check (salary >= 0),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists night_staff_salaries_night_idx on public.night_staff_salaries (night_id);

-- Working draft (current unfinished night shared by New Entry + Expenses)
create table if not exists public.night_drafts (
  id text primary key default 'current',
  draft jsonb not null default '{}'::jsonb,
  expenses jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid references auth.users (id) on delete set null
);

insert into public.night_drafts (id)
values ('current')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.kitchen_settings enable row level security;
alter table public.menu_items enable row level security;
alter table public.nights enable row level security;
alter table public.night_item_sales enable row level security;
alter table public.night_loans enable row level security;
alter table public.night_staff_salaries enable row level security;
alter table public.night_drafts enable row level security;

-- Authenticated kitchen staff / admin can manage everything
-- (tighten later if you add more roles)

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
on public.profiles for select to authenticated
using (auth.uid() = id or exists (
  select 1 from public.profiles p where p.id = auth.uid() and p.is_admin
));

drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin"
on public.profiles for update to authenticated
using (auth.uid() = id or exists (
  select 1 from public.profiles p where p.id = auth.uid() and p.is_admin
));

drop policy if exists "kitchen_settings_all_auth" on public.kitchen_settings;
create policy "kitchen_settings_all_auth"
on public.kitchen_settings for all to authenticated
using (true) with check (true);

drop policy if exists "menu_items_all_auth" on public.menu_items;
create policy "menu_items_all_auth"
on public.menu_items for all to authenticated
using (true) with check (true);

drop policy if exists "nights_all_auth" on public.nights;
create policy "nights_all_auth"
on public.nights for all to authenticated
using (true) with check (true);

drop policy if exists "night_item_sales_all_auth" on public.night_item_sales;
create policy "night_item_sales_all_auth"
on public.night_item_sales for all to authenticated
using (true) with check (true);

drop policy if exists "night_loans_all_auth" on public.night_loans;
create policy "night_loans_all_auth"
on public.night_loans for all to authenticated
using (true) with check (true);

drop policy if exists "night_staff_salaries_all_auth" on public.night_staff_salaries;
create policy "night_staff_salaries_all_auth"
on public.night_staff_salaries for all to authenticated
using (true) with check (true);

drop policy if exists "night_drafts_all_auth" on public.night_drafts;
create policy "night_drafts_all_auth"
on public.night_drafts for all to authenticated
using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Create / upsert ADMIN user: dozka@gmail.com / 12121212
-- ---------------------------------------------------------------------------
do $$
declare
  v_user_id uuid;
  v_encrypted_pw text;
begin
  v_encrypted_pw := crypt('12121212', gen_salt('bf'));

  select id into v_user_id
  from auth.users
  where email = 'dozka@gmail.com'
  limit 1;

  if v_user_id is null then
    v_user_id := gen_random_uuid();

    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000',
      v_user_id,
      'authenticated',
      'authenticated',
      'dozka@gmail.com',
      v_encrypted_pw,
      timezone('utc', now()),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Kitchen Admin","role":"Kitchen Admin","is_admin":true}'::jsonb,
      timezone('utc', now()),
      timezone('utc', now()),
      '',
      '',
      '',
      ''
    );

    insert into auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    ) values (
      v_user_id,
      v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', 'dozka@gmail.com'),
      'email',
      v_user_id::text,
      timezone('utc', now()),
      timezone('utc', now()),
      timezone('utc', now())
    );
  else
    update auth.users
    set
      encrypted_password = v_encrypted_pw,
      email_confirmed_at = coalesce(email_confirmed_at, timezone('utc', now())),
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
        || '{"full_name":"Kitchen Admin","role":"Kitchen Admin","is_admin":true}'::jsonb,
      updated_at = timezone('utc', now())
    where id = v_user_id;
  end if;

  insert into public.profiles (id, email, full_name, role, is_admin)
  values (v_user_id, 'dozka@gmail.com', 'Kitchen Admin', 'Kitchen Admin', true)
  on conflict (id) do update
    set email = excluded.email,
        full_name = excluded.full_name,
        role = excluded.role,
        is_admin = true,
        updated_at = timezone('utc', now());
end;
$$;

-- =============================================================================
-- Done. Tables created + admin user ready.
-- Login: dozka@gmail.com / 12121212
-- =============================================================================
