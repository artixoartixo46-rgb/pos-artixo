import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Receipt as ReceiptIcon, CheckCircle2 } from "lucide-react";
import artixoLogo from "@/assets/artixo-logo.png";

// Standalone, mobile-first, NO login/sidebar - this is what a customer's own phone camera
// lands on after scanning the "Digital Receipt" QR shown at checkout. Paper-free alternative
// to the thermal/browser print receipt: same invoice data, read straight from Supabase by
// invoice_number (RLS on sales/sale_items is fully open, same as the scan-to-return flow).
export default function DigitalReceipt() {
  const { invoiceNumber } = useParams<{ invoiceNumber: string }>();

  const { data: shopSettings } = useQuery({
    queryKey: ["settings-for-digital-receipt"],
    queryFn: async () => {
      const { data, error } = await supabase.from("settings").select("business_name, address, phone").limit(1).single();
      if (error && error.code !== "PGRST116") throw error;
      return data;
    },
  });

  const { data: sale, isLoading: saleLoading, error: saleError } = useQuery({
    queryKey: ["digital-receipt-sale", invoiceNumber],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("*")
        .eq("invoice_number", invoiceNumber)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!invoiceNumber,
  });

  const { data: items, isLoading: itemsLoading } = useQuery({
    queryKey: ["digital-receipt-items", sale?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sale_items")
        .select("*")
        .eq("sale_id", sale!.id)
        .order("created_at");
      if (error) throw error;
      return data || [];
    },
    enabled: !!sale?.id,
  });

  const loading = saleLoading || (!!sale && itemsLoading);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (saleError || !sale) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background text-center">
        <div>
          <ReceiptIcon className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
          <p className="text-lg font-semibold">Receipt not found</p>
          <p className="text-sm text-muted-foreground mt-1">
            No bill found for invoice "{invoiceNumber}". Please check with the counter staff.
          </p>
        </div>
      </div>
    );
  }

  const dateStr = new Date(sale.sale_date || sale.created_at || Date.now());

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <div className="max-w-md mx-auto">
        <div className="flex flex-col items-center text-center mb-4">
          <img src={artixoLogo} alt="Artixo" className="h-12 w-12 mb-2" />
          <h1 className="text-xl font-bold">{shopSettings?.business_name || "Artixo POS"}</h1>
          {shopSettings?.address && <p className="text-xs text-muted-foreground">{shopSettings.address}</p>}
          {shopSettings?.phone && <p className="text-xs text-muted-foreground">{shopSettings.phone}</p>}
        </div>

        <div className="glass-card rounded-2xl p-5">
          <div className="flex items-center justify-center gap-2 text-green-500 mb-4">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-semibold">Digital Receipt</span>
          </div>

          <div className="flex justify-between text-sm mb-1">
            <span className="text-muted-foreground">Invoice:</span>
            <span className="font-semibold">{sale.invoice_number}</span>
          </div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-muted-foreground">Date:</span>
            <span>{dateStr.toLocaleDateString("en-GB")} {dateStr.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</span>
          </div>
          {sale.customer_name && (
            <div className="flex justify-between text-sm mb-1">
              <span className="text-muted-foreground">Customer:</span>
              <span>{sale.customer_name}</span>
            </div>
          )}

          <div className="border-t border-border/50 my-3" />

          <div className="space-y-2">
            {(items || []).map((item) => (
              <div key={item.id} className="flex justify-between text-sm gap-3">
                <div className="flex-1 min-w-0">
                  <p className="truncate">{item.product_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.quantity}{item.sold_unit ? ` ${item.sold_unit}` : ""} x Rs. {(item.total_price / item.quantity).toFixed(2)}
                  </p>
                </div>
                <span className="font-medium whitespace-nowrap">Rs. {item.total_price.toFixed(2)}</span>
              </div>
            ))}
          </div>

          <div className="border-t border-border/50 my-3" />

          <div className="flex justify-between text-sm mb-1">
            <span className="text-muted-foreground">Subtotal:</span>
            <span>Rs. {sale.subtotal.toFixed(2)}</span>
          </div>
          {!!sale.discount_amount && sale.discount_amount > 0 && (
            <div className="flex justify-between text-sm mb-1">
              <span className="text-muted-foreground">Discount:</span>
              <span>- Rs. {sale.discount_amount.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-bold mt-2">
            <span>Total:</span>
            <span>Rs. {sale.total_amount.toFixed(2)}</span>
          </div>

          <div className="border-t border-border/50 my-3" />

          <div className="flex justify-between text-sm mb-1">
            <span className="text-muted-foreground">Paid By:</span>
            <span>{sale.payment_method}</span>
          </div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-muted-foreground">Paid Amount:</span>
            <span>Rs. {(sale.paid_amount || 0).toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{(sale.balance || 0) >= 0 ? "Change:" : "Balance Due:"}</span>
            <span className={(sale.balance || 0) >= 0 ? "text-green-500" : "text-orange-500"}>
              Rs. {Math.abs(sale.balance || 0).toFixed(2)}
            </span>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-4">
          Thank you! Visit Again · Powered by Artixo
        </p>
      </div>
    </div>
  );
}
