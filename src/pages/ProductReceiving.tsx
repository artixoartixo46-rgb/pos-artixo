import { useState } from "react";
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
import { Plus, Search, Truck, ChevronDown, Trash2, PackagePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface LineItem {
  key: string;
  product_id: string;
  product_name: string;
  unit_label: string;
  quantity: string;
  cost_price: string;
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
  };

  const handleDialogChange = (open: boolean) => {
    if (open) {
      setIsDialogOpen(true);
    } else {
      setIsDialogOpen(false);
      resetForm();
    }
  };

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
    },
    onSuccess: () => {
      toast.success("Stock received and inventory updated");
      queryClient.invalidateQueries({ queryKey: ["product-receiving"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      handleDialogChange(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to save receiving");
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
        <Button className="bg-primary hover:bg-primary/90 text-white" onClick={() => handleDialogChange(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Receiving
        </Button>
      </div>

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
    </div>
  );
}
