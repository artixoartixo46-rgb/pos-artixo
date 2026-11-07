import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Runs on a daily schedule (Supabase pg_cron -> pg_net http call, set up via SQL - see the
// "credit_sms_reminders_daily" cron job) rather than depending on the shop's own n8n instance,
// which only runs while the owner's Windows laptop happens to be on. Two of the four credit-SMS
// triggers live here: "payment due soon" and "payment overdue". (The other two - "new bill" and
// "payment received" - fire inline from POSTerminal.tsx at the moment they happen.)
//
// Idempotent per due date: each sale tracks reminder_sms_sent_at / overdue_sms_sent_at so a
// customer gets exactly one due-soon nudge and one overdue notice per invoice, not one every
// single day this job runs.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DUE_SOON_WINDOW_DAYS = 3;

function normalizeLkPhone(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;
  if (digits.startsWith("94") && digits.length === 11) return `+${digits}`;
  if (digits.startsWith("0") && digits.length === 10) return `+94${digits.slice(1)}`;
  if (digits.length === 9) return `+94${digits}`;
  if (raw.trim().startsWith("+")) return raw.trim();
  return null;
}

async function sendSms(supabaseUrl: string, serviceKey: string, contact: string, message: string) {
  const resp = await fetch(`${supabaseUrl}/functions/v1/send-sms`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify({ contact, message }),
  });
  const data = await resp.json().catch(() => ({}));
  return resp.ok && data?.success;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const soonDate = new Date(today);
    soonDate.setDate(soonDate.getDate() + DUE_SOON_WINDOW_DAYS);
    const soonStr = soonDate.toISOString().split("T")[0];

    let dueSoonSent = 0;
    let overdueSent = 0;
    const errors: string[] = [];

    // -- Due soon: due_date within the window, still owing, not yet reminded --
    const { data: dueSoonSales, error: dueSoonError } = await supabase
      .from("sales")
      .select("id, invoice_number, customer_id, customer_name, customer_phone, balance, due_date, credit_customers(sms_opt_in)")
      .eq("payment_method", "Credit")
      .gt("balance", 0)
      .is("reminder_sms_sent_at", null)
      .gte("due_date", todayStr)
      .lte("due_date", soonStr);

    if (dueSoonError) errors.push(`due-soon query: ${dueSoonError.message}`);

    for (const sale of dueSoonSales || []) {
      const optedOut = (sale as any).credit_customers?.sms_opt_in === false;
      if (optedOut || !sale.customer_phone) continue;
      const phone = normalizeLkPhone(sale.customer_phone);
      if (!phone) continue;

      const message = `Dear ${sale.customer_name || "Customer"}, your credit bill ${sale.invoice_number} (Rs. ${Number(sale.balance).toFixed(2)}) is due on ${new Date(sale.due_date).toLocaleDateString("en-GB")}. Please settle soon. - Artixo`;
      const ok = await sendSms(supabaseUrl, serviceKey, phone, message);
      if (ok) {
        await supabase.from("sales").update({ reminder_sms_sent_at: new Date().toISOString() }).eq("id", sale.id);
        dueSoonSent++;
      } else {
        errors.push(`due-soon send failed for ${sale.invoice_number}`);
      }
    }

    // -- Overdue: due_date already passed, still owing, not yet notified --
    const { data: overdueSales, error: overdueError } = await supabase
      .from("sales")
      .select("id, invoice_number, customer_id, customer_name, customer_phone, balance, due_date, credit_customers(sms_opt_in)")
      .eq("payment_method", "Credit")
      .gt("balance", 0)
      .is("overdue_sms_sent_at", null)
      .lt("due_date", todayStr);

    if (overdueError) errors.push(`overdue query: ${overdueError.message}`);

    for (const sale of overdueSales || []) {
      const optedOut = (sale as any).credit_customers?.sms_opt_in === false;
      if (optedOut || !sale.customer_phone) continue;
      const phone = normalizeLkPhone(sale.customer_phone);
      if (!phone) continue;

      const message = `Dear ${sale.customer_name || "Customer"}, your credit bill ${sale.invoice_number} (Rs. ${Number(sale.balance).toFixed(2)}) was due on ${new Date(sale.due_date).toLocaleDateString("en-GB")} and is now overdue. Please settle at your earliest. - Artixo`;
      const ok = await sendSms(supabaseUrl, serviceKey, phone, message);
      if (ok) {
        await supabase.from("sales").update({ overdue_sms_sent_at: new Date().toISOString() }).eq("id", sale.id);
        overdueSent++;
      } else {
        errors.push(`overdue send failed for ${sale.invoice_number}`);
      }
    }

    console.log(`Credit SMS reminders: ${dueSoonSent} due-soon, ${overdueSent} overdue sent.`, errors);

    return new Response(
      JSON.stringify({ success: true, dueSoonSent, overdueSent, errors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("credit-sms-reminders error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
