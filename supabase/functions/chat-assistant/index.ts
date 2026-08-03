import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GEMINI_MODEL = "gemini-2.0-flash";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// ---- Tool (function-calling) declarations sent to Gemini ----
const toolDeclarations = [
  {
    name: "search_products",
    description:
      "Search products/items by name or barcode. Returns matching products with price, stock quantity and category.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Product name or barcode (partial match ok)" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_low_stock_products",
    description:
      "Get all products whose stock quantity is at or below their minimum stock level (low stock / needs restocking).",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "get_sales_summary",
    description:
      "Get a sales summary (total revenue and number of sales) for a given time period.",
    parameters: {
      type: "object",
      properties: {
        period: {
          type: "string",
          enum: ["today", "week", "month"],
          description: "today = current calendar day, week = last 7 days, month = last 30 days",
        },
      },
      required: ["period"],
    },
  },
  {
    name: "search_credit_customers",
    description:
      "Search credit customers by name or phone number. Returns their outstanding balance.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Customer name or phone (partial match ok)" },
      },
      required: ["query"],
    },
  },
  {
    name: "add_product",
    description:
      "Add a new product to the inventory. Only call this when the user has clearly confirmed they want to add a specific product with a name and price.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        price: { type: "number", description: "Selling price" },
        cost: { type: "number", description: "Cost price (optional)" },
        stock_quantity: { type: "number", description: "Initial stock quantity (optional, default 0)" },
        category: { type: "string", description: "Product category (optional)" },
      },
      required: ["name", "price"],
    },
  },
];

const SYSTEM_INSTRUCTION = `You are the Artixo POS support assistant, embedded inside a point-of-sale web app used by a shop owner in Sri Lanka. Currency is Rs. (LKR).

You can help in two ways:
1. Answer "how do I..." questions about using the POS (navigating pages, features like POS Terminal, Items, QR Code Print, Reports, Credit Customers, etc.)
2. Actually look up or act on real shop data using the tools provided (search products, check stock, sales summary, credit customer balances, add a product).

Rules:
- The user may write in English, Tamil, or Tanglish (Tamil written in English letters). Reply in the same style/language the user used, in a natural, friendly, concise way.
- Always use a tool when the question needs real data (stock, price, sales, customer balance) instead of guessing.
- Before adding a product, make sure you have at least a name and price; ask for missing details rather than inventing them.
- Keep answers short and practical, like a helpful shop assistant, not a formal report. Use Rs. for money.
- If a tool returns no results, say so clearly and suggest what the user could try instead.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "AI assistant is not configured yet. Ask the admin to add the GEMINI_API_KEY secret.",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { messages } = (await req.json()) as { messages: ChatMessage[] };
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "No messages provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ---- Tool implementations ----
    async function runTool(fnName: string, args: Record<string, unknown>) {
      switch (fnName) {
        case "search_products": {
          const query = String(args.query ?? "");
          const { data, error } = await supabase
            .from("products")
            .select("name, price, stock_quantity, category, barcode, min_stock_level")
            .or(`name.ilike.%${query}%,barcode.ilike.%${query}%`)
            .limit(10);
          if (error) return { error: error.message };
          return { products: data };
        }
        case "get_low_stock_products": {
          const { data, error } = await supabase
            .from("products")
            .select("name, stock_quantity, min_stock_level")
            .order("stock_quantity", { ascending: true })
            .limit(50);
          if (error) return { error: error.message };
          const low = (data ?? []).filter(
            (p: any) => (p.stock_quantity ?? 0) <= (p.min_stock_level ?? 10)
          );
          return { low_stock_products: low };
        }
        case "get_sales_summary": {
          const period = String(args.period ?? "today");
          const now = new Date();
          const start = new Date(now);
          if (period === "today") {
            start.setHours(0, 0, 0, 0);
          } else if (period === "week") {
            start.setDate(start.getDate() - 7);
          } else {
            start.setDate(start.getDate() - 30);
          }
          const { data, error } = await supabase
            .from("sales")
            .select("total_amount")
            .gte("sale_date", start.toISOString());
          if (error) return { error: error.message };
          const total = (data ?? []).reduce((sum: number, s: any) => sum + Number(s.total_amount || 0), 0);
          return { period, sales_count: data?.length ?? 0, total_amount: total };
        }
        case "search_credit_customers": {
          const query = String(args.query ?? "");
          const { data, error } = await supabase
            .from("credit_customers")
            .select("name, phone, outstanding_balance")
            .or(`name.ilike.%${query}%,phone.ilike.%${query}%`)
            .limit(10);
          if (error) return { error: error.message };
          return { customers: data };
        }
        case "add_product": {
          const name = String(args.name ?? "").trim();
          const price = Number(args.price);
          if (!name || !price) return { error: "name and price are required" };
          const { data, error } = await supabase
            .from("products")
            .insert({
              name,
              price,
              cost: args.cost != null ? Number(args.cost) : null,
              stock_quantity: args.stock_quantity != null ? Number(args.stock_quantity) : 0,
              category: args.category ? String(args.category) : null,
            })
            .select("id, name, price")
            .single();
          if (error) return { error: error.message };
          return { added: data };
        }
        default:
          return { error: `Unknown tool ${fnName}` };
      }
    }

    // ---- Build Gemini "contents" from chat history ----
    const contents = messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    async function callGemini(currentContents: unknown[]) {
      const res = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: currentContents,
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          tools: [{ functionDeclarations: toolDeclarations }],
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Gemini API error ${res.status}: ${errText}`);
      }
      return res.json();
    }

    let workingContents: any[] = [...contents];
    let finalText = "";
    const MAX_TOOL_ROUNDS = 4;

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const result = await callGemini(workingContents);
      const candidate = result?.candidates?.[0];
      const parts = candidate?.content?.parts ?? [];

      const functionCallPart = parts.find((p: any) => p.functionCall);

      if (functionCallPart) {
        const { name, args } = functionCallPart.functionCall;
        const toolResult = await runTool(name, args ?? {});

        // Echo model's function call, then supply the function response
        workingContents.push({ role: "model", parts: [{ functionCall: functionCallPart.functionCall }] });
        workingContents.push({
          role: "function",
          parts: [{ functionResponse: { name, response: toolResult } }],
        });
        continue; // ask Gemini again with the tool result
      }

      finalText = parts.map((p: any) => p.text ?? "").join("").trim();
      break;
    }

    if (!finalText) {
      finalText = "Sorry, I couldn't process that just now. Please try again.";
    }

    return new Response(
      JSON.stringify({ success: true, reply: finalText }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("chat-assistant error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
