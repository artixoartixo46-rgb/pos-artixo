-- Add cheque orientation setting
ALTER TABLE public.settings 
ADD COLUMN IF NOT EXISTS cheque_orientation TEXT DEFAULT 'portrait';