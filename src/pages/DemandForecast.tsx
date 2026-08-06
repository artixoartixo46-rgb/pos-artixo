import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Sparkles,
  Search,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  LineChart as LineChartIcon,
  PackageX,
  Loader2,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { computeDemandForecasts, type ProductForecast, type StockoutRisk } from "@/lib/demandForecast";

const RISK_LABEL: Record<StockoutRisk, string> = {
  critical: "Stockout risk",
  warning: "Watch closely",
  safe: "Healthy",
  unknown: "No data",
};

const RISK_BADGE_VARIANT: Record<StockoutRisk, "default" | "secondary" | "destructive" | "outline"> = {
  critical: "destructive",
  warning: "secondary",
  safe: "default",
  unknown: "outline",
};

function TrendBadge({ forecast }: { forecast: ProductForecast }) {
  if (forecast.trendDirection === "up") {
    return (
      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-sm font-medium">
        <TrendingUp className="h-3.5 w-3.5" />
        {forecast.trendPct !== null ? `+${forecast.trendPct.toFixed(0)}%` : "Up"}
      </span>
    );
  }
  if (forecast.trendDirection === "down") {
    return (
      <span className="inline-flex items-center gap-1 text-destructive text-sm font-medium">
        <TrendingDown className="h-3.5 w-3.5" />
        {forecast.trendPct !== null ? `${forecast.trendPct.toFixed(0)}%` : "Down"}
      </span>
    );
  }
  if (forecast.trendDirection === "new") {
    return (
      <span className="inline-flex items-center gap-1 text-primary text-sm font-medium">
        <Sparkles className="h-3.5 w-3.5" />
        New
      </span>
    );
  }
  if (forecast.trendDirection === "stable") {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground text-sm">
        <Minus className="h-3.5 w-3.5" />
        Stable
      </span>
    );
  }
  return <span className="text-muted-foreground text-sm">No data</span>;
}

const CONFIDENCE_LABEL: Record<string, string> = { high: "High", medium: "Medium", low: "Low" };
const CONFIDENCE_CLASS: Record<string, string> = {
  high: "text-emerald-600 dark:text-emerald-400",
  medium: "text-amber-600 dark:text-amber-400",
  low: "text-muted-foreground",
};

