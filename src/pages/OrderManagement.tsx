import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ClipboardList,
  AlertTriangle,
  Building2,
  Phone,
  ChevronDown,
  Plus,
  Trash2,
  Copy,
  MessageCircle,
  Loader2,
  PackageSearch,
} from "lucide-react";
import { toast } from "sonner";
import { computeReorderSuggestions, groupSuggestionsByVendor } from "@/lib/reorderSuggestions";

interface ManualLineItem {
  key: string;
  product_id: string;
  product_name: string;
  unit_label: string;
  quantity: string;
}

// wa.me needs digits only, with country code and no leading 0 - default to Sri Lanka (+94)
// since that's this business's locale (matches the support number already used in the TopBar).
function toWhatsAppNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("94")) return digits;
  if (digits.startsWith("0")) return "94" + digits.slice(1);
  return digits;
}

function buildOrderText(
  businessName: string,
  vendorName: string,
  items: { name: string; qty: number; unit: string }[]
) {
  const lines = items.map((it, i) => `${i + 1}. ${it.name} - ${it.qty} ${it.unit}`);
  return `*Purchase Order — ${businessName}*\n\nHi ${vendorName}, please arrange the following items:\n\n${lines.join(
    "\n"
  )}\n\nPlease confirm availability and pricing. Thank you!`;
}

