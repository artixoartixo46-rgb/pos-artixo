import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, Plus, Minus, X, ShoppingBag, QrCode, Loader2 } from "lucide-react";
import QRCode from "qrcode";
import artixoLogo from "@/assets/artixo-logo.png";

interface ListEntry {
  product_id: string;
  name: string;
  price: number;
  unit_label: string;
  qty: number;
}

function stockStatus(stock: number | null, minLevel: number | null): { label: string; variant: "default" | "secondary" | "destructive" } {
  const qty = Number(stock ?? 0);
  const min = Number(minLevel ?? 5);
  if (qty <= 0) return { label: "Out of Stock", variant: "destructive" };
  if (qty <= min) return { label: "Low Stock", variant: "secondary" };
  return { label: "In Stock", variant: "default" };
}

// Standalone, mobile-first, NO login/sidebar - a customer scans a shop-posted QR with their
// own phone and lands here to self-serve browse products/prices, especially useful when
// staff are busy. Deliberately only shows selling price + a coarse stock status (never exact
// stock numbers or cost/margin - this page is public).
export default function Catalog() {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [myList, setMyList] = useState<Record<string, ListEntry>>({});
  const [listOpen, setListOpen] = useState(false);
  const [checkoutQrUrl, setCheckoutQrUrl] = useState("");
  const [generatingQr, setGeneratingQr] = useState(false);

  const { data: categories } = useQuery({
    queryKey: ["catalog-categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("product_categories").select("id, name").order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: products, isLoading } = useQuery({
    queryKey: ["catalog-products", searchTerm, activeCategory],
    queryFn: async () => {
      let query = supabase
        .from("products")
        .select("id, name, price, unit_label, category, stock_quantity, min_stock_level")
        .order("name")
        .limit(150);
      if (searchTerm) query = query.ilike("name", `%${searchTerm}%`);
      if (activeCategory !== "all") query = query.eq("category", activeCategory);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  const listCount = useMemo(() => Object.values(myList).reduce((sum, i) => sum + i.qty, 0), [myList]);
  const listItems = useMemo(() => Object.values(myList), [myList]);

  const addToList = (p: any) => {
    setMyList((prev) => {
      const existing = prev[p.id];
      return {
        ...prev,
        [p.id]: {
          product_id: p.id,
          name: p.name,
          price: Number(p.price),
          unit_label: p.unit_label || "pcs",
          qty: (existing?.qty || 0) + 1,
        },
      };
    });
  };

  const changeQty = (productId: string, delta: number) => {
    setMyList((prev) => {
      const existing = prev[productId];
      if (!existing) return prev;
      const newQty = existing.qty + delta;
      if (newQty <= 0) {
        const { [productId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [productId]: { ...existing, qty: newQty } };
    });
  };

  const generateCheckoutQr = async () => {
    setGeneratingQr(true);
    try {
      const payload = JSON.stringify({
        type: "catalog_list",
        items: listItems.map((i) => ({ product_id: i.product_id, qty: i.qty })),
      });
      const dataUrl = await QRCode.toDataURL(payload, { width: 320, margin: 1, errorCorrectionLevel: "M" });
      setCheckoutQrUrl(dataUrl);
    } finally {
      setGeneratingQr(false);
    }
  };

  const listTotal = listItems.reduce((sum, i) => sum + i.price * i.qty, 0);

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b p-4">
        <div className="flex items-center gap-3 max-w-2xl mx-auto">
          <img src={artixoLogo} alt="Artixo" className="h-9 w-9 shrink-0" />
          <div className="min-w-0">
            <h1 className="text-lg font-bold leading-tight">Browse &amp; Price Check</h1>
            <p className="text-xs text-muted-foreground">Search products, check prices &amp; availability</p>
          </div>
        </div>
        <div className="max-w-2xl mx-auto mt-3 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search products..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 h-11"
          />
        </div>
        {categories && categories.length > 0 && (
          <div className="max-w-2xl mx-auto mt-3 flex gap-2 overflow-x-auto pb-1">
            <Button
              size="sm"
              variant={activeCategory === "all" ? "default" : "outline"}
              onClick={() => setActiveCategory("all")}
              className="shrink-0"
            >
              All
            </Button>
            {categories.map((c) => (
              <Button
                key={c.id}
                size="sm"
                variant={activeCategory === c.name ? "default" : "outline"}
                onClick={() => setActiveCategory(c.name)}
                className="shrink-0"
              >
                {c.name}
              </Button>
            ))}
          </div>
        )}
      </div>

      <div className="max-w-2xl mx-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading products...
          </div>
        ) : !products || products.length === 0 ? (
          <p className="text-center text-muted-foreground py-16">No products match your search.</p>
        ) : (
          <div className="space-y-2">
            {products.map((p) => {
              const status = stockStatus(p.stock_quantity, p.min_stock_level);
              const inList = myList[p.id];
              return (
                <div key={p.id} className="flex items-center justify-between gap-3 p-3 border rounded-xl">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{p.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-sm font-semibold text-primary">
                        Rs. {Number(p.price).toFixed(2)} / {p.unit_label || "pcs"}
                      </span>
                      <Badge variant={status.variant} className="text-[10px]">{status.label}</Badge>
                    </div>
                  </div>
                  {status.label === "Out of Stock" ? (
                    <Button size="sm" variant="outline" disabled className="shrink-0">
                      Unavailable
                    </Button>
                  ) : inList ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => changeQty(p.id, -1)}>
                        <Minus className="h-3.5 w-3.5" />
                      </Button>
                      <span className="w-6 text-center font-semibold text-sm">{inList.qty}</span>
                      <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => changeQty(p.id, 1)}>
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" onClick={() => addToList(p)} className="shrink-0 gap-1">
                      <Plus className="h-3.5 w-3.5" /> Add
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {listCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/95 backdrop-blur border-t">
          <Button
            size="lg"
            className="w-full max-w-2xl mx-auto flex h-12 gap-2"
            onClick={() => setListOpen(true)}
          >
            <ShoppingBag className="h-5 w-5" />
            My List ({listCount} item{listCount === 1 ? "" : "s"}) · Rs. {listTotal.toFixed(2)}
          </Button>
        </div>
      )}

      <Dialog open={listOpen} onOpenChange={(open) => { setListOpen(open); if (!open) setCheckoutQrUrl(""); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingBag className="h-5 w-5 text-primary" />
              My List
            </DialogTitle>
          </DialogHeader>

          {checkoutQrUrl ? (
            <div className="flex flex-col items-center gap-3 py-2">
              <img src={checkoutQrUrl} alt="Show to cashier" className="w-56 h-56 rounded-lg border bg-white p-2" />
              <p className="text-sm text-muted-foreground text-center">
                Show this to the cashier - they'll scan it to load your list straight into the bill.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {listItems.map((i) => (
                  <div key={i.product_id} className="flex items-center justify-between gap-2 p-2.5 border rounded-lg">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{i.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {i.qty} × Rs. {i.price.toFixed(2)} = Rs. {(i.qty * i.price).toFixed(2)}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0" onClick={() => setMyList((prev) => { const { [i.product_id]: _, ...rest } = prev; return rest; })}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between p-3 border rounded-xl font-semibold">
                <span>Total</span>
                <span>Rs. {listTotal.toFixed(2)}</span>
              </div>
              <Button size="lg" className="w-full h-12 gap-2" disabled={generatingQr} onClick={generateCheckoutQr}>
                {generatingQr ? <Loader2 className="h-5 w-5 animate-spin" /> : <QrCode className="h-5 w-5" />}
                Show to Cashier
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
