import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Sends an SMS via SMSlenz.lk (https://smslenz.lk/developers/api). Used for all four credit-
// customer alert triggers (new bill, payment received, due-soon reminder, overdue notice) -
// see POSTerminal.tsx (new bill / payment received, sent inline at checkout/payment time) and
// the "credit-sms-reminders" scheduled job (due-soon / overdue, run periodically via n8n/cron).
//
// Credentials live as Supabase Edge Function secrets (SMSLENZ_USER_ID, SMSLENZ_API_KEY,
// SMSLENZ_SENDER_ID) - never client-exposed, unlike the existing wa.me WhatsApp flow in
// src/lib/whatsapp.ts which has to run client-side because it has no API key to protect.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SMSLENZ_ENDPOINT = "https://smslenz.lk/api/send-sms";

// Sri Lankan numbers show up in the DB in all sorts of shapes (0771234567, 771234567,
// +94771234567, 94771234567, with spaces/dashes). SMSlenz wants E.164 (+94771234567).
function normalizeLkPhone(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;
  if (digits.startsWith("94") && digits.length === 11) return `+${digits}`;
  if (digits.startsWith("0") && digits.length === 10) return `+94${digits.slice(1)}`;
  if (digits.length === 9) return `+94${digits}`; // no leading 0, no country code
  if (raw.trim().startsWith("+")) return raw.trim();
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { contact, message } = await req.json();

    if (!contact || !message) {
      return new Response(
        JSON.stringify({ success: false, error: "contact and message are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = Deno.env.get("SMSLENZ_USER_ID");
    const apiKey = Deno.env.get("SMSLENZ_API_KEY");
    const senderId = Deno.env.get("SMSLENZ_SENDER_ID") || "SMSlenzDEMO";

    if (!userId || !apiKey) {
      console.error("SMSlenz credentials not configured");
      return new Response(
        JSON.stringify({ success: false, error: "SMS gateway not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const phone = normalizeLkPhone(String(contact));
    if (!phone) {
      console.error("Could not normalize phone number:", contact);
      return new Response(
        JSON.stringify({ success: false, error: "Invalid phone number" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Sending SMS via SMSlenz to", phone);

    const smsResponse = await fetch(SMSLENZ_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        api_key: apiKey,
        sender_id: senderId,
        contact: phone,
        message,
      }),
    });

    const responseText = await smsResponse.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(responseText);
    } catch {
      parsed = { raw: responseText };
    }

    if (!smsResponse.ok) {
      console.error("SMSlenz API error:", smsResponse.status, responseText);
      return new Response(
        JSON.stringify({ success: false, error: "SMS gateway rejected the request", details: parsed }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("SMSlenz response:", parsed);

    return new Response(
      JSON.stringify({ success: true, details: parsed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error sending SMS:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
