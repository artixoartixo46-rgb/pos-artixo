import { type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useRole } from "@/contexts/RoleContext";
import { ShieldAlert } from "lucide-react";

// Wraps a route's element so a cashier hitting the URL directly (typed it, bookmarked it, a
// stale link) gets bounced instead of silently loading owner-only data. The sidebar already
// hides these links for cashiers - this is the backstop for direct navigation.
export default function OwnerRoute({ children }: { children: ReactNode }) {
  const { isOwner, role } = useRole();

  if (isOwner) return <>{children}</>;

  if (role === "cashier") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-sm w-full text-center space-y-3">
          <ShieldAlert className="h-10 w-10 mx-auto text-amber-500" />
          <h1 className="text-lg font-bold">Owner access only</h1>
          <p className="text-sm text-muted-foreground">
            This page is restricted to the Owner PIN. Ask the owner if you need something here.
          </p>
        </div>
      </div>
    );
  }

  // No role picked yet at all (shouldn't normally happen - RoleGate wraps everything above this)
  return <Navigate to="/" replace />;
}
