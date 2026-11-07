// Sends real SMS alerts to credit customers via the SMSlenz.lk gateway, through the
// "send-sms" Supabase Edge Function (keeps the SMSlenz API key server-side - see
// supabase/functions/send-sms/index.ts). Used for all four credit-customer alert triggers:
// new bill created, payment received, due-date approaching, and overdue - fired inline at
// checkout/payment time in POSTerminal.tsx, and by the scheduled due/overdue check.
//
// Fire-and-forget by design: an SMS failing (bad number, gateway down, low balance) should
// never block or roll back a sale/payment that already succeeded - every call site wraps this
// in .catch(() => {}) the same way the existing WhatsApp share flow never blocks billing.

import { supabase } from "@/integrations/supabase/client";

export async function sendCreditSms(contact: string | null | undefined, message: string): Promise<boolean> {
  if (!contact) return false;
  try {
    const { data, error } = await supabase.functions.invoke("send-sms", {
      body: { contact, message },
    });
    if (error || !data?.success) {
      console.error("SMS send failed:", error || data?.error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("SMS send error:", err);
    return false;
  }
}

// -- Message templates for the four triggers --

export function newCreditBillSms(customerName: string, invoiceNumber: string, totalAmount: number, dueDate?: string | null): string {
  const due = dueDate ? ` Due by ${new Date(dueDate).toLocaleDateString("en-GB")}.` : "";
  return `Dear ${customerName}, a new credit bill ${invoiceNumber} of Rs. ${totalAmount.toFixed(2)} has been added to your account.${due} - Artixo`;
}

export function paymentReceivedSms(customerName: string, amountPaid: number, newBalance: number): string {
  return `Dear ${customerName}, we received your payment of Rs. ${amountPaid.toFixed(2)}. Your outstanding balance is now Rs. ${newBalance.toFixed(2)}. Thank you! - Artixo`;
}

export function paymentDueSoonSms(customerName: string, invoiceNumber: string, balance: number, dueDate: string): string {
  return `Dear ${customerName}, your credit bill ${invoiceNumber} (Rs. ${balance.toFixed(2)}) is due on ${new Date(dueDate).toLocaleDateString("en-GB")}. Please settle soon. - Artixo`;
}

export function paymentOverdueSms(customerName: string, invoiceNumber: string, balance: number, dueDate: string): string {
  return `Dear ${customerName}, your credit bill ${invoiceNumber} (Rs. ${balance.toFixed(2)}) was due on ${new Date(dueDate).toLocaleDateString("en-GB")} and is now overdue. Please settle at your earliest. - Artixo`;
}
