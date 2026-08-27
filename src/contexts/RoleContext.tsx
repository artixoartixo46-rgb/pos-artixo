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

interface RoleContextValue {
  role: Role | null;
  loading: boolean;
  login: (pin: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  isOwner: boolean;
}

const RoleContext = createContext<RoleContextValue | undefined>(undefined);

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role | null>(() => {
    const stored = sessionStorage.getItem(ROLE_KEY);
    return stored === "owner" || stored === "cashier" ? stored : null;
  });
  const [loading, setLoading] = useState(false);

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
        setRole("owner");
        return { success: true };
      }
      if (pin === cashierPin) {
        sessionStorage.setItem(ROLE_KEY, "cashier");
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
    setRole(null);
  };

  return (
    <RoleContext.Provider value={{ role, loading, login, logout, isOwner: role === "owner" }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRole must be used within a RoleProvider");
  return ctx;
}
