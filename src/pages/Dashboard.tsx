import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DollarSign, Package, ShoppingCart, TrendingUp, AlertTriangle, ClipboardList, ArrowRight } from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { computeReorderSuggestions } from "@/lib/reorderSuggestions";

export default function Dashboard() {
  const { data: todaySales } = useQuery({
    queryKey: ["today-sales"],
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const { data, error } = await supabase
        .from("sales")
        .select("total_amount")
        .gte("sale_date", today.toISOString());
      
      if (error) throw error;
      return data?.reduce((sum, sale) => sum + Number(sale.total_amount), 0) || 0;
    },
  });

  const { data: totalProducts } = useQuery({
    queryKey: ["total-products"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("products")
        .select("*", { count: "exact", head: true });
      
      if (error) throw error;
      return count || 0;
    },
  });

  const { data: lowStockItems } = useQuery({
    queryKey: ["low-stock"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .lt("stock_quantity", "min_stock_level");
      
      if (error) throw error;
      return data || [];
    },
  });

  const { data: recentSales } = useQuery({
    queryKey: ["recent-sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("*")
        .order("sale_date", { ascending: false })
        .limit(5);
      
      if (error) throw error;
      return data || [];
    },
  });

  // Monthly sales data for the last 6 months
  const { data: monthlySales } = useQuery({
    queryKey: ["monthly-sales"],
    queryFn: async () => {
      const months = [];
      for (let i = 5; i >= 0; i--) {
        const date = subMonths(new Date(), i);
        const start = startOfMonth(date);
        const end = endOfMonth(date);

        const { data, error } = await supabase
          .from("sales")
          .select("total_amount")
          .gte("sale_date", start.toISOString())
          .lte("sale_date", end.toISOString());

        if (error) throw error;

        const total = data?.reduce((sum, sale) => sum + Number(sale.total_amount), 0) || 0;
        months.push({
          month: format(date, "MMM yyyy"),
          sales: total,
        });
      }
      return months;
    },
  });

  // Top 5 selling items
  const { data: topItems } = useQuery({
    queryKey: ["top-items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sale_items")
        .select("product_name, quantity")
        .order("quantity", { ascending: false });

      if (error) throw error;

      // Aggregate by product name
      const aggregated = data?.reduce((acc: any, item) => {
        const existing = acc.find((i: any) => i.name === item.product_name);
        if (existing) {
          existing.total += item.quantity;
        } else {
          acc.push({ name: item.product_name, total: item.quantity });
        }
        return acc;
      }, []);

      return aggregated?.sort((a: any, b: any) => b.total - a.total).slice(0, 5) || [];
    },
  });

  // Sales by category
  const { data: categoryData } = useQuery({
    queryKey: ["category-sales"],
    queryFn: async () => {
      const { data: saleItems, error } = await supabase
        .from("sale_items")
        .select("product_id, total_price");

      if (error) throw error;

      const productIds = [...new Set(saleItems?.map(item => item.product_id))];
      const { data: products } = await supabase
        .from("products")
        .select("id, category")
        .in("id", productIds);

      const categoryMap = new Map(products?.map(p => [p.id, p.category || "Uncategorized"]));
      
      const aggregated = saleItems?.reduce((acc: any, item) => {
        const category = categoryMap.get(item.product_id) || "Uncategorized";
        const existing = acc.find((i: any) => i.name === category);
        if (existing) {
          existing.value += Number(item.total_price);
        } else {
          acc.push({ name: category, value: Number(item.total_price) });
        }
        return acc;
      }, []);

      return aggregated?.sort((a: any, b: any) => b.value - a.value) || [];
    },
  });

  const { data: reorderSuggestions } = useQuery({
    queryKey: ["reorder-suggestions"],
    queryFn: computeReorderSuggestions,
  });

  const COLORS = ['hsl(var(--primary))', 'hsl(var(--secondary))', 'hsl(var(--accent))', 'hsl(var(--chart-1))', 'hsl(var(--chart-2))'];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
          Dashboard
        </h1>
        <p className="text-muted-foreground mt-2">Welcome back! Here's your store overview</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="glass-card glass-hover border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today's Sales</CardTitle>
            <DollarSign className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              LKR {todaySales?.toFixed(2) || "0.00"}
            </div>
            <p className="text-xs text-muted-foreground">
              +20.1% from yesterday
            </p>
          </CardContent>
        </Card>

        <Card className="glass-card glass-hover border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Products</CardTitle>
            <Package className="h-4 w-4 text-secondary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-secondary">{totalProducts || 0}</div>
            <p className="text-xs text-muted-foreground">
              Active inventory items
            </p>
          </CardContent>
        </Card>

        <Card className="glass-card glass-hover border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Transactions</CardTitle>
            <ShoppingCart className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-accent">{recentSales?.length || 0}</div>
            <p className="text-xs text-muted-foreground">
              Recent transactions
            </p>
          </CardContent>
        </Card>

        <Card className="glass-card glass-hover border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Low Stock Alert</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{lowStockItems?.length || 0}</div>
            <p className="text-xs text-muted-foreground">
              Items need restock
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Monthly Sales Chart */}
        <Card className="glass-card border-border/50 lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Monthly Sales Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlySales || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis 
                  dataKey="month" 
                  stroke="hsl(var(--foreground))"
                  fontSize={12}
                />
                <YAxis 
                  stroke="hsl(var(--foreground))"
                  fontSize={12}
                />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                  formatter={(value: any) => [`LKR ${value ? Number(value).toFixed(2) : '0.00'}`, "Sales"]}
                />
                <Bar dataKey="sales" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Sales by Category Pie Chart */}
        <Card className="glass-card border-border/50">
          <CardHeader>
            <CardTitle className="text-sm">Sales by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={categoryData || []}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => entry.name}
                  outerRadius={80}
                  fill="hsl(var(--primary))"
                  dataKey="value"
                >
                  {categoryData?.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                  formatter={(value: any) => [`LKR ${value ? Number(value).toFixed(2) : '0.00'}`, "Sales"]}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Top Selling Items */}
      <Card className="glass-card border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-accent" />
            Top 5 Selling Items
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={topItems || []} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" stroke="hsl(var(--foreground))" fontSize={12} />
              <YAxis 
                dataKey="name" 
                type="category" 
                width={150}
                stroke="hsl(var(--foreground))"
                fontSize={12}
              />
              <Tooltip 
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                }}
                formatter={(value: any) => [`${value} units`, "Sold"]}
              />
              <Bar dataKey="total" fill="hsl(var(--accent))" radius={[0, 8, 8, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="glass-card border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Recent Sales
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentSales?.map((sale) => (
                <div
                  key={sale.id}
                  className="flex items-center justify-between p-3 rounded-lg glass-card border border-border/30"
                >
                  <div>
                    <p className="font-medium">{sale.invoice_number}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(sale.sale_date), "MMM dd, yyyy HH:mm")}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-primary">LKR {Number(sale.total_amount).toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">{sale.payment_method}</p>
                  </div>
                </div>
              ))}
              {(!recentSales || recentSales.length === 0) && (
                <p className="text-center text-muted-foreground py-8">No sales yet</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Low Stock Items
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {lowStockItems?.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 rounded-lg glass-card border border-destructive/30"
                >
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.category}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-destructive">{item.stock_quantity} left</p>
                    <p className="text-xs text-muted-foreground">Min: {item.min_stock_level}</p>
                  </div>
                </div>
              ))}
              {(!lowStockItems || lowStockItems.length === 0) && (
                <p className="text-center text-muted-foreground py-8">All items well stocked!</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Auto-reorder suggestions */}
      <Card className="glass-card border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center justify-between flex-wrap gap-2">
            <span className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary" />
              Reorder Suggestions
            </span>
            <Link to="/reports" className="text-sm font-normal text-primary flex items-center gap-1 hover:underline">
              View full report <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!reorderSuggestions || reorderSuggestions.length === 0 ? (
            <p className="text-center text-muted-foreground py-6">Nothing needs reordering right now — stock looks healthy.</p>
          ) : (
            <div className="space-y-2">
              {reorderSuggestions.slice(0, 5).map((item) => (
                <div
                  key={item.productId}
                  className="flex items-center justify-between p-3 rounded-lg glass-card border border-border/30"
                >
                  <div>
                    <p className="font-medium">
                      {item.name}
                      <Badge
                        variant={item.reason === "out_of_stock" ? "destructive" : item.reason === "below_min_stock" ? "secondary" : "outline"}
                        className="ml-2 text-[10px]"
                      >
                        {item.reason === "out_of_stock" ? "Out of stock" : item.reason === "below_min_stock" ? "Below min" : "Running low"}
                      </Badge>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.vendorName ? `Order from ${item.vendorName}` : "No vendor on record"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-primary">
                      Order {item.suggestedQty} {item.unitLabel}
                    </p>
                    <p className="text-xs text-muted-foreground">{item.stockQuantity} {item.unitLabel} left</p>
                  </div>
                </div>
              ))}
              {reorderSuggestions.length > 5 && (
                <p className="text-xs text-muted-foreground text-center pt-1">
                  +{reorderSuggestions.length - 5} more in Reports
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
