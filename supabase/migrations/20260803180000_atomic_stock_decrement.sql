-- Atomic stock decrement, used by both online checkout and offline-sale sync.
-- Doing this as a single UPDATE (instead of read-then-write in the app) avoids lost updates
-- when several sales for the same product get applied back-to-back (e.g. a burst of queued
-- offline sales syncing at once).
CREATE OR REPLACE FUNCTION public.decrement_stock(p_product_id UUID, p_qty NUMERIC)
RETURNS VOID AS $$
BEGIN
  UPDATE public.products
  SET stock_quantity = stock_quantity - p_qty
  WHERE id = p_product_id;
END;
$$ LANGUAGE plpgsql;

-- sale_date defaults to now(), but offline sales need to record when the sale actually
-- happened (at capture time) rather than when it gets synced - allow the app to set it explicitly.
COMMENT ON COLUMN public.sales.sale_date IS 'Time the sale occurred. For offline sales, set explicitly at sync time to the original capture time, not the sync time.';
