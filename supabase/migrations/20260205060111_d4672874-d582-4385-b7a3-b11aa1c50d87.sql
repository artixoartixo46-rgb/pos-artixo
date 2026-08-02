-- Add cheque print calibration settings to the settings table
ALTER TABLE public.settings 
ADD COLUMN IF NOT EXISTS cheque_top_offset_mm numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS cheque_left_offset_mm numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS cheque_test_mode boolean DEFAULT false;

-- Update existing rows to have default values
UPDATE public.settings 
SET cheque_top_offset_mm = COALESCE(cheque_top_offset_mm, 0),
    cheque_left_offset_mm = COALESCE(cheque_left_offset_mm, 0),
    cheque_test_mode = COALESCE(cheque_test_mode, false);
