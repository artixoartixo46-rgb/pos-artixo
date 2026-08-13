// Auto-reorder suggestions: uses recent sales velocity + vendor purchase history
// to suggest what to reorder, how much, and from which vendor - plus a trend read
// (is this item selling faster or slower than it was a week ago) so the suggestion
// isn't just a flat 30-day average.
import { supabase } from "@/integrations/supabase/client";

export type ReorderTrend = "up" | "down" | "flat" | "new" | "unknown";

export interface ReorderSuggestion {
  productId: string;
  name: string;
  category: string | null;
  stockQuantity: number;
  minStockLevel: number;
  unitLabel: string;
  caseSize: number | null;
  avgDailyQty: number; // the velocity actually used to size the suggestion (recent-weighted)
  recentDailyQty: number; // avg/day over the last 7 days
  priorDailyQty: number; // avg/day over the 7 days before that
  trend: ReorderTrend;
  trendPct: number | null; // % change of recent vs prior week (null if not computable)
  daysOfStockLeft: number | null; // null = no recent sales data to estimate from
  suggestedQty: number;
  estimatedCost: number | null;
  vendorId: string | null;
  vendorName: string | null;
  vendorPhone: string | null;
  reason: "out_of_stock" | "below_min_stock" | "running_low";
}

const VELOCITY_LOOKBACK_DAYS = 30;
const RECENT_WINDOW_DAYS = 7;
const PRIOR_WINDOW_DAYS = 7; // the 7 days immediately before the recent window
const TARGET_DAYS_OF_STOCK = 14;
const LOW_DAYS_THRESHOLD = 7;
const TREND_THRESHOLD_PCT = 15; // below this magnitude of change, call it "flat"

export async function computeReorderSuggestions(): Promise<ReorderSuggestion[]> {
  const now = new Date();
  const since30 = new Date(now);
  since30.setDate(since30.getDate() - VELOCITY_LOOKBACK_DAYS);
  const recentStart = new Date(now);
  recentStart.setDate(recentStart.getDate() - RECENT_WINDOW_DAYS);
  const priorStart = new Date(now);
  priorStart.setDate(priorStart.getDate() - (RECENT_WINDOW_DAYS + PRIOR_WINDOW_DAYS));

  const [{ data: products, error: pErr }, { data: sales, error: sErr }] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, category, stock_quantity, min_stock_level, unit_label, case_size, cost"),
    supabase.from("sales").select("id, sale_date").gte("sale_date", since30.toISOString()),
  ]);
  if (pErr) throw pErr;
  if (sErr) throw sErr;

  const saleDateById = new Map<string, string>();
  for (const s of sales || []) saleDateById.set(s.id, s.sale_date);
  const saleIds = (sales || []).map((s: any) => s.id);

  let saleItems: any[] = [];
  if (saleIds.length > 0) {
    const { data, error } = await supabase.from("sale_items").select("sale_id, product_id, quantity").in("sale_id", saleIds);
    if (error) throw error;
    saleItems = data || [];
  }

  // Bucket quantity sold per product into: total (30d), recent (last 7d), prior (7d before that)
  const totalQtyByProduct = new Map<string, number>();
  const recentQtyByProduct = new Map<string, number>();
  const priorQtyByProduct = new Map<string, number>();

  for (const item of saleItems) {
    if (!item.product_id) continue;
    const saleDateStr = saleDateById.get(item.sale_id);
    if (!saleDateStr) continue;
    const saleDate = new Date(saleDateStr);
    const qty = Number(item.quantity || 0);

    totalQtyByProduct.set(item.product_id, (totalQtyByProduct.get(item.product_id) || 0) + qty);

    if (saleDate >= recentStart) {
      recentQtyByProduct.set(item.product_id, (recentQtyByProduct.get(item.product_id) || 0) + qty);
    } else if (saleDate >= priorStart) {
      priorQtyByProduct.set(item.product_id, (priorQtyByProduct.get(item.product_id) || 0) + qty);
    }
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

    const totalQty = totalQtyByProduct.get(p.id) || 0;
    const recentQty = recentQtyByProduct.get(p.id) || 0;
    const priorQty = priorQtyByProduct.get(p.id) || 0;

    const avgDailyQty30 = totalQty / VELOCITY_LOOKBACK_DAYS;
    const recentDailyQty = recentQty / RECENT_WINDOW_DAYS;
    const priorDailyQty = priorQty / PRIOR_WINDOW_DAYS;

    // Size the suggestion off the most recent week when there's data for it (more responsive
    // to what's actually happening right now); fall back to the flatter 30-day average otherwise.
    const effectiveAvgDailyQty = recentDailyQty > 0 ? recentDailyQty : avgDailyQty30;
    const daysLeft = effectiveAvgDailyQty > 0 ? stock / effectiveAvgDailyQty : null;

    const belowMin = stock <= minStock;
    const runningLow = daysLeft !== null && daysLeft <= LOW_DAYS_THRESHOLD;
    if (!belowMin && !runningLow) continue;

    let suggestedQty: number;
    if (effectiveAvgDailyQty > 0) {
      suggestedQty = Math.ceil(effectiveAvgDailyQty * TARGET_DAYS_OF_STOCK) - stock;
    } else {
      // No recent sales data to size a suggestion from - just top back up above the min level.
      suggestedQty = Math.ceil(minStock * 2 - stock);
    }
    // A product sitting at/below its min-stock safety buffer should always get suggested a
    // top-up back above that buffer, even if it happens to be a slow mover whose velocity-based
    // target comes out lower (or negative) than current stock - that's the whole point of the
    // min-stock field, and it shouldn't get silently dropped just because it sells slowly.
    if (belowMin) {
      suggestedQty = Math.max(suggestedQty, Math.ceil(minStock * 2 - stock));
    }
    suggestedQty = Math.max(0, suggestedQty);
    if (suggestedQty <= 0) continue;

    const caseSize = p.case_size ? Number(p.case_size) : null;
    if (caseSize && caseSize > 1) {
      suggestedQty = Math.ceil(suggestedQty / caseSize) * caseSize;
    }

    // Trend: is this week's selling pace up, down, or flat vs the week before?
    let trend: ReorderTrend = "unknown";
    let trendPct: number | null = null;
    if (priorDailyQty > 0) {
      trendPct = ((recentDailyQty - priorDailyQty) / priorDailyQty) * 100;
      if (trendPct > TREND_THRESHOLD_PCT) trend = "up";
      else if (trendPct < -TREND_THRESHOLD_PCT) trend = "down";
      else trend = "flat";
    } else if (recentDailyQty > 0) {
      trend = "new"; // wasn't selling in the prior week, is selling now
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
      avgDailyQty: effectiveAvgDailyQty,
      recentDailyQty,
      priorDailyQty,
      trend,
      trendPct,
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
