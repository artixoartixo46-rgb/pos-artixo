import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Printer, Search, Trash2, Plus, Minus } from "lucide-react";
import { toast } from "sonner";
import QRCode from "qrcode";

type PrintQueueItem = {
  id: string;
  name: string;
  qrCodeNumber: string;
  price: number;
  quantity: number;
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

  const addToQueue = async (product: any) => {
    const existing = printQueue.find((item) => item.id === product.id);
    if (existing) {
      setPrintQueue(printQueue.map(item =>
        item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
      ));
      toast.success(`${product.name} quantity increased`);
      return;
    }

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

    setPrintQueue([
      ...printQueue,
      {
        id: product.id,
        name: product.name,
        qrCodeNumber,
        price: product.price,
        quantity: 1,
      },
    ]);
    toast.success(`${product.name} added to print queue`);
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

  const generateQRDataUrl = async (item: PrintQueueItem) => {
    const qrData = JSON.stringify({
      type: "item",
      item_id: item.qrCodeNumber,
      name: item.name,
      price: item.price,
      currency: "LKR",
    });
    return QRCode.toDataURL(qrData, { width: 600, margin: 1, errorCorrectionLevel: "H" });
  };

  // Auto-truncate long names to fit sticker width
  const fitName = (name: string, maxChars: number) => {
    if (name.length <= maxChars) return name;
    return name.substring(0, maxChars - 2) + "..";
  };

  const handlePrint = async () => {
    if (printQueue.length === 0) {
      toast.error("No items in print queue");
      return;
    }

    toast.info("Generating labels...");

    // Pre-generate all QR code data URLs
    const qrMap: Record<string, string> = {};
    for (const item of printQueue) {
      qrMap[item.id] = await generateQRDataUrl(item);
    }

    // Flatten queue into individual labels (doubled for front+back)
    const allLabels: { item: PrintQueueItem; qrUrl: string }[] = [];
    for (const item of printQueue) {
      for (let i = 0; i < item.quantity; i++) {
        allLabels.push({ item, qrUrl: qrMap[item.id] });
        allLabels.push({ item, qrUrl: qrMap[item.id] }); // double-sided
      }
    }

    // Build labels - rendered in a grid (2 side-by-side per row)
    const labelsHtml = allLabels.map(({ item, qrUrl }) => {
      const displayName = fitName(item.name, 16);
      const priceText = `Rs.${item.price.toFixed(2)}`;
      return `<div class="label">
          <div class="qr-section">
            <img src="${qrUrl}" class="qr-img" />
          </div>
          <div class="info-section">
            <div class="product-name">${displayName}</div>
            <div class="product-price">${priceText}</div>
            <div class="qr-number">#${item.qrCodeNumber}</div>
          </div>
        </div>`;
    }).join("");

    const totalLabels = printQueue.reduce((sum, item) => sum + item.quantity, 0);

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
        <h1 className="text-3xl font-bold neon-text">
          QR Code Sticker Print
        </h1>
        <p className="text-muted-foreground mt-2">
          Search product → Add to queue → Print A4 sticker sheets (2×8 grid)
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Search & Add */}
        <Card className="p-6 glass neon-border">
          <Label className="text-lg font-semibold mb-4 block neon-text">Search Products</Label>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Type product name, QR number, or barcode..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              autoFocus
            />
          </div>

          {searchQuery && products && products.length > 0 && (
            <div className="mt-4 space-y-2 max-h-72 overflow-y-auto">
              {products.map((product) => (
                <div
                  key={product.id}
                  className="flex items-center justify-between p-3 bg-background/50 rounded-lg hover:bg-background/80 transition-colors cursor-pointer"
                  onClick={() => addToQueue(product)}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{product.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {product.qr_code_number ? `QR: ${product.qr_code_number}` : "QR: Auto"} • LKR {product.price}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" className="ml-2 shrink-0">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {searchQuery && products && products.length === 0 && (
            <p className="text-muted-foreground text-center py-6 text-sm">No products found</p>
          )}
        </Card>

        {/* Print Queue */}
        <Card className="p-6 glass neon-border">
          <div className="flex items-center justify-between mb-4">
            <Label className="text-lg font-semibold neon-text">
              Print Queue ({printQueue.reduce((s, i) => s + i.quantity, 0)} labels)
            </Label>
            {printQueue.length > 0 && (
              <Button variant="destructive" size="sm" onClick={() => setPrintQueue([])}>
                Clear
              </Button>
            )}
          </div>

          <div className="space-y-3 max-h-72 overflow-y-auto">
            {printQueue.length === 0 ? (
              <p className="text-muted-foreground text-center py-8 text-sm">
                Click a product to add it to the print queue
              </p>
            ) : (
              printQueue.map((item) => (
                <div key={item.id} className="flex items-center gap-3 p-3 bg-background/50 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground">QR: {item.qrCodeNumber} • Rs.{item.price}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => updateQuantity(item.id, -1)}>
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => updateQuantity(item.id, 1)}>
                      <Plus className="h-3 w-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeFromQueue(item.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Print Preview - Thermal Roll Sample */}
          {printQueue.length > 0 && (
            <div className="mt-4 p-3 rounded-lg border border-border/30 bg-white">
              <p className="text-xs text-muted-foreground mb-2 text-center">Sticker Preview (2 × 50×25mm side-by-side)</p>
              <div className="mx-auto grid grid-cols-2 gap-0" style={{ width: "300px" }}>
                {printQueue.slice(0, 6).flatMap((item, idx) => [0, 1].map((side) => (
                  <div key={`${idx}-${side}`} className="border border-muted flex items-center p-1" style={{ height: "38px" }}>
                    <div className="w-8 h-8 shrink-0 bg-muted rounded-sm flex items-center justify-center text-foreground" style={{ fontSize: "6px" }}>QR</div>
                    <div className="pl-1 overflow-hidden flex-1">
                      <div className="text-foreground font-bold truncate" style={{ fontSize: "7px" }}>{item.name.substring(0, 14)}</div>
                      <div className="text-foreground font-bold" style={{ fontSize: "8px" }}>Rs.{item.price.toFixed(2)}</div>
                      <div className="text-muted-foreground" style={{ fontSize: "6px" }}>#{item.qrCodeNumber}</div>
                    </div>
                  </div>
                )))}
              </div>
            </div>
          )}

          <Button
            className="w-full mt-4 neon-glow"
            onClick={handlePrint}
            disabled={printQueue.length === 0}
            size="lg"
          >
            <Printer className="mr-2 h-5 w-5" />
            Print Thermal Stickers (50×25mm)
          </Button>
          <p className="text-xs text-muted-foreground text-center mt-2">
            Universal thermal sticker • 2 labels side-by-side • Double-sided
          </p>
        </Card>
      </div>
    </div>
  );
}
