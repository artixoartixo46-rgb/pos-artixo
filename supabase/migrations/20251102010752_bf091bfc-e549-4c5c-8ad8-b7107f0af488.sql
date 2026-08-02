-- Add new columns to products table
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS brand text,
ADD COLUMN IF NOT EXISTS sub_category text,
ADD COLUMN IF NOT EXISTS warranty text DEFAULT 'No Warranty',
ADD COLUMN IF NOT EXISTS weight_kg numeric(10,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS invoice_number text;

-- Create index for brand and sub_category for faster filtering
CREATE INDEX IF NOT EXISTS idx_products_brand ON public.products(brand);
CREATE INDEX IF NOT EXISTS idx_products_sub_category ON public.products(sub_category);