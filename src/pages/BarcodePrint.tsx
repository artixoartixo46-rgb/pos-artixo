import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Printer, Search, Trash2, Plus, Minus, QrCode, PackageSearch } from "lucide-react";
import { toast } from "sonner";
import QRCode from "qrcode";

type PrintQueueItem = {
  id: string;
  name: string;
  qrCodeNumber: string;
  price: number;
  quantity: number;
  qrDataUrl: string;
};

// Universal thermal sticker roll: 2 labels side-by-side per page
const LABEL_W = 50; // mm per label
const LABEL_H = 25; // mm per label
const COLS = 2; // labels per row
const PAGE_W = LABEL_W * COLS; // 100mm wide page
const QR_SIZE_MM = 20;

export default function BarcodePrint() {
  const [searchQuery, setSearchQuery] = useState("");
  const [printQueue, setPrintQueue] = useState<PrintQueueItem[]>([]);
  const [addingId, setAddingId] = useState<string | null>(null);

  const { data: products } = useQuery({
    queryKey: ["products-label-search", searchQuery],
    queryFn: async () => {
      if (!searchQuery) return [];
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .or(`name.ilike.%${searchQuery}%,qr_code_number.ilike.%${searchQuery}%,barcode.ilike.%${searchQuery}%`)
        .order("name")
        .limit(20);
      if (error) throw error;
      return data || [];
    },
    enabled: searchQuery.length > 0,
  });

  const generateQRDataUrl = async (qrCodeNumber: string, name: string, price: number) => {
    const qrData = JSON.stringify({
      type: "item",
      item_id: qrCodeNumber,
      name,
      price,
      currency: "LKR",
    });
    return QRCode.toDataURL(qrData, { width: 400, margin: 1, errorCorrectionLevel: "H" });
  };

  // Auto-truncate long names to fit sticker width
  const fitName = (name: string, maxChars: number) => {
    if (name.length <= maxChars) return name;
    return name.substring(0, maxChars - 2) + "..";
  };

  const addToQueue = async (product: any) => {
    const existing = printQueue.find((item) => item.id === product.id);
    if (existing) {
      setPrintQueue(printQueue.map(item =>
        item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
      ));
      toast.success(`${product.name} quantity increased`);
      return;
    }

    setAddingId(product.id);
    try {
      let qrCodeNumber = product.qr_code_number;
      if (!qrCodeNumber) {
        const { data: nextQR, error: qrError } = await supabase.rpc("get_next_qr_code_number");
        if (qrError) {
          toast.error("Failed to generate QR code number");
          return;
        }
        qrCodeNumber = nextQR;
        await supabase.from("products").update({ qr_code_number: qrCodeNumber }).eq("id", product.id);
      }

      const qrDataUrl = await generateQRDataUrl(qrCodeNumber, product.name, product.price);

      setPrintQueue((prev) => [
        ...prev,
        {
          id: product.id,
          name: product.name,
          qrCodeNumber,
          price: product.price,
          quantity: 1,
          qrDataUrl,
        },
      ]);
      toast.success(`${product.name} added to print queue`);
    } finally {
      setAddingId(null);
    }
  };

  const updateQuantity = (id: string, delta: number) => {
    setPrintQueue(printQueue.map(item => {
      if (item.id !== id) return item;
      const newQty = item.quantity + delta;
      return newQty < 1 ? item : { ...item, quantity: newQty };
    }));
  };

  const removeFromQueue = (id: string) => {
    setPrintQueue(printQueue.filter((item) => item.id !== id));
  };

  const totalLabels = printQueue.reduce((sum, item) => sum + item.quantity, 0);
  const totalValue = printQueue.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const handlePrint = () => {
    if (printQueue.length === 0) {
      toast.error("No items in print queue");
      return;
    }

    // Flatten queue into individual labels (doubled for front+back)
    const allLabels: { item: PrintQueueItem }[] = [];
    for (const item of printQueue) {
      for (let i = 0; i < item.quantity; i++) {
        allLabels.push({ item });
        allLabels.push({ item }); // double-sided
      }
    }

    const labelsHtml = allLabels.map(({ item }) => {
      const displayName = fitName(item.name, 16);
      const priceText = `Rs.${item.price.toFixed(2)}`;
      return `<div class="label">
          <div class="qr-section">
            <img src="${item.qrDataUrl}" class="qr-img" />
          </div>
          <div class="info-section">
            <div class="product-name">${displayName}</div>
            <div class="product-price">${priceText}</div>
            <div class="qr-number">#${item.qrCodeNumber}</div>
          </div>
        </div>`;
    }).join("");

    const printContent = `<!DOCTYPE html>
<html>
<head>
  <title>QR Sticker Print - ${LABEL_W}x${LABEL_H}mm</title>
  <style>
    @page {
      size: ${PAGE_W}mm ${LABEL_H}mm;
      margin: 0;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: ${PAGE_W}mm;
      margin: 0;
      padding: 0;
      font-family: Arial, Helvetica, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      display: grid;
      grid-template-columns: repeat(${COLS}, ${LABEL_W}mm);
      grid-auto-rows: ${LABEL_H}mm;
      gap: 0;
    }
    .label {
      width: ${LABEL_W}mm;
      height: ${LABEL_H}mm;
      display: flex;
      align-items: center;
      padding: 1.5mm 2mm;
      overflow: hidden;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .qr-section {
      flex-shrink: 0;
      width: ${QR_SIZE_MM}mm;
      height: ${QR_SIZE_MM}mm;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .qr-img {
      width: ${QR_SIZE_MM}mm;
      height: ${QR_SIZE_MM}mm;
      display: block;
      image-rendering: pixelated;
      image-rendering: -moz-crisp-edges;
      image-rendering: crisp-edges;
    }
    .info-section {
      flex: 1;
      padding-left: 1.5mm;
      display: flex;
      flex-direction: column;
      justify-content: center;
      overflow: hidden;
      min-width: 0;
    }
    .product-name {
      font-size: 7pt;
      font-weight: bold;
      line-height: 1.15;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: #000;
    }
    .product-price {
      font-size: 9pt;
      font-weight: bold;
      color: #000;
      margin-top: 0.5mm;
    }
    .qr-number {
      font-size: 6pt;
      color: #000;
      margin-top: 0.3mm;
    }
  </style>
</head>
<body>${labelsHtml}</body>
</html>`;

    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.onload = () => {
        setTimeout(() => printWindow.print(), 300);
      };
      toast.success(`Printing ${totalLabels} labels on ${LABEL_W}×${LABEL_H}mm thermal roll (${allLabels.length} stickers, double-sided)`);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
          QR Code Sticker Print
        </h1>
        <p className="text-muted-foreground mt-2">
          Search a product, add it to the queue, then print onto a {LABEL_W}×{LABEL_H}mm thermal sticker roll.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Search & Add */}
        <Card className="glass-card border-border/50 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Search className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Search Products</h2>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Type product name, QR number, or barcode..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 glass border-border/50"
              autoFocus
            />
          </div>

          {searchQuery && products && products.length > 0 && (
            <div className="mt-4 space-y-2 max-h-80 overflow-y-auto pr-1">
              {products.map((product) => (
                <button
                  key={product.id}
                  onClick={() => addToQueue(product)}
                  disabled={addingId === product.id}
                  className="w-full flex items-center justify-between gap-3 p-3 glass-card glass-hover border-border/30 rounded-xl text-left disabled:opacity-60"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{product.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {product.qr_code_number ? `QR #${product.qr_code_number}` : "QR will be generated"} · Rs. {Number(product.price).toFixed(2)}
                    </p>
                  </div>
                  <span className="shrink-0 h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                    <Plus className="h-4 w-4" />
                  </span>
                </button>
              ))}
            </div>
          )}

          {searchQuery && products && products.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <PackageSearch className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-muted-foreground text-sm">No products match "{searchQuery}"</p>
            </div>
          )}

          {!searchQuery && (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <QrCode className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-muted-foreground text-sm">Start typing to find a product</p>
            </div>
          )}
        </Card>

        {/* Print Queue */}
        <Card className="glass-card border-border/50 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Printer className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">
                Print Queue
                {printQueue.length > 0 && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    {totalLabels} label{totalLabels !== 1 ? "s" : ""}
                  </span>
                )}
              </h2>
            </div>
            {printQueue.length > 0 && (
              <Button variant="destructive" size="sm" onClick={() => setPrintQueue([])}>
                Clear
              </Button>
            )}
          </div>

          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {printQueue.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <Printer className="h-8 w-8 text-muted-foreground/40" />
                <p className="text-muted-foreground text-sm">Click a product on the left to add it here</p>
              </div>
            ) : (
              printQueue.map((item) => (
                <div key={item.id} className="flex items-center gap-3 p-3 glass-card border-border/30 rounded-xl">
                  <img src={item.qrDataUrl} alt={`QR for ${item.name}`} className="h-10 w-10 rounded-md border border-border/40 bg-white p-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground">#{item.qrCodeNumber} · Rs. {item.price.toFixed(2)}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="icon" variant="outline" className="h-7 w-7 glass" onClick={() => updateQuantity(item.id, -1)}>
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-7 text-center text-sm font-semibold">{item.quantity}</span>
                    <Button size="icon" variant="outline" className="h-7 w-7 glass" onClick={() => updateQuantity(item.id, 1)}>
                      <Plus className="h-3 w-3" />
                    </Button>
                    <Button size="icon" variant="destructive" className="h-7 w-7 ml-1" onClick={() => removeFromQueue(item.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          {printQueue.length > 0 && (
            <>
              <div className="mt-4 flex items-center justify-between p-3 glass-card border-border/30 rounded-xl">
                <span className="text-sm text-muted-foreground">Total value</span>
                <span className="font-bold text-primary">Rs. {totalValue.toFixed(2)}</span>
              </div>

              {/* Live sticker preview */}
              <div className="mt-4 p-3 rounded-xl border border-border/30 bg-white">
                <p className="text-xs text-muted-foreground mb-2 text-center">
                  Live preview · {LABEL_W}×{LABEL_H}mm, 2 side-by-side, double-sided
                </p>
                <div className="mx-auto grid grid-cols-2 gap-0 border border-border/20 rounded-md overflow-hidden" style={{ width: "300px" }}>
                  {printQueue.slice(0, 6).flatMap((item) => [0, 1].map((side) => (
                    <div key={`${item.id}-${side}`} className="border border-border/10 flex items-center p-1 bg-white" style={{ height: "38px" }}>
                      <img src={item.qrDataUrl} alt="" className="w-8 h-8 shrink-0" />
                      <div className="pl-1 overflow-hidden flex-1">
                        <div className="text-black font-bold truncate" style={{ fontSize: "7px" }}>{fitName(item.name, 16)}</div>
                        <div className="text-black font-bold" style={{ fontSize: "8px" }}>Rs.{item.price.toFixed(2)}</div>
                        <div className="text-neutral-500" style={{ fontSize: "6px" }}>#{item.qrCodeNumber}</div>
                      </div>
                    </div>
                  )))}
                </div>
                {totalLabels * 2 > 6 && (
                  <p className="text-[11px] text-muted-foreground text-center mt-2">
                    +{totalLabels * 2 - 6} more sticker{totalLabels * 2 - 6 !== 1 ? "s" : ""} not shown in preview
                  </p>
                )}
              </div>
            </>
          )}

          <Button
            className="w-full mt-4 bg-primary hover:bg-primary/90"
            onClick={handlePrint}
            disabled={printQueue.length === 0}
            size="lg"
          >
            <Printer className="mr-2 h-5 w-5" />
            Print Thermal Stickers ({LABEL_W}×{LABEL_H}mm)
          </Button>
          <p className="text-xs text-muted-foreground text-center mt-2">
            Universal thermal sticker roll · 2 labels side-by-side · double-sided
          </p>
        </Card>
      </div>
    </div>
  );
}
