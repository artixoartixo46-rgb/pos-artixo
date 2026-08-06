import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Printer, Search, Trash2, Plus, Minus, QrCode, PackageSearch, Star, LayoutTemplate, SlidersHorizontal, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import QRCode from "qrcode";
import {
  QR_LABEL_TEMPLATES,
  getFavoriteTemplateId,
  setFavoriteTemplateId,
  getTemplateById,
  getTextScale,
  saveTextScale,
  getQrScale,
  saveQrScale,
  MIN_TEXT_SCALE,
  MAX_TEXT_SCALE,
  MIN_QR_SCALE,
  MAX_QR_SCALE,
  LABEL_W,
  LABEL_H,
  COLS,
  PAGE_W,
  type QRTemplateItem,
} from "@/lib/qrLabelTemplates";

type PrintQueueItem = {
  id: string;
  name: string;
  qrCodeNumber: string;
  price: number;
  quantity: number;
  qrDataUrl: string;
};

export default function BarcodePrint() {
  const [searchQuery, setSearchQuery] = useState("");
  const [printQueue, setPrintQueue] = useState<PrintQueueItem[]>([]);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState(getFavoriteTemplateId());
  const [sampleQrUrl, setSampleQrUrl] = useState("");
  const [textScale, setTextScale] = useState(getTextScale());
  const [qrScale, setQrScale] = useState(getQrScale());

  // Generate a sample QR once, used for template preview cards when the queue is empty
  useEffect(() => {
    QRCode.toDataURL(
      JSON.stringify({ type: "item", item_id: "000001", name: "Sample Product", price: 250, currency: "LKR" }),
      { width: 400, margin: 1, errorCorrectionLevel: "H" }
    ).then(setSampleQrUrl);
  }, []);

  const chooseTemplate = (id: string) => {
    setSelectedTemplateId(id);
    setFavoriteTemplateId(id);
    const tpl = getTemplateById(id);
    toast.success(`"${tpl.name}" set as your favorite print template`);
  };

  const round1 = (n: number) => Math.round(n * 10) / 10;

  const adjustTextScale = (delta: number) => {
    const next = round1(Math.min(MAX_TEXT_SCALE, Math.max(MIN_TEXT_SCALE, textScale + delta)));
    setTextScale(next);
    saveTextScale(next);
  };

  const adjustQrScale = (delta: number) => {
    const next = round1(Math.min(MAX_QR_SCALE, Math.max(MIN_QR_SCALE, qrScale + delta)));
    setQrScale(next);
    saveQrScale(next);
  };

  const resetScales = () => {
    setTextScale(1);
    setQrScale(1);
    saveTextScale(1);
    saveQrScale(1);
    toast.success("Label size reset to default");
  };

  const allTemplateCss = QR_LABEL_TEMPLATES.map((t) => t.css).join("\n");
  const scaleCss = `.qr-label-box { --qr-scale: ${qrScale}; --text-scale: ${textScale}; }`;
  const baseLabelCss = `.qr-label-box { width: ${LABEL_W}mm; height: ${LABEL_H}mm; box-sizing: border-box; overflow: hidden; font-family: Arial, Helvetica, sans-serif; background: #fff; }`;

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

  // Every template's name/line element already has white-space:nowrap + overflow:hidden +
  // text-overflow:ellipsis in CSS, which measures real font metrics at render/print time -
  // far more accurate than guessing a character-count cutoff. So just pass the name through
  // untouched and let CSS do the fitting (previously this hard-cut names way too early,
  // e.g. "Samsung Galaxy A54" -> "Samsung Galaxy..", wasting space that was actually available).
  const fitName = (name: string) => name;

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

    const template = getTemplateById(selectedTemplateId);

    // Flatten queue into individual labels (doubled for front+back)
    const allLabels: { item: PrintQueueItem }[] = [];
    for (const item of printQueue) {
      for (let i = 0; i < item.quantity; i++) {
        allLabels.push({ item });
        allLabels.push({ item }); // double-sided
      }
    }

    const labelsHtml = allLabels.map(({ item }) => {
      const templateItem: QRTemplateItem = {
        name: item.name,
        price: item.price,
        qrCodeNumber: item.qrCodeNumber,
        qrDataUrl: item.qrDataUrl,
      };
      return `<div class="qr-label-box tpl-${template.id}">${template.renderLabel(templateItem, fitName)}</div>`;
    }).join("");

    const printContent = `<!DOCTYPE html>
<html>
<head>
  <title>QR Sticker Print - ${template.name} - ${LABEL_W}x${LABEL_H}mm</title>
  <style>
    @page {
      size: ${PAGE_W}mm ${LABEL_H}mm;
      margin: 0;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: ${PAGE_W}mm;
      height: ${LABEL_H}mm;
      margin: 0 !important;
      padding: 0 !important;
      font-family: Arial, Helvetica, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      display: grid;
      grid-template-columns: repeat(${COLS}, ${LABEL_W}mm);
      grid-auto-rows: ${LABEL_H}mm;
      gap: 0;
      overflow: hidden;
    }
    .qr-label-box {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .qr-label-box img {
      image-rendering: pixelated;
      image-rendering: -moz-crisp-edges;
      image-rendering: crisp-edges;
    }
    ${baseLabelCss}
    ${allTemplateCss}
    ${scaleCss}
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
      toast.success(`Printing ${totalLabels} labels using "${template.name}" template on ${LABEL_W}×${LABEL_H}mm thermal roll (${allLabels.length} stickers, double-sided)`);
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

      {/* Shared style block for all template previews (picker + live preview) */}
      <style>{`${baseLabelCss}\n${allTemplateCss}\n${scaleCss}`}</style>

      {/* Template Picker */}
      <Card className="glass-card border-border/50 p-6">
        <div className="flex items-center gap-2 mb-4">
          <LayoutTemplate className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Label Design Templates</h2>
        </div>
        <p className="text-sm text-muted-foreground -mt-2 mb-4">
          Pick a design and it becomes your favorite — printing always uses your favorite template.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {QR_LABEL_TEMPLATES.map((template) => {
            const isSelected = template.id === selectedTemplateId;
            const previewItem: QRTemplateItem = printQueue[0]
              ? {
                  name: printQueue[0].name,
                  price: printQueue[0].price,
                  qrCodeNumber: printQueue[0].qrCodeNumber,
                  qrDataUrl: printQueue[0].qrDataUrl,
                }
              : { name: "Sample Product", price: 250, qrCodeNumber: "000001", qrDataUrl: sampleQrUrl };
            return (
              <button
                key={template.id}
                onClick={() => chooseTemplate(template.id)}
                className={`relative flex flex-col items-center gap-2 rounded-xl border p-3 text-left transition ${
                  isSelected
                    ? "border-primary ring-2 ring-primary bg-primary/5"
                    : "border-border/30 glass-card glass-hover"
                }`}
              >
                {isSelected && (
                  <span className="absolute top-1.5 right-1.5 flex items-center gap-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold px-1.5 py-0.5">
                    <Star className="h-2.5 w-2.5 fill-current" /> Favorite
                  </span>
                )}
                <div className="rounded-md overflow-hidden border border-border/20 bg-white flex items-center justify-center" style={{ width: "50mm", height: "25mm", maxWidth: "100%" }}>
                  {previewItem.qrDataUrl ? (
                    <div
                      className={`qr-label-box tpl-${template.id}`}
                      dangerouslySetInnerHTML={{ __html: template.renderLabel(previewItem, fitName) }}
                    />
                  ) : null}
                </div>
                <div className="text-center">
                  <p className="text-xs font-semibold">{template.name}</p>
                  <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{template.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Text / QR size customization — applies to whichever template is selected above,
          in both the live preview and the actual print output */}
      <Card className="glass-card border-border/50 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Customize Label Size</h2>
          </div>
          {(textScale !== 1 || qrScale !== 1) && (
            <Button variant="ghost" size="sm" onClick={resetScales} className="text-xs gap-1 h-7">
              <RotateCcw className="h-3 w-3" />
              Reset
            </Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground -mt-2 mb-4">
          Increase or decrease text size and QR code size — applies to every template and is remembered for next time.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex items-center justify-between p-3 glass-card border-border/30 rounded-xl">
            <div>
              <p className="text-sm font-medium">Text Size</p>
              <p className="text-xs text-muted-foreground">{Math.round(textScale * 100)}%</p>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8 glass"
                onClick={() => adjustTextScale(-0.1)}
                disabled={textScale <= MIN_TEXT_SCALE}
              >
                <Minus className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8 glass"
                onClick={() => adjustTextScale(0.1)}
                disabled={textScale >= MAX_TEXT_SCALE}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 glass-card border-border/30 rounded-xl">
            <div>
              <p className="text-sm font-medium">QR Code Size</p>
              <p className="text-xs text-muted-foreground">{Math.round(qrScale * 100)}%</p>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8 glass"
                onClick={() => adjustQrScale(-0.1)}
                disabled={qrScale <= MIN_QR_SCALE}
              >
                <Minus className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8 glass"
                onClick={() => adjustQrScale(0.1)}
                disabled={qrScale >= MAX_QR_SCALE}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </Card>

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

              {/* Live sticker preview — actual size, using the favorite template */}
              <div className="mt-4 p-3 rounded-xl border border-border/30 bg-white">
                <p className="text-xs text-muted-foreground mb-2 text-center">
                  Live preview · "{getTemplateById(selectedTemplateId).name}" template · actual size · double-sided
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {printQueue.slice(0, 4).map((item) => {
                    const templateItem: QRTemplateItem = {
                      name: item.name,
                      price: item.price,
                      qrCodeNumber: item.qrCodeNumber,
                      qrDataUrl: item.qrDataUrl,
                    };
                    return (
                      <div
                        key={item.id}
                        className={`qr-label-box tpl-${selectedTemplateId} border border-border/20 rounded-md overflow-hidden`}
                        dangerouslySetInnerHTML={{
                          __html: getTemplateById(selectedTemplateId).renderLabel(templateItem, fitName),
                        }}
                      />
                    );
                  })}
                </div>
                {printQueue.length > 4 && (
                  <p className="text-[11px] text-muted-foreground text-center mt-2">
                    +{printQueue.length - 4} more product{printQueue.length - 4 !== 1 ? "s" : ""} not shown in preview
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
            Print with "{getTemplateById(selectedTemplateId).name}" ({LABEL_W}×{LABEL_H}mm)
          </Button>
          <p className="text-xs text-muted-foreground text-center mt-2">
            Universal thermal sticker roll · 2 labels side-by-side · double-sided
          </p>

          <div className="mt-3 p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs leading-relaxed">
            <p className="font-semibold text-amber-700 dark:text-amber-400 mb-1">
              First time printing labels? Set this once in the print window:
            </p>
            <p className="text-muted-foreground">
              Click <span className="font-medium text-foreground">"More settings"</span> →
              set <span className="font-medium text-foreground">Margins: None</span>, turn{" "}
              <span className="font-medium text-foreground">Headers and footers: OFF</span>, and{" "}
              <span className="font-medium text-foreground">Scale: Default (100%)</span>.
              Chrome remembers this after the first print, so labels come out perfectly aligned
              from then on — without it, Chrome reserves blank space at the top for a page title/date
              that pushes your label content down.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
