-- Returns / refunds: a cashier looks up a past sale by invoice number, selects which line
-- items (and how much of each) are being returned, picks a reason code, and records a
-- refund. Returned items get restocked (unless flagged not-restockable, e.g. damaged/expired
-- goods that can't go back on the shelf). This table pair is the permanent audit trail of
-- every return ever processed.

CREATE TABLE public.returns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_id UUID REFERENCES public.sales(id),
  invoice_number TEXT NOT NULL,
  customer_id UUID REFERENCES public.credit_customers(id),
  customer_name TEXT,
  reason TEXT NOT NULL, -- 'damaged' | 'wrong_item' | 'changed_mind' | 'expired' | 'other'
  reason_note TEXT,
  refund_method TEXT NOT NULL, -- 'cash' | 'credit_adjustment' | 'exchange'
  refund_amount NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.return_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  return_id UUID NOT NULL REFERENCES public.returns(id) ON DELETE CASCADE,
  sale_item_id UUID REFERENCES public.sale_items(id),
  product_id UUID REFERENCES public.products(id),
  product_name TEXT NOT NULL,
  quantity NUMERIC NOT NULL,
  unit_price NUMERIC NOT NULL,
  line_refund NUMERIC NOT NULL,
  restocked BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX idx_return_items_return_id ON public.return_items(return_id);
CREATE INDEX idx_returns_sale_id ON public.returns(sale_id);
CREATE INDEX idx_returns_invoice_number ON public.returns(invoice_number);

ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on returns" ON public.returns FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on return_items" ON public.return_items FOR ALL USING (true) WITH CHECK (true);
