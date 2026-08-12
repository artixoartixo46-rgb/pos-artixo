import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Settings, Save, Printer, Usb, CheckCircle2, XCircle, QrCode, Wallet, Database, Download } from "lucide-react";
import { toast } from "sonner";
import QRCodeLib from "qrcode";
import artixoLogo from "@/assets/artixo-logo.png";
import {
  isWebUSBSupported,
  getSavedPrinterInfo,
  getConnectedPrinter,
  requestAndSavePrinter,
  forgetPrinter,
  getPaperWidth,
  setPaperWidth,
  isAutoDirectPrintEnabled,
  setAutoDirectPrintEnabled,
  isAutoOpenDrawerEnabled,
  setAutoOpenDrawerEnabled,
  isDigitalReceiptModeEnabled,
  setDigitalReceiptModeEnabled,
  openCashDrawer,
  printTestReceipt,
} from "@/lib/thermalPrinter";

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    business_name: "",
    address: "",
    phone: "",
    currency: "LKR",
    currency_symbol: "Rs.",
    tax_rate: "0",
  });

  const { isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("settings")
        .select("*")
        .limit(1)
        .single();
      if (error && error.code !== "PGRST116") throw error;
      if (data) {
        setFormData({
          business_name: data.business_name || "",
          address: data.address || "",
          phone: data.phone || "",
          currency: data.currency || "LKR",
          currency_symbol: data.currency_symbol || "Rs.",
          tax_rate: data.tax_rate?.toString() || "0",
        });
      }
      return data;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { data: existing } = await supabase.from("settings").select("id").limit(1).single();
      
      if (existing) {
        const { error } = await supabase
          .from("settings")
          .update({ ...data, tax_rate: parseFloat(data.tax_rate) })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("settings")
          .insert([{ ...data, tax_rate: parseFloat(data.tax_rate) }]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Settings saved successfully");
    },
    onError: () => toast.error("Failed to save settings"),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(formData);
  };

  // ---- Receipt printer (WebUSB direct ESC/POS) ----
  const webUSBSupported = isWebUSBSupported();
  const [printerInfo, setPrinterInfo] = useState(getSavedPrinterInfo());
  const [printerConnected, setPrinterConnected] = useState(false);
  const [paperWidth, setPaperWidthState] = useState<58 | 80>(getPaperWidth());
  const [autoDirectPrint, setAutoDirectPrintState] = useState(isAutoDirectPrintEnabled());
  const [autoOpenDrawer, setAutoOpenDrawerState] = useState(isAutoOpenDrawerEnabled());
  const [digitalReceiptMode, setDigitalReceiptModeState] = useState(isDigitalReceiptModeEnabled());
  const [connecting, setConnecting] = useState(false);
  const [testPrinting, setTestPrinting] = useState(false);
  const [openingDrawer, setOpeningDrawer] = useState(false);

  useEffect(() => {
    if (!webUSBSupported || !printerInfo) return;
    getConnectedPrinter()
      .then((device) => setPrinterConnected(!!device))
      .catch(() => setPrinterConnected(false));
  }, [webUSBSupported, printerInfo]);

  const handleConnectPrinter = async () => {
    setConnecting(true);
    try {
      const info = await requestAndSavePrinter();
      setPrinterInfo(info);
      setPrinterConnected(true);
      toast.success(`Connected to ${info.name || "thermal printer"}`);
    } catch (err: any) {
      toast.error(err?.message || "Could not connect to printer");
    } finally {
      setConnecting(false);
    }
  };

  const handleForgetPrinter = () => {
    forgetPrinter();
    setPrinterInfo(null);
    setPrinterConnected(false);
    toast.success("Printer disconnected");
  };

  const handleTestPrint = async () => {
    setTestPrinting(true);
    try {
      await printTestReceipt(formData.business_name);
      toast.success("Test receipt sent to printer");
    } catch (err: any) {
      toast.error(err?.message || "Test print failed");
    } finally {
      setTestPrinting(false);
    }
  };

  const handleOpenDrawer = async () => {
    setOpeningDrawer(true);
    try {
      await openCashDrawer();
      toast.success("Drawer kick sent");
    } catch (err: any) {
      toast.error(err?.message || "Could not open drawer - check it's wired into the printer's drawer port");
    } finally {
      setOpeningDrawer(false);
    }
  };

  // ---- Customer catalog QR ----
  const [catalogQrOpen, setCatalogQrOpen] = useState(false);
  const [catalogQrDataUrl, setCatalogQrDataUrl] = useState("");

  const openCatalogQr = async () => {
    const url = `${window.location.origin}/catalog`;
    const dataUrl = await QRCodeLib.toDataURL(url, { width: 400, margin: 1, errorCorrectionLevel: "M" });
    setCatalogQrDataUrl(dataUrl);
    setCatalogQrOpen(true);
  };

  // Opens a print-ready A5 poster (not a thermal label - this is meant to be printed on a
  // regular printer and posted at the counter/shelves for customers to scan).
  const printCatalogQr = () => {
    if (!catalogQrDataUrl) return;
    const shopName = formData.business_name || "Artixo POS";
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const printContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Catalog QR - ${shopName}</title>
  <style>
    @page { size: A5 portrait; margin: 0; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      width: 148mm;
      height: 210mm;
      font-family: 'Segoe UI', Arial, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 14mm;
    }
    .logo { width: 22mm; height: 22mm; margin-bottom: 5mm; object-fit: contain; }
    .shop-name { font-size: 13pt; font-weight: 600; color: #6d28d9; margin: 0 0 8mm; letter-spacing: 0.5px; }
    h1 { font-size: 20pt; margin: 0 0 3mm; color: #1e1b4b; line-height: 1.3; }
    p.sub { font-size: 11pt; color: #666; margin: 0 0 9mm; }
    .qr-box { width: 85mm; height: 85mm; padding: 5mm; border: 2px solid #e5e0f5; border-radius: 6mm; }
    .qr-box img { width: 100%; height: 100%; display: block; }
    ol.steps { margin: 10mm 0 0; padding: 0 0 0 5mm; font-size: 10.5pt; color: #333; text-align: left; max-width: 95mm; }
    ol.steps li { margin-bottom: 3mm; }
    .footer { margin-top: auto; padding-top: 10mm; font-size: 8.5pt; color: #999; }
  </style>
</head>
<body>
  <img class="logo" src="${artixoLogo}" />
  <p class="shop-name">${shopName}</p>
  <h1>Scan to Browse Our Products</h1>
  <p class="sub">Check prices &amp; availability instantly on your phone</p>
  <div class="qr-box"><img src="${catalogQrDataUrl}" /></div>
  <ol class="steps">
    <li>Open your phone camera and scan this QR code</li>
    <li>Search &amp; browse products with live prices</li>
    <li>Build your list, then show it to the cashier</li>
  </ol>
  <div class="footer">Powered by Artixo POS</div>
</body>
</html>`;

    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.onload = () => {
      setTimeout(() => printWindow.print(), 300);
    };
  };

  // ---- Full database backup (manual download, separate from the automated Google Sheets sync) ----
  const [backingUp, setBackingUp] = useState(false);

  // Every business table worth keeping a copy of. Deliberately excludes catalog_checkout_sessions
  // (short-lived, 2-hour-expiry QR checkout codes - plumbing, not business data).
  const BACKUP_TABLES = [
    "products", "product_categories", "product_price_tiers", "product_receiving",
    "sales", "sale_items", "returns", "return_items",
    "credit_customers", "credit_payment_history",
    "vendors", "vendor_bills", "vendor_ledger", "vendor_checkins", "vendor_checkin_items",
    "stock_takes", "stock_take_items",
    "cheques", "cheque_print_history",
    "banks", "locations", "settings",
  ] as const;

  // PostgREST caps a plain .select() at 1000 rows by default and nothing else in this codebase
  // paginates around that - so a naive full-table fetch would silently truncate sales history
  // for any shop with real transaction volume. Page through with .range() instead.
  const fetchAllRows = async (table: string): Promise<any[]> => {
    const PAGE_SIZE = 1000;
    let rows: any[] = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase.from(table as any).select("*").range(from, from + PAGE_SIZE - 1);
      if (error) throw new Error(`${table}: ${error.message}`);
      if (!data || data.length === 0) break;
      rows = rows.concat(data);
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
    return rows;
  };

  const handleFullBackup = async () => {
    setBackingUp(true);
    try {
      const tables: Record<string, any[]> = {};
      let totalRows = 0;
      for (const table of BACKUP_TABLES) {
        const rows = await fetchAllRows(table);
        tables[table] = rows;
        totalRows += rows.length;
      }
      const payload = { exported_at: new Date().toISOString(), source: "Artixo POS", tables };
      const json = JSON.stringify(payload, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `artixo-pos-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Backup downloaded — ${totalRows} rows across ${BACKUP_TABLES.length} tables`);
    } catch (err: any) {
      toast.error(err?.message || "Backup failed");
    } finally {
      setBackingUp(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
          Settings
        </h1>
        <p className="text-muted-foreground mt-2">Configure your POS system</p>
      </div>

      <Card className="p-6 glass-card glass-hover border-border/50 max-w-3xl">
        <div className="flex items-center gap-2 mb-6">
          <Settings className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">Business Information</h2>
        </div>

        {isLoading ? (
          <p className="text-center text-muted-foreground py-8">Loading settings...</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="business_name">Business Name</Label>
              <Input
                id="business_name"
                value={formData.business_name}
                onChange={(e) => setFormData({ ...formData, business_name: e.target.value })}
                placeholder="Enter business name"
              />
            </div>

            <div>
              <Label htmlFor="address">Address</Label>
              <Textarea
                id="address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="Enter business address"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="Enter phone number"
                />
              </div>
              <div>
                <Label htmlFor="tax_rate">Tax Rate (%)</Label>
                <Input
                  id="tax_rate"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={formData.tax_rate}
                  onChange={(e) => setFormData({ ...formData, tax_rate: e.target.value })}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="currency">Currency</Label>
                <Input
                  id="currency"
                  value={formData.currency}
                  onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                  placeholder="LKR"
                />
              </div>
              <div>
                <Label htmlFor="currency_symbol">Currency Symbol</Label>
                <Input
                  id="currency_symbol"
                  value={formData.currency_symbol}
                  onChange={(e) => setFormData({ ...formData, currency_symbol: e.target.value })}
                  placeholder="Rs."
                />
              </div>
            </div>

            <Button type="submit" className="w-full gap-2">
              <Save className="h-4 w-4" />
              Save Settings
            </Button>
          </form>
        )}
      </Card>

      <Card className="p-6 glass-card glass-hover border-border/50 max-w-3xl">
        <div className="flex items-center gap-2 mb-2">
          <Printer className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">Receipt Printer</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          Connect a USB thermal receipt printer for instant one-click printing — no browser print dialog.
        </p>

        {!webUSBSupported ? (
          <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
            <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              Direct printing needs Chrome or Edge on desktop (this browser doesn't support WebUSB). You can
              still print receipts via the normal browser print dialog.
            </span>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center justify-between p-3 rounded-md glass-card border-border/50">
              <div className="flex items-center gap-2">
                <Usb className="h-4 w-4 text-muted-foreground" />
                <div>
                  {printerInfo ? (
                    <>
                      <p className="text-sm font-medium">{printerInfo.name || "USB Thermal Printer"}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        {printerConnected ? (
                          <>
                            <CheckCircle2 className="h-3 w-3 text-green-500" /> Connected
                          </>
                        ) : (
                          <>
                            <XCircle className="h-3 w-3 text-amber-500" /> Not detected — plug it in and reload
                          </>
                        )}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">No printer connected yet</p>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                {printerInfo && (
                  <Button variant="outline" size="sm" onClick={handleForgetPrinter}>
                    Forget
                  </Button>
                )}
                <Button size="sm" onClick={handleConnectPrinter} disabled={connecting}>
                  {connecting ? "Connecting..." : printerInfo ? "Reconnect / Change" : "Connect Printer"}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Paper Width</Label>
                <Select
                  value={String(paperWidth)}
                  onValueChange={(v) => {
                    const width = v === "58" ? 58 : 80;
                    setPaperWidthState(width);
                    setPaperWidth(width);
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="80">80mm</SelectItem>
                    <SelectItem value="58">58mm</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between glass-card border-border/50 rounded-md px-3 mt-6">
                <Label htmlFor="auto-direct-print" className="text-sm cursor-pointer">
                  Auto-print directly after each sale
                </Label>
                <Switch
                  id="auto-direct-print"
                  checked={autoDirectPrint}
                  onCheckedChange={(checked) => {
                    setAutoDirectPrintState(checked);
                    setAutoDirectPrintEnabled(checked);
                  }}
                />
              </div>
              <div className="flex items-center justify-between glass-card border-border/50 rounded-md px-3 mt-2">
                <Label htmlFor="auto-open-drawer" className="text-sm cursor-pointer">
                  Auto-open cash drawer after Cash sales
                </Label>
                <Switch
                  id="auto-open-drawer"
                  checked={autoOpenDrawer}
                  onCheckedChange={(checked) => {
                    setAutoOpenDrawerState(checked);
                    setAutoOpenDrawerEnabled(checked);
                  }}
                />
              </div>
              <div className="flex items-center justify-between glass-card border-border/50 rounded-md px-3 mt-2">
                <Label htmlFor="digital-receipt-mode" className="text-sm cursor-pointer">
                  Digital receipt (QR) instead of printing paper
                </Label>
                <Switch
                  id="digital-receipt-mode"
                  checked={digitalReceiptMode}
                  onCheckedChange={(checked) => {
                    setDigitalReceiptModeState(checked);
                    setDigitalReceiptModeEnabled(checked);
                  }}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 gap-2"
                onClick={handleTestPrint}
                disabled={!printerInfo || testPrinting}
              >
                <Printer className="h-4 w-4" />
                {testPrinting ? "Printing..." : "Test Print"}
              </Button>
              <Button
                variant="outline"
                className="flex-1 gap-2"
                onClick={handleOpenDrawer}
                disabled={!printerInfo || openingDrawer}
              >
                <Wallet className="h-4 w-4" />
                {openingDrawer ? "Opening..." : "Open Drawer"}
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              This is set per device/browser — connect the printer once on each till PC. If direct printing
              isn't set up or the printer is unplugged, receipts automatically fall back to the normal print dialog.
              The cash drawer must be wired into the printer's own drawer-kick port (the usual setup) - a
              separately-connected drawer with no printer link can't be triggered from here.
            </p>
          </div>
        )}
      </Card>

      <Card className="p-6 glass-card glass-hover border-border/50 max-w-3xl">
        <div className="flex items-center gap-2 mb-4">
          <QrCode className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">Customer Catalog QR</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Print and post this at the counter or shelves. Customers scan it with their own phone to browse
          products, prices and availability, build a list, then show it to the cashier to load into the bill —
          no app or login needed on their end.
        </p>
        <Button variant="outline" className="glass gap-2" onClick={openCatalogQr}>
          <QrCode className="h-4 w-4" />
          Show Catalog QR
        </Button>
      </Card>

      <Card className="p-6 glass-card glass-hover border-border/50 max-w-3xl">
        <div className="flex items-center gap-2 mb-4">
          <Database className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">Data Backup</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Download a complete copy of your shop's data — products, sales, customers, vendors, stock
          history, returns and more — as a single JSON file you keep yourself. This is separate from
          the automated Google Sheets backup; use it as an extra safety net before major changes, or
          just periodically for peace of mind.
        </p>
        <Button variant="outline" className="glass gap-2" onClick={handleFullBackup} disabled={backingUp}>
          <Download className="h-4 w-4" />
          {backingUp ? "Backing up..." : "Download Full Backup"}
        </Button>
      </Card>

      <Dialog open={catalogQrOpen} onOpenChange={setCatalogQrOpen}>
        <DialogContent className="glass-card border-border/50 sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5 text-primary" />
              Customer Catalog QR
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3 py-2">
            {catalogQrDataUrl && (
              <img src={catalogQrDataUrl} alt="Customer catalog QR" className="w-56 h-56 rounded-lg border border-border/40 bg-white p-2" />
            )}
            <p className="text-sm text-muted-foreground text-center">
              Print this and display it where customers can easily scan it.
            </p>
            <Button className="w-full gap-2 bg-primary hover:bg-primary/90" onClick={printCatalogQr}>
              <Printer className="h-4 w-4" />
              Print Catalog QR
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
