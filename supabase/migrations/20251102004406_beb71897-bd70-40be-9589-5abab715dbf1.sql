-- Add customer_id and status to sales table for credit billing
ALTER TABLE public.sales 
ADD COLUMN customer_id uuid REFERENCES public.credit_customers(id) ON DELETE SET NULL,
ADD COLUMN status text DEFAULT 'closed' CHECK (status IN ('open', 'partial', 'closed'));

-- Create index for faster customer lookups
CREATE INDEX idx_sales_customer_id ON public.sales(customer_id);
CREATE INDEX idx_credit_customers_name ON public.credit_customers(name);
CREATE INDEX idx_credit_customers_phone ON public.credit_customers(phone);

COMMENT ON COLUMN public.sales.customer_id IS 'Links to credit_customers table for credit billing';
COMMENT ON COLUMN public.sales.status IS 'Invoice status: open (no payment), partial (some payment), closed (full payment)';