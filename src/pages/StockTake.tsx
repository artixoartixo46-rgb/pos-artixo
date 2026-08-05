import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardCheck, Camera, ScanBarcode, CheckCircle2, History, Loader2, AlertTriangle, Trash2, TrendingDown } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { QRScanner } from "@/components/QRScanner";

interface ProductLookup {
  id: string;
  name: string;
  barcode: string | null;
  unit_label: string | null;
  stock_quantity: number | null;
}

async function lookupProduct(code: string): Promise<ProductLookup | null> {
  const trimmed = code.trim();
  if (!trimmed) return null;

  const { data: byBarcode } = await supabase
    .from("products")
    .select("id, name, barcode, unit_label, stock_quantity")
    .eq("barcode", trimmed)
    .limit(1);
  if (byBarcode && byBarcode.length > 0) return byBarcode[0];

  if (/^\d+$/.test(trimmed)) {
    const { data: byQr } = await supabase
      .from("products")
      .select("id, name, barcode, unit_label, stock_quantity")
      .eq("qr_code_number", trimmed)
      .limit(1);
    if (byQr && byQr.length > 0) return byQr[0];
  }
  return null;
}

export default function StockTake() {
  const queryClient = useQueryClient();
  const [locationId, setLocationId] = useState<string>("none");
  const [scanInput, setScanInput] = useState("");
  const [qtyInput, setQtyInput] = useState("1");
  const [cameraOpen, setCameraOpen] = useState(false);
  const scanInputRef = useRef<HTMLInputElement>(null);

  const { data: locations } = useQuery({
    queryKey: ["locations-for-stock-take"],
    queryFn: async () => {
      const { data, error } = await supabase.from("locations").select("id, name, code").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: activeStockTake, isLoading: activeLoading } = useQuery({
    queryKey: ["active-stock-take"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_takes")
        .select("id, location_id, started_at, locations(name)")
        .eq("status", "in_progress")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: items } = useQuery({
    queryKey: ["stock-take-items", activeStockTake?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_take_items")
        .select("id, product_id, system_qty, counted_qty, variance, products(name, unit_label, barcode)")
        .eq("stock_take_id", activeStockTake!.id)
        .order("scanned_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!activeStockTake,
  });

  const { data: pastStockTakes } = useQuery({
    queryKey: ["past-stock-takes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_takes")
        .select("id, completed_at, started_at, locations(name)")
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data as any[];
    },
  });

  // Shrinkage trend: pull every count from every *completed* stock take (not the in-progress
  // one, and not cancelled ones - those get their rows deleted via cascade) and group by
  // product, so a product that's short again and again stands out from a one-off miscount.
  const { data: shrinkageRows, isLoading: shrinkageLoading } = useQuery({
    queryKey: ["shrinkage-trend"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_take_items")
        .select("product_id, system_qty, counted_qty, variance, scanned_at, stock_takes!inner(status, completed_at), products(name, unit_label, barcode)")
        .eq("stock_takes.status", "completed")
        .order("scanned_at", { ascending: true });
      if (error) throw error;
      return data as any[];
    },
  });

  const shrinkageTrend = useMemo(() => {
    if (!shrinkageRows) return [];
    const byProduct = new Map<
      string,
      {
        productId: string;
        name: string;
        unitLabel: string;
        barcode: string | null;
        timesCounted: number;
        timesShort: number;
        totalShortQty: number;
        totalVariance: number;
        lastVariance: number;
        lastCompletedAt: string;
      }
    >();

    for (const row of shrinkageRows) {
      const variance = Number(row.variance);
      const completedAt = row.stock_takes?.completed_at || row.scanned_at;
      const existing = byProduct.get(row.product_id);
      if (existing) {
        existing.timesCounted += 1;
        if (variance < 0) {
          existing.timesShort += 1;
          existing.totalShortQty += Math.abs(variance);
        }
        existing.totalVariance += variance;
        if (completedAt >= existing.lastCompletedAt) {
          existing.lastVariance = variance;
          existing.lastCompletedAt = completedAt;
        }
      } else {
        byProduct.set(row.product_id, {
          productId: row.product_id,
          name: row.products?.name || "Unknown product",
          unitLabel: row.products?.unit_label || "pcs",
          barcode: row.products?.barcode || null,
          timesCounted: 1,
          timesShort: variance < 0 ? 1 : 0,
          totalShortQty: variance < 0 ? Math.abs(variance) : 0,
          totalVariance: variance,
          lastVariance: variance,
          lastCompletedAt: completedAt,
        });
      }
    }

    return Array.from(byProduct.values())
      .map((p) => ({
        ...p,
        shortRate: p.timesShort / p.timesCounted,
        avgVariance: p.totalVariance / p.timesCounted,
      }))
      .filter((p) => p.timesShort > 0)
      .sort((a, b) => {
        // Repeat offenders (short almost every time, counted more than once) float to the top.
        if (b.timesShort !== a.timesShort) return b.timesShort - a.timesShort;
        return b.totalShortQty - a.totalShortQty;
      });
  }, [shrinkageRows]);

  useEffect(() => {
    if (activeStockTake) scanInputRef.current?.focus();
  }, [activeStockTake, items]);

  const startMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("stock_takes")
        .insert([{ location_id: locationId === "none" ? null : locationId, status: "in_progress" }])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["active-stock-take"] });
      toast.success("Stock take started - start scanning");
    },
    onError: () => toast.error("Failed to start stock take"),
  });

  const scanMutation = useMutation({
    mutationFn: async (code: string) => {
      const qty = parseFloat(qtyInput) || 1;
      const product = await lookupProduct(code);
      if (!product) {
        throw new Error(`No product found for "${code}"`);
      }

      const { data: existing } = await supabase
        .from("stock_take_items")
        .select("id, counted_qty")
        .eq("stock_take_id", activeStockTake!.id)
        .eq("product_id", product.id)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("stock_take_items")
          .update({ counted_qty: Number(existing.counted_qty) + qty })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("stock_take_items").insert([
          {
            stock_take_id: activeStockTake!.id,
            product_id: product.id,
            system_qty: Number(product.stock_quantity ?? 0),
            counted_qty: qty,
          },
        ]);
        if (error) throw error;
      }
      return product;
    },
    onSuccess: (product) => {
      queryClient.invalidateQueries({ queryKey: ["stock-take-items", activeStockTake?.id] });
      toast.success(`${product.name} counted`);
      setScanInput("");
      scanInputRef.current?.focus();
    },
    onError: (error: Error) => {
      toast.error(error.message || "Scan failed");
      setScanInput("");
      scanInputRef.current?.focus();
    },
  });

  const updateCountMutation = useMutation({
    mutationFn: async ({ id, counted_qty }: { id: string; counted_qty: number }) => {
      const { error } = await supabase.from("stock_take_items").update({ counted_qty }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["stock-take-items", activeStockTake?.id] }),
  });

  const removeItemMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("stock_take_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["stock-take-items", activeStockTake?.id] }),
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      if (!items || items.length === 0) throw new Error("No items counted yet");
      for (const item of items) {
        const { error } = await supabase.rpc("set_stock", {
          p_product_id: item.product_id,
          p_qty: Number(item.counted_qty),
        });
        if (error) throw error;
      }
      const { error: closeError } = await supabase
        .from("stock_takes")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", activeStockTake!.id);
      if (closeError) throw closeError;
    },
    onSuccess: () => {
      toast.success("Stock adjusted to match your count");
      queryClient.invalidateQueries({ queryKey: ["active-stock-take"] });
      queryClient.invalidateQueries({ queryKey: ["past-stock-takes"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["topbar-low-stock"] });
      queryClient.invalidateQueries({ queryKey: ["low-stock"] });
    },
    onError: (error: Error) => toast.error(error.message || "Failed to apply adjustments"),
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("stock_takes").delete().eq("id", activeStockTake!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Stock take cancelled");
      queryClient.invalidateQueries({ queryKey: ["active-stock-take"] });
    },
  });

  const sortedItems = useMemo(() => {
    if (!items) return [];
    return [...items].sort((a, b) => Math.abs(Number(b.variance)) - Math.abs(Number(a.variance)));
  }, [items]);

  const totalVarianceItems = sortedItems.filter((i) => Number(i.variance) !== 0).length;

  const handleScanSubmit = () => {
    if (!scanInput.trim() || scanMutation.isPending) return;
    scanMutation.mutate(scanInput);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
          Stock Take
        </h1>
        <p className="text-muted-foreground mt-2">Scan and count physical stock, then compare against the system and fix variances.</p>
      </div>

      {activeLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : !activeStockTake ? (
        <Card className="glass-card border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-primary" />
              Start a Stock Take
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 max-w-xs">
              <Label>Location (optional)</Label>
              <Select value={locationId} onValueChange={setLocationId}>
                <SelectTrigger className="glass-input">
                  <SelectValue placeholder="No location" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No location</SelectItem>
                  {locations?.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name} ({l.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => startMutation.mutate()} disabled={startMutation.isPending} className="gap-2">
              {startMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
              Start New Stock Take
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="glass-card border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center justify-between flex-wrap gap-2">
                <span className="flex items-center gap-2">
                  <ScanBarcode className="h-5 w-5 text-primary" />
                  Scan &amp; Count
                  {activeStockTake.locations?.name && (
                    <Badge variant="secondary" className="text-xs">{activeStockTake.locations.name}</Badge>
                  )}
                </span>
                <span className="text-sm font-normal text-muted-foreground">
                  Started {format(new Date(activeStockTake.started_at), "dd MMM yyyy, HH:mm")}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-[1fr_100px_auto_auto] gap-3 items-end">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Scan barcode / QR (or type it and press Enter)</Label>
                  <Input
                    ref={scanInputRef}
                    autoFocus
                    value={scanInput}
                    onChange={(e) => setScanInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleScanSubmit();
                      }
                    }}
                    placeholder="Scan here..."
                    className="glass-input"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Qty per scan</Label>
                  <Input
                    type="number"
                    min="1"
                    value={qtyInput}
                    onChange={(e) => setQtyInput(e.target.value)}
                    className="glass-input"
                  />
                </div>
                <Button type="button" variant="outline" onClick={() => setCameraOpen(true)} className="gap-1.5">
                  <Camera className="h-4 w-4" /> Camera
                </Button>
                <Button type="button" onClick={handleScanSubmit} disabled={scanMutation.isPending} className="gap-1.5">
                  {scanMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanBarcode className="h-4 w-4" />}
                  Add
                </Button>
              </div>

              {!items || items.length === 0 ? (
                <p className="text-center text-muted-foreground text-sm py-8">
                  Nothing counted yet - scan your first item above.
                </p>
              ) : (
                <>
                  <div className="glass-card border-border/50 rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead className="text-right">System Stock</TableHead>
                          <TableHead className="text-right w-32">Counted Qty</TableHead>
                          <TableHead className="text-right">Variance</TableHead>
                          <TableHead className="w-10" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedItems.map((item) => {
                          const variance = Number(item.variance);
                          return (
                            <TableRow key={item.id}>
                              <TableCell className="font-medium">
                                {item.products?.name}
                                <p className="text-xs text-muted-foreground">{item.products?.barcode || "No barcode"}</p>
                              </TableCell>
                              <TableCell className="text-right text-muted-foreground">
                                {item.system_qty} {item.products?.unit_label || "pcs"}
                              </TableCell>
                              <TableCell className="text-right">
                                <Input
                                  type="number"
                                  defaultValue={item.counted_qty}
                                  onBlur={(e) => {
                                    const val = parseFloat(e.target.value);
                                    if (!isNaN(val) && val !== Number(item.counted_qty)) {
                                      updateCountMutation.mutate({ id: item.id, counted_qty: val });
                                    }
                                  }}
                                  className="glass-input h-8 text-right w-24 ml-auto"
                                />
                              </TableCell>
                              <TableCell className="text-right">
                                <Badge
                                  variant={variance === 0 ? "outline" : variance > 0 ? "secondary" : "destructive"}
                                  className="font-mono"
                                >
                                  {variance > 0 ? "+" : ""}
                                  {variance}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeItemMutation.mutate(item.id)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <p className="text-sm text-muted-foreground">
                      {items.length} product{items.length === 1 ? "" : "s"} counted
                      {totalVarianceItems > 0 && (
                        <span className="text-destructive font-medium"> - {totalVarianceItems} with a variance</span>
                      )}
                    </p>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending}>
                        Cancel Stock Take
                      </Button>
                      <Button onClick={() => applyMutation.mutate()} disabled={applyMutation.isPending} className="gap-1.5">
                        {applyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        Apply Adjustments &amp; Finish
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Past stock takes */}
      <Card className="glass-card border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            Past Stock Takes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!pastStockTakes || pastStockTakes.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4">No completed stock takes yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Started</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pastStockTakes.map((st) => (
                  <TableRow key={st.id}>
                    <TableCell>{st.completed_at ? format(new Date(st.completed_at), "dd MMM yyyy, HH:mm") : "-"}</TableCell>
                    <TableCell>{st.locations?.name || <span className="text-muted-foreground">No location</span>}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{format(new Date(st.started_at), "dd MMM yyyy, HH:mm")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Shrinkage trend - products that keep coming up short across multiple completed
          stock takes. A single short count can be a miscount; a repeated one is a signal. */}
      <Card className="glass-card border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-destructive" />
            Shrinkage Trend
          </CardTitle>
        </CardHeader>
        <CardContent>
          {shrinkageLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading history...
            </div>
          ) : !pastStockTakes || pastStockTakes.length < 2 ? (
            <p className="text-muted-foreground text-sm py-4">
              Complete at least 2 stock takes to start seeing repeated-shortage patterns here.
            </p>
          ) : shrinkageTrend.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4">
              No products have come up short across completed stock takes yet. Good sign.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-center">Times Counted</TableHead>
                  <TableHead className="text-center">Times Short</TableHead>
                  <TableHead className="text-right">Total Units Short</TableHead>
                  <TableHead className="text-right">Avg Variance</TableHead>
                  <TableHead className="text-right">Last Variance</TableHead>
                  <TableHead className="text-center">Flag</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shrinkageTrend.map((p) => {
                  const repeatOffender = p.timesShort >= 2 && p.shortRate >= 0.5;
                  return (
                    <TableRow key={p.productId}>
                      <TableCell>
                        <div className="font-medium">{p.name}</div>
                        {p.barcode && <div className="text-xs text-muted-foreground">{p.barcode}</div>}
                      </TableCell>
                      <TableCell className="text-center">{p.timesCounted}</TableCell>
                      <TableCell className="text-center">{p.timesShort}</TableCell>
                      <TableCell className="text-right text-destructive font-semibold">
                        -{p.totalShortQty.toLocaleString()} {p.unitLabel}
                      </TableCell>
                      <TableCell className="text-right">{p.avgVariance.toFixed(1)}</TableCell>
                      <TableCell className="text-right">{p.lastVariance}</TableCell>
                      <TableCell className="text-center">
                        {repeatOffender ? (
                          <Badge variant="destructive" className="gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            Repeat
                          </Badge>
                        ) : (
                          <Badge variant="outline">Watch</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <QRScanner
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onScan={(data) => {
          setCameraOpen(false);
          scanMutation.mutate(data);
        }}
      />
    </div>
  );
}
