-- Physical stock take: periodic scan-and-count inventory audit sessions, with a permanent
-- history of what was counted and how far off the system was, so recurring shortages on the
-- same product are visible over time instead of getting overwritten by the next count.

CREATE TABLE public.stock_takes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  location_id UUID REFERENCES public.locations(id),
  status TEXT NOT NULL DEFAULT 'in_progress', -- 'in_progress' | 'completed'
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.stock_take_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stock_take_id UUID NOT NULL REFERENCES public.stock_takes(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  system_qty NUMERIC NOT NULL,
  counted_qty NUMERIC NOT NULL,
  variance NUMERIC GENERATED ALWAYS AS (counted_qty - system_qty) STORED,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (stock_take_id, product_id)
);

CREATE INDEX idx_stock_take_items_stock_take_id ON public.stock_take_items(stock_take_id);

ALTER TABLE public.stock_takes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_take_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on stock_takes" ON public.stock_takes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on stock_take_items" ON public.stock_take_items FOR ALL USING (true) WITH CHECK (true);

-- Atomic absolute stock set - used when applying stock take adjustments, where the goal is
-- "make stock equal exactly what was counted", not a relative increment/decrement.
CREATE OR REPLACE FUNCTION public.set_stock(p_product_id UUID, p_qty NUMERIC)
RETURNS VOID AS $$
BEGIN
  UPDATE public.products
  SET stock_quantity = p_qty
  WHERE id = p_product_id;
END;
$$ LANGUAGE plpgsql;
