import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

// Lightweight owner/cashier split for a shared shop terminal - NOT real security (this whole app
// has no server-side auth beyond the single super-admin gate in AuthContext), just a "which
// buttons should this person see" gate so a cashier doesn't wander into Reports/Items/Product
// Receiving during a shift. PINs live in the settings table (owner_pin/cashier_pin) so the owner
// can change them from Settings without a code change. Role is stored in sessionStorage on
// purpose - it resets when the browser/tab closes, so the next shift has to pick a role again
// rather than silently inheriting whoever used the till last.
export type Role = "owner" | "cashier";

const ROLE_KEY = "pos_role";
const CASHIER_ID_KEY = "pos_cashier_id";
const CASHIER_NAME_KEY = "pos_cashier_name";

interface RoleContextValue {
  role: Role | null;
  loading: boolean;
  login: (pin: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  isOwner: boolean;
  cashierId: string | null;
  cashierName: string | null;
}

const RoleContext = createContext<RoleContextValue | undefined>(undefined);

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role | null>(() => {
    const stored = sessionStorage.getItem(ROLE_KEY);
    return stored === "owner" || stored === "cashier" ? stored : null;
  });
  const [cashierId, setCashierId] = useState<string | null>(() => sessionStorage.getItem(CASHIER_ID_KEY));
  const [cashierName, setCashierName] = useState<string | null>(() => sessionStorage.getItem(CASHIER_NAME_KEY));
  const [loading, setLoading] = useState(false);

  const setCashierIdentity = (id: string | null, name: string | null) => {
    if (id) sessionStorage.setItem(CASHIER_ID_KEY, id); else sessionStorage.removeItem(CASHIER_ID_KEY);
    if (name) sessionStorage.setItem(CASHIER_NAME_KEY, name); else sessionStorage.removeItem(CASHIER_NAME_KEY);
    setCashierId(id);
    setCashierName(name);
  };

  const login = async (pin: string): Promise<{ success: boolean; error?: string }> => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("settings")
        .select("owner_pin, cashier_pin")
        .limit(1)
        .single();
      if (error && error.code !== "PGRST116") throw error;

      const ownerPin = data?.owner_pin || "1234";
      const cashierPin = data?.cashier_pin || "0000";

      if (pin === ownerPin) {
        sessionStorage.setItem(ROLE_KEY, "owner");
        setCashierIdentity(null, null);
        setRole("owner");
        return { success: true };
      }

      // Named cashiers (individual PIN, tied to their own daily target/salary) take priority
      // over the old shared cashier_pin, so the performance system can attribute each sale.
      const { data: namedCashier } = await supabase
        .from("cashiers")
        .select("id, name")
        .eq("pin", pin)
        .eq("active", true)
        .maybeSingle();
      if (namedCashier) {
        sessionStorage.setItem(ROLE_KEY, "cashier");
        setCashierIdentity(namedCashier.id, namedCashier.name);
        setRole("cashier");
        return { success: true };
      }

      if (pin === cashierPin) {
        sessionStorage.setItem(ROLE_KEY, "cashier");
        setCashierIdentity(null, null);
        setRole("cashier");
        return { success: true };
      }
      return { success: false, error: "Wrong PIN" };
    } catch (err) {
      return { success: false, error: "Couldn't verify PIN - check your connection" };
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    sessionStorage.removeItem(ROLE_KEY);
    setCashierIdentity(null, null);
    setRole(null);
  };

  return (
    <RoleContext.Provider
      value={{ role, loading, login, logout, isOwner: role === "owner", cashierId, cashierName }}
    >
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRole must be used within a RoleProvider");
  return ctx;
}
