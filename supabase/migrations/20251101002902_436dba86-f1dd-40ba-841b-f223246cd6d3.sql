-- Add paid_amount and balance columns to sales table
ALTER TABLE public.sales 
ADD COLUMN paid_amount numeric DEFAULT 0,
ADD COLUMN balance numeric DEFAULT 0;