import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Minus,
  Sparkles,
  Package,
  Boxes,
  AlertTriangle,
  Building2,
  Receipt,
  ClipboardList,
  Phone,
  PackageX,
  Download,
  Loader2,
  Users,
  Target,
  Wallet,
  DollarSign,
  Percent,
} from "lucide-react";
import { computeReorderSuggestions, groupSuggestionsByVendor, type ReorderTrend } from "@/lib/reorderSuggestions";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

type Period = "today" | "week" | "month" | "all";

const PERIOD_LABELS: Record<Period, string> = {
  today: "Today",
  week: "Last 7 Days",
  month: "Last 30 Days",
  all: "All Time",
};

const SOLD_UNIT_COLORS: Record<string, string> = {
  unit: "hsl(var(--primary))",
  case: "hsl(var(--secondary))",
  weight: "hsl(var(--accent))",
};

function getPeriodStart(period: Period): string | null {
  if (period === "all") return null;
  const start = new Date();
  if (period === "today") {
    start.setHours(0, 0, 0, 0);
  } else if (period === "week") {
    start.setDate(start.getDate() - 7);
  } else {
    start.setDate(start.getDate() - 30);
  }
  return start.toISOString();
}

function TrendBadge({ trend, trendPct }: { trend: ReorderTrend; trendPct: number | null }) {
  if (trend === "up") {
    return (
      <Badge variant="destructive" className="text-[10px] gap-1">
        <TrendingUp className="h-3 w-3" /> {trendPct !== null ? `+${trendPct.toFixed(0)}%` : "Faster"}
      </Badge>
    );
  }
  if (trend === "down") {
    return (
      <Badge variant="outline" className="text-[10px] gap-1 text-muted-foreground">
        <TrendingDown className="h-3 w-3" /> {trendPct !== null ? `${trendPct.toFixed(0)}%` : "Slower"}
      </Badge>
    );
  }
  if (trend === "new") {
    return (
      <Badge variant="secondary" className="text-[10px] gap-1">
        <Sparkles className="h-3 w-3" /> New demand
      </Badge>
    );
  }
  if (trend === "flat") {
    return (
      <Badge variant="outline" className="text-[10px] gap-1 text-muted-foreground">
        <Minus className="h-3 w-3" /> Steady
      </Badge>
    );
  }
  return <span className="text-xs text-muted-foreground">—</span>;
}

