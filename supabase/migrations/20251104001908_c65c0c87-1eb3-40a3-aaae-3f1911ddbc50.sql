-- Create credit payment history table
CREATE TABLE IF NOT EXISTS public.credit_payment_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID REFERENCES public.credit_customers(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES public.sales(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL,
  payment_amount NUMERIC NOT NULL,
  payment_method TEXT NOT NULL,
  remarks TEXT,
  balance_before NUMERIC NOT NULL,
  balance_after NUMERIC NOT NULL,
  payment_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.credit_payment_history ENABLE ROW LEVEL SECURITY;

-- Create policy for credit payment history
CREATE POLICY "Allow all operations on credit_payment_history"
ON public.credit_payment_history
FOR ALL
USING (true)
WITH CHECK (true);

-- Create index for faster queries
CREATE INDEX idx_credit_payment_history_customer ON public.credit_payment_history(customer_id);
CREATE INDEX idx_credit_payment_history_invoice ON public.credit_payment_history(invoice_id);
CREATE INDEX idx_credit_payment_history_date ON public.credit_payment_history(payment_date);