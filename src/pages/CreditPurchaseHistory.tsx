import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import {
  Search, UserCheck, ChevronDown, ArrowUpDown, ArrowUp, ArrowDown,
  Download, FileText, Calendar as CalendarIcon, X, ShoppingBag,
  TrendingUp, DollarSign, Package, Eye
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface AggregatedProduct {
  product_id: string | null;
  product_name: string;
  total_quantity: number;
  total_amount: number;
  last_purchased: string;
  invoice_count: number;
  invoices: InvoiceDetail[];
}

interface InvoiceDetail {
  sale_id: string;
  invoice_number: string;
  sale_date: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

type SortField = "product_name" | "total_quantity" | "total_amount" | "last_purchased";
type SortDir = "asc" | "desc";

export default function CreditPurchaseHistory() {
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [customerSearchTerm, setCustomerSearchTerm] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [invoiceFilter, setInvoiceFilter] = useState("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [dateFromOpen, setDateFromOpen] = useState(false);
  const [dateToOpen, setDateToOpen] = useState(false);
  const [sortField, setSortField] = useState<SortField>("total_amount");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [drillDownProduct, setDrillDownProduct] = useState<AggregatedProduct | null>(null);

  // Fetch customers
  const { data: customers } = useQuery({
    queryKey: ["credit-customers-list", customerSearchTerm],
    queryFn: async () => {
      let query = supabase.from("credit_customers").select("*").order("name");
      if (customerSearchTerm) {
        query = query.or(`name.ilike.%${customerSearchTerm}%,phone.ilike.%${customerSearchTerm}%`);
      }
      const { data, error } = await query.limit(50);
      if (error) throw error;
      return data;
    },
  });

  const selectedCustomer = customers?.find((c) => c.id === selectedCustomerId);

  // Fetch all sales + sale_items for selected customer
  const { data: salesData, isLoading: salesLoading } = useQuery({
    queryKey: ["credit-purchase-history", selectedCustomerId],
    queryFn: async () => {
      if (!selectedCustomerId) return null;
      const { data: sales, error: salesErr } = await supabase
        .from("sales")
        .select("id, invoice_number, sale_date, total_amount, paid_amount, balance, status")
        .eq("customer_id", selectedCustomerId)
        .order("sale_date", { ascending: false });
      if (salesErr) throw salesErr;
      if (!sales?.length) return { sales: [], items: [] };

      const saleIds = sales.map((s) => s.id);
      const { data: items, error: itemsErr } = await supabase
        .from("sale_items")
        .select("*")
        .in("sale_id", saleIds);
      if (itemsErr) throw itemsErr;
      return { sales, items: items || [] };
    },
    enabled: !!selectedCustomerId,
  });

  // Aggregate products
  const aggregated = useMemo<AggregatedProduct[]>(() => {
    if (!salesData?.items?.length || !salesData.sales.length) return [];
    const salesMap = new Map(salesData.sales.map((s) => [s.id, s]));
    const map = new Map<string, AggregatedProduct>();

    for (const item of salesData.items) {
      const sale = salesMap.get(item.sale_id!);
      if (!sale) continue;

      const key = item.product_name;
      const existing = map.get(key);
      const invoiceDetail: InvoiceDetail = {
        sale_id: item.sale_id!,
        invoice_number: sale.invoice_number,
        sale_date: sale.sale_date || "",
        quantity: item.quantity,
        unit_price: Number(item.unit_price),
        total_price: Number(item.total_price),
      };

      if (existing) {
        existing.total_quantity += item.quantity;
        existing.total_amount += Number(item.total_price);
        existing.invoice_count += 1;
        existing.invoices.push(invoiceDetail);
        if (invoiceDetail.sale_date > existing.last_purchased) {
          existing.last_purchased = invoiceDetail.sale_date;
        }
      } else {
        map.set(key, {
          product_id: item.product_id,
          product_name: item.product_name,
          total_quantity: item.quantity,
          total_amount: Number(item.total_price),
          last_purchased: invoiceDetail.sale_date,
          invoice_count: 1,
          invoices: [invoiceDetail],
        });
      }
    }
    return Array.from(map.values());
  }, [salesData]);

  // Filter & sort
  const filtered = useMemo(() => {
    let result = aggregated;

    if (productSearch) {
      const term = productSearch.toLowerCase();
      result = result.filter((p) => p.product_name.toLowerCase().includes(term));
    }
    if (invoiceFilter) {
      const term = invoiceFilter.toLowerCase();
      result = result.filter((p) =>
        p.invoices.some((inv) => inv.invoice_number.toLowerCase().includes(term))
      );
    }
    if (dateFrom) {
      result = result.filter((p) => new Date(p.last_purchased) >= dateFrom);
    }
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59);
      result = result.filter((p) => new Date(p.last_purchased) <= end);
    }

    result.sort((a, b) => {
      let cmp = 0;
      if (sortField === "product_name") cmp = a.product_name.localeCompare(b.product_name);
      else if (sortField === "total_quantity") cmp = a.total_quantity - b.total_quantity;
      else if (sortField === "total_amount") cmp = a.total_amount - b.total_amount;
      else cmp = a.last_purchased.localeCompare(b.last_purchased);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return result;
  }, [aggregated, productSearch, invoiceFilter, dateFrom, dateTo, sortField, sortDir]);

  // Stats
  const stats = useMemo(() => {
    const totalSpent = aggregated.reduce((s, p) => s + p.total_amount, 0);
    const totalItems = aggregated.reduce((s, p) => s + p.total_quantity, 0);
    const uniqueProducts = aggregated.length;
    const totalInvoices = new Set(aggregated.flatMap((p) => p.invoices.map((i) => i.invoice_number))).size;
    return { totalSpent, totalItems, uniqueProducts, totalInvoices };
  }, [aggregated]);

  // Thresholds for color coding
  const maxQty = useMemo(() => Math.max(...aggregated.map((p) => p.total_quantity), 1), [aggregated]);
  const maxAmount = useMemo(() => Math.max(...aggregated.map((p) => p.total_amount), 1), [aggregated]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("desc"); }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />;
  };

  // Export CSV
  const exportCSV = () => {
    if (!filtered.length) return;
    const header = "Product Name,Total Qty,Total Amount (LKR),Last Purchased,Invoice Count\n";
    const rows = filtered.map((p) =>
      `"${p.product_name}",${p.total_quantity},${p.total_amount.toFixed(2)},${p.last_purchased ? format(new Date(p.last_purchased), "yyyy-MM-dd") : ""},${p.invoice_count}`
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedCustomer?.name || "customer"}_purchase_history.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearFilters = () => {
    setProductSearch("");
    setInvoiceFilter("");
    setDateFrom(undefined);
    setDateTo(undefined);
  };

  const hasFilters = productSearch || invoiceFilter || dateFrom || dateTo;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
          Credit Purchase History
        </h1>
        <p className="text-muted-foreground mt-1">View aggregated purchase history for credit customers</p>
      </div>

      {/* Customer Selector */}
      <Card className="glass">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <div className="flex-1">
              <Popover open={customerSearchOpen} onOpenChange={setCustomerSearchOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-between h-12 text-left glass-card border-border">
                    {selectedCustomer ? (
                      <div className="flex items-center gap-2">
                        <UserCheck className="h-4 w-4 text-primary" />
                        <span className="font-medium">{selectedCustomer.name}</span>
                        {selectedCustomer.phone && (
                          <span className="text-muted-foreground text-xs">({selectedCustomer.phone})</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Select a credit customer...</span>
                    )}
                    <ChevronDown className="h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-[400px]" align="start">
                  <Command>
                    <CommandInput
                      placeholder="Search by name or phone..."
                      value={customerSearchTerm}
                      onValueChange={setCustomerSearchTerm}
                    />
                    <CommandList>
                      <CommandEmpty>No customers found.</CommandEmpty>
                      <CommandGroup>
                        {customers?.map((c) => (
                          <CommandItem
                            key={c.id}
                            onSelect={() => {
                              setSelectedCustomerId(c.id);
                              setCustomerSearchOpen(false);
                              clearFilters();
                            }}
                            className="cursor-pointer"
                          >
                            <div className="flex items-center justify-between w-full">
                              <div>
                                <p className="font-medium">{c.name}</p>
                                <p className="text-xs text-muted-foreground">{c.phone || "No phone"}</p>
                              </div>
                              <Badge variant={Number(c.outstanding_balance) > 0 ? "destructive" : "secondary"} className="text-xs">
                                LKR {Number(c.outstanding_balance ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                              </Badge>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Customer info cards */}
            {selectedCustomer && (
              <div className="flex gap-3 flex-wrap">
                <div className="glass-card rounded-lg px-4 py-2 text-center min-w-[100px]">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Balance</p>
                  <p className="text-sm font-bold text-destructive">
                    LKR {Number(selectedCustomer.outstanding_balance ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="glass-card rounded-lg px-4 py-2 text-center min-w-[80px]">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Phone</p>
                  <p className="text-sm font-medium">{selectedCustomer.phone || "—"}</p>
                </div>
                <div className="glass-card rounded-lg px-4 py-2 text-center min-w-[80px]">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Email</p>
                  <p className="text-sm font-medium truncate max-w-[140px]">{selectedCustomer.email || "—"}</p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      {selectedCustomer && aggregated.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total Spent", value: `LKR ${stats.totalSpent.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, icon: DollarSign, color: "text-emerald-400" },
            { label: "Items Bought", value: stats.totalItems.toLocaleString(), icon: ShoppingBag, color: "text-sky-400" },
            { label: "Unique Products", value: stats.uniqueProducts.toLocaleString(), icon: Package, color: "text-violet-400" },
            { label: "Total Invoices", value: stats.totalInvoices.toLocaleString(), icon: FileText, color: "text-amber-400" },
          ].map((s) => (
            <Card key={s.label} className="glass-card glass-hover">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={cn("p-2.5 rounded-xl bg-background/50", s.color)}>
                  <s.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-lg font-bold">{s.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filters & table */}
      {selectedCustomer && (
        <Card className="glass">
          <CardHeader className="pb-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Aggregated Product List
              </CardTitle>
              <div className="flex items-center gap-2">
                {hasFilters && (
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs gap-1">
                    <X className="h-3 w-3" /> Clear Filters
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={exportCSV} disabled={!filtered.length} className="gap-1.5">
                  <Download className="h-3.5 w-3.5" /> Export CSV
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Filter bar */}
            <div className="flex flex-col md:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search products..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Input
                placeholder="Filter by invoice #"
                value={invoiceFilter}
                onChange={(e) => setInvoiceFilter(e.target.value)}
                className="md:w-44"
              />
              <Popover open={dateFromOpen} onOpenChange={setDateFromOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="default" className="md:w-40 justify-start gap-2 text-xs">
                    <CalendarIcon className="h-3.5 w-3.5" />
                    {dateFrom ? format(dateFrom, "dd MMM yyyy") : "From date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateFrom} onSelect={(d) => { setDateFrom(d); setDateFromOpen(false); }} />
                </PopoverContent>
              </Popover>
              <Popover open={dateToOpen} onOpenChange={setDateToOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="default" className="md:w-40 justify-start gap-2 text-xs">
                    <CalendarIcon className="h-3.5 w-3.5" />
                    {dateTo ? format(dateTo, "dd MMM yyyy") : "To date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateTo} onSelect={(d) => { setDateTo(d); setDateToOpen(false); }} />
                </PopoverContent>
              </Popover>
            </div>

            {/* Table */}
            {salesLoading ? (
              <div className="text-center py-12 text-muted-foreground">Loading purchase history...</div>
            ) : !filtered.length ? (
              <div className="text-center py-12">
                <ShoppingBag className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-muted-foreground">
                  {aggregated.length ? "No products match your filters." : "No purchase history found for this customer."}
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="w-[40%]">
                        <button onClick={() => toggleSort("product_name")} className="flex items-center gap-1.5 hover:text-foreground transition-colors">
                          Product Name <SortIcon field="product_name" />
                        </button>
                      </TableHead>
                      <TableHead className="text-center">
                        <button onClick={() => toggleSort("total_quantity")} className="flex items-center gap-1.5 mx-auto hover:text-foreground transition-colors">
                          Total Qty <SortIcon field="total_quantity" />
                        </button>
                      </TableHead>
                      <TableHead className="text-right">
                        <button onClick={() => toggleSort("total_amount")} className="flex items-center gap-1.5 ml-auto hover:text-foreground transition-colors">
                          Total Spent <SortIcon field="total_amount" />
                        </button>
                      </TableHead>
                      <TableHead className="text-center">
                        <button onClick={() => toggleSort("last_purchased")} className="flex items-center gap-1.5 mx-auto hover:text-foreground transition-colors">
                          Last Purchased <SortIcon field="last_purchased" />
                        </button>
                      </TableHead>
                      <TableHead className="text-center">Invoices</TableHead>
                      <TableHead className="text-center w-16">View</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((p) => {
                      const isHighQty = p.total_quantity >= maxQty * 0.6;
                      const isHighValue = p.total_amount >= maxAmount * 0.6;
                      return (
                        <TableRow
                          key={p.product_name}
                          className={cn(
                            "transition-colors cursor-pointer hover:bg-muted/30",
                            isHighValue && "border-l-2 border-l-emerald-500/60",
                            isHighQty && !isHighValue && "border-l-2 border-l-sky-500/60"
                          )}
                          onClick={() => setDrillDownProduct(p)}
                        >
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{p.product_name}</span>
                              {isHighValue && <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px] px-1.5">High Value</Badge>}
                              {isHighQty && <Badge className="bg-sky-500/20 text-sky-400 border-sky-500/30 text-[10px] px-1.5">Frequent</Badge>}
                            </div>
                          </TableCell>
                          <TableCell className="text-center font-semibold">{p.total_quantity}</TableCell>
                          <TableCell className="text-right font-semibold">
                            LKR {p.total_amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-center text-sm text-muted-foreground">
                            {p.last_purchased ? format(new Date(p.last_purchased), "dd MMM yyyy") : "—"}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="secondary" className="text-xs">{p.invoice_count}</Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {filtered.length > 0 && (
              <p className="text-xs text-muted-foreground text-right">
                Showing {filtered.length} of {aggregated.length} products
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!selectedCustomer && (
        <Card className="glass">
          <CardContent className="py-20 text-center">
            <UserCheck className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-semibold mb-1">Select a Customer</h3>
            <p className="text-muted-foreground text-sm">Choose a credit customer above to view their purchase history</p>
          </CardContent>
        </Card>
      )}

      {/* Invoice Drill-Down Dialog */}
      <Dialog open={!!drillDownProduct} onOpenChange={(open) => !open && setDrillDownProduct(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              {drillDownProduct?.product_name}
            </DialogTitle>
          </DialogHeader>
          {drillDownProduct && (
            <div className="space-y-4">
              <div className="flex gap-4 flex-wrap">
                <div className="glass-card rounded-lg px-4 py-2">
                  <p className="text-[10px] uppercase text-muted-foreground">Total Qty</p>
                  <p className="font-bold">{drillDownProduct.total_quantity}</p>
                </div>
                <div className="glass-card rounded-lg px-4 py-2">
                  <p className="text-[10px] uppercase text-muted-foreground">Total Spent</p>
                  <p className="font-bold">LKR {drillDownProduct.total_amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="glass-card rounded-lg px-4 py-2">
                  <p className="text-[10px] uppercase text-muted-foreground">Invoices</p>
                  <p className="font-bold">{drillDownProduct.invoice_count}</p>
                </div>
              </div>

              <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-center">Qty</TableHead>
                      <TableHead className="text-right">Unit Price</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {drillDownProduct.invoices
                      .sort((a, b) => b.sale_date.localeCompare(a.sale_date))
                      .map((inv, i) => (
                        <TableRow key={`${inv.invoice_number}-${i}`}>
                          <TableCell>
                            <Badge variant="outline" className="font-mono text-xs">{inv.invoice_number}</Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {inv.sale_date ? format(new Date(inv.sale_date), "dd MMM yyyy") : "—"}
                          </TableCell>
                          <TableCell className="text-center">{inv.quantity}</TableCell>
                          <TableCell className="text-right text-sm">
                            LKR {inv.unit_price.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            LKR {inv.total_price.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
