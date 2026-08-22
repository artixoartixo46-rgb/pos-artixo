import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QRCodeSVG } from "qrcode.react";
import {
  Loader2,
  Receipt as ReceiptIcon,
  ShoppingCart,
  Calendar,
  Clock,
  FileText,
  Store,
  MapPin,
  Phone,
  Banknote,
  BadgeDollarSign,
  Heart,
  Headset,
} from "lucide-react";

// Standalone, mobile-first, NO login/sidebar - this is what a customer's own phone camera
// lands on after scanning the "Digital Receipt" QR shown at checkout. Paper-free alternative
// to the thermal/browser print receipt: same invoice data, read straight from Supabase by
// invoice_number (RLS on sales/sale_items is fully open, same as the scan-to-return flow).
//
// Styled as a standalone printable-looking "invoice card" (teal brand accent, icon rows,
// QR + support footer) rather than a bare list, since this is the one receipt surface that
// isn't constrained to a 58mm thermal printer - full color and layout are fair game here.
export default function DigitalReceipt() {
  const { invoiceNumber } = useParams<{ invoiceNumber: string }>();

  const { data: shopSettings } = useQuery({
    queryKey: ["settings-for-digital-receipt"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("settings")
        .select("business_name, address, phone, logo_url, tax_rate")
        .limit(1)
        .single();
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
      <div className="min-h-screen flex items-center justify-center p-6 bg-neutral-100">
        <Loader2 className="h-8 w-8 animate-spin text-teal-700" />
      </div>
    );
  }

  if (saleError || !sale) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-neutral-100 text-center">
        <div>
          <ReceiptIcon className="h-10 w-10 mx-auto mb-3 text-neutral-400" />
          <p className="text-lg font-semibold text-neutral-800">Receipt not found</p>
          <p className="text-sm text-neutral-500 mt-1">
            No bill found for invoice "{invoiceNumber}". Please check with the counter staff.
          </p>
        </div>
      </div>
    );
  }

  const dateStr = new Date(sale.sale_date || sale.created_at || Date.now());
  const businessName = shopSettings?.business_name || "Artixo POS";
  const taxAmount = Number(sale.tax_amount || 0);
  const discountAmount = Number(sale.discount_amount || 0);
  const balance = Number(sale.balance || 0);
  const paymentLabel = (sale.payment_method || "Cash").toString();

  return (
    <div className="min-h-screen bg-neutral-100 p-4 sm:p-8 flex justify-center">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-3xl shadow-xl overflow-hidden">
          <div className="p-6 sm:p-8">
            {/* Header */}
            <div className="flex flex-col items-center text-center mb-6">
              {shopSettings?.logo_url ? (
                <img
                  src={shopSettings.logo_url}
                  alt={businessName}
                  className="h-14 w-14 rounded-2xl object-cover mb-3"
                />
              ) : (
                <div className="h-14 w-14 rounded-2xl bg-teal-700 flex items-center justify-center mb-3">
                  <ShoppingCart className="h-7 w-7 text-white" />
                </div>
              )}
              <h1 className="text-2xl font-extrabold tracking-wide text-teal-800 uppercase break-words">
                {businessName}
              </h1>
              <div className="flex items-center gap-2 mt-1.5 text-teal-700">
                <span className="h-px w-8 bg-teal-700/40" />
                <span className="text-xs font-semibold tracking-[0.2em]">POS SYSTEM</span>
                <span className="h-px w-8 bg-teal-700/40" />
              </div>
            </div>

            {/* Info grid */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm mb-5">
              <div className="flex items-center gap-2 text-neutral-700 min-w-0">
                <Calendar className="h-4 w-4 text-teal-700 shrink-0" />
                <span className="truncate">{dateStr.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</span>
              </div>
              <div className="flex items-center gap-2 text-neutral-700 min-w-0">
                <Store className="h-4 w-4 text-teal-700 shrink-0" />
                <span className="truncate">{businessName}</span>
              </div>
              <div className="flex items-center gap-2 text-neutral-700 min-w-0">
                <Clock className="h-4 w-4 text-teal-700 shrink-0" />
                <span className="truncate">{dateStr.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              {shopSettings?.address && (
                <div className="flex items-start gap-2 text-neutral-700 min-w-0">
                  <MapPin className="h-4 w-4 text-teal-700 shrink-0 mt-0.5" />
                  <span>{shopSettings.address}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-neutral-700 min-w-0">
                <FileText className="h-4 w-4 text-teal-700 shrink-0" />
                <span className="truncate">INV # {sale.invoice_number}</span>
              </div>
              {shopSettings?.phone && (
                <div className="flex items-center gap-2 text-neutral-700 min-w-0">
                  <Phone className="h-4 w-4 text-teal-700 shrink-0" />
                  <span className="truncate">{shopSettings.phone}</span>
                </div>
              )}
            </div>

            <div className="border-t border-dashed border-neutral-300 my-4" />

            {/* Payment type pill */}
            <div className="flex justify-center mb-5">
              <span className="bg-teal-700 text-white text-xs font-bold tracking-wide px-4 py-1.5 rounded-full uppercase">
                {paymentLabel} Receipt
              </span>
            </div>

            {/* Items table */}
            <div className="rounded-lg overflow-hidden mb-4 border border-neutral-100">
              <div className="grid grid-cols-[1fr_2.5rem_4rem_4.5rem] gap-2 bg-teal-700 text-white text-[11px] font-semibold px-3 py-2 tracking-wide">
                <span>ITEM</span>
                <span className="text-center">QTY</span>
                <span className="text-right">PRICE</span>
                <span className="text-right">AMOUNT</span>
              </div>
              <div className="divide-y divide-dashed divide-neutral-200">
                {(items || []).map((item) => (
                  <div key={item.id} className="grid grid-cols-[1fr_2.5rem_4rem_4.5rem] gap-2 px-3 py-2.5 text-sm items-center">
                    <span className="truncate">
                      {item.product_name}
                      {item.sold_unit && <span className="text-neutral-400"> ({item.sold_unit})</span>}
                    </span>
                    <span className="text-center">{item.quantity}</span>
                    <span className="text-right">{(item.total_price / item.quantity).toFixed(2)}</span>
                    <span className="text-right font-medium">{item.total_price.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Totals */}
            <div className="space-y-1.5 text-sm mb-3">
              <div className="flex justify-between">
                <span className="text-neutral-500 uppercase text-xs tracking-wide">Sub Total</span>
                <span className="text-neutral-800">Rs. {sale.subtotal.toFixed(2)}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between">
                  <span className="text-neutral-500 uppercase text-xs tracking-wide">Discount</span>
                  <span className="text-neutral-800">- Rs. {discountAmount.toFixed(2)}</span>
                </div>
              )}
              {taxAmount > 0 && (
                <div className="flex justify-between">
                  <span className="text-neutral-500 uppercase text-xs tracking-wide">
                    Tax{shopSettings?.tax_rate ? ` (${Number(shopSettings.tax_rate)}%)` : ""}
                  </span>
                  <span className="text-neutral-800">Rs. {taxAmount.toFixed(2)}</span>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center bg-teal-700 text-white rounded-xl px-4 py-3 mb-5">
              <span className="font-bold tracking-wide">TOTAL</span>
              <span className="font-extrabold text-lg">Rs. {sale.total_amount.toFixed(2)}</span>
            </div>

            {/* Payment method / paid amount */}
            <div className="grid grid-cols-2 gap-4 border-t border-neutral-200 pt-4 mb-5">
              <div className="flex items-center gap-2 min-w-0">
                <Banknote className="h-5 w-5 text-teal-700 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] uppercase text-neutral-400 tracking-wide">Payment Method</p>
                  <p className="font-semibold capitalize truncate">{paymentLabel}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 border-l border-neutral-200 pl-4 min-w-0">
                <BadgeDollarSign className="h-5 w-5 text-teal-700 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] uppercase text-neutral-400 tracking-wide">Paid Amount</p>
                  <p className="font-semibold truncate">Rs. {(sale.paid_amount || 0).toFixed(2)}</p>
                </div>
              </div>
            </div>

            {!!sale.customer_name && (
              <div className="flex justify-between text-sm mb-5 -mt-2">
                <span className="text-neutral-500">Customer:</span>
                <span className="font-medium">{sale.customer_name}</span>
              </div>
            )}

            {balance !== 0 && (
              <div className="flex justify-between text-sm mb-5 -mt-2">
                <span className="text-neutral-500">{balance >= 0 ? "Change:" : "Balance Due:"}</span>
                <span className={`font-semibold ${balance >= 0 ? "text-teal-700" : "text-orange-500"}`}>
                  Rs. {Math.abs(balance).toFixed(2)}
                </span>
              </div>
            )}

            {/* Thank you */}
            <div className="border-t border-neutral-200 pt-5 text-center mb-5">
              <p className="flex items-center justify-center gap-3 text-teal-700 text-xl italic" style={{ fontFamily: "Georgia, serif" }}>
                <span className="h-px w-10 bg-teal-700/30" /> Thank you! <span className="h-px w-10 bg-teal-700/30" />
              </p>
              <p className="text-sm text-neutral-500 flex items-center justify-center gap-1.5 mt-1.5">
                Visit Again <Heart className="h-3.5 w-3.5 fill-teal-700 text-teal-700" />
              </p>
            </div>

            {/* QR + support */}
            <div className="border-t border-neutral-200 pt-5 flex items-center justify-between gap-4">
              <div className="p-1.5 border border-neutral-200 rounded-lg shrink-0">
                <QRCodeSVG value={typeof window !== "undefined" ? window.location.href : ""} size={56} level="M" />
              </div>
              {shopSettings?.phone && (
                <div className="flex items-center gap-2 text-right">
                  <div>
                    <p className="text-[10px] uppercase text-neutral-400 tracking-wide">Need Support?</p>
                    <a href={`tel:${shopSettings.phone}`} className="text-sm font-semibold text-teal-700">
                      {shopSettings.phone}
                    </a>
                  </div>
                  <Headset className="h-6 w-6 text-teal-700 shrink-0" />
                </div>
              )}
            </div>
          </div>

          <div className="bg-teal-700 text-white text-center text-[11px] py-2.5 px-4">
            This is a computer generated receipt. No signature required.
          </div>
        </div>

        <p className="text-center text-xs text-neutral-400 mt-4">Powered by Artixo POS</p>
      </div>
    </div>
  );
}
