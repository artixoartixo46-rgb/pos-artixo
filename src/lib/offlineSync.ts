// Syncs sales that were queued while offline back to Supabase, and keeps the local
// product/price-tier cache fresh while online.
import { supabase } from "@/integrations/supabase/client";
import {
  cacheProducts,
  cachePriceTiers,
  getPendingSales,
  updatePendingSale,
  removePendingSale,
  type PendingSale,
} from "@/lib/offlineDb";
import { getLineNetTotal } from "@/lib/cartMath";

export async function refreshOfflineCache(): Promise<void> {
  const [{ data: products, error: pErr }, { data: tiers, error: tErr }] = await Promise.all([
    supabase.from("products").select("*"),
    supabase.from("product_price_tiers").select("*"),
  ]);
  if (pErr) throw pErr;
  if (tErr) throw tErr;
  await cacheProducts(products || []);
  await cachePriceTiers((tiers || []) as any);
}

async function syncOneSale(sale: PendingSale): Promise<void> {
  const { payload } = sale;

  const { data: invoiceResult, error: invoiceError } = await supabase.rpc("generate_invoice_number");
  if (invoiceError) throw invoiceError;
  const invoiceNumber = invoiceResult as string;

  let status = "closed";
  if (payload.paymentMethod === "Credit") {
    if (payload.paidAmount === 0) status = "open";
    else if (payload.paidAmount < payload.total) status = "partial";
  }

  const { data: insertedSale, error: saleError } = await supabase
    .from("sales")
    .insert({
      invoice_number: invoiceNumber,
      customer_id: payload.customerId || null,
      customer_name: payload.customerName || null,
      customer_phone: payload.customerPhone || null,
      subtotal: payload.subtotal,
      discount_amount: payload.discountAmount,
      total_amount: payload.total,
      payment_method: payload.paymentMethod,
      paid_amount: payload.paidAmount,
      balance: payload.balance,
      status,
      sale_date: sale.createdAt, // preserve the actual offline sale time, not the sync time
    })
    .select()
    .single();
  if (saleError) throw saleError;

  if (payload.paymentMethod === "Credit" && payload.customerId) {
    const delta = payload.total - payload.paidAmount;
    const { error: balanceError } = await supabase.rpc("adjust_credit_balance", {
      p_customer_id: payload.customerId,
      p_delta: delta,
    });
    if (balanceError) throw balanceError;
  }

  const saleItems = payload.cart.map((item: any) => {
    const netTotal = getLineNetTotal(item);
    return {
      sale_id: insertedSale.id,
      product_id: item.product_id,
      product_name: item.name,
      quantity: item.quantity,
      unit_price: item.quantity > 0 ? netTotal / item.quantity : item.price,
      total_price: netTotal,
      sold_unit: item.sold_unit,
    };
  });
  const { error: itemsError } = await supabase.from("sale_items").insert(saleItems);
  if (itemsError) throw itemsError;

  const stockDeductions = new Map<string, number>();
  for (const item of payload.cart) {
    if (!item.product_id || String(item.product_id).startsWith("temp_")) continue;
    stockDeductions.set(item.product_id, (stockDeductions.get(item.product_id) || 0) + item.quantity);
  }
  for (const [productId, qty] of stockDeductions.entries()) {
    const { error: stockError } = await supabase.rpc("decrement_stock", {
      p_product_id: productId,
      p_qty: qty,
    });
    if (stockError) throw stockError;
  }
}

export interface SyncResult {
  succeeded: number;
  failed: number;
}

let syncInFlight: Promise<SyncResult> | null = null;

// Processes the offline sale queue in order. Safe to call repeatedly (e.g. on every
// 'online' event) - it no-ops if a sync is already running, and leaves failed sales in
// the queue (marked "failed") for manual retry rather than blocking the rest of the queue.
export async function syncPendingSales(): Promise<SyncResult> {
  if (syncInFlight) return syncInFlight;

  syncInFlight = (async () => {
    let succeeded = 0;
    let failed = 0;
    const pending = await getPendingSales();

    for (const sale of pending) {
      if (sale.status === "syncing") continue;
      try {
        await updatePendingSale({ ...sale, status: "syncing" });
        await syncOneSale(sale);
        await removePendingSale(sale.localId);
        succeeded++;
      } catch (err: any) {
        failed++;
        await updatePendingSale({ ...sale, status: "failed", errorMessage: err?.message || "Sync failed" });
      }
    }

    if (succeeded > 0) {
      try {
        await refreshOfflineCache();
      } catch {
        // best-effort refresh; not fatal if it fails here
      }
    }

    return { succeeded, failed };
  })();

  try {
    return await syncInFlight;
  } finally {
    syncInFlight = null;
  }
}
