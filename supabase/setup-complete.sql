-- ============================================================
-- Glass Flow POS - Complete Database Setup
-- Run this entire file in Supabase SQL Editor
-- ============================================================

-- ============================================================
-- MIGRATION 1: Core Tables (Products, Sales, Sale Items)
-- ============================================================

-- Create products table
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  barcode TEXT UNIQUE,
  category TEXT,
  price DECIMAL(10, 2) NOT NULL,
  cost DECIMAL(10, 2),
  stock_quantity INTEGER DEFAULT 0,
  min_stock_level INTEGER DEFAULT 10,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create sales table
CREATE TABLE public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT UNIQUE NOT NULL,
  sale_date TIMESTAMPTZ DEFAULT now(),
  subtotal DECIMAL(10, 2) NOT NULL,
  tax_amount DECIMAL(10, 2) DEFAULT 0,
  discount_amount DECIMAL(10, 2) DEFAULT 0,
  total_amount DECIMAL(10, 2) NOT NULL,
  payment_method TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create sale_items table
CREATE TABLE public.sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id),
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(10, 2) NOT NULL,
  total_price DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;

-- Create policies for public access
CREATE POLICY "Allow all operations on products" ON public.products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on sales" ON public.sales FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on sale_items" ON public.sale_items FOR ALL USING (true) WITH CHECK (true);

-- Create function to auto-generate invoice numbers
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TEXT AS $$
DECLARE
  next_number INTEGER;
  invoice_num TEXT;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM 4) AS INTEGER)), 0) + 1
  INTO next_number
  FROM public.sales
  WHERE invoice_number LIKE 'INV%';
  
  invoice_num := 'INV' || LPAD(next_number::TEXT, 6, '0');
  RETURN invoice_num;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Insert sample products
INSERT INTO public.products (name, barcode, category, price, cost, stock_quantity, min_stock_level) VALUES
('Apple iPhone 15', '1234567890123', 'Electronics', 999.00, 750.00, 25, 5),
('Samsung Galaxy S24', '2345678901234', 'Electronics', 899.00, 700.00, 30, 5),
('Sony WH-1000XM5', '3456789012345', 'Electronics', 399.00, 250.00, 15, 5),
('Coca Cola 500ml', '4567890123456', 'Beverages', 2.50, 1.00, 200, 50),
('Notebook A4', '5678901234567', 'Stationery', 5.00, 2.50, 100, 20),
('Wireless Mouse', '6789012345678', 'Accessories', 29.99, 15.00, 50, 10),
('USB-C Cable', '7890123456789', 'Accessories', 15.99, 5.00, 80, 15),
('Coffee Beans 1kg', '8901234567890', 'Food', 25.00, 12.00, 40, 10);

-- ============================================================
-- MIGRATION 2: Security Fixes for Functions
-- ============================================================

CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_number INTEGER;
  invoice_num TEXT;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM 4) AS INTEGER)), 0) + 1
  INTO next_number
  FROM public.sales
  WHERE invoice_number LIKE 'INV%';
  
  invoice_num := 'INV' || LPAD(next_number::TEXT, 6, '0');
  RETURN invoice_num;
END;
$$;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============================================================
-- MIGRATION 3: Paid Amount and Balance on Sales
-- ============================================================

ALTER TABLE public.sales 
ADD COLUMN paid_amount numeric DEFAULT 0,
ADD COLUMN balance numeric DEFAULT 0;

-- ============================================================
-- MIGRATION 4: Product Categories, Vendors, Credit Customers, Locations, Settings
-- ============================================================