export default function Reports() {
  const [period, setPeriod] = useState<Period>("week");
  const reportContentRef = useRef<HTMLDivElement>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const periodStart = getPeriodStart(period);
  const [deadStockDays, setDeadStockDays] = useState(60);

  const { data: sales, isLoading: salesLoading } = useQuery({
    queryKey: ["reports-sales", period],
    queryFn: async () => {
      let query = supabase
        .from("sales")
        .select("id, customer_id, customer_name, total_amount, subtotal, discount_amount, payment_method, sale_date, status, cashier_id, cashier_name")
        .order("sale_date", { ascending: false });
      if (periodStart) query = query.gte("sale_date", periodStart);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  const saleIds = useMemo(() => (sales || []).map((s: any) => s.id), [sales]);

  const { data: saleItems } = useQuery({
    queryKey: ["reports-sale-items", saleIds],
    enabled: saleIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sale_items")
        .select("product_id, product_name, quantity, unit_price, total_price, sold_unit")
        .in("sale_id", saleIds);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: products } = useQuery({
    queryKey: ["reports-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, category, stock_quantity, min_stock_level, unit_label, case_size, cost, price, created_at");
      if (error) throw error;
      return data || [];
    },
  });

  // Dead stock needs the *full* sales history regardless of the period filter above - a
  // product that hasn't sold in 90 days is still dead stock even if you're viewing "Today".
  const { data: allSaleItemsWithDate } = useQuery({
    queryKey: ["reports-dead-stock-sale-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sale_items")
        .select("product_id, sales(sale_date)");
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const { data: creditCustomers } = useQuery({
    queryKey: ["reports-credit-customers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_customers")
        .select("id, name, business_name, customer_type");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: reorderSuggestions, isLoading: reorderLoading } = useQuery({
    queryKey: ["reorder-suggestions"],
    queryFn: computeReorderSuggestions,
  });

  const reorderGroups = useMemo(() => groupSuggestionsByVendor(reorderSuggestions || []), [reorderSuggestions]);
  const reorderTotalCost = (reorderSuggestions || []).reduce((sum, s) => sum + (s.estimatedCost || 0), 0);

  // ---- Cashier performance (daily target / salary incentive) ----
  const { data: cashiers } = useQuery({
    queryKey: ["reports-cashiers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cashiers").select("*").order("name", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  // "today"/"week"/"month" map to a fixed number of days so the target scales with the period
  // (7 days of a Rs.5000/day target = Rs.35000 target for the week). "all" has no fixed length,
  // so it's approximated from how many distinct calendar days actually had a sale in the data -
  // a cashier who's only been active 10 days shouldn't be judged against a target sized for 365.
  const periodDays = useMemo(() => {
    if (period === "today") return 1;
    if (period === "week") return 7;
    if (period === "month") return 30;
    const days = new Set((sales || []).map((s: any) => (s.sale_date || "").slice(0, 10)));
    return Math.max(days.size, 1);
  }, [period, sales]);

  const cashierPerformance = useMemo(() => {
    const buckets: Record<string, { totalSales: number; bills: number }> = {};
    for (const s of sales || []) {
      if (!s.cashier_id) continue;
      if (!buckets[s.cashier_id]) buckets[s.cashier_id] = { totalSales: 0, bills: 0 };
      buckets[s.cashier_id].totalSales += Number(s.total_amount || 0);
      buckets[s.cashier_id].bills += 1;
    }
    return (cashiers || []).map((c: any) => {
      const bucket = buckets[c.id] || { totalSales: 0, bills: 0 };
      const target = Number(c.daily_target || 0) * periodDays;
      const achievementPct = target > 0 ? (bucket.totalSales / target) * 100 : 0;
      const baseSalary = Number(c.base_salary || 0) * periodDays;
      const bonusPct = Number(c.bonus_percent || 0);
      // Every 1% achieved over 100% adds bonusPct% of the base salary - e.g. 120% achievement
      // with a 5% bonus rate adds 20 * 5% = 100% extra... kept linear and transparent so the
      // owner can tune bonus_percent per cashier in Settings until it matches what feels fair.
      const overPct = Math.max(0, achievementPct - 100);
      const bonusAmount = baseSalary * (overPct / 100) * (bonusPct / 100);
      const estimatedSalary = baseSalary + bonusAmount;
      return {
        id: c.id,
        name: c.name,
        active: c.active,
        totalSales: bucket.totalSales,
        bills: bucket.bills,
        target,
        achievementPct,
        baseSalary,
        bonusAmount,
        estimatedSalary,
      };
    }).sort((a, b) => b.totalSales - a.totalSales);
  }, [sales, cashiers, periodDays]);

  // ---- Revenue summary ----
  const totalRevenue = (sales || []).reduce((sum: number, s: any) => sum + Number(s.total_amount || 0), 0);
  const salesCount = sales?.length || 0;
  const avgOrderValue = salesCount > 0 ? totalRevenue / salesCount : 0;

  // ---- Case vs Unit vs Weight breakdown ----
  const unitBreakdown = useMemo(() => {
    const buckets: Record<string, number> = { unit: 0, case: 0, weight: 0 };
    for (const item of saleItems || []) {
      const key = item.sold_unit || "unit";
      buckets[key] = (buckets[key] || 0) + Number(item.total_price || 0);
    }
    return Object.entries(buckets)
      .filter(([, value]) => value > 0)
      .map(([name, value]) => ({ name: name === "unit" ? "Unit" : name === "case" ? "Case/Bulk" : "Weight-based", value }));
  }, [saleItems]);

  // ---- Sales by category ----
  const categoryMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of products || []) map.set(p.id, p.category || "Uncategorized");
    return map;
  }, [products]);

  const categoryBreakdown = useMemo(() => {
    const buckets: Record<string, number> = {};
    for (const item of saleItems || []) {
      const category = categoryMap.get(item.product_id) || "Uncategorized";
      buckets[category] = (buckets[category] || 0) + Number(item.total_price || 0);
    }
    return Object.entries(buckets)
      .map(([name, revenue]) => ({ name, revenue: Number(revenue.toFixed(2)) }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);
  }, [saleItems, categoryMap]);

  // ---- Profit margin by product ----
  // Uses each product's CURRENT cost as a stand-in for what it actually cost at the time of
  // that sale - same approximation the Dead Stock report already makes elsewhere in this page.
  // A truly historical margin would need cost captured per sale_item at checkout time, which
  // this schema doesn't record.
  const [marginView, setMarginView] = useState<"top" | "bottom">("top");

  const costMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of products || []) map.set(p.id, Number(p.cost) || 0);
    return map;
  }, [products]);

  const profitMargin = useMemo(() => {
    const buckets: Record<string, { name: string; qty: number; revenue: number; cost: number }> = {};
    for (const item of saleItems || []) {
      if (!item.product_id) continue;
      if (!buckets[item.product_id]) {
        buckets[item.product_id] = { name: item.product_name, qty: 0, revenue: 0, cost: 0 };
      }
      const b = buckets[item.product_id];
      b.qty += Number(item.quantity || 0);
      b.revenue += Number(item.total_price || 0);
      b.cost += Number(item.quantity || 0) * (costMap.get(item.product_id) || 0);
    }
    return Object.entries(buckets).map(([id, b]) => {
      const profit = b.revenue - b.cost;
      const marginPct = b.revenue > 0 ? (profit / b.revenue) * 100 : 0;
      return { id, ...b, profit, marginPct };
    });
  }, [saleItems, costMap]);

  const totalProfit = useMemo(() => profitMargin.reduce((sum, p) => sum + p.profit, 0), [profitMargin]);

  const marginTableRows = useMemo(() => {
    const sorted = [...profitMargin];
    if (marginView === "top") {
      sorted.sort((a, b) => b.profit - a.profit);
    } else {
      sorted.sort((a, b) => a.marginPct - b.marginPct);
    }
    return sorted.slice(0, 15);
  }, [profitMargin, marginView]);

  // ---- Top wholesale / B2B buyers ----
  const wholesaleCustomerIds = useMemo(
    () => new Set((creditCustomers || []).filter((c: any) => c.customer_type === "wholesale" || c.customer_type === "b2b").map((c: any) => c.id)),
    [creditCustomers]
  );
  const customerInfoById = useMemo(() => {
    const map = new Map<string, any>();
    for (const c of creditCustomers || []) map.set(c.id, c);
    return map;
  }, [creditCustomers]);

  const topWholesaleBuyers = useMemo(() => {
    const buckets: Record<string, { name: string; business_name?: string; total: number; orders: number }> = {};
    for (const s of sales || []) {
      if (!s.customer_id || !wholesaleCustomerIds.has(s.customer_id)) continue;
      const info = customerInfoById.get(s.customer_id);
      if (!buckets[s.customer_id]) {
        buckets[s.customer_id] = { name: info?.name || s.customer_name || "Unknown", business_name: info?.business_name, total: 0, orders: 0 };
      }
      buckets[s.customer_id].total += Number(s.total_amount || 0);
      buckets[s.customer_id].orders += 1;
    }
    return Object.values(buckets)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [sales, wholesaleCustomerIds, customerInfoById]);

  // ---- Low stock / reorder list ----
  const lowStockProducts = useMemo(
    () =>
      (products || [])
        .filter((p: any) => Number(p.stock_quantity ?? 0) <= Number(p.min_stock_level ?? 10))
        .sort((a: any, b: any) => Number(a.stock_quantity ?? 0) - Number(b.stock_quantity ?? 0)),
    [products]
  );

  // ---- Dead stock report ----
  const lastSaleDateByProduct = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of allSaleItemsWithDate || []) {
      const date = row.sales?.sale_date;
      if (!date) continue;
      const existing = map.get(row.product_id);
      if (!existing || date > existing) map.set(row.product_id, date);
    }
    return map;
  }, [allSaleItemsWithDate]);

  const deadStockProducts = useMemo(() => {
    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;
    return (products || [])
      .filter((p: any) => Number(p.stock_quantity ?? 0) > 0)
      .map((p: any) => {
        const lastSale = lastSaleDateByProduct.get(p.id) || null;
        // A product that has never sold isn't necessarily "dead stock" - it might just have been
        // added yesterday and hasn't had a chance to sell yet. Fall back to how long the product
        // itself has existed (created_at) so a brand-new product needs the same deadStockDays
        // window to pass before it's flagged, same as a product with an actual last-sale date.
        const daysSince = lastSale
          ? Math.floor((now - new Date(lastSale).getTime()) / DAY_MS)
          : p.created_at
          ? Math.floor((now - new Date(p.created_at).getTime()) / DAY_MS)
          : null;
        const unitValue = Number(p.cost) > 0 ? Number(p.cost) : Number(p.price) || 0;
        const tiedUpValue = unitValue * Number(p.stock_quantity ?? 0);
        // Separate from daysSince (which now falls back to "days since added" for never-sold
        // products so they still age into the report correctly) - the UI needs to know whether
        // it's showing "last sold Xd ago" or "never sold, just been sitting Xd since it was added".
        const neverSold = !lastSale;
        return { ...p, lastSale, daysSince, neverSold, tiedUpValue };
      })
      .filter((p: any) => p.daysSince === null || p.daysSince >= deadStockDays)
      .sort((a: any, b: any) => b.tiedUpValue - a.tiedUpValue);
  }, [products, lastSaleDateByProduct, deadStockDays]);

  const totalDeadStockValue = useMemo(
    () => deadStockProducts.reduce((sum: number, p: any) => sum + p.tiedUpValue, 0),
    [deadStockProducts]
  );

  // Rasterizes the report content (everything below the period-filter toolbar) into a canvas,
  // same html2canvas settings as the receipt-image print path elsewhere in the app, then slices
  // it across as many A4 pages as needed - the full report is comfortably taller than one page.
  const handleExportPdf = async () => {
    if (!reportContentRef.current) return;
    setExportingPdf(true);
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      const canvas = await html2canvas(reportContentRef.current, {
        scale: 2,
        backgroundColor: "#ffffff",
        logging: false,
        useCORS: true,
      });
      const imgData = canvas.toDataURL("image/png");

      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      pdf.save(`artixo-report-${period}-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      console.error("PDF export failed:", err);
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
            Reports & Analytics
          </h1>
          <p className="text-muted-foreground mt-2">Wholesale sales, volume, and stock reports</p>
        </div>
        <div className="flex gap-2">
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
            <Button key={p} size="sm" variant={period === p ? "default" : "outline"} onClick={() => setPeriod(p)}>
              {PERIOD_LABELS[p]}
            </Button>
          ))}
          <Button size="sm" variant="outline" className="gap-1.5" onClick={handleExportPdf} disabled={exportingPdf}>
            {exportingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {exportingPdf ? "Exporting..." : "Download PDF"}
          </Button>
        </div>
      </div>

      <div ref={reportContentRef} className="space-y-6">
      {/* Revenue summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="glass-card border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <TrendingUp className="h-4 w-4 text-primary" />
              Total Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">Rs. {totalRevenue.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground mt-1">{PERIOD_LABELS[period]}</p>
          </CardContent>
        </Card>
        <Card className="glass-card border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Receipt className="h-4 w-4 text-primary" />
              Sales Count
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{salesCount}</p>
            <p className="text-xs text-muted-foreground mt-1">Invoices completed</p>
          </CardContent>
        </Card>
        <Card className="glass-card border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <BarChart3 className="h-4 w-4 text-primary" />
              Avg. Order Value
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">Rs. {avgOrderValue.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground mt-1">Per invoice</p>
          </CardContent>
        </Card>
      </div>

      {/* Cashier performance - daily target / salary incentive, only shows cashiers set up in
          Settings > Manage Cashiers. Target scales with the selected period above. */}
      {cashiers && cashiers.length > 0 && (
        <Card className="glass-card border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Cashier Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cashier</TableHead>
                  <TableHead className="text-right">Bills</TableHead>
                  <TableHead className="text-right">Sales</TableHead>
                  <TableHead className="text-right">Target</TableHead>
                  <TableHead className="text-right">Achievement</TableHead>
                  <TableHead className="text-right">Est. Salary</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cashierPerformance.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      {c.name}
                      {!c.active && <span className="text-xs text-muted-foreground ml-1">(inactive)</span>}
                    </TableCell>
                    <TableCell className="text-right">{c.bills}</TableCell>
                    <TableCell className="text-right">Rs. {c.totalSales.toFixed(2)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">Rs. {c.target.toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={c.achievementPct >= 100 ? "default" : c.achievementPct >= 70 ? "secondary" : "outline"}>
                        {c.achievementPct.toFixed(0)}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-semibold text-primary">
                      Rs. {c.estimatedSalary.toFixed(2)}
                      {c.bonusAmount > 0 && (
                        <span className="block text-[10px] text-muted-foreground font-normal">
                          +Rs. {c.bonusAmount.toFixed(2)} bonus
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="text-xs text-muted-foreground mt-3 flex items-start gap-1.5">
              <Target className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              Target and base salary scale with the period filter above ({PERIOD_LABELS[period]}). Bonus is
              earned only above 100% achievement, at each cashier's own bonus rate (set in Settings &gt;
              Manage Cashiers) - e.g. 120% achievement at a 5% bonus rate adds 20 × 5% = 100% of base salary
              as a bonus. Only sales made while logged in with a named cashier PIN count here.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Auto-reorder suggestions */}
      <Card className="glass-card border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center justify-between flex-wrap gap-2">
            <span className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary" />
              Auto-Reorder Suggestions
            </span>
            {(reorderSuggestions?.length || 0) > 0 && (
              <span className="text-sm font-normal text-muted-foreground">
                {reorderSuggestions!.length} item{reorderSuggestions!.length === 1 ? "" : "s"} to reorder
                {reorderTotalCost > 0 && ` · est. Rs. ${reorderTotalCost.toFixed(2)}`}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {reorderLoading ? (
            <p className="text-muted-foreground text-sm">Crunching last {30} days of sales…</p>
          ) : !reorderSuggestions || reorderSuggestions.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nothing needs reordering right now — stock looks healthy.</p>
          ) : (
            <div className="space-y-5">
              {reorderGroups.map(([vendorId, group]) => (
                <div key={vendorId}>
                  <div className="flex items-center gap-2 mb-2">
                    <Building2 className="h-4 w-4 text-primary" />
                    <p className="font-semibold">{group.vendorName}</p>
                    {group.vendorPhone && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Phone className="h-3 w-3" /> {group.vendorPhone}
                      </span>
                    )}
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Stock Left</TableHead>
                        <TableHead className="text-right">Days Left</TableHead>
                        <TableHead className="text-right">Trend (7d vs prior 7d)</TableHead>
                        <TableHead className="text-right">Suggested Order</TableHead>
                        <TableHead className="text-right">Est. Cost</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.items.map((item) => (
                        <TableRow key={item.productId}>
                          <TableCell className="font-medium">
                            {item.name}
                            <Badge
                              variant={item.reason === "out_of_stock" ? "destructive" : item.reason === "below_min_stock" ? "secondary" : "outline"}
                              className="ml-2 text-[10px]"
                            >
                              {item.reason === "out_of_stock" ? "Out of stock" : item.reason === "below_min_stock" ? "Below min" : "Running low"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {item.stockQuantity} {item.unitLabel}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {item.daysOfStockLeft === null ? "—" : `${item.daysOfStockLeft.toFixed(1)}d`}
                          </TableCell>
                          <TableCell className="text-right">
                            <TrendBadge trend={item.trend} trendPct={item.trendPct} />
                          </TableCell>
                          <TableCell className="text-right font-semibold text-primary">
                            {item.suggestedQty} {item.unitLabel}
                            {item.caseSize && item.caseSize > 1 && ` (${(item.suggestedQty / item.caseSize).toFixed(0)} case${item.suggestedQty / item.caseSize === 1 ? "" : "s"})`}
                          </TableCell>
                          <TableCell className="text-right">
                            {item.estimatedCost != null ? `Rs. ${item.estimatedCost.toFixed(2)}` : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                Based on the last 30 days of sales, targeting ~14 days of stock cover. Vendor is inferred from the
                last Product Receiving entry for each item — items never received from a vendor show as unassigned.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Case vs Unit vs Weight breakdown */}
        <Card className="glass-card border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Boxes className="h-5 w-5 text-primary" />
              Sales by Selling Mode
            </CardTitle>
          </CardHeader>
          <CardContent>
            {unitBreakdown.length === 0 ? (
              <p className="text-muted-foreground text-sm">No sales in this period.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={unitBreakdown}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    labelLine={false}
                    label={({ name, value, percent }) => (percent > 0.06 ? `${name}: Rs. ${Number(value).toFixed(0)}` : "")}
                  >
                    {unitBreakdown.map((entry, index) => (
                      <Cell key={index} fill={Object.values(SOLD_UNIT_COLORS)[index % 3]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => `Rs. ${v.toFixed(2)}`} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Sales by category */}
        <Card className="glass-card border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              Sales by Category
            </CardTitle>
          </CardHeader>
          <CardContent>
            {categoryBreakdown.length === 0 ? (
              <p className="text-muted-foreground text-sm">No sales in this period.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={categoryBreakdown} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tickFormatter={(v) => `Rs.${v}`} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v: number) => `Rs. ${v.toFixed(2)}`} />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Profit margin by product */}
      <Card className="glass-card border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center justify-between flex-wrap gap-2">
            <span className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" />
              Profit Margin by Product
            </span>
            <div className="flex gap-1.5">
              <Button size="sm" variant={marginView === "top" ? "default" : "outline"} onClick={() => setMarginView("top")}>
                Most Profitable
              </Button>
              <Button size="sm" variant={marginView === "bottom" ? "default" : "outline"} onClick={() => setMarginView("bottom")}>
                Lowest Margin
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {profitMargin.length === 0 ? (
            <p className="text-muted-foreground text-sm">No sales in this period.</p>
          ) : (
            <>
              <div className="flex items-center justify-between p-3 mb-4 glass-card border-border/30 rounded-xl">
                <span className="text-sm text-muted-foreground">Total profit ({PERIOD_LABELS[period]})</span>
                <span className={`font-bold ${totalProfit >= 0 ? "text-primary" : "text-destructive"}`}>
                  Rs. {totalProfit.toFixed(2)}
                </span>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Qty Sold</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead className="text-right">Profit</TableHead>
                    <TableHead className="text-right">Margin</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {marginTableRows.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-right">{p.qty}</TableCell>
                      <TableCell className="text-right">Rs. {p.revenue.toFixed(2)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">Rs. {p.cost.toFixed(2)}</TableCell>
                      <TableCell className={`text-right font-semibold ${p.profit >= 0 ? "" : "text-destructive"}`}>
                        Rs. {p.profit.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant={p.marginPct < 0 ? "destructive" : p.marginPct < 15 ? "secondary" : "default"}
                          className="gap-1"
                        >
                          <Percent className="h-3 w-3" />
                          {p.marginPct.toFixed(0)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="text-xs text-muted-foreground mt-3">
                Uses each product's current cost price as a stand-in for cost at the time of sale (this app
                doesn't record historical cost per sale) - if a product's cost was changed recently, older
                sales here reflect today's cost, not what it actually cost back then.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top wholesale / B2B buyers */}
        <Card className="glass-card border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              Top Wholesale / B2B Buyers
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topWholesaleBuyers.length === 0 ? (
              <p className="text-muted-foreground text-sm">No wholesale/B2B purchases in this period.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead className="text-right">Total Spent</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topWholesaleBuyers.map((buyer, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <p className="font-medium">{buyer.name}</p>
                        {buyer.business_name && <p className="text-xs text-muted-foreground">{buyer.business_name}</p>}
                      </TableCell>
                      <TableCell className="text-right">{buyer.orders}</TableCell>
                      <TableCell className="text-right font-semibold">Rs. {buyer.total.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Low stock / reorder list */}
        <Card className="glass-card border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Low Stock / Reorder List
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lowStockProducts.length === 0 ? (
              <p className="text-muted-foreground text-sm">All products are sufficiently stocked.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead className="text-right">Min Level</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lowStockProducts.slice(0, 12).map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={Number(p.stock_quantity ?? 0) === 0 ? "destructive" : "secondary"}>
                          {p.stock_quantity ?? 0} {p.unit_label || "pcs"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{p.min_stock_level ?? 10}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dead stock report - always looks at all-time sales history, independent of the
          period filter above, since a product being dead stock doesn't reset just because
          you're viewing "Today" */}
      <Card className="glass-card border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center justify-between flex-wrap gap-2">
            <span className="flex items-center gap-2">
              <PackageX className="h-5 w-5 text-destructive" />
              Dead Stock Report
            </span>
            <div className="flex gap-1.5">
              {[30, 60, 90, 180].map((d) => (
                <Button key={d} size="sm" variant={deadStockDays === d ? "default" : "outline"} onClick={() => setDeadStockDays(d)}>
                  {d}+ days
                </Button>
              ))}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {deadStockProducts.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No products have been sitting unsold for {deadStockDays}+ days — inventory is moving well.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between p-3 mb-4 glass-card border-border/30 rounded-xl">
                <span className="text-sm text-muted-foreground">Capital tied up in dead stock</span>
                <span className="font-bold text-destructive">Rs. {totalDeadStockValue.toFixed(2)}</span>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead className="text-right">Last Sold</TableHead>
                    <TableHead className="text-right">Tied-up Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deadStockProducts.slice(0, 20).map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <p className="font-medium">{p.name}</p>
                        {p.category && <p className="text-xs text-muted-foreground">{p.category}</p>}
                      </TableCell>
                      <TableCell className="text-right">
                        {p.stock_quantity ?? 0} {p.unit_label || "pcs"}
                      </TableCell>
                      <TableCell className="text-right">
                        {p.neverSold ? (
                          <div className="flex flex-col items-end gap-0.5">
                            <Badge variant="destructive" className="text-[10px]">Never sold</Badge>
                            {p.daysSince !== null && (
                              <span className="text-[10px] text-muted-foreground">added {p.daysSince}d ago</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">{p.daysSince}d ago</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold">Rs. {p.tiedUpValue.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {deadStockProducts.length > 20 && (
                <p className="text-xs text-muted-foreground text-center mt-2">
                  +{deadStockProducts.length - 20} more product{deadStockProducts.length - 20 === 1 ? "" : "s"} not shown
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-3">
                Based on all-time sales history. "Never sold" means there's no sale on record for this product at all.
                Value uses cost price where available, otherwise selling price.
              </p>
            </>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
