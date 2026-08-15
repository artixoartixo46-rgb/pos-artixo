import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Truck, ChevronDown, Trash2, PackagePlus, Loader2, QrCode, Inbox, Clock, ScanBarcode, Camera } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import QRCode from "qrcode";
import { QRScanner } from "@/components/QRScanner";
import { useHardwareScanner } from "@/hooks/useHardwareScanner";

interface LineItem {
  key: string;
  product_id: string;
  product_name: string;
  unit_label: string;
  quantity: string;
  cost_price: string;
}

// Restock-by-scan: an existing product's own printed QR label (or its barcode) is looked up the
// same way StockTake does it - by barcode first, then by qr_code_number for plain-digit codes -
// so scanning the label already stuck on the shelf/bin instantly re-selects that same product
// here instead of typing its name into the search box again.
interface ProductLookup {
  id: string;
  name: string;
  barcode: string | null;
  unit_label: string | null;
  cost: number | null;
}

async function lookupProductByCode(code: string): Promise<ProductLookup | null> {
  const trimmed = code.trim();
  if (!trimmed) return null;

  const { data: byBarcode } = await supabase
    .from("products")
    .select("id, name, barcode, unit_label, cost")
    .eq("barcode", trimmed)
    .limit(1);
  if (byBarcode && byBarcode.length > 0) return byBarcode[0];

  if (/^\d+$/.test(trimmed)) {
    const { data: byQr } = await supabase
      .from("products")
      .select("id, name, barcode, unit_label, cost")
      .eq("qr_code_number", trimmed)
      .limit(1);
    if (byQr && byQr.length > 0) return byQr[0];
  }
  return null;
}

