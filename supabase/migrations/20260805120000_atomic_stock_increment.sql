-- Atomic stock increment, used by Product Receiving to add incoming stock from vendors.
-- Mirrors decrement_stock (single UPDATE instead of read-then-write) so concurrent
-- receiving entries for the same product don't lose updates.
CREATE OR REPLACE FUNCTION public.increment_stock(p_product_id UUID, p_qty NUMERIC)
RETURNS VOID AS $$
BEGIN
  UPDATE public.products
  SET stock_quantity = stock_quantity + p_qty
  WHERE id = p_product_id;
END;
$$ LANGUAGE plpgsql;
