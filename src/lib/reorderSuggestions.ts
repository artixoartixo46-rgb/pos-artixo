// Auto-reorder suggestions: uses recent sales velocity + vendor purchase history
// to suggest what to reorder, how much, and from which vendor.
import { supabase } from "@/integrations/supabase/client";

export interface ReorderSuggestion {
  productId: string;
  name: string;
  category: string | null;
  stockQuantity: number;
  minStockLevel: number;
  unitLabel: string;
  caseSize: number | null;
  avgDailyQty: number;
  daysOfStockLeft: number | null; // null = no recent sales data to estimate from
  suggestedQty: number;
  estimatedCost: number | null;
  vendorId: string | null;
  vendorName: string | null;
  vendorPhone: string | null;
  reason: "out_of_stock" | "below_min_stock" | "running_low";
}

const VELOCITY_LOOKBACK_DAYS = 30;
const TARGET_DAYS_OF_STOCK = 14;
const LOW_DAYS_THRESHOLD = 7;

export async function computeReorderSuggestions(): Promise<ReorderSuggestion[]> {
  const since = new Date();
  since.setDate(since.getDate() - VELOCITY_LOOKBACK_DAYS);

  const [{ data: products, error: pErr }, { data: sales, error: sErr }] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, category, stock_quantity, min_stock_level, unit_label, case_size, cost"),
    supabase.from("sales").select("id").gte("sale_date", since.toISOString()),
  ]);
  if (pErr) throw pErr;
  if (sErr) throw sErr;

  const saleIds = (sales || []).map((s: any) => s.id);
  let saleItems: any[] = [];
  if (saleIds.length > 0) {
    const { data, error } = await supabase.from("sale_items").select("product_id, quantity").in("sale_id", saleIds);
    if (error) throw error;
    saleItems = data || [];
  }

  const qtyByProduct = new Map<string, number>();
  for (const item of saleItems) {
    if (!item.product_id) continue;
    qtyByProduct.set(item.product_id, (qtyByProduct.get(item.product_id) || 0) + Number(item.quantity || 0));
  }

  // Most recent vendor that supplied each product, from receiving history.
  const { data: receiving, error: rErr } = await supabase
    .from("product_receiving")
    .select("product_id, vendor_id, received_date")
    .order("received_date", { ascending: false });
  if (rErr) throw rErr;

  const vendorIdByProduct = new Map<string, string>();
  for (const r of receiving || []) {
    if (!r.product_id || !r.vendor_id) continue;
    if (!vendorIdByProduct.has(r.product_id)) vendorIdByProduct.set(r.product_id, r.vendor_id);
  }

  const vendorIds = [...new Set(vendorIdByProduct.values())];
  let vendorInfoById = new Map<string, { name: string; phone: string | null }>();
  if (vendorIds.length > 0) {
    const { data: vendors, error: vErr } = await supabase.from("vendors").select("id, name, phone").in("id", vendorIds);
    if (vErr) throw vErr;
    vendorInfoById = new Map((vendors || []).map((v: any) => [v.id, { name: v.name, phone: v.phone }]));
  }

  const suggestions: ReorderSuggestion[] = [];

  for (const p of products || []) {
    const stock = Number(p.stock_quantity ?? 0);
    const minStock = Number(p.min_stock_level ?? 10);
    const qtySold = qtyByProduct.get(p.id) || 0;
    const avgDailyQty = qtySold / VELOCITY_LOOKBACK_DAYS;
    const daysLeft = avgDailyQty > 0 ? stock / avgDailyQty : null;

    const belowMin = stock <= minStock;
    const runningLow = daysLeft !== null && daysLeft <= LOW_DAYS_THRESHOLD;
    if (!belowMin && !runningLow) continue;

    let suggestedQty: number;
    if (avgDailyQty > 0) {
      suggestedQty = Math.max(0, Math.ceil(avgDailyQty * TARGET_DAYS_OF_STOCK) - stock);
    } else {
      // No recent sales data to size a suggestion from - just top back up above the min level.
      suggestedQty = Math.max(0, Math.ceil(minStock * 2 - stock));
    }
    if (suggestedQty <= 0) continue;

    const caseSize = p.case_size ? Number(p.case_size) : null;
    if (caseSize && caseSize > 1) {
      suggestedQty = Math.ceil(suggestedQty / caseSize) * caseSize;
    }

    const vendorId = vendorIdByProduct.get(p.id) || null;
    const vendor = vendorId ? vendorInfoById.get(vendorId) : undefined;

    suggestions.push({
      productId: p.id,
      name: p.name,
      category: p.category,
      stockQuantity: stock,
      minStockLevel: minStock,
      unitLabel: p.unit_label || "pcs",
      caseSize,
      avgDailyQty,
      daysOfStockLeft: daysLeft,
      suggestedQty,
      estimatedCost: p.cost != null ? Number(p.cost) * suggestedQty : null,
      vendorId,
      vendorName: vendor?.name || null,
      vendorPhone: vendor?.phone || null,
      reason: stock <= 0 ? "out_of_stock" : belowMin ? "below_min_stock" : "running_low",
    });
  }

  const rank = (r: ReorderSuggestion["reason"]) => (r === "out_of_stock" ? 0 : r === "below_min_stock" ? 1 : 2);
  suggestions.sort((a, b) => {
    if (rank(a.reason) !== rank(b.reason)) return rank(a.reason) - rank(b.reason);
    return (a.daysOfStockLeft ?? Infinity) - (b.daysOfStockLeft ?? Infinity);
  });

  return suggestions;
}

export function groupSuggestionsByVendor(suggestions: ReorderSuggestion[]) {
  const groups = new Map<string, { vendorName: string; vendorPhone: string | null; items: ReorderSuggestion[] }>();
  for (const s of suggestions) {
    const key = s.vendorId || "unassigned";
    if (!groups.has(key)) {
      groups.set(key, { vendorName: s.vendorName || "No vendor on record", vendorPhone: s.vendorPhone, items: [] });
    }
    groups.get(key)!.items.push(s);
  }
  // Vendored groups first, "unassigned" last
  return [...groups.entries()].sort(([a], [b]) => (a === "unassigned" ? 1 : b === "unassigned" ? -1 : 0));
}
