-- Create cheques table for cheque records
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

-- Create cheque print history log
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

-- Create banks table for bank selection
CREATE TABLE public.banks (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    bank_code VARCHAR(10) NOT NULL UNIQUE,
    bank_name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Insert common Sri Lankan banks
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

-- Enable RLS
ALTER TABLE public.cheques ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cheque_print_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banks ENABLE ROW LEVEL SECURITY;

-- RLS policies for cheques (public access for now - can be restricted later with auth)
CREATE POLICY "Allow all access to cheques" ON public.cheques FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to cheque_print_history" ON public.cheque_print_history FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow read access to banks" ON public.banks FOR SELECT USING (true);

-- Create function to generate next cheque number
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

-- Create trigger for updated_at
CREATE TRIGGER update_cheques_updated_at
BEFORE UPDATE ON public.cheques
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();