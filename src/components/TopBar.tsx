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
import { Plus, Bell, Package, Users, UserCheck, ShoppingCart, AlertTriangle, RefreshCw, Phone } from "lucide-react";
import artixoLogo from "@/assets/artixo-logo.png";
import { getPendingSales } from "@/lib/offlineDb";

export default function TopBar() {
  const navigate = useNavigate();

  const { data: lowStockItems } = useQuery({
    queryKey: ["topbar-low-stock"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, stock_quantity, min_stock_level")
        .lt("stock_quantity", "min_stock_level")
        .limit(10);
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 60000,
  });

  const { data: pendingSyncCount = 0 } = useQuery({
    queryKey: ["topbar-pending-sync"],
    queryFn: async () => (await getPendingSales()).length,
    refetchInterval: 15000,
  });

  const { data: shopSettings } = useQuery({
    queryKey: ["topbar-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("settings").select("business_name").limit(1).single();
      if (error && error.code !== "PGRST116") throw error;
      return data;
    },
  });

  const notifCount = (lowStockItems?.length || 0) + pendingSyncCount;
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
            {pendingSyncCount > 0 && (
              <DropdownMenuItem onClick={() => navigate("/pos")} className="cursor-pointer">
                <RefreshCw className="h-4 w-4 mr-2 text-amber-500 shrink-0" />
                <span className="truncate">
                  {pendingSyncCount} offline sale{pendingSyncCount === 1 ? "" : "s"} waiting to sync
                </span>
              </DropdownMenuItem>
            )}
            {(lowStockItems || []).slice(0, 6).map((item) => (
              <DropdownMenuItem key={item.id} onClick={() => navigate("/product-inventory")} className="cursor-pointer">
                <AlertTriangle className="h-4 w-4 mr-2 text-destructive shrink-0" />
                <span className="truncate">{item.name} low ({item.stock_quantity} left)</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Avatar className="h-8 w-8 ml-1 border-2 border-white/40">
          <AvatarFallback className="bg-white/20 text-white text-xs font-bold">{initials}</AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