export default function ProductReceiving() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [vendorId, setVendorId] = useState("");
  const [vendorSearchOpen, setVendorSearchOpen] = useState(false);
  const [locationId, setLocationId] = useState<string>("none");
  const [receivedDate, setReceivedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [lineItems, setLineItems] = useState<LineItem[]>([]);

  // Product picker (for adding a line item)
  const [productSearchOpen, setProductSearchOpen] = useState(false);
  const [productSearchTerm, setProductSearchTerm] = useState("");
  const [pendingProduct, setPendingProduct] = useState<{ id: string; name: string; unit_label: string; cost: number | null } | null>(null);
  const [pendingQty, setPendingQty] = useState("");
  const [pendingCost, setPendingCost] = useState("");
  const [activeCheckinId, setActiveCheckinId] = useState<string | null>(null);
  const [checkinQrOpen, setCheckinQrOpen] = useState(false);
  const [checkinQrDataUrl, setCheckinQrDataUrl] = useState("");

  // Restock-by-scan: scan a product's existing QR label/barcode to pull it straight into the
  // "Add Item" row instead of searching by name - works with a hardware keyboard-wedge scanner
  // (types into scanInput + Enter) or the phone/webcam camera via the QRScanner dialog.
  const [scanInput, setScanInput] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const qtyInputRef = useRef<HTMLInputElement>(null);

  const { data: vendors } = useQuery({
    queryKey: ["vendors-for-receiving"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vendors").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: locations } = useQuery({
    queryKey: ["locations-for-receiving"],
    queryFn: async () => {
      const { data, error } = await supabase.from("locations").select("id, name, code").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: productOptions } = useQuery({
    queryKey: ["products-for-receiving", productSearchTerm],
    queryFn: async () => {
      let query = supabase.from("products").select("id, name, barcode, unit_label, cost").order("name").limit(30);
      if (productSearchTerm) {
        query = query.or(`name.ilike.%${productSearchTerm}%,barcode.ilike.%${productSearchTerm}%`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: productSearchOpen,
  });

  const { data: receivingHistory, isLoading } = useQuery({
    queryKey: ["product-receiving"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_receiving")
        .select("id, quantity, cost_price, received_date, vendors(name), products(name, unit_label), locations(name)")
        .order("received_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: pendingCheckins, isLoading: checkinsLoading } = useQuery({
    queryKey: ["vendor-checkins-pending"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_checkins")
        .select("id, vendor_id, vendor_name, notes, checked_in_at, vendor_checkin_items(id, product_id, product_name, quantity)")
        .eq("status", "pending")
        .order("checked_in_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const selectedVendor = vendors?.find((v) => v.id === vendorId);

  const filteredHistory = (receivingHistory || []).filter((r) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      r.products?.name?.toLowerCase().includes(term) ||
      r.vendors?.name?.toLowerCase().includes(term)
    );
  });

  const resetForm = () => {
    setVendorId("");
    setLocationId("none");
    setReceivedDate(format(new Date(), "yyyy-MM-dd"));
    setLineItems([]);
    setPendingProduct(null);
    setPendingQty("");
    setPendingCost("");
    setProductSearchTerm("");
    setActiveCheckinId(null);
    setScanInput("");
  };

  // Pulls a vendor's self-reported QR check-in into the normal receiving form so staff can
  // verify quantities/cost against the physical delivery before anything touches stock.
  const loadCheckinIntoForm = async (checkin: any) => {
    const allItems = checkin.vendor_checkin_items || [];
    const catalogItems = allItems.filter((i: any) => i.product_id);
    const freeTextItems = allItems.filter((i: any) => !i.product_id);

    let costByProduct = new Map<string, number>();
    let unitByProduct = new Map<string, string>();
    const productIds = catalogItems.map((i: any) => i.product_id);
    if (productIds.length > 0) {
      const { data } = await supabase.from("products").select("id, cost, unit_label").in("id", productIds);
      for (const p of data || []) {
        costByProduct.set(p.id, Number(p.cost) || 0);
        unitByProduct.set(p.id, p.unit_label || "pcs");
      }
    }

    setVendorId(checkin.vendor_id || "");
    setReceivedDate(format(new Date(checkin.checked_in_at), "yyyy-MM-dd"));
    setActiveCheckinId(checkin.id);
    setLineItems(
      catalogItems.map((i: any) => ({
        key: `${i.id}-${Date.now()}`,
        product_id: i.product_id,
        product_name: i.product_name,
        unit_label: unitByProduct.get(i.product_id) || "pcs",
        quantity: String(i.quantity),
        cost_price: String(costByProduct.get(i.product_id) ?? ""),
      }))
    );

    if (freeTextItems.length > 0) {
      toast.info(
        `${checkin.vendor_name || "Vendor"} also mentioned: ${freeTextItems.map((i: any) => i.product_name).join(", ")} — not in your catalog, add as a new product if needed.`
      );
    }

    setIsDialogOpen(true);
  };

  const openCheckinQr = async () => {
    const url = `${window.location.origin}/vendor-checkin`;
    const dataUrl = await QRCode.toDataURL(url, { width: 400, margin: 1, errorCorrectionLevel: "M" });
    setCheckinQrDataUrl(dataUrl);
    setCheckinQrOpen(true);
  };

  const handleDialogChange = (open: boolean) => {
    if (open) {
      setIsDialogOpen(true);
    } else {
      setIsDialogOpen(false);
      resetForm();
    }
  };

  // Scanning a product's QR label/barcode pulls it straight into the "Add Item" picker - cost
  // pre-fills from that product's last known cost (editable), and focus jumps to Qty so staff
  // can just type the received quantity and hit Add, no name search needed for a re-stock.
  const scanMutation = useMutation({
    mutationFn: async (code: string) => {
      const product = await lookupProductByCode(code);
      if (!product) throw new Error(`No product found for "${code}"`);
      return product;
    },
    onSuccess: (product) => {
      setPendingProduct({ id: product.id, name: product.name, unit_label: product.unit_label || "pcs", cost: product.cost });
      setPendingCost(product.cost != null ? String(product.cost) : "");
      setScanInput("");
      toast.success(`${product.name} - enter quantity received`);
      qtyInputRef.current?.focus();
    },
    onError: (error: Error) => {
      toast.error(error.message || "Scan failed");
      setScanInput("");
      scanInputRef.current?.focus();
    },
  });

  const handleScanSubmit = () => {
    if (!scanInput.trim() || scanMutation.isPending) return;
    scanMutation.mutate(scanInput);
  };

  // Desktop presentation-mount and handheld trigger 2D scanners both work here even if focus has
  // drifted off the scan box (e.g. it jumped to Qty after the last scan, or staff tapped
  // elsewhere) - this catches the scan at the document level regardless of where it lands.
  useHardwareScanner({
    enabled: isDialogOpen && !cameraOpen,
    ignoreRefs: [scanInputRef],
    onScan: (code) => {
      if (scanMutation.isPending) return;
      scanMutation.mutate(code);
    },
  });

  const addLineItem = () => {
    if (!pendingProduct) {
      toast.error("Select a product first");
      return;
    }
    const qty = parseFloat(pendingQty);
    const cost = parseFloat(pendingCost);
    if (!qty || qty <= 0) {
      toast.error("Enter a valid quantity");
      return;
    }
    if (isNaN(cost) || cost < 0) {
      toast.error("Enter a valid cost price");
      return;
    }
    setLineItems((prev) => [
      ...prev,
      {
        key: `${pendingProduct.id}-${Date.now()}`,
        product_id: pendingProduct.id,
        product_name: pendingProduct.name,
        unit_label: pendingProduct.unit_label || "pcs",
        quantity: pendingQty,
        cost_price: pendingCost,
      },
    ]);
    setPendingProduct(null);
    setPendingQty("");
    setPendingCost("");
    setProductSearchTerm("");
  };

  const removeLineItem = (key: string) => {
    setLineItems((prev) => prev.filter((li) => li.key !== key));
  };

  const lineItemsTotal = lineItems.reduce(
    (sum, li) => sum + (parseFloat(li.quantity) || 0) * (parseFloat(li.cost_price) || 0),
    0
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!vendorId) throw new Error("Please select a vendor");
      if (lineItems.length === 0) throw new Error("Add at least one item");

      const rows = lineItems.map((li) => ({
        vendor_id: vendorId,
        product_id: li.product_id,
        quantity: parseFloat(li.quantity),
        cost_price: parseFloat(li.cost_price),
        location_id: locationId === "none" ? null : locationId,
        received_date: new Date(receivedDate).toISOString(),
      }));

      const { error: insertError } = await supabase.from("product_receiving").insert(rows);
      if (insertError) throw insertError;

      // Bump stock and refresh last cost for each received product
      for (const li of lineItems) {
        const { error: stockError } = await supabase.rpc("increment_stock", {
          p_product_id: li.product_id,
          p_qty: parseFloat(li.quantity),
        });
        if (stockError) throw stockError;

        const { error: costError } = await supabase
          .from("products")
          .update({ cost: parseFloat(li.cost_price) })
          .eq("id", li.product_id);
        if (costError) throw costError;
      }

      if (activeCheckinId) {
        const { error: checkinError } = await supabase
          .from("vendor_checkins")
          .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
          .eq("id", activeCheckinId);
        if (checkinError) throw checkinError;
      }
    },
    onSuccess: () => {
      toast.success("Stock received and inventory updated");
      queryClient.invalidateQueries({ queryKey: ["product-receiving"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["vendor-checkins-pending"] });
      handleDialogChange(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to save receiving");
    },
  });

  const dismissCheckinMutation = useMutation({
    mutationFn: async (checkinId: string) => {
      const { error } = await supabase.from("vendor_checkins").update({ status: "dismissed" }).eq("id", checkinId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendor-checkins-pending"] });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
            Product Receiving
          </h1>
          <p className="text-muted-foreground mt-2">Receive and process incoming inventory</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="glass" onClick={openCheckinQr}>
            <QrCode className="h-4 w-4 mr-2" />
            Vendor Check-in QR
          </Button>
          <Button className="bg-primary hover:bg-primary/90 text-white" onClick={() => handleDialogChange(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Receiving
          </Button>
        </div>
      </div>

      {/* Pending vendor QR check-ins - self-reported by vendors, waiting for staff to verify
          the physical delivery and confirm it into actual stock */}
      {!checkinsLoading && pendingCheckins && pendingCheckins.length > 0 && (
        <Card className="glass-card border-border/50 border-amber-500/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Inbox className="h-5 w-5 text-amber-500" />
              Pending Vendor Check-ins
              <span className="text-sm font-normal text-muted-foreground">
                {pendingCheckins.length} waiting for review
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendingCheckins.map((c: any) => (
              <div key={c.id} className="flex items-center justify-between gap-3 p-3 glass-card border-border/30 rounded-xl">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{c.vendor_name || "Unknown vendor"}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Clock className="h-3 w-3" />
                    {format(new Date(c.checked_in_at), "dd MMM yyyy, HH:mm")} ·{" "}
                    {(c.vendor_checkin_items || []).length} item{(c.vendor_checkin_items || []).length === 1 ? "" : "s"}
                  </p>
                  {c.notes && <p className="text-xs text-muted-foreground mt-0.5 italic">"{c.notes}"</p>}
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => dismissCheckinMutation.mutate(c.id)}>
                    Dismiss
                  </Button>
                  <Button size="sm" onClick={() => loadCheckinIntoForm(c)}>
                    Review &amp; Load
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="glass-card border-border/50">
        <CardHeader>
          <CardTitle>Receiving History</CardTitle>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by product or vendor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 glass border-border/50"
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : filteredHistory.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Truck className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>No receiving records found. Click "New Receiving" to create one.</p>
            </div>
          ) : (
            <div className="glass-card border-border/50 rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-center">Qty</TableHead>
                    <TableHead className="text-right">Cost/Unit</TableHead>
                    <TableHead className="text-right">Total Cost</TableHead>
                    <TableHead>Location</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredHistory.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm">
                        {r.received_date ? format(new Date(r.received_date), "dd MMM yyyy") : "-"}
                      </TableCell>
                      <TableCell>{r.vendors?.name || "-"}</TableCell>
                      <TableCell className="font-medium">{r.products?.name || "-"}</TableCell>
                      <TableCell className="text-center">
                        {r.quantity} {r.products?.unit_label || ""}
                      </TableCell>
                      <TableCell className="text-right">Rs. {Number(r.cost_price).toFixed(2)}</TableCell>
                      <TableCell className="text-right font-semibold">
                        Rs. {(Number(r.cost_price) * Number(r.quantity)).toFixed(2)}
                      </TableCell>
                      <TableCell>
                        {r.locations?.name ? (
                          <Badge variant="secondary" className="text-xs">{r.locations.name}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* New Receiving Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={handleDialogChange}>
        <DialogContent className="max-w-3xl glass-card border-border/50 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackagePlus className="h-5 w-5 text-primary" />
              New Stock Receiving
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2 md:col-span-1">
                <Label>Vendor *</Label>
                <Popover open={vendorSearchOpen} onOpenChange={setVendorSearchOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-between glass-input border-border/50">
                      <span className={selectedVendor ? "" : "text-muted-foreground"}>
                        {selectedVendor ? selectedVendor.name : "Select vendor..."}
                      </span>
                      <ChevronDown className="h-4 w-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0 w-[300px]" align="start">
                    <Command>
                      <CommandInput placeholder="Search vendors..." />
                      <CommandList>
                        <CommandEmpty>No vendors found.</CommandEmpty>
                        <CommandGroup>
                          {vendors?.map((v) => (
                            <CommandItem
                              key={v.id}
                              onSelect={() => {
                                setVendorId(v.id);
                                setVendorSearchOpen(false);
                              }}
                              className="cursor-pointer"
                            >
                              {v.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>Received Date</Label>
                <Input
                  type="date"
                  value={receivedDate}
                  onChange={(e) => setReceivedDate(e.target.value)}
                  className="glass-input"
                />
              </div>

              <div className="space-y-2">
                <Label>Location</Label>
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
            </div>

            <div className="glass-card border-border/50 rounded-lg p-4 space-y-3">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Add Item</Label>

              {/* Restock by scan: scan an already-printed QR label/barcode for a product that's
                  come back for restock and it drops straight into the picker below - a hardware
                  wedge scanner just needs this input focused (types the code + Enter), or use
                  the Camera button for a phone/webcam scan. */}
              <div className="flex gap-2">
                <Input
                  ref={scanInputRef}
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleScanSubmit();
                    }
                  }}
                  placeholder="Scan product QR/barcode to restock..."
                  className="glass-input border-border/50"
                  autoFocus
                />
                <Button type="button" variant="outline" onClick={() => setCameraOpen(true)} className="gap-1.5 shrink-0">
                  <Camera className="h-4 w-4" /> Camera
                </Button>
                <Button type="button" onClick={handleScanSubmit} disabled={scanMutation.isPending} className="gap-1.5 shrink-0">
                  {scanMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanBarcode className="h-4 w-4" />}
                  Scan
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[1fr_120px_140px_auto] gap-3 items-end">
                <div className="space-y-1.5">
                  <Popover open={productSearchOpen} onOpenChange={setProductSearchOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-between glass-input border-border/50">
                        <span className={pendingProduct ? "" : "text-muted-foreground"}>
                          {pendingProduct ? pendingProduct.name : "Select product..."}
                        </span>
                        <ChevronDown className="h-4 w-4 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="p-0 w-[320px]" align="start">
                      <Command shouldFilter={false}>
                        <CommandInput
                          placeholder="Search by name or barcode..."
                          value={productSearchTerm}
                          onValueChange={setProductSearchTerm}
                        />
                        <CommandList>
                          <CommandEmpty>No products found.</CommandEmpty>
                          <CommandGroup>
                            {productOptions?.map((p) => (
                              <CommandItem
                                key={p.id}
                                onSelect={() => {
                                  setPendingProduct({ id: p.id, name: p.name, unit_label: p.unit_label || "pcs", cost: p.cost });
                                  setPendingCost(p.cost != null ? String(p.cost) : "");
                                  setProductSearchOpen(false);
                                }}
                                className="cursor-pointer"
                              >
                                <div>
                                  <p>{p.name}</p>
                                  <p className="text-xs text-muted-foreground">{p.barcode || "No barcode"}</p>
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <Input
                  ref={qtyInputRef}
                  type="number"
                  placeholder="Qty"
                  value={pendingQty}
                  onChange={(e) => setPendingQty(e.target.value)}
                  className="glass-input"
                />
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Cost/Unit"
                  value={pendingCost}
                  onChange={(e) => setPendingCost(e.target.value)}
                  className="glass-input"
                />
                <Button type="button" onClick={addLineItem} className="gap-1.5">
                  <Plus className="h-4 w-4" /> Add
                </Button>
              </div>
            </div>

            {lineItems.length > 0 && (
              <div className="glass-card border-border/50 rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-center">Qty</TableHead>
                      <TableHead className="text-right">Cost/Unit</TableHead>
                      <TableHead className="text-right">Line Total</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lineItems.map((li) => (
                      <TableRow key={li.key}>
                        <TableCell className="font-medium">{li.product_name}</TableCell>
                        <TableCell className="text-center">
                          {li.quantity} {li.unit_label}
                        </TableCell>
                        <TableCell className="text-right">Rs. {parseFloat(li.cost_price).toFixed(2)}</TableCell>
                        <TableCell className="text-right font-semibold">
                          Rs. {((parseFloat(li.quantity) || 0) * (parseFloat(li.cost_price) || 0)).toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeLineItem(li.key)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="flex justify-end px-4 py-3 border-t border-border/50 font-semibold">
                  Total: Rs. {lineItemsTotal.toFixed(2)}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => handleDialogChange(false)} disabled={saveMutation.isPending}>
              Cancel
            </Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...
                </>
              ) : (
                <>
                  <PackagePlus className="h-4 w-4 mr-2" /> Save Receiving
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Vendor check-in QR - print/display this at the receiving counter. Any vendor's
          delivery person scans it with their own phone to self-report a delivery. */}
      <Dialog open={checkinQrOpen} onOpenChange={setCheckinQrOpen}>
        <DialogContent className="glass-card border-border/50 sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5 text-primary" />
              Vendor Check-in QR
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3 py-2">
            {checkinQrDataUrl && (
              <img src={checkinQrDataUrl} alt="Vendor check-in QR" className="w-56 h-56 rounded-lg border border-border/40 bg-white p-2" />
            )}
            <p className="text-sm text-muted-foreground text-center">
              Print this and stick it at your receiving counter. Any vendor's delivery person can scan it with their
              own phone to log what they're dropping off - no app or login needed on their end.
            </p>
          </div>
        </DialogContent>
      </Dialog>

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