export default function DemandForecast() {
  const [searchTerm, setSearchTerm] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [riskFilter, setRiskFilter] = useState<"all" | StockoutRisk>("all");
  const [selected, setSelected] = useState<ProductForecast | null>(null);

  const { data: forecasts, isLoading } = useQuery({
    queryKey: ["demand-forecasts"],
    queryFn: computeDemandForecasts,
  });

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const f of forecasts || []) if (f.category) set.add(f.category);
    return [...set].sort();
  }, [forecasts]);

  const filtered = useMemo(() => {
    return (forecasts || []).filter((f) => {
      if (searchTerm && !f.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      if (category !== "all" && f.category !== category) return false;
      if (riskFilter !== "all" && f.stockoutRisk !== riskFilter) return false;
      return true;
    });
  }, [forecasts, searchTerm, category, riskFilter]);

  const summary = useMemo(() => {
    const list = forecasts || [];
    const critical = list.filter((f) => f.stockoutRisk === "critical").length;
    const rising = list.filter((f) => f.trendDirection === "up").length;
    const predictedRevenue30 = list.reduce((sum, f) => sum + f.forecast30 * (f.price ?? 0), 0);
    return { total: list.length, critical, rising, predictedRevenue30 };
  }, [forecasts]);

  const chartData = useMemo(() => {
    if (!selected) return [];
    const historyTail = selected.history.slice(-30);
    const rows = historyTail.map((h, idx) => ({
      date: h.date.slice(5),
      actual: Math.round(h.qty * 10) / 10,
      forecast: idx === historyTail.length - 1 ? Math.round(h.qty * 10) / 10 : null,
    }));
    for (const f of selected.forecast.slice(0, 14)) {
      rows.push({ date: f.date.slice(5), actual: null, forecast: Math.round(f.qty * 10) / 10 });
    }
    return rows;
  }, [selected]);

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 rounded-2xl bg-primary/10 grid place-items-center">
          <Sparkles className="h-5.5 w-5.5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">AI Demand Forecasting</h1>
          <p className="text-sm text-muted-foreground">
            Trend + seasonality-based sales projections for the next 30 days, per product.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Crunching sales history...
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="glass-card glass-hover">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Products Forecasted</p>
                <p className="text-2xl font-bold mt-1">{summary.total}</p>
              </CardContent>
            </Card>
            <Card className="glass-card glass-hover">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5 text-destructive" /> Stockout Risk (7d)
                </p>
                <p className="text-2xl font-bold mt-1 text-destructive">{summary.critical}</p>
              </CardContent>
            </Card>
            <Card className="glass-card glass-hover">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-500" /> Rising Demand
                </p>
                <p className="text-2xl font-bold mt-1">{summary.rising}</p>
              </CardContent>
            </Card>
            <Card className="glass-card glass-hover">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Predicted Revenue (30d)</p>
                <p className="text-2xl font-bold mt-1">Rs. {summary.predictedRevenue30.toFixed(0)}</p>
              </CardContent>
            </Card>
          </div>

          <Card className="glass-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between flex-wrap gap-3">
                <span>Forecast by Product</span>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Search products..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-8 h-9 w-48"
                    />
                  </div>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger className="h-9 w-40">
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {categories.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-1">
                    {(["all", "critical", "warning", "safe"] as const).map((r) => (
                      <Button
                        key={r}
                        size="sm"
                        variant={riskFilter === r ? "default" : "outline"}
                        onClick={() => setRiskFilter(r)}
                        className="h-9 capitalize"
                      >
                        {r === "all" ? "All" : RISK_LABEL[r]}
                      </Button>
                    ))}
                  </div>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {filtered.length === 0 ? (
                <p className="text-center text-muted-foreground py-12">No products match your filters.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Stock</TableHead>
                        <TableHead className="text-right">Avg/Day (7d)</TableHead>
                        <TableHead>Trend</TableHead>
                        <TableHead className="text-right">7-Day Forecast</TableHead>
                        <TableHead className="text-right">30-Day Forecast</TableHead>
                        <TableHead>Confidence</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Chart</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((f) => (
                        <TableRow key={f.productId}>
                          <TableCell className="font-medium max-w-[220px] truncate">{f.name}</TableCell>
                          <TableCell className="text-right">
                            {f.stockQuantity} {f.unitLabel}
                          </TableCell>
                          <TableCell className="text-right">{f.avgDailyRecent.toFixed(1)}</TableCell>
                          <TableCell>
                            <TrendBadge forecast={f} />
                          </TableCell>
                          <TableCell className="text-right">{f.forecast7.toFixed(0)}</TableCell>
                          <TableCell className="text-right font-semibold">{f.forecast30.toFixed(0)}</TableCell>
                          <TableCell>
                            <span className={`text-xs font-medium ${CONFIDENCE_CLASS[f.confidence]}`}>
                              {CONFIDENCE_LABEL[f.confidence]}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge variant={RISK_BADGE_VARIANT[f.stockoutRisk]} className="whitespace-nowrap">
                              {f.stockoutRisk === "critical" && f.daysToStockout !== null
                                ? `Out in ~${Math.max(0, Math.round(f.daysToStockout))}d`
                                : RISK_LABEL[f.stockoutRisk]}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              disabled={f.forecast.length === 0}
                              onClick={() => setSelected(f)}
                            >
                              <LineChartIcon className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LineChartIcon className="h-5 w-5 text-primary" />
              {selected?.name}
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="glass-card p-3 rounded-xl text-center">
                  <p className="text-muted-foreground text-xs">Next 7 days</p>
                  <p className="font-bold text-lg">{selected.forecast7.toFixed(0)}</p>
                </div>
                <div className="glass-card p-3 rounded-xl text-center">
                  <p className="text-muted-foreground text-xs">Next 14 days</p>
                  <p className="font-bold text-lg">{selected.forecast14.toFixed(0)}</p>
                </div>
                <div className="glass-card p-3 rounded-xl text-center">
                  <p className="text-muted-foreground text-xs">Next 30 days</p>
                  <p className="font-bold text-lg">{selected.forecast30.toFixed(0)}</p>
                </div>
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line
                      type="monotone"
                      dataKey="actual"
                      name="Actual sales"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={false}
                      connectNulls={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="forecast"
                      name="Forecast"
                      stroke="hsl(var(--secondary))"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={false}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {selected.recommendedOrderQty > 0 && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-400 text-sm">
                  <PackageX className="h-4 w-4 shrink-0" />
                  Order ~{selected.recommendedOrderQty} {selected.unitLabel} to stay stocked for the next 14 days.
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
