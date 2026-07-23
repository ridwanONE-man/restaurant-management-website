# Database setup (Supabase)

## 1. Run the schema

1. Open your Supabase project
2. Go to **SQL Editor** → **New query**
3. Open this file in the repo: `supabase/schema.sql`
4. Copy everything → paste into the SQL Editor → **Run**

That creates:

- `profiles` (admin users)
- `kitchen_settings`
- `menu_items` (+ default menu seed)
- `nights` (history)
- `night_item_sales`
- `night_loans`
- `night_staff_salaries`
- `night_drafts`
- RLS policies for authenticated users

## 2. Admin login

Created by the same SQL:

| Field    | Value            |
|----------|------------------|
| Email    | `dozka@gmail.com` |
| Password | `12121212`        |

## 3. App `.env`

Use the project root URL only (no `/rest/v1/`):

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Then restart `npm run dev`.
