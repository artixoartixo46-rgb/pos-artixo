import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Free OpenRouter model with tool-calling support. Nvidia-hosted, fast and reliable.
const OPENROUTER_MODEL = "nvidia/nemotron-3-nano-30b-a3b:free";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// ---- Tool (function-calling) declarations, OpenAI/OpenRouter format ----
const tools = [
  {
    type: "function",
    function: {
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
  },
  {
    type: "function",
    function: {
      name: "get_low_stock_products",
      description:
        "Get all products whose stock quantity is at or below their minimum stock level (low stock / needs restocking).",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
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
  },
  {
    type: "function",
    function: {
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
  },
  {
    type: "function",
    function: {
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
  },
];

const SYSTEM_INSTRUCTION = `You are the Artixo POS support assistant, embedded inside a wholesale grocery point-of-sale web app used by a shop owner in Sri Lanka. Currency is Rs. (LKR).

The app's sidebar has these exact pages: Dashboard, POS Terminal (ring up sales), Items (product list/add/edit), Product Category, Vendors, Credit Customers (customers who buy on credit and their balances), Purchase History, Product Receiving (receiving new stock from vendors), Product Inventory, QR Code Print (generate/print QR/barcode stickers for items), Reports, and Settings. Only refer to these actual pages/features when giving how-to guidance — do not invent buttons, menus, or steps that don't fit this app.

This app supports wholesale grocery selling: products can have a selling unit (pcs/kg/g/ltr/sack/box), be sold by weight in decimal quantities, be sold per case/carton (bulk pricing) in addition to single units, have a minimum order quantity, and have bulk/tiered pricing where the unit price drops at higher quantities — all configured on the Items page. Credit Customers can be marked as Retail, Wholesale, or B2B accounts with an optional business name. Reports shows revenue by selling mode (unit/case/weight), sales by category, top wholesale/B2B buyers, and a low-stock reorder list.

You can help in two ways:
1. Answer "how do I..." questions about using the POS by pointing to the correct sidebar page above.
2. Actually look up or act on real shop data using the tools provided (search products, check stock, sales summary, credit customer balances, add a product).

Rules:
- The user may write in English, Tamil, or Tanglish (Tamil written in English letters). Reply in the same style/language the user used, in a natural, friendly, concise way.
- Always use a tool when the question needs real data (stock, price, sales, customer balance) instead of guessing.
- Before adding a product, make sure you have at least a name and price; ask for missing details rather than inventing them.
- Keep answers short and practical, like a helpful shop assistant, not a formal report. Use Rs. for money.
- If a tool returns no results, say so clearly and suggest what the user could try instead.
- Never mention tool names, JSON, or internal implementation details to the user.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "AI assistant is not configured yet. Ask the admin to add the OPENROUTER_API_KEY secret.",
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

    // ---- Build OpenAI-style message history ----
    const chatMessages: any[] = [
      { role: "system", content: SYSTEM_INSTRUCTION },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const openrouterUrl = "https://openrouter.ai/api/v1/chat/completions";

    async function callOpenRouter(currentMessages: unknown[]) {
      const res = await fetch(openrouterUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "HTTP-Referer": "https://pos-artixo.vercel.app",
          "X-Title": "Artixo POS Support Assistant",
        },
        body: JSON.stringify({
          model: OPENROUTER_MODEL,
          messages: currentMessages,
          tools,
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`OpenRouter API error ${res.status}: ${errText}`);
      }
      return res.json();
    }

    let workingMessages: any[] = [...chatMessages];
    let finalText = "";
    const MAX_TOOL_ROUNDS = 4;

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const result = await callOpenRouter(workingMessages);
      const choice = result?.choices?.[0];
      const message = choice?.message;
      const toolCalls = message?.tool_calls;

      if (toolCalls && toolCalls.length > 0) {
        // Echo the assistant's tool-call message first
        workingMessages.push({
          role: "assistant",
          content: message.content ?? null,
          tool_calls: toolCalls,
        });

        for (const call of toolCalls) {
          const fnName = call.function?.name;
          let args: Record<string, unknown> = {};
          try {
            args = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
          } catch {
            args = {};
          }
          const toolResult = await runTool(fnName, args);
          workingMessages.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify(toolResult),
          });
        }
        continue; // ask the model again with tool results
      }

      finalText = (message?.content ?? "").trim();
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
