import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ExtractedItem {
  product_name: string;
  quantity: number;
  unit_price: number;
  tax: number;
  total: number;
}

interface ExtractedBillData {
  vendor_name: string;
  vendor_address: string;
  vendor_phone: string;
  vendor_email: string;
  gst_vat_number: string;
  bill_date: string;
  invoice_number: string;
  items: ExtractedItem[];
  subtotal: number;
  tax_amount: number;
  total_amount: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { image_base64, action, extracted_data } = await req.json();

    // Handle "preview" action - just extract and return data without saving
    if (action === "preview") {
      if (!image_base64) {
        return new Response(
          JSON.stringify({ success: false, error: "No image provided" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) {
        console.error("LOVABLE_API_KEY not configured");
        return new Response(
          JSON.stringify({ success: false, error: "AI service not configured" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("Processing vendor bill with OCR (preview mode)...");

      // Use Lovable AI Vision to extract bill data
      const ocrResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content: `You are an expert OCR system specialized in extracting data from vendor bills, invoices, and receipts.
Extract ALL visible information from the bill image and return ONLY valid JSON:
{
  "vendor_name": "string - name of the vendor/supplier/company",
  "vendor_address": "string - full vendor address if visible",
  "vendor_phone": "string - vendor phone number (look for Tel, Phone, Mobile, Contact)",
  "vendor_email": "string - vendor email address if visible",
  "gst_vat_number": "string - GST/VAT/Tax registration number if visible",
  "bill_date": "YYYY-MM-DD format",
  "invoice_number": "string - invoice/bill/receipt number",
  "items": [
    {
      "product_name": "string - item/product/service name",
      "quantity": number,
      "unit_price": number (price per unit, no currency symbols),
      "tax": number (tax on this item, 0 if not shown),
      "total": number (line total)
    }
  ],
  "subtotal": number (sum before tax, 0 if not shown separately),
  "tax_amount": number (total tax amount, 0 if not shown),
  "total_amount": number (grand total / final amount)
}

IMPORTANT EXTRACTION RULES:
- Extract phone numbers carefully - look for patterns like +94, 0XX, Tel:, Phone:, Mobile:
- Extract email addresses - look for @ symbol
- Extract GST/VAT numbers - look for "GST", "VAT", "TIN", "Tax ID", registration numbers
- All prices must be numbers, not strings (remove currency symbols)
- Use 0 for missing numeric values
- Use empty string "" for missing text values
- Parse quantity as numbers (convert "2 pcs", "2x", "2 nos" to 2)
- Extract ALL line items including services
- Calculate subtotal if not shown (sum of item totals)
- Calculate tax_amount if not shown (total - subtotal)
- Return ONLY the JSON object, no markdown, no code blocks, no additional text`
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Extract ALL data from this vendor bill/invoice image. Return only valid JSON with all fields."
                },
                {
                  type: "image_url",
                  image_url: {
                    url: image_base64.startsWith("data:") ? image_base64 : `data:image/jpeg;base64,${image_base64}`
                  }
                }
              ]
            }
          ],
          max_tokens: 4000,
        }),
      });

