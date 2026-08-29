import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, Package, PackagePlus, PackageMinus, Building2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type MovementPeriod = "today" | "week" | "month";

const MOVEMENT_PERIOD_LABELS: Record<MovementPeriod, string> = {
  today: "Today",
  week: "Last 7 Days",
  month: "Last 30 Days",
};

function getMovementPeriodStart(period: MovementPeriod): string {
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

export default function ProductInventory() {
  const [searchTerm, setSearchTerm] = useState("");
  const [movementPeriod, setMovementPeriod] = useState<MovementPeriod>("week");
  const movementPeriodStart = getMovementPeriodStart(movementPeriod);

  const { data: products } = useQuery({
    queryKey: ["inventory", searchTerm],
    queryFn: async () => {
      let query = supabase.from("products").select("*");

      if (searchTerm) {
        query = query.or(`name.ilike.%${searchTerm}%,barcode.ilike.%${searchTerm}%`);
      }

      const { data, error } = await query.order("name");
      if (error) throw error;
      return data || [];
    },
  });

  // ---- Stock coming IN: recent Product Receiving entries, newest first ----
  const { data: recentArrivals } = useQuery({
    queryKey: ["inventory-recent-arrivals", movementPeriod],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_receiving")
        .select("id, quantity, received_date, vendors(name), products(name, unit_label)")
        .gte("received_date", movementPeriodStart)
        .order("received_date", { ascending: false })
        .limit(25);
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  // ---- Stock going OUT: recent sales in the period, aggregated per product ----
  const { data: recentSales } = useQuery({
    queryKey: ["inventory-recent-sales", movementPeriod],
    queryFn: async () => {
      const { data: sales, error: salesError } = await supabase
        .from("sales")
        .select("id")
        .gte("sale_date", movementPeriodStart);
      if (salesError) throw salesError;
      const saleIds = (sales || []).map((s) => s.id);
      if (saleIds.length === 0) return [];
      const { data, error } = await supabase
        .from("sale_items")
        .select("product_id, product_name, quantity, sold_unit")
        .in("sale_id", saleIds);
      if (error) throw error;
      return data || [];
    },
  });

  const goingOut = useMemo(() => {
    const buckets: Record<string, { name: string; qty: number; unit: string }> = {};
    for (const item of recentSales || []) {
      const key = item.product_id || item.product_name;
      if (!buckets[key]) buckets[key] = { name: item.product_name, qty: 0, unit: item.sold_unit || "unit" };
      buckets[key].qty += Number(item.quantity || 0);
    }
    return Object.values(buckets)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 25);
  }, [recentSales]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
          Product Inventory
        </h1>
        <p className="text-muted-foreground mt-2">View and manage current stock levels</p>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground mr-1">Stock movement:</span>
        {(Object.keys(MOVEMENT_PERIOD_LABELS) as MovementPeriod[]).map((p) => (
          <Button
            key={p}
            size="sm"
            variant={movementPeriod === p ? "default" : "outline"}
            onClick={() => setMovementPeriod(p)}
          >
            {MOVEMENT_PERIOD_LABELS[p]}
          </Button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* New arrivals - stock that has just come IN, from Product Receiving */}
        <Card className="glass-card border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PackagePlus className="h-5 w-5 text-green-500" />
              New Stock Arrived
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!recentArrivals || recentArrivals.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4">
                No new stock received in this period.
              </p>
            ) : (
              <div className="space-y-2 max-h-[420px] overflow-y-auto scroll-glass pr-1">
                {recentArrivals.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between p-3 glass-card border-border/30 rounded-lg"
                  >
                    <div className="min-w-0">
                      <p className="font-medium truncate">{r.products?.name || "Unknown product"}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        {r.vendors?.name && (
                          <>
                            <Building2 className="h-3 w-3" /> {r.vendors.name} ·{" "}
                          </>
                        )}
                        {formatDistanceToNow(new Date(r.received_date), { addSuffix: true })}
                      </p>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="text-lg font-bold text-green-600">
                        +{r.quantity} {r.products?.unit_label || "pcs"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Going out - stock sold / leaving in the period, aggregated per product */}
        <Card className="glass-card border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PackageMinus className="h-5 w-5 text-destructive" />
              Stock Going Out
            </CardTitle>
          </CardHeader>
          <CardContent>
            {goingOut.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4">
                No sales in this period yet.
              </p>
            ) : (
              <div className="space-y-2 max-h-[420px] overflow-y-auto scroll-glass pr-1">
                {goingOut.map((g, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-3 glass-card border-border/30 rounded-lg"
                  >
                    <p className="font-medium truncate">{g.name}</p>
                    <p className="text-lg font-bold text-destructive shrink-0 ml-3">
                      -{g.qty} {g.unit === "case" ? "case" : g.unit === "weight" ? "kg" : "pcs"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="glass-card border-border/50">
        <CardHeader>
          <CardTitle>Inventory Status</CardTitle>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search inventory..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 glass border-border/50"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {products?.map((product) => (
              <div
                key={product.id}
                className="flex items-center justify-between p-4 glass-card border-border/30 glass-hover"
              >
                <div className="flex items-center gap-4">
                  <Package className="h-8 w-8 text-primary" />
                  <div>
                    <p className="font-semibold">{product.name}</p>
                    <p className="text-sm text-muted-foreground">{product.category}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-primary">{product.stock_quantity}</p>
                  <p className="text-xs text-muted-foreground">units in stock</p>
                  {product.stock_quantity <= product.min_stock_level && (
                    <p className="text-xs text-destructive font-medium mt-1">Low Stock!</p>
                  )}
                </div>
              </div>
            ))}
            {products?.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <p>No inventory records found.</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
