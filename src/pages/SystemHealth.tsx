import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Fingerprint,
  KeyRound,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Loader2,
  Database,
  Clock,
  WifiOff,
  Printer,
  Smartphone,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { getPendingSales } from "@/lib/offlineDb";
import { isWebUSBSupported, getSavedPrinterInfo } from "@/lib/thermalPrinter";

// Standalone, deliberately NOT in the sidebar nav and NOT wrapped in <Layout> - this is a
// developer-only diagnostics page. There's no real login system in this app (every other route
// is open to anyone with the URL), so this can't be a true server-verified "admin only" page.
// What it CAN do without a backend: gate itself behind this device's fingerprint/Face ID via the
// browser's WebAuthn API (a real platform-authenticator check - the OS won't release an assertion
// without the correct biometric), with a PIN as the fallback for devices with no biometric
// sensor or that haven't been registered yet. This deters casual staff/customers from wandering
// in; it is not cryptographically bullet-proof against someone deliberately reading the JS bundle.

const PIN_KEY = "pos_health_pin";
const CREDENTIAL_KEY = "pos_health_webauthn_id";
const SESSION_UNLOCK_KEY = "pos_health_unlocked";

function base64urlToBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - (base64.length % 4)) % 4;
  const binary = atob(base64 + "=".repeat(pad));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function registerFingerprint(): Promise<string> {
  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: "Artixo POS" },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: "developer", displayName: "Developer" },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
      timeout: 60000,
    },
  })) as PublicKeyCredential;
  return credential.id;
}

async function verifyFingerprint(credentialId: string): Promise<boolean> {
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ id: base64urlToBuffer(credentialId), type: "public-key" }],
        userVerification: "required",
        timeout: 60000,
      },
    });
    return !!assertion;
  } catch {
    return false;
  }
}

function formatAgo(iso: string | null): string {
  if (!iso) return "No sales recorded yet";
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function GateScreen({ onUnlock }: { onUnlock: () => void }) {
  const storedPin = localStorage.getItem(PIN_KEY);
  const storedCredentialId = localStorage.getItem(CREDENTIAL_KEY);
  const [platformAuthAvailable, setPlatformAuthAvailable] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable) {
      window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().then(setPlatformAuthAvailable);
    }
  }, []);

  const unlock = () => {
    sessionStorage.setItem(SESSION_UNLOCK_KEY, "1");
    onUnlock();
  };

  const handleFingerprintUnlock = async () => {
    if (!storedCredentialId) return;
    setChecking(true);
    setError("");
    const ok = await verifyFingerprint(storedCredentialId);
    setChecking(false);
    if (ok) unlock();
    else setError("Fingerprint didn't match - try again or use your PIN below.");
  };

  const handlePinUnlock = () => {
    if (pinInput === storedPin) {
      unlock();
    } else {
      setError("Wrong PIN.");
      setPinInput("");
    }
  };

  const handleRegisterOnThisDevice = async () => {
    if (pinInput !== storedPin) {
      setError("Enter the correct PIN first to register this device's fingerprint.");
      return;
    }
    setChecking(true);
    setError("");
    try {
      const id = await registerFingerprint();
      localStorage.setItem(CREDENTIAL_KEY, id);
      toast.success("This device's fingerprint/Face ID is now registered");
      unlock();
    } catch {
      setError("Couldn't register a fingerprint on this device/browser.");
    } finally {
      setChecking(false);
    }
  };

  const handleFirstTimeSetup = () => {
    if (pinInput.length < 4) {
      setError("PIN must be at least 4 digits.");
      return;
    }
    if (pinInput !== confirmPin) {
      setError("PINs don't match.");
      return;
    }
    localStorage.setItem(PIN_KEY, pinInput);
    toast.success("PIN saved for this page");
    unlock();
  };

  // First visit ever, on any device - no PIN set up at all yet
  if (!storedPin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
        <Card className="glass-card border-border/50 p-6 w-full max-w-sm space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">Set up System Health access</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Choose a PIN for this page. You can also register your fingerprint/Face ID per-device
            afterwards - the PIN is the one thing that works everywhere and is your fallback.
          </p>
          <Input type="password" inputMode="numeric" placeholder="New PIN (min 4 digits)" value={pinInput} onChange={(e) => setPinInput(e.target.value)} className="glass border-border/50" />
          <Input type="password" inputMode="numeric" placeholder="Confirm PIN" value={confirmPin} onChange={(e) => setConfirmPin(e.target.value)} className="glass border-border/50" />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button className="w-full bg-primary hover:bg-primary/90" onClick={handleFirstTimeSetup}>
            Save PIN &amp; Continue
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <Card className="glass-card border-border/50 p-6 w-full max-w-sm space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Developer access only</h1>
        </div>

        {storedCredentialId && (
          <Button
            variant="outline"
            className="w-full gap-2 glass"
            onClick={handleFingerprintUnlock}
            disabled={checking}
          >
            {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Fingerprint className="h-4 w-4" />}
            Unlock with Fingerprint / Face ID
          </Button>
        )}

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <KeyRound className="h-3 w-3" /> {storedCredentialId ? "Or enter your PIN" : "Enter your PIN"}
          </p>
          <Input
            type="password"
            inputMode="numeric"
            placeholder="PIN"
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handlePinUnlock()}
            className="glass border-border/50"
          />
          <Button className="w-full bg-primary hover:bg-primary/90" onClick={handlePinUnlock}>
            Unlock
          </Button>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        {!storedCredentialId && platformAuthAvailable && (
          <button
            type="button"
            onClick={handleRegisterOnThisDevice}
            className="text-xs text-muted-foreground hover:text-foreground underline w-full text-center"
          >
            Register this device's fingerprint (needs correct PIN above)
          </button>
        )}
      </Card>
    </div>
  );
}