      if (!ocrResponse.ok) {
        const errorText = await ocrResponse.text();
        console.error("OCR API error:", ocrResponse.status, errorText);
        
        if (ocrResponse.status === 429) {
          return new Response(
            JSON.stringify({ success: false, error: "AI rate limit exceeded. Please try again later." }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (ocrResponse.status === 402) {
          return new Response(
            JSON.stringify({ success: false, error: "AI service payment required. Please add credits." }),
            { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        return new Response(
          JSON.stringify({ success: false, error: "OCR processing failed" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const ocrData = await ocrResponse.json();
      const content = ocrData.choices?.[0]?.message?.content;
      
      if (!content) {
        console.error("No content in OCR response");
        return new Response(
          JSON.stringify({ success: false, error: "No data extracted from image" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("OCR raw response:", content);

      // Parse the extracted JSON
      let extractedData: ExtractedBillData;
      try {
        let cleanContent = content.trim();
        // Remove markdown code blocks if present
        if (cleanContent.startsWith("```json")) {
          cleanContent = cleanContent.slice(7);
        }
        if (cleanContent.startsWith("```")) {
          cleanContent = cleanContent.slice(3);
        }
        if (cleanContent.endsWith("```")) {
          cleanContent = cleanContent.slice(0, -3);
        }
        extractedData = JSON.parse(cleanContent.trim());
        
        // Ensure all fields have default values
        extractedData = {
          vendor_name: extractedData.vendor_name || "",
          vendor_address: extractedData.vendor_address || "",
          vendor_phone: extractedData.vendor_phone || "",
          vendor_email: extractedData.vendor_email || "",
          gst_vat_number: extractedData.gst_vat_number || "",
          bill_date: extractedData.bill_date || new Date().toISOString().split("T")[0],
          invoice_number: extractedData.invoice_number || "",
          items: extractedData.items || [],
          subtotal: extractedData.subtotal || 0,
          tax_amount: extractedData.tax_amount || 0,
          total_amount: extractedData.total_amount || 0,
        };
        
        // Calculate subtotal if not provided
        if (!extractedData.subtotal && extractedData.items.length > 0) {
          extractedData.subtotal = extractedData.items.reduce((sum, item) => sum + (item.total || 0), 0);
        }
        
        // Calculate total if not provided
        if (!extractedData.total_amount) {
          extractedData.total_amount = extractedData.subtotal + extractedData.tax_amount;
        }
        
      } catch (parseError) {
        console.error("Failed to parse OCR response:", parseError);
        return new Response(
          JSON.stringify({ success: false, error: "Failed to parse bill data", raw: content }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("Extracted data (preview):", extractedData);

      return new Response(
        JSON.stringify({
          success: true,
          action: "preview",
          extracted_data: extractedData,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle "save" action - save the confirmed data to database
    if (action === "save") {
      if (!extracted_data) {
        return new Response(
          JSON.stringify({ success: false, error: "No data provided to save" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Initialize Supabase client
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      const data = extracted_data as ExtractedBillData;
      console.log("Saving vendor bill data:", data);

      // Step 1: Find or create vendor
      let vendorId: string;
      const vendorName = data.vendor_name || "Unknown Vendor";
      
      const { data: existingVendor } = await supabase
        .from("vendors")
        .select("id, current_balance")
        .ilike("name", `%${vendorName}%`)
        .limit(1)
        .single();

      if (existingVendor) {
        vendorId = existingVendor.id;
        console.log("Found existing vendor:", vendorId);
        
        // Update vendor info if we have new data
        await supabase
          .from("vendors")
          .update({
            phone: data.vendor_phone || undefined,
            email: data.vendor_email || undefined,
            address: data.vendor_address || undefined,
            gst_vat_number: data.gst_vat_number || undefined,
            updated_at: new Date().toISOString(),
          })
          .eq("id", vendorId);
      } else {
        // Create new vendor
        const { data: newVendor, error: vendorError } = await supabase
          .from("vendors")
          .insert({
            name: vendorName,
            address: data.vendor_address || null,
            phone: data.vendor_phone || null,
            email: data.vendor_email || null,
            gst_vat_number: data.gst_vat_number || null,
            opening_balance: 0,
            current_balance: 0,
          })
          .select("id")
          .single();

        if (vendorError) {
          console.error("Failed to create vendor:", vendorError);
          return new Response(
            JSON.stringify({ success: false, error: "Failed to create vendor" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        vendorId = newVendor.id;
        console.log("Created new vendor:", vendorId);
      }

      // Step 2: Save vendor bill
      const totalAmount = data.total_amount || 
        data.items.reduce((sum, item) => sum + (item.total || 0), 0);

      const { data: bill, error: billError } = await supabase
        .from("vendor_bills")
        .insert({
          vendor_id: vendorId,
          invoice_number: data.invoice_number || `SCAN-${Date.now()}`,
          invoice_date: data.bill_date || new Date().toISOString().split("T")[0],
          total_amount: totalAmount,
          items: data.items,
          bill_image_url: null,
          status: "processed",
        })
        .select("id")
        .single();

      if (billError) {
        console.error("Failed to save bill:", billError);
        return new Response(
          JSON.stringify({ success: false, error: "Failed to save bill" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("Saved bill:", bill.id);

      // Step 3: Auto-import products and update stock
      let productsCreated = 0;
      let productsUpdated = 0;

      for (const item of data.items) {
        if (!item.product_name) continue;

        const { data: existingProduct } = await supabase
          .from("products")
          .select("id, stock_quantity, cost")
          .ilike("name", `%${item.product_name}%`)
          .limit(1)
          .single();

        if (existingProduct) {
          const newStock = (existingProduct.stock_quantity || 0) + (item.quantity || 0);
          await supabase
            .from("products")
            .update({
              cost: item.unit_price || existingProduct.cost,
              stock_quantity: newStock,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingProduct.id);
          productsUpdated++;
        } else {
          const { data: qrData } = await supabase.rpc("get_next_qr_code_number");
          
          await supabase.from("products").insert({
            name: item.product_name,
            price: item.unit_price ? item.unit_price * 1.2 : 0,
            cost: item.unit_price || 0,
            stock_quantity: item.quantity || 0,
            qr_code_number: qrData || null,
            invoice_number: data.invoice_number || null,
          });
          productsCreated++;
        }
      }

      console.log(`Products: ${productsCreated} created, ${productsUpdated} updated`);

      // Step 4: Update vendor ledger
      const { data: lastLedgerEntry } = await supabase
        .from("vendor_ledger")
        .select("balance")
        .eq("vendor_id", vendorId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      const previousBalance = lastLedgerEntry?.balance || 0;
      const newBalance = previousBalance + totalAmount;

      await supabase.from("vendor_ledger").insert({
        vendor_id: vendorId,
        bill_id: bill.id,
        description: "Vendor Bill Added via OCR Scan",
        invoice_number: data.invoice_number || `SCAN-${Date.now()}`,
        debit: totalAmount,
        credit: 0,
        balance: newBalance,
        transaction_date: new Date().toISOString(),
      });

      // Update vendor's current balance
      await supabase
        .from("vendors")
        .update({ current_balance: newBalance })
        .eq("id", vendorId);

      console.log("Ledger updated, new balance:", newBalance);

      return new Response(
        JSON.stringify({
          success: true,
          message: "Vendor bill saved successfully",
          data: {
            bill_id: bill.id,
            vendor_id: vendorId,
            vendor_name: vendorName,
            invoice_number: data.invoice_number,
            total_amount: totalAmount,
            items_count: data.items.length,
            products_created: productsCreated,
            products_updated: productsUpdated,
            new_vendor_balance: newBalance,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Legacy support: if no action specified, do both preview and save (old behavior)
    if (!action && image_base64) {
      return new Response(
        JSON.stringify({ success: false, error: "Please specify action: 'preview' or 'save'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: "Invalid request" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Error processing vendor bill:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
