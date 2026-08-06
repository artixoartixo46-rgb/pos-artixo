import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Undo2, Search, Receipt, History, Loader2, PackageCheck, PackageX } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const REASON_OPTIONS = [
  { value: "damaged", label: "Damaged" },
  { value: "wrong_item", label: "Wrong Item" },
  { value: "changed_mind", label: "Customer Changed Mind" },
  { value: "expired", label: "Expired" },
  { value: "other", label: "Other" },
];

const REASON_LABELS: Record<string, string> = Object.fromEntries(REASON_OPTIONS.map((r) => [r.value, r.label]));

const REFUND_METHOD_LABELS: Record<string, string> = {
  cash: "Cash Refund",
  credit_adjustment: "Credit Balance Adjustment",
  exchange: "Exchange (No Refund)",
};

// Reasons where returned stock normally can't go back on the shelf, unless the cashier
// overrides it for a specific line item.
const DEFAULT_NON_RESTOCK_REASONS = new Set(["damaged", "expired"]);

export default function Returns() {
  const queryClient = useQueryClient();

  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [selectedSale, setSelectedSale] = useState<any | null>(null);
  const [returnQtys, setReturnQtys] = useState<Record<string, number>>({});
  const [restockOverrides, setRestockOverrides] = useState<Record<string, boolean>>({});
  const [reason, setReason] = useState("changed_mind");
  const [reasonNote, setReasonNote] = useState("");
  const [refundMethod, setRefundMethod] = useState("cash");

  const { data: matchingSales, isLoading: searchLoading } = useQuery({
    queryKey: ["returns-sale-search", invoiceSearch],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, invoice_number, customer_id, customer_name, total_amount, sale_date, status")
        .ilike("invoice_number", `%${invoiceSearch}%`)
        .order("sale_date", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data || [];
    },
    enabled: invoiceSearch.trim().length > 0,
  });

  const { data: saleItems, isLoading: saleItemsLoading } = useQuery({
    queryKey: ["returns-sale-items", selectedSale?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sale_items")
        .select("id, product_id, product_name, quantity, unit_price, total_price, sold_unit")
        .eq("sale_id", selectedSale.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedSale,
  });

  // Sum up anything already returned against this sale so a cashier can't accidentally
  // return the same item twice.
  const { data: priorReturnItems } = useQuery({
    queryKey: ["returns-prior-items", selectedSale?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("return_items")
        .select("sale_item_id, quantity, returns!inner(sale_id)")
        .eq("returns.sale_id", selectedSale.id);
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!selectedSale,
  });

  const { data: recentReturns } = useQuery({
    queryKey: ["recent-returns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("returns")
        .select("id, invoice_number, customer_name, reason, refund_method, refund_amount, created_at")
        .order("created_at", { ascending: false })
        .limit(15);
      if (error) throw error;
      return data || [];
    },
  });

  const alreadyReturnedByItem = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of priorReturnItems || []) {
      if (!row.sale_item_id) continue;
      map.set(row.sale_item_id, (map.get(row.sale_item_id) || 0) + Number(row.quantity));
    }
    return map;
  }, [priorReturnItems]);

  const selectSale = (sale: any) => {
    setSelectedSale(sale);
    setReturnQtys({});
    setRestockOverrides({});
    setInvoiceSearch("");
  };

  const clearSale = () => {
    setSelectedSale(null);
    setReturnQtys({});
    setRestockOverrides({});
  };

  const returnLines = useMemo(() => {
    return (saleItems || [])
      .map((item: any) => {
        const alreadyReturned = alreadyReturnedByItem.get(item.id) || 0;
        const maxReturnable = Math.max(0, Number(item.quantity) - alreadyReturned);
        const qty = Math.min(Number(returnQtys[item.id] || 0), maxReturnable);
        const restock = restockOverrides[item.id] ?? !DEFAULT_NON_RESTOCK_REASONS.has(reason);
        return { item, qty, maxReturnable, alreadyReturned, restock };
      });
  }, [saleItems, returnQtys, restockOverrides, alreadyReturnedByItem, reason]);

  const activeReturnLines = useMemo(() => returnLines.filter((l) => l.qty > 0), [returnLines]);

  const totalRefund = useMemo(
    () => activeReturnLines.reduce((sum, l) => sum + l.qty * Number(l.item.unit_price), 0),
    [activeReturnLines]
  );

  const canCreditAdjust = !!selectedSale?.customer_id;

  const processReturnMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSale) throw new Error("No sale selected");
      if (activeReturnLines.length === 0) throw new Error("Enter a quantity for at least one item");

      const { data: returnRow, error: returnError } = await supabase
        .from("returns")
        .insert({
          sale_id: selectedSale.id,
          invoice_number: selectedSale.invoice_number,
          customer_id: selectedSale.customer_id || null,
          customer_name: selectedSale.customer_name || null,
          reason,
          reason_note: reasonNote || null,
          refund_method: refundMethod,
          refund_amount: totalRefund,
        })
        .select()
        .single();
      if (returnError) throw returnError;

      const itemRows = activeReturnLines.map((l) => ({
        return_id: returnRow.id,
        sale_item_id: l.item.id,
        product_id: l.item.product_id,
        product_name: l.item.product_name,
        quantity: l.qty,
        unit_price: Number(l.item.unit_price),
        line_refund: l.qty * Number(l.item.unit_price),
        restocked: l.restock,
      }));
      const { error: itemsError } = await supabase.from("return_items").insert(itemRows);
      if (itemsError) throw itemsError;

      for (const l of activeReturnLines) {
        if (l.restock && l.item.product_id) {
          const { error: stockError } = await supabase.rpc("increment_stock", {
            p_product_id: l.item.product_id,
            p_qty: l.qty,
          });
          if (stockError) throw stockError;
        }
      }

      if (refundMethod === "credit_adjustment" && selectedSale.customer_id) {
        const { error: creditError } = await supabase.rpc("adjust_credit_balance", {
          p_customer_id: selectedSale.customer_id,
          p_delta: -totalRefund,
        });
        if (creditError) throw creditError;
      }

      return returnRow;
    },
    onSuccess: () => {
      toast.success(`Return processed — Rs. ${totalRefund.toFixed(2)} refunded`);
      clearSale();
      setReasonNote("");
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["topbar-low-stock"] });
      queryClient.invalidateQueries({ queryKey: ["low-stock"] });
      queryClient.invalidateQueries({ queryKey: ["recent-returns"] });
      queryClient.invalidateQueries({ queryKey: ["credit-customers"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to process return");
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
          Returns &amp; Refunds
        </h1>
        <p className="text-muted-foreground mt-2">Look up a past sale, select what's being returned, and record the refund.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Find a sale */}
        <Card className="glass-card border-border/50 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Search className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Find a Sale</h2>
          </div>
          <Input
            placeholder="Search by invoice number..."
            value={invoiceSearch}
            onChange={(e) => setInvoiceSearch(e.target.value)}
            className="glass border-border/50"
            autoFocus
          />

          {searchLoading && (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Searching...
            </div>
          )}

          {!searchLoading && invoiceSearch && matchingSales && matchingSales.length === 0 && (
            <p className="text-muted-foreground text-sm text-center py-8">No invoice matches "{invoiceSearch}"</p>
          )}

          {matchingSales && matchingSales.length > 0 && (
            <div className="mt-4 space-y-2 max-h-96 overflow-y-auto pr-1">
              {matchingSales.map((sale: any) => (
                <button
                  key={sale.id}
                  onClick={() => selectSale(sale)}
                  className="w-full flex items-center justify-between gap-3 p-3 glass-card glass-hover border-border/30 rounded-xl text-left"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">#{sale.invoice_number}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {sale.customer_name || "Walk-in"} · {format(new Date(sale.sale_date), "dd MMM yyyy, HH:mm")}
                    </p>
                  </div>
                  <span className="shrink-0 font-semibold text-primary">Rs. {Number(sale.total_amount).toFixed(2)}</span>
                </button>
              ))}
            </div>
          )}

          {!invoiceSearch && (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Receipt className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-muted-foreground text-sm">Type an invoice number to find a sale</p>
            </div>
          )}
        </Card>

        {/* Process return */}
        <Card className="glass-card border-border/50 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Undo2 className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Process Return</h2>
            </div>
            {selectedSale && (
              <Button variant="ghost" size="sm" onClick={clearSale} className="text-xs h-7">
                Change Sale
              </Button>
            )}
          </div>

          {!selectedSale ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Undo2 className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-muted-foreground text-sm">Select a sale on the left to begin a return</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-3 glass-card border-border/30 rounded-xl flex items-center justify-between">
                <div>
                  <p className="font-medium">#{selectedSale.invoice_number}</p>
                  <p className="text-xs text-muted-foreground">{selectedSale.customer_name || "Walk-in"}</p>
                </div>
                <span className="font-semibold text-primary">Rs. {Number(selectedSale.total_amount).toFixed(2)}</span>
              </div>

              {saleItemsLoading ? (
                <div className="flex items-center justify-center py-6 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading items...
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {returnLines.map(({ item, qty, maxReturnable, alreadyReturned, restock }) => (
                    <div key={item.id} className="p-2.5 glass-card border-border/30 rounded-xl">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{item.product_name}</p>
                          <p className="text-xs text-muted-foreground">
                            Sold {item.quantity} × Rs. {Number(item.unit_price).toFixed(2)}
                            {alreadyReturned > 0 && ` · ${alreadyReturned} already returned`}
                          </p>
                        </div>
                        <Input
                          type="number"
                          min="0"
                          max={maxReturnable}
                          step="0.01"
                          value={returnQtys[item.id] || ""}
                          onChange={(e) =>
                            setReturnQtys({ ...returnQtys, [item.id]: Math.max(0, Math.min(maxReturnable, parseFloat(e.target.value) || 0)) })
                          }
                          placeholder="0"
                          disabled={maxReturnable <= 0}
                          className="w-20 h-8 glass border-border/50 text-center shrink-0"
                        />
                      </div>
                      {qty > 0 && (
                        <label className="flex items-center gap-2 mt-2 text-xs text-muted-foreground cursor-pointer">
                          <input
                            type="checkbox"
                            checked={restock}
                            onChange={(e) => setRestockOverrides({ ...restockOverrides, [item.id]: e.target.checked })}
                            className="h-3.5 w-3.5 accent-primary rounded"
                          />
                          Add {qty} back to stock
                        </label>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Reason</Label>
                  <Select value={reason} onValueChange={setReason}>
                    <SelectTrigger className="glass border-border/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REASON_OPTIONS.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Refund Method</Label>
                  <Select value={refundMethod} onValueChange={setRefundMethod}>
                    <SelectTrigger className="glass border-border/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash Refund</SelectItem>
                      <SelectItem value="credit_adjustment" disabled={!canCreditAdjust}>
                        Credit Balance Adjustment{!canCreditAdjust ? " (no customer)" : ""}
                      </SelectItem>
                      <SelectItem value="exchange">Exchange (No Refund)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Note (optional)</Label>
                <Textarea
                  value={reasonNote}
                  onChange={(e) => setReasonNote(e.target.value)}
                  placeholder="Any extra detail about this return..."
                  className="glass border-border/50 min-h-[60px]"
                />
              </div>

              <div className="flex items-center justify-between p-3 glass-card border-border/30 rounded-xl">
                <span className="text-sm text-muted-foreground">Refund Total</span>
                <span className="font-bold text-lg text-primary">Rs. {totalRefund.toFixed(2)}</span>
              </div>

              <Button
                className="w-full bg-primary hover:bg-primary/90"
                size="lg"
                disabled={activeReturnLines.length === 0 || processReturnMutation.isPending}
                onClick={() => processReturnMutation.mutate()}
              >
                {processReturnMutation.isPending ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <Undo2 className="mr-2 h-5 w-5" />
                )}
                Process Return
              </Button>
            </div>
          )}
        </Card>
      </div>

      {/* Audit trail */}
      <Card className="glass-card border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            Recent Returns
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!recentReturns || recentReturns.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4">No returns processed yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Refund Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentReturns.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">#{r.invoice_number}</TableCell>
                    <TableCell>{r.customer_name || <span className="text-muted-foreground">Walk-in</span>}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="gap-1 text-[10px]">
                        {r.reason === "damaged" || r.reason === "expired" ? (
                          <PackageX className="h-3 w-3" />
                        ) : (
                          <PackageCheck className="h-3 w-3" />
                        )}
                        {REASON_LABELS[r.reason] || r.reason}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{REFUND_METHOD_LABELS[r.refund_method] || r.refund_method}</TableCell>
                    <TableCell className="text-right font-semibold">Rs. {Number(r.refund_amount).toFixed(2)}</TableCell>
                    <TableCell className="text-right text-muted-foreground text-sm">
                      {format(new Date(r.created_at), "dd MMM yyyy, HH:mm")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
