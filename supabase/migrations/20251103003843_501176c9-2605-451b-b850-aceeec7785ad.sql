-- Add qr_code_number field to products table
ALTER TABLE public.products 
ADD COLUMN qr_code_number text UNIQUE;

-- Create an index on qr_code_number for faster searches
CREATE INDEX idx_products_qr_code_number ON public.products(qr_code_number);

-- Create a function to get the next QR code number
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
  -- Get the maximum existing QR code number (starting from 1001)
  SELECT COALESCE(MAX(CAST(qr_code_number AS INTEGER)), 1000) + 1
  INTO next_number
  FROM public.products
  WHERE qr_code_number ~ '^\d+$';
  
  qr_code := next_number::TEXT;
  RETURN qr_code;
END;
$function$;