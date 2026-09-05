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
import { Settings, Save, Printer, Usb, CheckCircle2, XCircle, QrCode, Wallet, Database, Download, CloudUpload, Loader2, ShieldCheck, Users, Pencil, Trash2, Plus, Target, Upload, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
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
    owner_pin: "",
    cashier_pin: "",
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
          owner_pin: data.owner_pin || "1234",
          cashier_pin: data.cashier_pin || "0000",
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
    if (formData.owner_pin.trim().length < 4 || formData.cashier_pin.trim().length < 4) {
      toast.error("PINs must be at least 4 digits");
      return;
    }
    if (formData.owner_pin.trim() === formData.cashier_pin.trim()) {
      toast.error("Owner and Cashier PINs must be different");
      return;
    }
    updateMutation.mutate(formData);
  };

  // ---- Cashier management (individual identity + daily target/salary for the performance
  // incentive system) - separate from the shared Cashier PIN above, which still works as a
  // no-name fallback for shops that don't want to bother naming each cashier. ----
  interface CashierRow {
    id: string;
    name: string;
    pin: string;
    daily_target: number;
    base_salary: number;
    bonus_percent: number;
    active: boolean;
  }

  const { data: cashiers, isLoading: cashiersLoading } = useQuery({
    queryKey: ["cashiers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cashiers").select("*").order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as CashierRow[];
    },
  });

  const [cashierDialogOpen, setCashierDialogOpen] = useState(false);
  const [editingCashier, setEditingCashier] = useState<CashierRow | null>(null);
  const [cashierForm, setCashierForm] = useState({
    name: "",
    pin: "",
    daily_target: "5000",
    base_salary: "2000",
    bonus_percent: "5",
    active: true,
  });

  const openAddCashier = () => {
    setEditingCashier(null);
    setCashierForm({ name: "", pin: "", daily_target: "5000", base_salary: "2000", bonus_percent: "5", active: true });
    setCashierDialogOpen(true);
  };

  const openEditCashier = (c: CashierRow) => {
    setEditingCashier(c);
    setCashierForm({
      name: c.name,
      pin: c.pin,
      daily_target: String(c.daily_target),
      base_salary: String(c.base_salary),
      bonus_percent: String(c.bonus_percent),
      active: c.active,
    });
    setCashierDialogOpen(true);
  };

  const saveCashierMutation = useMutation({
    mutationFn: async () => {
      if (!cashierForm.name.trim()) throw new Error("Name is required");
      if (cashierForm.pin.trim().length < 4) throw new Error("PIN must be at least 4 digits");

      const payload = {
        name: cashierForm.name.trim(),
        pin: cashierForm.pin.trim(),
        daily_target: parseFloat(cashierForm.daily_target) || 0,
        base_salary: parseFloat(cashierForm.base_salary) || 0,
        bonus_percent: parseFloat(cashierForm.bonus_percent) || 0,
        active: cashierForm.active,
      };

      if (editingCashier) {
        const { error } = await supabase.from("cashiers").update(payload).eq("id", editingCashier.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("cashiers").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cashiers"] });
      setCashierDialogOpen(false);
      toast.success(editingCashier ? "Cashier updated" : "Cashier added");
    },
    onError: (err: any) => toast.error(err?.message || "Couldn't save cashier"),
  });

  const deleteCashierMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cashiers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cashiers"] });
      toast.success("Cashier removed");
    },
    onError: () => toast.error("Couldn't remove cashier"),
  });

  const toggleCashierActive = async (c: CashierRow) => {
    const { error } = await supabase.from("cashiers").update({ active: !c.active }).eq("id", c.id);
    if (error) {
      toast.error("Couldn't update cashier");
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["cashiers"] });
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

  // ---- Developer System Health QR ----
  // This page isn't in the sidebar menu on purpose - the QR is the only way to reach it. It's
  // still gated by its own fingerprint/PIN screen on open, so scanning this alone doesn't grant
  // access to anyone who isn't the developer.
  const [healthQrOpen, setHealthQrOpen] = useState(false);
  const [healthQrDataUrl, setHealthQrDataUrl] = useState("");

  const openHealthQr = async () => {
    const url = `${window.location.origin}/system-health`;
    const dataUrl = await QRCodeLib.toDataURL(url, { width: 400, margin: 1, errorCorrectionLevel: "M" });
    setHealthQrDataUrl(dataUrl);
    setHealthQrOpen(true);
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

  // ---- Multi-cloud redundancy: on-demand trigger for the backup-redundancy edge function,
  // which also runs automatically once a day via pg_cron - see the backup_redundancy migration. ----
  const [cloudBackingUp, setCloudBackingUp] = useState(false);
  const [lastCloudBackup, setLastCloudBackup] = useState<{ fileName: string; totalRows: number; at: string } | null>(null);

  // Every business table worth keeping a copy of. Deliberately excludes catalog_checkout_sessions
  // (short-lived, 2-hour-expiry QR checkout codes - plumbing, not business data).
  const BACKUP_TABLES = [
    "products", "product_categories", "product_price_tiers", "product_receiving",
    "product_batches", "price_change_alerts",
    "sales", "sale_items", "returns", "return_items",
    "credit_customers", "credit_payment_history",
    "vendors", "vendor_bills", "vendor_ledger", "vendor_checkins", "vendor_checkin_items",
    "stock_takes", "stock_take_items",
    "cheques", "cheque_print_history",
    "banks", "locations", "settings",
    "cashiers", "catalog_checkout_sessions", "sync_errors",
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

  const handleCloudBackup = async () => {
    setCloudBackingUp(true);
    try {
      const { data, error } = await supabase.functions.invoke("backup-redundancy", { body: {} });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setLastCloudBackup({ fileName: data.fileName, totalRows: data.totalRows, at: new Date().toISOString() });
      toast.success(`Cloud backup saved — ${data.totalRows} rows across ${data.tableCount} tables`);
    } catch (err: any) {
      toast.error(err?.message || "Cloud backup failed");
    } finally {
      setCloudBackingUp(false);
    }
  };

  // ---- Restore from Backup - reads a JSON file produced by "Download Full Backup" (or the
  // matching Supabase Storage cloud snapshot) and re-inserts every row via upsert-by-id, so
  // running it twice - or restoring on top of data that's still partly there - never creates
  // duplicates. Parent tables are restored before the child tables that reference them, so
  // foreign keys never fail mid-restore. ----
  const RESTORE_ORDER: (typeof BACKUP_TABLES)[number][] = [
    "settings", "banks", "locations", "cashiers",
    "product_categories", "products", "product_price_tiers", "product_batches", "price_change_alerts",
    "vendors", "product_receiving", "vendor_checkins", "vendor_checkin_items",
    "vendor_bills", "vendor_ledger",
    "credit_customers", "credit_payment_history",
    "cheques", "cheque_print_history",
    "sales", "sale_items", "returns", "return_items",
    "stock_takes", "stock_take_items",
    "catalog_checkout_sessions", "sync_errors",
  ];

  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [restoreParsed, setRestoreParsed] = useState<{ exported_at?: string; tables: Record<string, any[]> } | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreLog, setRestoreLog] = useState<{ table: string; status: "pending" | "done" | "error"; count: number; error?: string }[]>([]);

  const handleRestoreFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again later
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || !parsed.tables || typeof parsed.tables !== "object") {
        throw new Error("Not a valid Artixo POS backup file");
      }
      setRestoreParsed(parsed);
      setRestoreLog([]);
      setRestoreDialogOpen(true);
    } catch (err: any) {
      toast.error(err?.message || "Couldn't read that backup file");
    }
  };

  const handleConfirmRestore = async () => {
    if (!restoreParsed) return;
    setRestoring(true);
    const tablesToRestore = RESTORE_ORDER.filter(
      (t) => Array.isArray(restoreParsed.tables[t]) && restoreParsed.tables[t].length > 0
    );
    setRestoreLog(tablesToRestore.map((t) => ({ table: t, status: "pending" as const, count: restoreParsed.tables[t].length })));

    let totalRestored = 0;
    let stoppedAt = "";
    for (const table of tablesToRestore) {
      const rows = restoreParsed.tables[table];
      try {
        const CHUNK = 500;
        for (let i = 0; i < rows.length; i += CHUNK) {
          const chunk = rows.slice(i, i + CHUNK);
          const { error } = await supabase.from(table as any).upsert(chunk, { onConflict: "id" });
          if (error) throw new Error(error.message);
        }
        totalRestored += rows.length;
        setRestoreLog((prev) => prev.map((r) => (r.table === table ? { ...r, status: "done" } : r)));
      } catch (err: any) {
        setRestoreLog((prev) => prev.map((r) => (r.table === table ? { ...r, status: "error", error: err?.message } : r)));
        stoppedAt = table;
        break;
      }
    }

    setRestoring(false);
    if (stoppedAt) {
      toast.error(`Restore stopped at "${stoppedAt}" - tables before it restored fine, re-run the same file to retry`);
    } else {
      toast.success(`Restore complete — ${totalRestored} rows restored across ${tablesToRestore.length} tables`);
      queryClient.invalidateQueries();
      setRestoreDialogOpen(false);
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

            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border/50">
              <div>
                <Label htmlFor="owner_pin">Owner PIN</Label>
                <Input
                  id="owner_pin"
                  type="text"
                  inputMode="numeric"
                  value={formData.owner_pin}
                  onChange={(e) => setFormData({ ...formData, owner_pin: e.target.value })}
                  placeholder="1234"
                />
                <p className="text-xs text-muted-foreground mt-1">Full access to every page.</p>
              </div>
              <div>
                <Label htmlFor="cashier_pin">Cashier PIN</Label>
                <Input
                  id="cashier_pin"
                  type="text"
                  inputMode="numeric"
                  value={formData.cashier_pin}
                  onChange={(e) => setFormData({ ...formData, cashier_pin: e.target.value })}
                  placeholder="0000"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Everything except Reports, Product Receiving and Settings - those stay Owner-only.
                </p>
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
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">Manage Cashiers</h2>
          </div>
          <Button size="sm" className="gap-2" onClick={openAddCashier}>
            <Plus className="h-4 w-4" />
            Add Cashier
          </Button>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Give each cashier their own name and PIN so sales are attributed to them individually -
          needed for the daily target / salary performance report in Reports. Their PIN logs them
          in as Cashier, same access as the shared Cashier PIN above.
        </p>

        {cashiersLoading ? (
          <p className="text-sm text-muted-foreground py-4">Loading cashiers...</p>
        ) : !cashiers || cashiers.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            No named cashiers yet. Everyone still shares the single Cashier PIN above until you add one here.
          </p>
        ) : (
          <div className="space-y-2">
            {cashiers.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between p-3 rounded-md glass-card border-border/50 gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate flex items-center gap-2">
                    {c.name}
                    {!c.active && (
                      <span className="text-xs font-normal text-muted-foreground">(inactive)</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Target className="h-3 w-3" />
                    Target Rs.{c.daily_target}/day · Base Rs.{c.base_salary} · +{c.bonus_percent}% bonus
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Switch checked={c.active} onCheckedChange={() => toggleCashierActive(c)} />
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => openEditCashier(c)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => {
                      if (confirm(`Remove ${c.name}? Their past sales stay attributed to them, they just can't log in anymore.`)) {
                        deleteCashierMutation.mutate(c.id);
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
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
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">Developer Tools</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          System Health is a diagnostics page (database status, table counts, offline sync queue,
          printer connection) that isn't in the sidebar menu - scan this QR to open it. It's
          protected by its own fingerprint/PIN screen, separate from this Settings page.
        </p>
        <Button variant="outline" className="glass gap-2" onClick={openHealthQr}>
          <QrCode className="h-4 w-4" />
          Show System Health QR
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
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" className="glass gap-2" onClick={handleFullBackup} disabled={backingUp}>
            <Download className="h-4 w-4" />
            {backingUp ? "Backing up..." : "Download Full Backup"}
          </Button>
          <Button variant="outline" className="glass gap-2" onClick={handleCloudBackup} disabled={cloudBackingUp}>
            {cloudBackingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />}
            {cloudBackingUp ? "Backing up..." : "Backup to Cloud Now"}
          </Button>
          <input
            id="restore-file-input"
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={handleRestoreFilePicked}
          />
          <Button
            variant="outline"
            className="glass gap-2"
            onClick={() => document.getElementById("restore-file-input")?.click()}
          >
            <Upload className="h-4 w-4" />
            Restore from Backup
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          "Backup to Cloud Now" saves a redundant snapshot to Supabase Storage - separate from the
          database itself, so it survives a bad migration or accidental table drop. This also runs
          automatically every day at 2:00 AM UTC (7:30 AM Sri Lanka time), no action needed.
          {lastCloudBackup && (
            <span className="block mt-1 text-primary">
              Last manual cloud backup: {lastCloudBackup.totalRows} rows, {format(new Date(lastCloudBackup.at), "MMM dd, HH:mm")}
            </span>
          )}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          "Restore from Backup" reads a JSON file from "Download Full Backup" (or the cloud snapshot,
          downloaded from Supabase Storage) and puts that data back — safe to re-run, existing rows are
          matched by ID and updated, nothing gets duplicated.
        </p>
      </Card>

      <Dialog open={restoreDialogOpen} onOpenChange={(open) => !restoring && setRestoreDialogOpen(open)}>
        <DialogContent className="glass-card border-border/50 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Restore from Backup
            </DialogTitle>
          </DialogHeader>
          {restoreParsed && (
            <div className="space-y-4">
              <div className="text-sm bg-destructive/10 border border-destructive/30 rounded-lg p-3 text-destructive">
                This will overwrite any current row that shares an ID with the backup, and add back
                anything that was deleted. It will NOT remove rows created after this backup was made.
                Double-check the date below before continuing.
              </div>
              <p className="text-sm">
                Backup from:{" "}
                <span className="font-medium">
                  {restoreParsed.exported_at ? format(new Date(restoreParsed.exported_at), "MMM dd, yyyy HH:mm") : "unknown date"}
                </span>
              </p>
              <div className="max-h-64 overflow-y-auto scroll-glass space-y-1 pr-1">
                {RESTORE_ORDER.filter((t) => Array.isArray(restoreParsed.tables[t]) && restoreParsed.tables[t].length > 0).map((t) => {
                  const logEntry = restoreLog.find((r) => r.table === t);
                  return (
                    <div key={t} className="flex items-center justify-between text-sm p-2 glass-card border-border/30 rounded">
                      <span>{t}</span>
                      <span className="flex items-center gap-2 text-muted-foreground">
                        {restoreParsed.tables[t].length} rows
                        {logEntry?.status === "done" && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                        {logEntry?.status === "error" && <XCircle className="h-4 w-4 text-destructive" />}
                        {restoring && logEntry?.status === "pending" && <Loader2 className="h-4 w-4 animate-spin" />}
                      </span>
                    </div>
                  );
                })}
              </div>
              {restoreLog.some((r) => r.status === "error") && (
                <p className="text-xs text-destructive">
                  {restoreLog.find((r) => r.status === "error")?.error}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setRestoreDialogOpen(false)} disabled={restoring}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={handleConfirmRestore} disabled={restoring}>
                  {restoring ? "Restoring..." : "Restore Now"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={cashierDialogOpen} onOpenChange={setCashierDialogOpen}>
        <DialogContent className="glass-card border-border/50 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              {editingCashier ? "Edit Cashier" : "Add Cashier"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="cashier_name">Name</Label>
              <Input
                id="cashier_name"
                value={cashierForm.name}
                onChange={(e) => setCashierForm({ ...cashierForm, name: e.target.value })}
                placeholder="e.g. Kumar"
              />
            </div>
            <div>
              <Label htmlFor="cashier_own_pin">PIN</Label>
              <Input
                id="cashier_own_pin"
                type="text"
                inputMode="numeric"
                value={cashierForm.pin}
                onChange={(e) => setCashierForm({ ...cashierForm, pin: e.target.value })}
                placeholder="At least 4 digits"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="daily_target">Daily Target (Rs.)</Label>
                <Input
                  id="daily_target"
                  type="number"
                  min="0"
                  value={cashierForm.daily_target}
                  onChange={(e) => setCashierForm({ ...cashierForm, daily_target: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="base_salary">Base Salary/Day (Rs.)</Label>
                <Input
                  id="base_salary"
                  type="number"
                  min="0"
                  value={cashierForm.base_salary}
                  onChange={(e) => setCashierForm({ ...cashierForm, base_salary: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="bonus_percent">Bonus % (per % achievement over target)</Label>
              <Input
                id="bonus_percent"
                type="number"
                min="0"
                step="0.1"
                value={cashierForm.bonus_percent}
                onChange={(e) => setCashierForm({ ...cashierForm, bonus_percent: e.target.value })}
              />
              <p className="text-xs text-muted-foreground mt-1">
                e.g. 5% means for every 10% over target achieved, salary goes up 0.5x that day's base.
                Exact formula is applied in the Reports &gt; Cashier Performance view.
              </p>
            </div>
            <div className="flex items-center justify-between glass-card border-border/50 rounded-md px-3 py-2">
              <Label htmlFor="cashier_active" className="text-sm cursor-pointer">Active (can log in)</Label>
              <Switch
                id="cashier_active"
                checked={cashierForm.active}
                onCheckedChange={(checked) => setCashierForm({ ...cashierForm, active: checked })}
              />
            </div>
            <Button
              className="w-full gap-2"
              onClick={() => saveCashierMutation.mutate()}
              disabled={saveCashierMutation.isPending}
            >
              <Save className="h-4 w-4" />
              {saveCashierMutation.isPending ? "Saving..." : editingCashier ? "Save Changes" : "Add Cashier"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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

      <Dialog open={healthQrOpen} onOpenChange={setHealthQrOpen}>
        <DialogContent className="glass-card border-border/50 sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              System Health QR
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3 py-2">
            {healthQrDataUrl && (
              <img src={healthQrDataUrl} alt="System health page QR" className="w-56 h-56 rounded-lg border border-border/40 bg-white p-2" />
            )}
            <p className="text-sm text-muted-foreground text-center">
              Scan with your own phone to open the System Health page. First time on a new device,
              you'll set/enter a PIN, then you can register that device's fingerprint for next time.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
