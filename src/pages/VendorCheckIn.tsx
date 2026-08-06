import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown, Plus, Trash2, Truck, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import artixoLogo from "@/assets/artixo-logo.png";

interface PendingItem {
  key: string;
  product_id: string | null;
  product_name: string;
  quantity: string;
}

// Standalone, mobile-first, NO login/sidebar - a vendor's delivery person scans a QR posted
// at the shop's receiving counter with their own phone and lands directly here. They log what
// they're delivering; this just creates a "pending" claim with an automatic timestamp - shop
// staff still verify the physical goods on the Product Receiving page before stock changes.
export default function VendorCheckIn() {
  const [vendorId, setVendorId] = useState("");
  const [vendorSearchOpen, setVendorSearchOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<PendingItem[]>([]);

  const [productSearchOpen, setProductSearchOpen] = useState(false);
  const [productSearchTerm, setProductSearchTerm] = useState("");
  const [pendingProduct, setPendingProduct] = useState<{ id: string; name: string; unit_label: string } | null>(null);
  const [pendingQty, setPendingQty] = useState("");
  const [freeTextItem, setFreeTextItem] = useState("");

  const [submitted, setSubmitted] = useState(false);

  const { data: vendors } = useQuery({
    queryKey: ["vendor-checkin-vendors"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vendors").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: productOptions } = useQuery({
    queryKey: ["vendor-checkin-products", productSearchTerm],
    queryFn: async () => {
      let query = supabase.from("products").select("id, name, barcode, unit_label").order("name").limit(30);
      if (productSearchTerm) query = query.or(`name.ilike.%${productSearchTerm}%,barcode.ilike.%${productSearchTerm}%`);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: productSearchOpen,
  });

  const selectedVendor = vendors?.find((v) => v.id === vendorId);

  const addFromCatalog = () => {
    if (!pendingProduct) {
      toast.error("Select a product first");
      return;
    }
    const qty = parseFloat(pendingQty);
    if (!qty || qty <= 0) {
      toast.error("Enter a valid quantity");
      return;
    }
    setItems((prev) => [
      ...prev,
      { key: `${pendingProduct.id}-${Date.now()}`, product_id: pendingProduct.id, product_name: pendingProduct.name, quantity: pendingQty },
    ]);
    setPendingProduct(null);
    setPendingQty("");
    setProductSearchTerm("");
  };

  const addFreeText = () => {
    if (!freeTextItem.trim()) return;
    setItems((prev) => [...prev, { key: `free-${Date.now()}`, product_id: null, product_name: freeTextItem.trim(), quantity: "1" }]);
    setFreeTextItem("");
  };

  const removeItem = (key: string) => setItems((prev) => prev.filter((i) => i.key !== key));

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!vendorId) throw new Error("Please select who you are");
      if (items.length === 0) throw new Error("Add at least one item you're delivering");

      const { data: checkin, error: checkinError } = await supabase
        .from("vendor_checkins")
        .insert({
          vendor_id: vendorId,
          vendor_name: selectedVendor?.name || null,
          notes: notes || null,
          status: "pending",
        })
        .select()
        .single();
      if (checkinError) throw checkinError;

      const rows = items.map((i) => ({
        checkin_id: checkin.id,
        product_id: i.product_id,
        product_name: i.product_name,
        quantity: parseFloat(i.quantity) || 1,
      }));
      const { error: itemsError } = await supabase.from("vendor_checkin_items").insert(rows);
      if (itemsError) throw itemsError;
    },
    onSuccess: () => setSubmitted(true),
    onError: (error: any) => toast.error(error.message || "Failed to check in"),
  });

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="max-w-sm w-full text-center space-y-4">
          <CheckCircle2 className="h-16 w-16 text-primary mx-auto" />
          <h1 className="text-2xl font-bold">Checked In!</h1>
          <p className="text-muted-foreground">
            Thanks{selectedVendor ? `, ${selectedVendor.name}` : ""}. Shop staff will verify the delivery shortly. You can close this page now.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <div className="max-w-md mx-auto space-y-5">
        <div className="flex flex-col items-center text-center gap-2 pt-4">
          <img src={artixoLogo} alt="Artixo" className="h-12 w-12" />
          <h1 className="text-2xl font-bold">Delivery Check-In</h1>
          <p className="text-sm text-muted-foreground">Tell us who you are and what you're dropping off.</p>
        </div>

        <div className="space-y-2">
          <Label>Who are you? *</Label>
          <Popover open={vendorSearchOpen} onOpenChange={setVendorSearchOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-between h-12 text-base">
                <span className={selectedVendor ? "" : "text-muted-foreground"}>
                  {selectedVendor ? selectedVendor.name : "Select your business..."}
                </span>
                <ChevronDown className="h-4 w-4 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0 w-[92vw] max-w-md" align="start">
              <Command>
                <CommandInput placeholder="Search..." />
                <CommandList>
                  <CommandEmpty>No match found.</CommandEmpty>
                  <CommandGroup>
                    {vendors?.map((v) => (
                      <CommandItem key={v.id} onSelect={() => { setVendorId(v.id); setVendorSearchOpen(false); }} className="cursor-pointer py-3">
                        {v.name}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        <div className="border rounded-xl p-4 space-y-3">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">What are you delivering?</Label>

          <Popover open={productSearchOpen} onOpenChange={setProductSearchOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-between h-11">
                <span className={pendingProduct ? "" : "text-muted-foreground"}>
                  {pendingProduct ? pendingProduct.name : "Search a product..."}
                </span>
                <ChevronDown className="h-4 w-4 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0 w-[92vw] max-w-md" align="start">
              <Command shouldFilter={false}>
                <CommandInput placeholder="Search by name..." value={productSearchTerm} onValueChange={setProductSearchTerm} />
                <CommandList>
                  <CommandEmpty>No products found.</CommandEmpty>
                  <CommandGroup>
                    {productOptions?.map((p) => (
                      <CommandItem
                        key={p.id}
                        onSelect={() => { setPendingProduct({ id: p.id, name: p.name, unit_label: p.unit_label || "pcs" }); setProductSearchOpen(false); }}
                        className="cursor-pointer py-3"
                      >
                        {p.name}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          <div className="flex gap-2">
            <Input type="number" placeholder="Qty" value={pendingQty} onChange={(e) => setPendingQty(e.target.value)} className="h-11" />
            <Button type="button" onClick={addFromCatalog} className="h-11 gap-1.5 shrink-0">
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>

          <div className="text-xs text-muted-foreground text-center">or, if it's not in the catalog</div>

          <div className="flex gap-2">
            <Input placeholder="Item name (e.g. new product)" value={freeTextItem} onChange={(e) => setFreeTextItem(e.target.value)} className="h-11" />
            <Button type="button" variant="outline" onClick={addFreeText} className="h-11 gap-1.5 shrink-0">
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>
        </div>

        {items.length > 0 && (
          <div className="border rounded-xl divide-y">
            {items.map((i) => (
              <div key={i.key} className="flex items-center justify-between p-3">
                <div>
                  <p className="font-medium text-sm">{i.product_name}</p>
                  <p className="text-xs text-muted-foreground">Qty: {i.quantity}</p>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeItem(i.key)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2">
          <Label>Notes (optional)</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything the shop should know..." className="min-h-[70px]" />
        </div>

        <Button
          size="lg"
          className="w-full h-12 text-base gap-2"
          disabled={submitMutation.isPending}
          onClick={() => submitMutation.mutate()}
        >
          {submitMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Truck className="h-5 w-5" />}
          Check In Delivery
        </Button>
      </div>
    </div>
  );
}