export default function OrderManagement() {
  const [qtyOverrides, setQtyOverrides] = useState<Record<string, string>>({});

  // Manual/custom order builder
  const [manualVendorId, setManualVendorId] = useState("");
  const [manualVendorSearchOpen, setManualVendorSearchOpen] = useState(false);
  const [manualItems, setManualItems] = useState<ManualLineItem[]>([]);
  const [productSearchOpen, setProductSearchOpen] = useState(false);
  const [productSearchTerm, setProductSearchTerm] = useState("");
  const [pendingProduct, setPendingProduct] = useState<{ id: string; name: string; unit_label: string } | null>(null);
  const [pendingQty, setPendingQty] = useState("");

  const { data: shopSettings } = useQuery({
    queryKey: ["settings-for-order"],
    queryFn: async () => {
      const { data, error } = await supabase.from("settings").select("business_name").limit(1).single();
      if (error && error.code !== "PGRST116") throw error;
      return data;
    },
  });
  const businessName = shopSettings?.business_name || "Artixo Wholesale Grocery";

  const { data: suggestions, isLoading: suggestionsLoading } = useQuery({
    queryKey: ["reorder-suggestions"],
    queryFn: computeReorderSuggestions,
  });
  const groups = groupSuggestionsByVendor(suggestions || []);

  const { data: vendors } = useQuery({
    queryKey: ["vendors-for-order"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vendors").select("id, name, phone").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: productOptions } = useQuery({
    queryKey: ["products-for-order", productSearchTerm],
    queryFn: async () => {
      let query = supabase.from("products").select("id, name, barcode, unit_label").order("name").limit(30);
      if (productSearchTerm) {
        query = query.or(`name.ilike.%${productSearchTerm}%,barcode.ilike.%${productSearchTerm}%`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: productSearchOpen,
  });

  const manualVendor = vendors?.find((v) => v.id === manualVendorId);

  const getQty = (productId: string, fallback: number) => {
    const override = qtyOverrides[productId];
    return override !== undefined ? override : String(fallback);
  };

  const shareToVendor = (vendorName: string, phone: string | null, items: { name: string; qty: number; unit: string }[]) => {
    if (items.length === 0) {
      toast.error("No items to share");
      return;
    }
    if (!phone) {
      toast.error("This vendor has no phone number on record. Add one from the Vendors page.");
      return;
    }
    const text = buildOrderText(businessName, vendorName, items);
    const waNumber = toWhatsAppNumber(phone);
    window.open(`https://wa.me/${waNumber}?text=${encodeURIComponent(text)}`, "_blank");
  };

  const copyOrderText = async (vendorName: string, items: { name: string; qty: number; unit: string }[]) => {
    if (items.length === 0) {
      toast.error("No items to copy");
      return;
    }
    const text = buildOrderText(businessName, vendorName, items);
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Order text copied to clipboard");
    } catch {
      toast.error("Couldn't copy - your browser blocked clipboard access");
    }
  };

  const addManualItem = () => {
    if (!pendingProduct) {
      toast.error("Select a product first");
      return;
    }
    const qty = parseFloat(pendingQty);
    if (!qty || qty <= 0) {
      toast.error("Enter a valid quantity");
      return;
    }
    setManualItems((prev) => [
      ...prev,
      {
        key: `${pendingProduct.id}-${Date.now()}`,
        product_id: pendingProduct.id,
        product_name: pendingProduct.name,
        unit_label: pendingProduct.unit_label || "pcs",
        quantity: pendingQty,
      },
    ]);
    setPendingProduct(null);
    setPendingQty("");
    setProductSearchTerm("");
  };

  const removeManualItem = (key: string) => {
    setManualItems((prev) => prev.filter((li) => li.key !== key));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
          Order Management
        </h1>
        <p className="text-muted-foreground mt-2">
          Auto-detected low stock, grouped by vendor - review the quantity and send the order straight to WhatsApp.
        </p>
      </div>

      {/* Auto-detected low stock, grouped by vendor */}
      <Card className="glass-card border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Low Stock — Suggested Orders
          </CardTitle>
        </CardHeader>
        <CardContent>
          {suggestionsLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : groups.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4">Nothing needs reordering right now — stock looks healthy.</p>
          ) : (
            <div className="space-y-6">
              {groups.map(([vendorId, group]) => {
                const orderItems = group.items.map((item) => ({
                  name: item.name,
                  qty: parseFloat(getQty(item.productId, item.suggestedQty)) || 0,
                  unit: item.unitLabel,
                }));
                const totalCost = group.items.reduce((sum, item) => {
                  const qty = parseFloat(getQty(item.productId, item.suggestedQty)) || 0;
                  const unitCost = item.estimatedCost != null && item.suggestedQty > 0 ? item.estimatedCost / item.suggestedQty : 0;
                  return sum + qty * unitCost;
                }, 0);

                return (
                  <div key={vendorId} className="glass-card border-border/50 rounded-lg p-4">
                    <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-primary" />
                        <p className="font-semibold">{group.vendorName}</p>
                        {group.vendorPhone && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Phone className="h-3 w-3" /> {group.vendorPhone}
                          </span>
                        )}
                        {!group.vendorPhone && (
                          <Badge variant="outline" className="text-[10px]">No phone on record</Badge>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => copyOrderText(group.vendorName, orderItems)} className="gap-1.5">
                          <Copy className="h-3.5 w-3.5" /> Copy
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => shareToVendor(group.vendorName, group.vendorPhone, orderItems)}
                          disabled={!group.vendorPhone}
                          className="gap-1.5 bg-[#25D366] hover:bg-[#1fbd5a] text-white"
                        >
                          <MessageCircle className="h-3.5 w-3.5" /> Share via WhatsApp
                        </Button>
                      </div>
                    </div>

                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead className="text-right">Stock Left</TableHead>
                          <TableHead className="text-right">Suggested</TableHead>
                          <TableHead className="text-right w-32">Order Qty</TableHead>
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
                            <TableCell className="text-right text-muted-foreground">
                              {item.stockQuantity} {item.unitLabel}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {item.suggestedQty} {item.unitLabel}
                            </TableCell>
                            <TableCell className="text-right">
                              <Input
                                type="number"
                                min="0"
                                value={getQty(item.productId, item.suggestedQty)}
                                onChange={(e) => setQtyOverrides((prev) => ({ ...prev, [item.productId]: e.target.value }))}
                                className="glass-input h-8 text-right w-24 ml-auto"
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {totalCost > 0 && (
                      <p className="text-xs text-muted-foreground text-right mt-2">Est. cost: Rs. {totalCost.toFixed(2)}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Manual custom order */}
      <Card className="glass-card border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            Create a Custom Order
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 max-w-sm">
            <Label>Vendor</Label>
            <Popover open={manualVendorSearchOpen} onOpenChange={setManualVendorSearchOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-between glass-input border-border/50">
                  <span className={manualVendor ? "" : "text-muted-foreground"}>
                    {manualVendor ? manualVendor.name : "Select vendor..."}
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
                        <CommandItem key={v.id} onSelect={() => { setManualVendorId(v.id); setManualVendorSearchOpen(false); }} className="cursor-pointer">
                          {v.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="glass-card border-border/50 rounded-lg p-4 space-y-3">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Add Item</Label>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_120px_auto] gap-3 items-end">
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
                    <CommandInput placeholder="Search by name or barcode..." value={productSearchTerm} onValueChange={setProductSearchTerm} />
                    <CommandList>
                      <CommandEmpty>No products found.</CommandEmpty>
                      <CommandGroup>
                        {productOptions?.map((p) => (
                          <CommandItem
                            key={p.id}
                            onSelect={() => {
                              setPendingProduct({ id: p.id, name: p.name, unit_label: p.unit_label || "pcs" });
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
              <Input type="number" placeholder="Qty" value={pendingQty} onChange={(e) => setPendingQty(e.target.value)} className="glass-input" />
              <Button type="button" onClick={addManualItem} className="gap-1.5">
                <Plus className="h-4 w-4" /> Add
              </Button>
            </div>
          </div>

          {manualItems.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <PackageSearch className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Add items above to build a custom order for this vendor.</p>
            </div>
          ) : (
            <>
              <div className="glass-card border-border/50 rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {manualItems.map((li) => (
                      <TableRow key={li.key}>
                        <TableCell className="font-medium">{li.product_name}</TableCell>
                        <TableCell className="text-right">
                          {li.quantity} {li.unit_label}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeManualItem(li.key)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  className="gap-1.5"
                  onClick={() =>
                    copyOrderText(
                      manualVendor?.name || "Vendor",
                      manualItems.map((li) => ({ name: li.product_name, qty: parseFloat(li.quantity) || 0, unit: li.unit_label }))
                    )
                  }
                >
                  <Copy className="h-3.5 w-3.5" /> Copy
                </Button>
                <Button
                  className="gap-1.5 bg-[#25D366] hover:bg-[#1fbd5a] text-white"
                  disabled={!manualVendor}
                  onClick={() =>
                    shareToVendor(
                      manualVendor?.name || "Vendor",
                      manualVendor?.phone || null,
                      manualItems.map((li) => ({ name: li.product_name, qty: parseFloat(li.quantity) || 0, unit: li.unit_label }))
                    )
                  }
                >
                  <MessageCircle className="h-3.5 w-3.5" /> Share via WhatsApp
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