function HealthDashboard() {
  const { data: health, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["system-health-check"],
    queryFn: async () => {
      const start = performance.now();
      const [products, sales, saleItems, creditCustomers, categories, lastSale] = await Promise.all([
        supabase.from("products").select("*", { count: "exact", head: true }),
        supabase.from("sales").select("*", { count: "exact", head: true }),
        supabase.from("sale_items").select("*", { count: "exact", head: true }),
        supabase.from("credit_customers").select("*", { count: "exact", head: true }),
        supabase.from("product_categories").select("*", { count: "exact", head: true }),
        supabase.from("sales").select("sale_date").order("sale_date", { ascending: false }).limit(1).maybeSingle(),
      ]);
      const latencyMs = Math.round(performance.now() - start);
      const anyError = products.error || sales.error || saleItems.error || creditCustomers.error || categories.error || lastSale.error;
      return {
        ok: !anyError,
        error: anyError?.message,
        latencyMs,
        productsCount: products.count ?? 0,
        salesCount: sales.count ?? 0,
        saleItemsCount: saleItems.count ?? 0,
        creditCustomersCount: creditCustomers.count ?? 0,
        categoriesCount: categories.count ?? 0,
        lastSaleAt: lastSale.data?.sale_date ?? null,
      };
    },
    refetchInterval: 30000,
  });

  const { data: pendingSyncCount } = useQuery({
    queryKey: ["health-pending-sync"],
    queryFn: async () => (await getPendingSales()).length,
    refetchInterval: 15000,
  });

  const printerInfo = getSavedPrinterInfo();

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 p-4 sm:p-8">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            System Health
          </h1>
          <Button variant="outline" size="sm" className="glass gap-1.5" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <Card className="glass-card border-border/50 p-5 flex items-center gap-3">
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : health?.ok ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          ) : (
            <XCircle className="h-5 w-5 text-destructive" />
          )}
          <div>
            <p className="font-medium">{isLoading ? "Checking database..." : health?.ok ? "Database reachable" : "Database error"}</p>
            <p className="text-xs text-muted-foreground">
              {health?.ok ? `Responded in ${health.latencyMs}ms` : health?.error || ""}
            </p>
          </div>
        </Card>

        <Card className="glass-card border-border/50 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Database className="h-4 w-4 text-primary" />
            <h2 className="font-medium text-sm">Table Row Counts</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <div><p className="text-muted-foreground text-xs">Products</p><p className="font-semibold">{health?.productsCount ?? "-"}</p></div>
            <div><p className="text-muted-foreground text-xs">Sales</p><p className="font-semibold">{health?.salesCount ?? "-"}</p></div>
            <div><p className="text-muted-foreground text-xs">Sale Items</p><p className="font-semibold">{health?.saleItemsCount ?? "-"}</p></div>
            <div><p className="text-muted-foreground text-xs">Credit Customers</p><p className="font-semibold">{health?.creditCustomersCount ?? "-"}</p></div>
            <div><p className="text-muted-foreground text-xs">Categories</p><p className="font-semibold">{health?.categoriesCount ?? "-"}</p></div>
          </div>
        </Card>

        <Card className="glass-card border-border/50 p-5 flex items-center gap-3">
          <Clock className="h-5 w-5 text-primary" />
          <div>
            <p className="font-medium text-sm">Last sale</p>
            <p className="text-xs text-muted-foreground">{formatAgo(health?.lastSaleAt ?? null)}</p>
          </div>
        </Card>

        <Card className="glass-card border-border/50 p-5 flex items-center gap-3">
          <WifiOff className={`h-5 w-5 ${pendingSyncCount ? "text-amber-500" : "text-muted-foreground"}`} />
          <div>
            <p className="font-medium text-sm">Offline sync queue</p>
            <p className="text-xs text-muted-foreground">
              {pendingSyncCount ? `${pendingSyncCount} sale(s) waiting to sync` : "Nothing queued"}
              {" · "}Browser is currently {navigator.onLine ? "online" : "offline"}
            </p>
          </div>
        </Card>

        <Card className="glass-card border-border/50 p-5 flex items-center gap-3">
          <Printer className={`h-5 w-5 ${printerInfo ? "text-emerald-500" : "text-muted-foreground"}`} />
          <div>
            <p className="font-medium text-sm">Receipt printer</p>
            <p className="text-xs text-muted-foreground">
              {isWebUSBSupported()
                ? printerInfo
                  ? `Paired: ${printerInfo.name || `Vendor ${printerInfo.vendorId}`}`
                  : "No printer paired on this device"
                : "WebUSB not supported in this browser"}
            </p>
          </div>
        </Card>

        <Card className="glass-card border-border/50 p-5">
          <div className="flex items-center gap-2 mb-2">
            <Smartphone className="h-4 w-4 text-primary" />
            <h2 className="font-medium text-sm">This device</h2>
          </div>
          <p className="text-xs text-muted-foreground break-all">{navigator.userAgent}</p>
          <p className="text-xs text-muted-foreground mt-1">Screen: {window.screen.width}×{window.screen.height}</p>
        </Card>

        <p className="text-center text-xs text-muted-foreground pt-2">
          This page is not linked anywhere in the app - bookmark it or scan the QR from Settings.
        </p>
      </div>
    </div>
  );
}

export default function SystemHealth() {
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem(SESSION_UNLOCK_KEY) === "1");

  if (!unlocked) return <GateScreen onUnlock={() => setUnlocked(true)} />;
  return <HealthDashboard />;
}