CREATE TABLE public.product_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.vendors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  gst_vat_number TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.credit_customers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  outstanding_balance NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.locations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  address TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.product_receiving (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor_id UUID REFERENCES public.vendors(id),
  product_id UUID REFERENCES public.products(id),
  quantity INTEGER NOT NULL,
  cost_price NUMERIC NOT NULL,
  location_id UUID REFERENCES public.locations(id),
  received_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_name TEXT DEFAULT 'JN POS',
  address TEXT,
  phone TEXT,
  logo_url TEXT,
  currency TEXT DEFAULT 'LKR',
  currency_symbol TEXT DEFAULT 'Rs.',
  tax_rate NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_receiving ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow all operations on product_categories" ON public.product_categories FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on vendors" ON public.vendors FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on credit_customers" ON public.credit_customers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on locations" ON public.locations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on product_receiving" ON public.product_receiving FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on settings" ON public.settings FOR ALL USING (true) WITH CHECK (true);

-- Add triggers for updated_at
CREATE TRIGGER update_product_categories_updated_at BEFORE UPDATE ON public.product_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_vendors_updated_at BEFORE UPDATE ON public.vendors FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_credit_customers_updated_at BEFORE UPDATE ON public.credit_customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_locations_updated_at BEFORE UPDATE ON public.locations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON public.settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default settings
INSERT INTO public.settings (business_name, currency, currency_symbol) VALUES ('JN POS', 'LKR', 'Rs.');

-- ============================================================
-- MIGRATION 5: Credit Billing (Customer ID + Status on Sales)
-- ============================================================

ALTER TABLE public.sales 
ADD COLUMN customer_id uuid REFERENCES public.credit_customers(id) ON DELETE SET NULL,
ADD COLUMN status text DEFAULT 'closed' CHECK (status IN ('open', 'partial', 'closed'));

CREATE INDEX idx_sales_customer_id ON public.sales(customer_id);
CREATE INDEX idx_credit_customers_name ON public.credit_customers(name);
CREATE INDEX idx_credit_customers_phone ON public.credit_customers(phone);

COMMENT ON COLUMN public.sales.customer_id IS 'Links to credit_customers table for credit billing';
COMMENT ON COLUMN public.sales.status IS 'Invoice status: open (no payment), partial (some payment), closed (full payment)';

-- ============================================================
-- MIGRATION 6: Product Extra Columns (Brand, Warranty, etc.)
-- ============================================================

ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS brand text,
ADD COLUMN IF NOT EXISTS sub_category text,
ADD COLUMN IF NOT EXISTS warranty text DEFAULT 'No Warranty',
ADD COLUMN IF NOT EXISTS weight_kg numeric(10,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS invoice_number text;

CREATE INDEX IF NOT EXISTS idx_products_brand ON public.products(brand);
CREATE INDEX IF NOT EXISTS idx_products_sub_category ON public.products(sub_category);

-- ============================================================
-- MIGRATION 7: QR Code Number on Products
-- ============================================================

ALTER TABLE public.products 
ADD COLUMN qr_code_number text UNIQUE;

CREATE INDEX idx_products_qr_code_number ON public.products(qr_code_number);

CREATE OR REPLACE FUNCTION public.get_next_qr_code_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  next_number INTEGER;
  qr_code TEXT;
BEGIN
  SELECT COALESCE(MAX(CAST(qr_code_number AS INTEGER)), 1000) + 1
  INTO next_number
  FROM public.products
  WHERE qr_code_number ~ '^\d+$';
  
  qr_code := next_number::TEXT;
  RETURN qr_code;
END;
$function$;

-- ============================================================
-- MIGRATION 8: Credit Payment History
-- ============================================================

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

ALTER TABLE public.credit_payment_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on credit_payment_history"
ON public.credit_payment_history
FOR ALL
USING (true)
WITH CHECK (true);

CREATE INDEX idx_credit_payment_history_customer ON public.credit_payment_history(customer_id);
CREATE INDEX idx_credit_payment_history_invoice ON public.credit_payment_history(invoice_id);
CREATE INDEX idx_credit_payment_history_date ON public.credit_payment_history(payment_date);

-- ============================================================
-- MIGRATION 9: Vendor Bills and Vendor Ledger
-- ============================================================

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

ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS opening_balance NUMERIC DEFAULT 0;
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS current_balance NUMERIC DEFAULT 0;

ALTER TABLE public.vendor_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on vendor_bills" 
ON public.vendor_bills 
FOR ALL 
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow all operations on vendor_ledger" 
ON public.vendor_ledger 
FOR ALL 
USING (true)
WITH CHECK (true);

CREATE INDEX idx_vendor_bills_vendor_id ON public.vendor_bills(vendor_id);
CREATE INDEX idx_vendor_bills_invoice_number ON public.vendor_bills(invoice_number);
CREATE INDEX idx_vendor_ledger_vendor_id ON public.vendor_ledger(vendor_id);
CREATE INDEX idx_vendor_ledger_transaction_date ON public.vendor_ledger(transaction_date);

-- ============================================================
-- MIGRATION 10: Cheques, Banks, Cheque Print History
-- ============================================================

CREATE TABLE public.cheques (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    cheque_number VARCHAR(20) NOT NULL UNIQUE,
    payee_name VARCHAR(255) NOT NULL,
    amount NUMERIC(15, 2) NOT NULL,
    amount_in_words TEXT NOT NULL,
    cheque_date DATE NOT NULL,
    bank_name VARCHAR(100) NOT NULL,
    bank_branch VARCHAR(100),
    account_number VARCHAR(50),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'printed', 'cancelled', 'cleared')),
    print_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    created_by UUID,
    last_printed_by UUID,
    last_printed_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE public.cheque_print_history (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    cheque_id UUID REFERENCES public.cheques(id) ON DELETE CASCADE NOT NULL,
    cheque_number VARCHAR(20) NOT NULL,
    printed_by UUID,
    printed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    print_type VARCHAR(20) DEFAULT 'original' CHECK (print_type IN ('original', 'reprint')),
    ip_address VARCHAR(45),
    user_agent TEXT
);

CREATE TABLE public.banks (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    bank_code VARCHAR(10) NOT NULL UNIQUE,
    bank_name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

INSERT INTO public.banks (bank_code, bank_name) VALUES
    ('BOC', 'Bank of Ceylon'),
    ('PB', 'People''s Bank'),
    ('HNB', 'Hatton National Bank'),
    ('COMBANK', 'Commercial Bank of Ceylon'),
    ('SAMPATH', 'Sampath Bank'),
    ('SEYLAN', 'Seylan Bank'),
    ('NTB', 'Nations Trust Bank'),
    ('DFCC', 'DFCC Bank'),
    ('NSB', 'National Savings Bank'),
    ('PAN', 'Pan Asia Banking Corporation'),
    ('UNION', 'Union Bank of Colombo'),
    ('AMANA', 'Amana Bank'),
    ('RDB', 'Regional Development Bank'),
    ('SDB', 'Sanasa Development Bank'),
    ('HDFC', 'HDFC Bank Sri Lanka');

ALTER TABLE public.cheques ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cheque_print_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to cheques" ON public.cheques FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to cheque_print_history" ON public.cheque_print_history FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow read access to banks" ON public.banks FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION public.get_next_cheque_number()
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    next_number INTEGER;
    result TEXT;
BEGIN
    SELECT COALESCE(MAX(CAST(SUBSTRING(cheque_number FROM 4) AS INTEGER)), 0) + 1
    INTO next_number
    FROM public.cheques
    WHERE cheque_number LIKE 'CHQ%';
    
    result := 'CHQ' || LPAD(next_number::TEXT, 6, '0');
    RETURN result;
END;
$$;

CREATE TRIGGER update_cheques_updated_at
BEFORE UPDATE ON public.cheques
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- MIGRATION 11: Cheque Print Calibration Settings
-- ============================================================

ALTER TABLE public.settings 
ADD COLUMN IF NOT EXISTS cheque_top_offset_mm numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS cheque_left_offset_mm numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS cheque_test_mode boolean DEFAULT false;

UPDATE public.settings 
SET cheque_top_offset_mm = COALESCE(cheque_top_offset_mm, 0),
    cheque_left_offset_mm = COALESCE(cheque_left_offset_mm, 0),
    cheque_test_mode = COALESCE(cheque_test_mode, false);

-- ============================================================
-- MIGRATION 12: Cheque Orientation Setting
-- ============================================================

ALTER TABLE public.settings 
ADD COLUMN IF NOT EXISTS cheque_orientation TEXT DEFAULT 'portrait';

-- ============================================================
-- MIGRATION 13: Improved Cheque Number Generator
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_next_cheque_number()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  max_num INTEGER := 0;
  cur_num INTEGER;
  rec RECORD;
BEGIN
  FOR rec IN SELECT cheque_number FROM public.cheques LOOP
    BEGIN
      cur_num := CAST(regexp_replace(rec.cheque_number, '[^0-9]', '', 'g') AS INTEGER);
      IF cur_num > max_num THEN
        max_num := cur_num;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END LOOP;
  RETURN 'CHQ' || LPAD((max_num + 1)::TEXT, 6, '0');
END;
$$;

-- ============================================================
-- ✅ SETUP COMPLETE
-- ============================================================
