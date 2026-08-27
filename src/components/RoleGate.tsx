import { useState, type ReactNode, type FormEvent } from "react";
import { useRole } from "@/contexts/RoleContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KeyRound, ShieldCheck, ShoppingCart } from "lucide-react";
import artixoLogo from "@/assets/artixo-logo.png";

// Full-screen gate shown once per browser session (until logout/tab close) - picks Owner vs
// Cashier and checks the PIN against settings.owner_pin/cashier_pin. Same PIN box for both;
// which PIN matches decides the role, so there's nothing to pick beforehand.
export default function RoleGate({ children }: { children: ReactNode }) {
  const { role, login } = useRole();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (role) return <>{children}</>;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!pin.trim()) return;
    setSubmitting(true);
    setError("");
    const result = await login(pin.trim());
    setSubmitting(false);
    if (!result.success) {
      setError(result.error || "Wrong PIN");
      setPin("");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="max-w-sm w-full text-center space-y-5">
        <div className="mx-auto h-16 w-16 rounded-2xl bg-white/70 p-2 shadow-inner">
          <img src={artixoLogo} alt="Artixo" className="h-full w-full object-contain" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Enter PIN to continue</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Owner and Cashier each have their own PIN - what you can see and do depends on which
            one you enter.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            type="password"
            inputMode="numeric"
            placeholder="PIN"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="text-center text-lg tracking-widest"
            autoFocus
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full gap-2" disabled={submitting}>
            <KeyRound className="h-4 w-4" />
            {submitting ? "Checking..." : "Unlock"}
          </Button>
        </form>
        <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground pt-2">
          <span className="flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" /> Owner PIN</span>
          <span className="flex items-center gap-1"><ShoppingCart className="h-3.5 w-3.5" /> Cashier PIN</span>
        </div>
      </div>
    </div>
  );
}
