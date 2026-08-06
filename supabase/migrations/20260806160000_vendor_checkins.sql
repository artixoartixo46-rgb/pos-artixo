-- Vendor QR check-in: a vendor scans a QR posted at the shop's receiving counter with their
-- own phone, self-reports what they're delivering, and the exact arrival time gets captured
-- automatically. This is a "pending" claim, not an actual stock update - shop staff still
-- verify the physical goods and confirm it (via Product Receiving) before stock/cost changes.

CREATE TABLE public.vendor_checkins (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor_id UUID REFERENCES public.vendors(id),
  vendor_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'confirmed' | 'dismissed'
  notes TEXT,
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.vendor_checkin_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  checkin_id UUID NOT NULL REFERENCES public.vendor_checkins(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id),
  product_name TEXT NOT NULL,
  quantity NUMERIC NOT NULL
);

CREATE INDEX idx_vendor_checkin_items_checkin_id ON public.vendor_checkin_items(checkin_id);
CREATE INDEX idx_vendor_checkins_status ON public.vendor_checkins(status);

ALTER TABLE public.vendor_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_checkin_items ENABLE ROW LEVEL SECURITY;

-- Same "allow all" policy used everywhere else in this app (no auth layer yet), and this
-- specific table is meant to be reachable from a vendor's own phone with no login at all.
CREATE POLICY "Allow all operations on vendor_checkins" ON public.vendor_checkins FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on vendor_checkin_items" ON public.vendor_checkin_items FOR ALL USING (true) WITH CHECK (true);
