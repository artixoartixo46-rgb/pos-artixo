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
import { useAuth } from "@/contexts/AuthContext";

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47c-.28 1.5-1.13 2.78-2.4 3.63v3.02h3.88c2.27-2.09 3.57-5.17 3.57-8.84z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.9l-3.88-3.02c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.12C3.25 21.3 7.31 24 12 24z" />
      <path fill="#FBBC05" d="M5.27 14.27a7.2 7.2 0 0 1 0-4.54V6.61H1.27a12 12 0 0 0 0 10.78l4-3.12z" />
      <path fill="#EA4335" d="M12 4.77c1.76 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.7 1.27 6.61l4 3.12C6.22 6.88 8.87 4.77 12 4.77z" />
    </svg>
  );
}

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
  const { user, loading: authLoading, isSuperAdmin, signInWithGoogle, signOut } = useAuth();

  useEffect(() => {
    if (window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable) {
      window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().then(setPlatformAuthAvailable);
    }
  }, []);

  const unlock = () => {
    sessionStorage.setItem(SESSION_UNLOCK_KEY, "1");
    onUnlock();
  };

  // Real, server-verified path: Supabase Auth confirms the Google account, and we only unlock if
  // it's the one specific super-admin email - the same check the browser can't be tricked into
  // skipping the way it can with a locally-stored PIN. Auto-unlocks the moment the session lands
  // (e.g. right after the Google redirect comes back to this page).
  useEffect(() => {
    if (!authLoading && isSuperAdmin) unlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isSuperAdmin]);

  const handleGoogleSignIn = async () => {
    setError("");
    try {
      await signInWithGoogle();
    } catch (err: any) {
      setError(err?.message || "Google sign-in isn't set up yet for this app - use your PIN below instead.");
    }
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

  // Shown whenever a Google account IS signed in but it isn't the authorized super-admin email -
  // makes it obvious why nothing unlocked, and offers a one-tap way to try a different account.
  const wrongAccountBanner = user && !isSuperAdmin && !authLoading && (
    <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs space-y-1.5">
      <p className="text-destructive font-medium">Signed in as {user.email} - not the authorized account.</p>
      <button type="button" onClick={() => signOut()} className="text-destructive underline">
        Sign out and try a different Google account
      </button>
    </div>
  );

  const googleSignInBlock = (
    <div className="space-y-1.5">
      <Button variant="outline" className="w-full gap-2 glass" onClick={handleGoogleSignIn} disabled={authLoading}>
        {authLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon />}
        Sign in with Google
      </Button>
      {wrongAccountBanner}
    </div>
  );

  // First visit ever, on any device - no PIN set up at all yet
  if (!storedPin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
        <Card className="glass-card border-border/50 p-6 w-full max-w-sm space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">Set up System Health access</h1>
          </div>
          {googleSignInBlock}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> or set a PIN <div className="h-px flex-1 bg-border" />
          </div>
          <p className="text-sm text-muted-foreground">
            A PIN works as a fallback on any device, including ones without Google sign-in set up yet.
            You can also register your fingerprint/Face ID per-device afterwards.
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

        {googleSignInBlock}

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
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
