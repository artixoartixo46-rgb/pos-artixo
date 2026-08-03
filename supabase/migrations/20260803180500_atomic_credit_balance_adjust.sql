-- Atomic credit-customer balance adjustment, used by both online checkout and offline-sale
-- sync so that several credit sales for the same customer (e.g. a burst of queued offline
-- sales syncing at once) apply as deltas instead of racing on a stale client-side balance read.
CREATE OR REPLACE FUNCTION public.adjust_credit_balance(p_customer_id UUID, p_delta NUMERIC)
RETURNS VOID AS $$
BEGIN
  UPDATE public.credit_customers
  SET outstanding_balance = outstanding_balance + p_delta
  WHERE id = p_customer_id;
END;
$$ LANGUAGE plpgsql;
