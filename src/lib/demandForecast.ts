// AI Demand Forecasting: builds a per-product daily sales history (zero-filled calendar,
// last 60 days), fits a linear trend line to it via least-squares regression, layers a
// day-of-week seasonality curve on top (some products sell more on weekends etc.), and
// projects that forward to predict how much of each product will sell over the next
// 7/14/30 days. This is a statistical forecast, not a trained ML model - but it reacts to
// both trend direction and weekly rhythm, which a flat moving average (see
// reorderSuggestions.ts) can't. Used to catch stockouts before they happen and to size
// purchasing off a real trajectory instead of last week's average.
import { supabase } from "@/integrations/supabase/client";

export type ForecastConfidence = "high" | "medium" | "low";
export type StockoutRisk = "critical" | "warning" | "safe" | "unknown";
export type TrendDirection = "up" | "down" | "stable" | "new" | "no_data";

export interface DailyPoint {
  date: string; // yyyy-mm-dd
  qty: number;
}

export interface ProductForecast {
  productId: string;
  name: string;
  category: string | null;
  unitLabel: string;
  stockQuantity: number;
  minStockLevel: number;
  cost: number | null;
  price: number | null;
  history: DailyPoint[]; // last HISTORY_DAYS days, zero-filled
  forecast: DailyPoint[]; // next FORECAST_DAYS days, projected
  forecast7: number;
  forecast14: number;
  forecast30: number;
  avgDailyRecent: number; // last 7 actual days avg, for reference
  trendPct: number | null; // predicted next-30d vs actual last-30d, % change
  trendDirection: TrendDirection;
  confidence: ForecastConfidence;
  daysToStockout: number | null;
  stockoutRisk: StockoutRisk;
  recommendedOrderQty: number;
}

