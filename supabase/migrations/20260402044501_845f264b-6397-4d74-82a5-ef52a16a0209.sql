
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
    END;
  END LOOP;
  RETURN 'CHQ' || LPAD((max_num + 1)::TEXT, 6, '0');
END;
$$;
