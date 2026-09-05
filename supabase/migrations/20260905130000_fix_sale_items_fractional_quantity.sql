-- Bug fix: sale_items.quantity was left as INTEGER from the original schema. The wholesale
-- grocery feature (weight-based products, partial sacks/cases, kg/ltr selling units) lets the
-- POS Terminal record fractional quantities like 1.1 (sack) or 0.5 (kg), but every checkout for
-- such a line item was silently failing the sale_items insert (Postgres rejects "1.1" for an
-- integer column) with a 400 error. Because the insert is a single batch call, this also blocked
-- every OTHER item in the same cart from being recorded, and the code then never reached the
-- decrement_stock step - so the customer's total sale amount would land in "sales" with zero
-- line items and stock left untouched, and no clear success/failure was shown at the register.
--
-- return_items.quantity, vendor_checkin_items.quantity and stock_take_items' counted/system
-- qty were all already created as NUMERIC. products.stock_quantity, products.min_stock_level
-- and product_receiving.quantity were missed the same way sale_items was - fixing all of them
-- here so weight-based stock levels and vendor receipts don't hit the same failure or get
-- silently rounded (an INTEGER column accepts "stock_quantity - 1.1" via an assignment cast
-- that rounds instead of erroring, which would have quietly drifted stock counts over time).
ALTER TABLE public.sale_items
  ALTER COLUMN quantity TYPE NUMERIC USING quantity::numeric;

ALTER TABLE public.products
  ALTER COLUMN stock_quantity TYPE NUMERIC USING stock_quantity::numeric,
  ALTER COLUMN min_stock_level TYPE NUMERIC USING min_stock_level::numeric;

ALTER TABLE public.product_receiving
  ALTER COLUMN quantity TYPE NUMERIC USING quantity::numeric;