export const HISTORY_DAYS = 60;
export const FORECAST_DAYS = 30;
const TARGET_DAYS_OF_STOCK = 14;
const MIN_ACTIVE_DAYS_FOR_TREND = 5;

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function computeDemandForecasts(): Promise<ProductForecast[]> {
  const now = new Date();
  const historyStart = new Date(now);
  historyStart.setDate(historyStart.getDate() - HISTORY_DAYS);

  const [{ data: products, error: pErr }, { data: sales, error: sErr }] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, category, stock_quantity, min_stock_level, unit_label, cost, price"),
    supabase.from("sales").select("id, sale_date").gte("sale_date", historyStart.toISOString()),
  ]);
  if (pErr) throw pErr;
  if (sErr) throw sErr;

  const saleDateById = new Map<string, string>();
  for (const s of sales || []) saleDateById.set(s.id, s.sale_date);
  const saleIds = (sales || []).map((s: any) => s.id);

  let saleItems: any[] = [];
  if (saleIds.length > 0) {
    const { data, error } = await supabase
      .from("sale_items")
      .select("sale_id, product_id, quantity")
      .in("sale_id", saleIds);
    if (error) throw error;
    saleItems = data || [];
  }

  // Zero-filled calendar for the history window, oldest first, today last.
  const dayKeys: string[] = [];
  for (let i = HISTORY_DAYS - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dayKeys.push(toDateKey(d));
  }
  const dayIndex = new Map(dayKeys.map((k, i) => [k, i]));

  const qtyByProduct = new Map<string, number[]>();
  const ensure = (pid: string) => {
    let arr = qtyByProduct.get(pid);
    if (!arr) {
      arr = new Array(HISTORY_DAYS).fill(0);
      qtyByProduct.set(pid, arr);
    }
    return arr;
  };

  for (const item of saleItems) {
    if (!item.product_id) continue;
    const saleDateStr = saleDateById.get(item.sale_id);
    if (!saleDateStr) continue;
    const idx = dayIndex.get(saleDateStr.slice(0, 10));
    if (idx === undefined) continue;
    ensure(item.product_id)[idx] += Number(item.quantity || 0);
  }

  const forecasts: ProductForecast[] = [];

  for (const p of products || []) {
    const series = qtyByProduct.get(p.id) || new Array(HISTORY_DAYS).fill(0);
    const activeDays = series.filter((q) => q > 0).length;
    const totalQty = series.reduce((s, q) => s + q, 0);

    const stock = Number(p.stock_quantity ?? 0);
    const minStock = Number(p.min_stock_level ?? 10);
    const cost = p.cost != null ? Number(p.cost) : null;
    const price = p.price != null ? Number(p.price) : null;

    if (totalQty === 0) {
      // Never sold in the window - no signal to forecast off, but still surface it
      // (e.g. a genuinely dead / brand-new item).
      forecasts.push({
        productId: p.id,
        name: p.name,
        category: p.category,
        unitLabel: p.unit_label || "pcs",
        stockQuantity: stock,
        minStockLevel: minStock,
        cost,
        price,
        history: dayKeys.map((date, i) => ({ date, qty: series[i] })),
        forecast: [],
        forecast7: 0,
        forecast14: 0,
        forecast30: 0,
        avgDailyRecent: 0,
        trendPct: null,
        trendDirection: "no_data",
        confidence: "low",
        daysToStockout: null,
        stockoutRisk: stock > 0 ? "safe" : "unknown",
        recommendedOrderQty: 0,
      });
      continue;
    }

    // --- Linear regression (least squares) over the full history window ---
    const n = HISTORY_DAYS;
    let sumX = 0,
      sumY = 0,
      sumXY = 0,
      sumX2 = 0;
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += series[i];
      sumXY += i * series[i];
      sumX2 += i * i;
    }
    const denom = n * sumX2 - sumX * sumX;
    const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
    const intercept = (sumY - slope * sumX) / n;
    const trendAt = (i: number) => Math.max(0, intercept + slope * i);

    // --- Day-of-week seasonality: avg ratio of actual/trend per weekday, normalized to mean 1 ---
    const weekdaySum = new Array(7).fill(0);
    const weekdayCount = new Array(7).fill(0);
    for (let i = 0; i < n; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - (n - 1 - i));
      const dow = d.getDay();
      const t = trendAt(i);
      if (t > 0.05) {
        weekdaySum[dow] += series[i] / t;
        weekdayCount[dow] += 1;
      }
    }
    const weekdayFactor = weekdaySum.map((s, i) => (weekdayCount[i] > 0 ? s / weekdayCount[i] : 1));
    const avgFactor = weekdayFactor.reduce((s, f) => s + f, 0) / 7;
    const normalizedFactor = weekdayFactor.map((f) => (avgFactor > 0 ? f / avgFactor : 1));

    // --- Project forward ---
    const forecastPoints: DailyPoint[] = [];
    let f7 = 0,
      f14 = 0,
      f30 = 0;
    for (let h = 0; h < FORECAST_DAYS; h++) {
      const i = n + h;
      const d = new Date(now);
      d.setDate(d.getDate() + h + 1);
      const dow = d.getDay();
      const qty = Math.max(0, trendAt(i) * normalizedFactor[dow]);
      forecastPoints.push({ date: toDateKey(d), qty });
      f30 += qty;
      if (h < 14) f14 += qty;
      if (h < 7) f7 += qty;
    }

    const last7Actual = series.slice(-7).reduce((s, q) => s + q, 0);
    const last30Actual = series.slice(-30).reduce((s, q) => s + q, 0);
    const avgDailyRecent = last7Actual / 7;

    let trendPct: number | null = null;
    let trendDirection: TrendDirection = "stable";
    if (last30Actual > 0) {
      trendPct = ((f30 - last30Actual) / last30Actual) * 100;
      if (trendPct > 15) trendDirection = "up";
      else if (trendPct < -15) trendDirection = "down";
      else trendDirection = "stable";
    } else if (f30 > 0) {
      trendDirection = "new";
    } else {
      trendDirection = "no_data";
    }

    // --- Confidence: how much history there is + how noisy it is ---
    const mean = totalQty / n;
    const variance = series.reduce((s, q) => s + (q - mean) ** 2, 0) / n;
    const stdDev = Math.sqrt(variance);
    const cv = mean > 0 ? stdDev / mean : Infinity;
    let confidence: ForecastConfidence;
    if (activeDays < MIN_ACTIVE_DAYS_FOR_TREND) confidence = "low";
    else if (cv <= 0.6) confidence = "high";
    else if (cv <= 1.2) confidence = "medium";
    else confidence = "low";

    // --- Stockout risk, sized off the near-term (7-day) forecast ---
    const avgForecastDaily = f7 / 7;
    const daysToStockout = avgForecastDaily > 0 ? stock / avgForecastDaily : null;
    let stockoutRisk: StockoutRisk = "unknown";
    if (daysToStockout !== null) {
      stockoutRisk = daysToStockout <= 7 ? "critical" : daysToStockout <= 14 ? "warning" : "safe";
    } else if (stock > minStock) {
      stockoutRisk = "safe";
    }

    const targetStock = avgForecastDaily > 0 ? avgForecastDaily * TARGET_DAYS_OF_STOCK : minStock * 2;
    const recommendedOrderQty = Math.max(0, Math.ceil(targetStock - stock));

    forecasts.push({
      productId: p.id,
      name: p.name,
      category: p.category,
      unitLabel: p.unit_label || "pcs",
      stockQuantity: stock,
      minStockLevel: minStock,
      cost,
      price,
      history: dayKeys.map((date, i) => ({ date, qty: series[i] })),
      forecast: forecastPoints,
      forecast7: f7,
      forecast14: f14,
      forecast30: f30,
      avgDailyRecent,
      trendPct,
      trendDirection,
      confidence,
      daysToStockout,
      stockoutRisk,
      recommendedOrderQty,
    });
  }

  const riskRank = (r: StockoutRisk) => (r === "critical" ? 0 : r === "warning" ? 1 : r === "safe" ? 2 : 3);
  forecasts.sort((a, b) => {
    if (riskRank(a.stockoutRisk) !== riskRank(b.stockoutRisk)) return riskRank(a.stockoutRisk) - riskRank(b.stockoutRisk);
    return b.forecast30 - a.forecast30;
  });

  return forecasts;
}
