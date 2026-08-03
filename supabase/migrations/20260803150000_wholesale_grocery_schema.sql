-- Wholesale grocery shop schema additions

-- Products: unit type, case/bulk selling, min order qty
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS unit_label TEXT DEFAULT 'pcs',
  ADD COLUMN IF NOT EXISTS is_weight_based BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS case_size NUMERIC DEFAULT 1,
  ADD COLUMN IF NOT EXISTS case_price NUMERIC,
  ADD COLUMN IF NOT EXISTS min_order_qty NUMERIC DEFAULT 1;

COMMENT ON COLUMN public.products.unit_label IS 'Selling unit label, e.g. pcs, kg, g, ltr, sack, box';
COMMENT ON COLUMN public.products.is_weight_based IS 'If true, quantity is sold in decimal amounts (kg/ltr etc.)';
COMMENT ON COLUMN public.products.case_size IS 'Number of base units in one case/carton/box';
COMMENT ON COLUMN public.products.case_price IS 'Price for one full case (optional override; if null, case_size * price)';
COMMENT ON COLUMN public.products.min_order_qty IS 'Minimum sellable quantity per line (wholesale minimum order)';

-- Bulk / tiered pricing per product: buy more, pay less per unit
CREATE TABLE IF NOT EXISTS public.product_price_tiers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  min_qty NUMERIC NOT NULL,
  unit_price NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.product_price_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on product_price_tiers"
ON public.product_price_tiers
FOR ALL
USING (true)
WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_product_price_tiers_product_id ON public.product_price_tiers(product_id);
CREATE INDEX IF NOT EXISTS idx_product_price_tiers_min_qty ON public.product_price_tiers(min_qty);

-- Credit customers: distinguish retail vs wholesale/B2B accounts
ALTER TABLE public.credit_customers
  ADD COLUMN IF NOT EXISTS customer_type TEXT NOT NULL DEFAULT 'retail' CHECK (customer_type IN ('retail', 'wholesale', 'b2b')),
  ADD COLUMN IF NOT EXISTS business_name TEXT;

CREATE INDEX IF NOT EXISTS idx_credit_customers_customer_type ON public.credit_customers(customer_type);

-- Sale items: track what unit (piece/case/weight) was actually sold, for reporting
ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS sold_unit TEXT DEFAULT 'unit';

COMMENT ON COLUMN public.sale_items.sold_unit IS 'unit | case | weight - what selling mode was used for this line';
