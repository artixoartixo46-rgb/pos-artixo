# 🔗 Supabase Setup Guide — Glass Flow POS

## Step 1: Create Supabase Project

1. Go to [https://supabase.com](https://supabase.com) and sign in
2. Click **"New Project"**
3. Choose your organization, give project name (e.g. `glass-flow-pos`)
4. Set database password (save it safely!)
5. Choose region closest to your users (e.g. `Southeast Asia (Singapore)`)
6. Click **"Create new project"** — wait 1-2 minutes

---

## Step 2: Get Your Credentials

1. In your Supabase dashboard, go to **Project Settings → API**
2. Copy these values:
   - **Project URL** → looks like `https://abcdefgh12345678.supabase.co`
   - **anon / public** key → looks like `eyJhbGciOiJIUzI1NiIs...`

---

## Step 3: Update `.env` File

Open the `.env` file in your project root and paste your credentials:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key-here
```

---

## Step 4: Run Migrations (Create Tables)

### Option A: Using Supabase CLI (Recommended)
```bash
# Install Supabase CLI if not already
npm install -g supabase

# Link your project
supabase link --project-ref your-project-ref

# Push all migrations
supabase db push
```

### Option B: Using SQL Editor (Manual)
1. Go to Supabase dashboard → **SQL Editor**
2. Click **"New query"**
3. Open each `.sql` file from `supabase/migrations/` folder in order (by date)
4. Copy-paste and click **"Run"** for each file

**Migration files to run in order:**
1. `20251031065647_3a6a65f8-f5de-439a-8f52-64bdfe665aa6.sql` — Products, Sales, Sale Items tables
2. `20251031065657_1efa9e37-760b-4651-8a7f-47d6d328f570.sql` — Security fixes
3. `20251101002902_436dba86-f1dd-40ba-841b-f223246cd6d3.sql`
4. `20251101004716_d9879a10-b7d2-4f06-8c23-78c09ccf4a81.sql`
5. `20251102004406_beb71897-bd70-40be-9589-5abab715dbf1.sql`
6. `20251102010752_bf091bfc-e549-4c5c-8ad8-b7107f0af488.sql`
7. `20251103003843_501176c9-2605-451b-b850-aceeec7785ad.sql`
8. `20251104001908_c65c0c87-1eb3-40a3-aaae-3f1911ddbc50.sql`
9. `20251208033441_acf16741-d6e1-4ed1-ad83-134c4e9c1712.sql`
10. `20260203174202_79ab6cfd-8ba7-4daa-8ac5-5af442323062.sql`
11. `20260205060111_d4672874-d582-4385-b7a3-b11aa1c50d87.sql`
12. `20260206041857_b50c5bfa-1038-4541-b17f-7fbf4d638a63.sql`
13. `20260402044501_845f264b-6397-4d74-82a5-ef52a16a0209.sql`

---

## Step 5: Update `supabase/config.toml`

Replace the project reference in `supabase/config.toml`:

```toml
project_id = "your-project-ref"
```

---

## Step 6: Deploy Edge Functions (Optional)

If your project uses Supabase Edge Functions:
```bash
supabase functions deploy qr-add-items
supabase functions deploy scan-vendor-bill
```

---

## Step 7: Set Vercel Environment Variables

After deploying to Vercel, add these environment variables:

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Your Supabase anon key |

**How to add:**
1. Go to [vercel.com](https://vercel.com) → Your project
2. **Settings → Environment Variables**
3. Add both variables
4. Click **"Deploy"** to redeploy

---

## ✅ Verify Connection

After setup, open your deployed app and check:
- Products load from Supabase
- Sales can be created
- Barcodes/QR codes work

If data doesn't load, check browser DevTools → Console for Supabase connection errors.
