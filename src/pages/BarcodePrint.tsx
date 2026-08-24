import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Printer, Search, Trash2, Plus, Minus, QrCode, PackageSearch, Star, LayoutTemplate, SlidersHorizontal, RotateCcw, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Crosshair } from "lucide-react";
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
  getOffsetX,
  saveOffsetX,
  getOffsetY,
  saveOffsetY,
  MIN_OFFSET_MM,
  MAX_OFFSET_MM,
  OFFSET_STEP_MM,
  LABEL_W,
  LABEL_H,
  COLS,
  PAGE_W,
  type QRTemplateItem,
} from "@/lib/qrLabelTemplates";
import { isWebUSBSupported, getSavedPrinterInfo, printLabelsDirect } from "@/lib/thermalPrinter";

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
  const [offsetX, setOffsetX] = useState(getOffsetX());
  const [offsetY, setOffsetY] = useState(getOffsetY());

  // Generate a sample QR once, used for template preview cards when the queue is empty
  useEffect(() => {
    QRCode.toDataURL("000001", { width: 400, margin: 4, errorCorrectionLevel: "H" }).then(setSampleQrUrl);
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

  // Nudges the whole label grid a fixed amount every print from now on - see the comment on
  // getOffsetX/getOffsetY in qrLabelTemplates.ts for why this exists instead of relying on the
  // browser's print-dialog Margins/Scale settings.
  const adjustOffsetX = (delta: number) => {
    const next = Math.round(Math.min(MAX_OFFSET_MM, Math.max(MIN_OFFSET_MM, offsetX + delta)) * 10) / 10;
    setOffsetX(next);
    saveOffsetX(next);
  };

  const adjustOffsetY = (delta: number) => {
    const next = Math.round(Math.min(MAX_OFFSET_MM, Math.max(MIN_OFFSET_MM, offsetY + delta)) * 10) / 10;
    setOffsetY(next);
    saveOffsetY(next);
  };

  const resetOffset = () => {
    setOffsetX(0);
    setOffsetY(0);
    saveOffsetX(0);
    saveOffsetY(0);
    toast.success("Print alignment reset to center");
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

  // Printed labels encode just the plain qr_code_number - no JSON. Hardware keyboard-wedge
  // scanners emulate keystrokes, and if the scanner's configured HID keyboard layout doesn't
  // match the OS input language, JSON punctuation (quotes/colons/braces) can arrive corrupted -
  // the scanner still beeps (optical decode succeeded) but the app can't parse the result, so
  // nothing gets added to the cart. Plain digits are immune to this since number keys are
  // consistent across virtually every keyboard layout, and handleQRScan in POSTerminal.tsx
  // already has a dedicated fallback path for this exact plain-number format.
  // margin:4 is the ISO/IEC 18004 spec's recommended quiet zone (in QR modules, not px) - a
  // camera + software decoder (phone, laptop, the in-app QRScanner) can localize a QR fine even
  // with a much thinner border, but cheap handheld "universal" laser/CCD scanners rely on that
  // quiet zone to find the code at all. margin:1 (the old value) scanned fine on-screen/via
  // camera but silently failed on hardware guns - this is the fix for that.
  const generateQRDataUrl = async (qrCodeNumber: string, _name: string, _price: number) => {
    return QRCode.toDataURL(String(qrCodeNumber), { width: 400, margin: 4, errorCorrectionLevel: "H" });
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

  // Shared by the real print job and the alignment test print below. The label grid lives in its
  // own wrapper (.label-grid) with a CSS transform applying the saved X/Y offset - a transform is
  // purely a paint-time nudge, so it can't interfere with the @page pagination/sizing that makes
  // multi-row printing on a continuous thermal roll work in the first place.
  const buildPrintDocument = (items: PrintQueueItem[], template: ReturnType<typeof getTemplateById>) => {
    const allLabels: { item: PrintQueueItem }[] = [];
    for (const item of items) {
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
      overflow: hidden;
    }
    .label-grid {
      display: grid;
      grid-template-columns: repeat(${COLS}, ${LABEL_W}mm);
      grid-auto-rows: ${LABEL_H}mm;
      gap: 0;
    }
    .qr-label-box {
      page-break-inside: avoid;
      break-inside: avoid;
      /* Offset applied here, per label box, NOT as a margin on .label-grid above. A margin on
         .label-grid adds extra height to the very first row only, which knocks every row after
         it out of sync with the fixed ${LABEL_H}mm page slices Chrome cuts the print into - each
         row then straddles two physical page breaks and prints as a torn/blank sliver on two
         separate stickers instead of one whole sticker (this is what caused "prints empty" to
         come back after the alignment feature was added). Each .qr-label-box is exactly one
         page/row tall with page-break-inside: avoid, so it's never itself split across a page -
         transforming it only repaints it in a nudged spot without changing any row's height in
         the document flow, so page breaks still land exactly on row boundaries every time. */
      transform: translate(${offsetX}mm, ${offsetY}mm);
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
<body><div class="label-grid">${labelsHtml}</div></body>
</html>`;

    return { printContent, labelCount: allLabels.length };
  };

  const openPrintWindow = (printContent: string) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return false;
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.onload = () => {
      // A batch of labels can mean dozens of QR <img> data-URIs - a flat 300ms delay can fire
      // before all of them have actually decoded/painted on a slower device, which prints blank
      // stickers even though the HTML/data was correct. Wait for every image to genuinely finish
      // loading (with a safety-net timeout so a stuck image can't block printing forever).
      const images = Array.from(printWindow.document.images);
      const whenReady = Promise.all(
        images.map(
          (img) =>
            img.complete
              ? Promise.resolve()
              : new Promise<void>((resolve) => {
                  img.addEventListener("load", () => resolve(), { once: true });
                  img.addEventListener("error", () => resolve(), { once: true });
                })
        )
      );
      const timeout = new Promise<void>((resolve) => setTimeout(resolve, 2000));
      Promise.race([whenReady, timeout]).then(() => {
        setTimeout(() => printWindow.print(), 100);
      });
    };
    return true;
  };

  const handlePrint = async () => {
    if (printQueue.length === 0) {
      toast.error("No items in print queue");
      return;
    }

    // If a thermal printer is already connected (same WebUSB device used for receipts), print
    // labels the same way receipts print - raw ESC/POS text + the printer's own built-in QR
    // generator. Most 58mm thermal RECEIPT printers have no real Windows print driver, so
    // sending them an HTML page via the browser's Print dialog (the fallback below) comes out
    // as a blank sticker even though the on-screen print preview looks correct - this sidesteps
    // that entirely instead of relying on a driver that isn't really there.
    if (isWebUSBSupported() && getSavedPrinterInfo()) {
      try {
        await printLabelsDirect(
          printQueue.map((item) => ({
            name: item.name,
            price: item.price,
            qrCodeNumber: item.qrCodeNumber,
            quantity: item.quantity,
          }))
        );
        toast.success(`Printing ${totalLabels} labels directly to your connected thermal printer`);
        return;
      } catch (err: any) {
        toast.error((err?.message || "Direct print failed") + " - falling back to browser print.");
        // fall through to browser print
      }
    }

    const template = getTemplateById(selectedTemplateId);
    const { printContent, labelCount } = buildPrintDocument(printQueue, template);

    if (openPrintWindow(printContent)) {
      toast.success(`Printing ${totalLabels} labels using "${template.name}" template on ${LABEL_W}×${LABEL_H}mm thermal roll (${labelCount} stickers, double-sided)`);
    }
  };

  // Prints one row (2 labels) of dummy content so the shop can calibrate the offset above against
  // their actual printer/roll without wasting a real product sticker - print, check against the
  // physical label edge, nudge, print again, repeat until it lines up. Not applicable when
  // printing directly to a connected thermal printer (there's no sheet/offset to calibrate -
  // each label is just cut off the roll as its own strip), so this always uses browser print.
  const handleTestPrint = () => {
    const template = getTemplateById(selectedTemplateId);
    const testItem: PrintQueueItem = {
      id: "test",
      name: "Test Alignment",
      qrCodeNumber: "000001",
      price: 100,
      quantity: 1,
      qrDataUrl: sampleQrUrl,
    };
    const { printContent } = buildPrintDocument([testItem], template);
    if (openPrintWindow(printContent)) {
      toast.success("Printing test label - compare it to your sticker roll and nudge the alignment if needed");
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

      {/* Print alignment calibration — a fixed offset applied inside the printed page itself
          (not the browser print dialog), so once it's dialed in against the actual printer/roll
          it never silently drifts again. */}
      <Card className="glass-card border-border/50 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Crosshair className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Fix Print Alignment</h2>
          </div>
          {(offsetX !== 0 || offsetY !== 0) && (
            <Button variant="ghost" size="sm" onClick={resetOffset} className="text-xs gap-1 h-7">
              <RotateCcw className="h-3 w-3" />
              Reset
            </Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground -mt-2 mb-4">
          If stickers print off-center or shifted on your label printer, print a test label, check it
          against the sticker roll, and nudge until it lines up. This offset is saved in the app and
          applied to every print from now on — it stays fixed even if your browser's print settings
          reset.
        </p>
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="grid grid-cols-3 gap-1.5 place-items-center">
            <div />
            <Button size="icon" variant="outline" className="h-9 w-9 glass" onClick={() => adjustOffsetY(-OFFSET_STEP_MM)} disabled={offsetY <= MIN_OFFSET_MM} title="Nudge up">
              <ArrowUp className="h-4 w-4" />
            </Button>
            <div />
            <Button size="icon" variant="outline" className="h-9 w-9 glass" onClick={() => adjustOffsetX(-OFFSET_STEP_MM)} disabled={offsetX <= MIN_OFFSET_MM} title="Nudge left">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="text-[10px] text-center text-muted-foreground leading-tight">
              X: {offsetX > 0 ? "+" : ""}{offsetX}mm<br />Y: {offsetY > 0 ? "+" : ""}{offsetY}mm
            </div>
            <Button size="icon" variant="outline" className="h-9 w-9 glass" onClick={() => adjustOffsetX(OFFSET_STEP_MM)} disabled={offsetX >= MAX_OFFSET_MM} title="Nudge right">
              <ArrowRight className="h-4 w-4" />
            </Button>
            <div />
            <Button size="icon" variant="outline" className="h-9 w-9 glass" onClick={() => adjustOffsetY(OFFSET_STEP_MM)} disabled={offsetY >= MAX_OFFSET_MM} title="Nudge down">
              <ArrowDown className="h-4 w-4" />
            </Button>
            <div />
          </div>
          <Button variant="outline" className="glass gap-2" onClick={handleTestPrint}>
            <Printer className="h-4 w-4" />
            Print Test Label
          </Button>
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
