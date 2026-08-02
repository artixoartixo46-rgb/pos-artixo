-- Create vendor_bills table for storing scanned bills
CREATE TABLE public.vendor_bills (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL,
  invoice_number TEXT NOT NULL,
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  bill_image_url TEXT,
  status TEXT NOT NULL DEFAULT 'processed',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create vendor_ledger table for tracking vendor transactions
CREATE TABLE public.vendor_ledger (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor_id UUID REFERENCES public.vendors(id) ON DELETE CASCADE,
  bill_id UUID REFERENCES public.vendor_bills(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  invoice_number TEXT,
  debit NUMERIC NOT NULL DEFAULT 0,
  credit NUMERIC NOT NULL DEFAULT 0,
  balance NUMERIC NOT NULL DEFAULT 0,
  transaction_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add opening_balance column to vendors table
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS opening_balance NUMERIC DEFAULT 0;
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS current_balance NUMERIC DEFAULT 0;

-- Enable RLS
ALTER TABLE public.vendor_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_ledger ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for vendor_bills
CREATE POLICY "Allow all operations on vendor_bills" 
ON public.vendor_bills 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Create RLS policies for vendor_ledger
CREATE POLICY "Allow all operations on vendor_ledger" 
ON public.vendor_ledger 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX idx_vendor_bills_vendor_id ON public.vendor_bills(vendor_id);
CREATE INDEX idx_vendor_bills_invoice_number ON public.vendor_bills(invoice_number);
CREATE INDEX idx_vendor_ledger_vendor_id ON public.vendor_ledger(vendor_id);
CREATE INDEX idx_vendor_ledger_transaction_date ON public.vendor_ledger(transaction_date);