-- Catalog checkout sessions: the customer-facing /catalog page builds a "My List" and shows a
-- QR to the cashier so it can be scanned straight into the bill. Embedding the full item list
-- (with full product UUIDs) directly in the QR makes it dense enough that budget hardware
-- barcode/QR scanners (laser/CCD guns, scanning off a phone screen) struggle to decode it -
-- so instead we store the list here under a short random code and only encode that short code
-- in the QR, keeping it small and easy for any scanner (camera or hardware gun) to read.
create table if not exists catalog_checkout_sessions (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  items jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '2 hours'),
  consumed_at timestamptz
);

create index if not exists idx_catalog_checkout_sessions_code on catalog_checkout_sessions(code);

alter table catalog_checkout_sessions enable row level security;

create policy "Allow all - catalog_checkout_sessions select"
  on catalog_checkout_sessions for select using (true);
create policy "Allow all - catalog_checkout_sessions insert"
  on catalog_checkout_sessions for insert with check (true);
create policy "Allow all - catalog_checkout_sessions update"
  on catalog_checkout_sessions for update using (true);
