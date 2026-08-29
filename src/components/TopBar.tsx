import { useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Plus, Bell, Package, Users, UserCheck, ShoppingCart, AlertTriangle, RefreshCw, Phone, TruckIcon, PauseCircle, Wallet, Lock, ShieldCheck, ShieldAlert, CalendarClock, Hourglass } from "lucide-react";
import artixoLogo from "@/assets/artixo-logo.png";
import { getPendingSales } from "@/lib/offlineDb";
import { useRole } from "@/contexts/RoleContext";
import { useQueryClient } from "@tanstack/react-query";

export default function TopBar() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isOwner, logout } = useRole();

  // Owner-only: cashiers can now use Items > Edit too, so this is the "easy to catch" net for
  // price/cost tampering at the till - every cashier price or cost change gets logged (see
  // Items.tsx saveMutation) and shows up here until the owner dismisses it.
  const { data: priceAlerts } = useQuery({
    queryKey: ["topbar-price-alerts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("price_change_alerts")
        .select("id, product_name, old_price, new_price, old_cost, new_cost, created_at")
        .eq("acknowledged", false)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data || [];
    },
    enabled: isOwner,
    refetchInterval: 30000,
  });

  const dismissPriceAlert = async (id: string) => {
    await supabase.from("price_change_alerts").update({ acknowledged: true }).eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["topbar-price-alerts"] });
  };

  const { data: lowStockItems } = useQuery({
    queryKey: ["topbar-low-stock"],
    queryFn: async () => {
      // PostgREST filters like .lt() only compare a column to a literal value, not to
      // another column - so this has to be fetched and compared client-side.
      const { data, error } = await supabase
        .from("products")
        .select("id, name, stock_quantity, min_stock_level");
      if (error) throw error;
      return (data || [])
        .filter((p) => Number(p.stock_quantity ?? 0) <= Number(p.min_stock_level ?? 0))
        .slice(0, 10);
    },
    refetchInterval: 60000,
  });

  const { data: pendingSyncCount = 0 } = useQuery({
    queryKey: ["topbar-pending-sync"],
    queryFn: async () => (await getPendingSales()).length,
    refetchInterval: 15000,
  });

  const { data: pendingCheckins } = useQuery({
    queryKey: ["topbar-vendor-checkins"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vendor_checkins").select("id, vendor_name").eq("status", "pending");
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 60000,
  });

  // Held bills live in localStorage (per-till, set by POS Terminal) - not a live subscription,
  // just polled like everything else here so the badge stays roughly in sync.
  const { data: heldBillsCount = 0 } = useQuery({
    queryKey: ["topbar-held-bills"],
    queryFn: () => {
      try {
        const raw = localStorage.getItem("pos_held_bills");
        return raw ? (JSON.parse(raw) as unknown[]).length : 0;
      } catch {
        return 0;
      }
    },
    refetchInterval: 10000,
  });

  const { data: creditOutstanding } = useQuery({
    queryKey: ["topbar-credit-outstanding"],
    queryFn: async () => {
      const { data, error } = await supabase.from("credit_customers").select("id, outstanding_balance");
      if (error) throw error;
      const withBalance = (data || []).filter((c) => Number(c.outstanding_balance ?? 0) > 0);
      const total = withBalance.reduce((sum, c) => sum + Number(c.outstanding_balance ?? 0), 0);
      return { count: withBalance.length, total };
    },
    refetchInterval: 60000,
  });

  // Owner-only: unpaid vendor bills that are overdue (due_date in the past) - the same "Mark
  // Paid" / due-date fields live on the Vendors page, this is just the heads-up that something
  // needs attention there. Cashiers don't touch vendor payments, so this stays owner-only.
  const { data: overdueVendorBills } = useQuery({
    queryKey: ["topbar-overdue-vendor-bills"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("vendor_bills")
        .select("id, invoice_number, total_amount, due_date, vendors(name)")
        .eq("paid", false)
        .lt("due_date", today)
        .order("due_date", { ascending: true })
        .limit(10);
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: isOwner,
    refetchInterval: 60000,
  });

  // Visible to everyone (not owner-only) - a cashier is the one actually selling stock, so
  // they're the one who benefits most from knowing what needs to move first. Only surfaces
  // batches within 7 days of expiry (or already expired) - the full 30-day view lives on
  // Product Inventory for browsing, this is just the "act now" subset.
  const { data: expiringBatches } = useQuery({
    queryKey: ["topbar-expiring-batches"],
    queryFn: async () => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() + 7);
      const { data, error } = await supabase
        .from("product_batches")
        .select("id, expiry_date, products(name)")
        .not("expiry_date", "is", null)
        .lte("expiry_date", cutoff.toISOString().slice(0, 10))
        .order("expiry_date", { ascending: true })
        .limit(10);
      if (error) throw error;
      return (data || []) as any[];
    },
    refetchInterval: 60000,
  });

  const { data: shopSettings } = useQuery({
    queryKey: ["topbar-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("settings").select("business_name").limit(1).single();
      if (error && error.code !== "PGRST116") throw error;
      return data;
    },
  });

  const notifCount =
    (lowStockItems?.length || 0) +
    pendingSyncCount +
    (pendingCheckins?.length || 0) +
    (heldBillsCount || 0) +
    (creditOutstanding?.count ? 1 : 0) + // one aggregated line, not per-customer
    (priceAlerts?.length || 0) +
    (overdueVendorBills?.length || 0) +
    (expiringBatches?.length || 0);
  const initials = (shopSettings?.business_name || "Artixo").trim().slice(0, 2).toUpperCase();

  return (
    <header className="fixed top-0 inset-x-0 z-50 h-14 bg-primary text-primary-foreground shadow-[0_2px_16px_-4px_rgba(0,0,0,0.25)] flex items-center justify-between px-3 md:px-4">
      <div className="flex items-center gap-3">
        <SidebarTrigger className="text-white hover:bg-white/15 rounded-lg h-9 w-9" />
        <Link to="/" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-white/90 p-1 flex items-center justify-center overflow-hidden shrink-0">
            <img src={artixoLogo} alt="Artixo" className="h-full w-full object-contain" />
          </div>
          <span className="font-bold text-lg tracking-tight hidden sm:inline">Artixo POS</span>
        </Link>
      </div>

      <div className="flex items-center gap-1.5 md:gap-2">
        {/* Support contact number */}
        <a
          href="tel:+94754120403"
          className="hidden md:flex items-center gap-1.5 px-3 h-9 rounded-full bg-white/15 hover:bg-white/25 transition-colors text-sm font-medium"
          title="Call support"
        >
          <Phone className="h-3.5 w-3.5" />
          +94 75 412 0403
        </a>

        {/* Quick add */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="text-white hover:bg-white/15 rounded-full h-9 w-9">
              <Plus className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 glass-card">
            <DropdownMenuLabel>Quick Add</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/pos")} className="cursor-pointer">
              <ShoppingCart className="h-4 w-4 mr-2 text-primary" /> New Sale
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/items")} className="cursor-pointer">
              <Package className="h-4 w-4 mr-2 text-primary" /> New Item
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/vendors")} className="cursor-pointer">
              <Users className="h-4 w-4 mr-2 text-primary" /> New Vendor
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/credit-customers")} className="cursor-pointer">
              <UserCheck className="h-4 w-4 mr-2 text-primary" /> New Credit Customer
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="relative text-white hover:bg-white/15 rounded-full h-9 w-9">
              <Bell className="h-5 w-5" />
              {notifCount > 0 && (
                <span className="absolute top-0.5 right-0.5 h-[18px] min-w-[18px] px-1 rounded-full bg-destructive text-[10px] font-bold flex items-center justify-center text-white leading-none">
                  {notifCount > 9 ? "9+" : notifCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72 glass-card">
            <DropdownMenuLabel>Notifications</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {notifCount === 0 && (
              <div className="px-2 py-4 text-sm text-muted-foreground text-center">You're all caught up</div>
            )}
            {/* Cashier changed a price/cost in Items - shown first, it's the one that matters
                most. Clicking dismisses it (marks acknowledged) rather than just navigating,
                since there's nothing to "go to" beyond having seen the number. */}
            {(priceAlerts || []).map((alert) => (
              <DropdownMenuItem
                key={alert.id}
                onClick={() => dismissPriceAlert(alert.id)}
                className="cursor-pointer items-start gap-2"
              >
                <ShieldAlert className="h-4 w-4 mr-2 text-destructive shrink-0 mt-0.5" />
                <span className="text-xs leading-snug">
                  <span className="font-medium">{alert.product_name}</span> - cashier changed{" "}
                  {Number(alert.old_price) !== Number(alert.new_price) && (
                    <>price Rs.{Number(alert.old_price).toFixed(2)} &rarr; Rs.{Number(alert.new_price).toFixed(2)}</>
                  )}
                  {Number(alert.old_price) !== Number(alert.new_price) && Number(alert.old_cost) !== Number(alert.new_cost) && ", "}
                  {Number(alert.old_cost) !== Number(alert.new_cost) && (
                    <>cost Rs.{Number(alert.old_cost || 0).toFixed(2)} &rarr; Rs.{Number(alert.new_cost || 0).toFixed(2)}</>
                  )}
                  <span className="block text-muted-foreground mt-0.5">Tap to dismiss</span>
                </span>
              </DropdownMenuItem>
            ))}
            {pendingSyncCount > 0 && (
              <DropdownMenuItem onClick={() => navigate("/pos")} className="cursor-pointer">
                <RefreshCw className="h-4 w-4 mr-2 text-amber-500 shrink-0" />
                <span className="truncate">
                  {pendingSyncCount} offline sale{pendingSyncCount === 1 ? "" : "s"} waiting to sync
                </span>
              </DropdownMenuItem>
            )}
            {heldBillsCount > 0 && (
              <DropdownMenuItem onClick={() => navigate("/pos")} className="cursor-pointer">
                <PauseCircle className="h-4 w-4 mr-2 text-primary shrink-0" />
                <span className="truncate">
                  {heldBillsCount} held bill{heldBillsCount === 1 ? "" : "s"} waiting to resume
                </span>
              </DropdownMenuItem>
            )}
            {(pendingCheckins?.length || 0) > 0 && (
              <DropdownMenuItem onClick={() => navigate("/product-receiving")} className="cursor-pointer">
                <TruckIcon className="h-4 w-4 mr-2 text-amber-500 shrink-0" />
                <span className="truncate">
                  {pendingCheckins!.length} vendor check-in{pendingCheckins!.length === 1 ? "" : "s"} to review
                </span>
              </DropdownMenuItem>
            )}
            {creditOutstanding && creditOutstanding.count > 0 && (
              <DropdownMenuItem onClick={() => navigate("/credit-customers")} className="cursor-pointer">
                <Wallet className="h-4 w-4 mr-2 text-amber-500 shrink-0" />
                <span className="truncate">
                  {creditOutstanding.count} customer{creditOutstanding.count === 1 ? "" : "s"} owe Rs. {creditOutstanding.total.toFixed(0)} on credit
                </span>
              </DropdownMenuItem>
            )}
            {(overdueVendorBills || []).map((bill) => {
              const daysOverdue = Math.round(
                (new Date().setHours(0, 0, 0, 0) - new Date(bill.due_date).setHours(0, 0, 0, 0)) / (24 * 60 * 60 * 1000)
              );
              return (
                <DropdownMenuItem key={bill.id} onClick={() => navigate("/vendors")} className="cursor-pointer">
                  <CalendarClock className="h-4 w-4 mr-2 text-destructive shrink-0" />
                  <span className="truncate">
                    {bill.vendors?.name || "Vendor"} - Rs. {Number(bill.total_amount || 0).toFixed(0)} overdue {daysOverdue}d
                  </span>
                </DropdownMenuItem>
              );
            })}
            {(expiringBatches || []).map((batch) => {
              const daysLeft = Math.round(
                (new Date(batch.expiry_date).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / (24 * 60 * 60 * 1000)
              );
              return (
                <DropdownMenuItem key={batch.id} onClick={() => navigate("/product-inventory")} className="cursor-pointer">
                  <Hourglass className="h-4 w-4 mr-2 text-destructive shrink-0" />
                  <span className="truncate">
                    {batch.products?.name || "Product"} - {daysLeft < 0 ? `expired ${-daysLeft}d ago` : daysLeft === 0 ? "expires today" : `expires in ${daysLeft}d`}
                  </span>
                </DropdownMenuItem>
              );
            })}
            {(lowStockItems || []).slice(0, 6).map((item) => (
              <DropdownMenuItem key={item.id} onClick={() => navigate("/product-inventory")} className="cursor-pointer">
                <AlertTriangle className="h-4 w-4 mr-2 text-destructive shrink-0" />
                <span className="truncate">{item.name} low ({item.stock_quantity} left)</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Role badge + lock button - lets whoever's on the till right now switch to the other
            role (or hand off to the next shift) without needing a full page reload. */}
        <button
          onClick={logout}
          title="Switch user / lock"
          className="hidden sm:flex items-center gap-1.5 px-3 h-9 rounded-full bg-white/15 hover:bg-white/25 transition-colors text-sm font-medium"
        >
          {isOwner ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShoppingCart className="h-3.5 w-3.5" />}
          {isOwner ? "Owner" : "Cashier"}
          <Lock className="h-3 w-3 opacity-70" />
        </button>
        <button onClick={logout} title="Switch user / lock" className="sm:hidden">
          <Lock className="h-4 w-4" />
        </button>

        <Avatar className="h-8 w-8 ml-1 border-2 border-white/40">
          <AvatarFallback className="bg-white/20 text-white text-xs font-bold">{initials}</AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
