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
import { Settings, Save, Printer, Usb, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
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
  const [connecting, setConnecting] = useState(false);
  const [testPrinting, setTestPrinting] = useState(false);

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
            </div>

            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={handleTestPrint}
              disabled={!printerInfo || testPrinting}
            >
              <Printer className="h-4 w-4" />
              {testPrinting ? "Printing..." : "Test Print"}
            </Button>

            <p className="text-xs text-muted-foreground">
              This is set per device/browser — connect the printer once on each till PC. If direct printing
              isn't set up or the printer is unplugged, receipts automatically fall back to the normal print dialog.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
