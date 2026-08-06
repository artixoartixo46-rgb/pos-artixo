import { LayoutDashboard, ShoppingCart, Package, BarChart3, Settings, Users, FolderOpen, TruckIcon, Archive, UserCheck, QrCode, History, ClipboardList, ClipboardCheck, Undo2, Sparkles } from "lucide-react";
import artixoLogo from "@/assets/artixo-logo.png";
import { NavLink } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const items = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "POS Terminal", url: "/pos", icon: ShoppingCart },
  { title: "Items", url: "/items", icon: Package },
  { title: "Product Category", url: "/product-category", icon: FolderOpen },
  { title: "Vendors", url: "/vendors", icon: Users },
  { title: "Order Management", url: "/order-management", icon: ClipboardList },
  { title: "Credit Customers", url: "/credit-customers", icon: UserCheck },
  { title: "Purchase History", url: "/credit-purchase-history", icon: History },
  { title: "Product Receiving", url: "/product-receiving", icon: TruckIcon },
  { title: "Product Inventory", url: "/product-inventory", icon: Archive },
  { title: "Stock Take", url: "/stock-take", icon: ClipboardCheck },
  { title: "Returns & Refunds", url: "/returns", icon: Undo2 },
  { title: "QR Code Print", url: "/barcode-print", icon: QrCode },
  { title: "Reports", url: "/reports", icon: BarChart3 },
  { title: "Demand Forecast", url: "/demand-forecast", icon: Sparkles },
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const { open } = useSidebar();

  return (
    <Sidebar className="glass border-r border-border/20">
      <SidebarContent className="relative overflow-x-hidden overflow-y-auto scroll-glass p-2">
        {/* Ambient floating glass blobs for a "living" background */}
        <div
          aria-hidden
          className="pointer-events-none absolute -left-10 top-10 h-40 w-40 rounded-full bg-primary/20 blur-3xl animate-sidebar-blob"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-12 bottom-24 h-44 w-44 rounded-full bg-secondary/20 blur-3xl animate-sidebar-blob"
          style={{ animationDelay: "2.5s" }}
        />

        {/* Logo */}
        <div className="relative z-10 px-4 py-5 flex items-center gap-3 animate-in fade-in slide-in-from-top-3 duration-700 [animation-fill-mode:backwards]">
          <div className="rounded-2xl bg-white/70 p-1.5 shadow-inner animate-logo-glow transition-transform duration-500 hover:scale-110 hover:-rotate-6">
            <img src={artixoLogo} alt="Artixo" className="h-9 w-9 object-contain" />
          </div>
          {open && (
            <div className="animate-in fade-in slide-in-from-left-2 duration-500 [animation-delay:150ms] [animation-fill-mode:backwards]">
              <h1 className="text-2xl font-bold iridescent-glow tracking-tight">Artixo</h1>
              <p className="text-xs text-muted-foreground mt-0.5 tracking-wide">Wholesale Grocery POS</p>
            </div>
          )}
        </div>

        <SidebarGroup className="relative z-10">
          <SidebarGroupLabel className="text-muted-foreground/70 text-[10px] uppercase tracking-widest px-2 mb-1 animate-in fade-in duration-700 [animation-delay:200ms] [animation-fill-mode:backwards]">
            Main Menu
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {items.map((item, index) => (
                <SidebarMenuItem
                  key={item.title}
                  className="animate-in fade-in slide-in-from-left-4 duration-500 [animation-fill-mode:backwards]"
                  style={{ animationDelay: `${120 + index * 45}ms` }}
                >
                  <SidebarMenuButton asChild className="h-auto">
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className={({ isActive }) =>
                        `group relative flex items-center gap-3.5 px-4 py-3.5 rounded-full overflow-hidden transition-all duration-300 ease-out ${
                          isActive
                            ? "bg-primary/15 text-primary shadow-[0_4px_20px_-4px_hsl(var(--primary)/0.35)] animate-nav-pop"
                            : "bg-primary/[0.06] text-sidebar-foreground/75 hover:bg-primary/15 hover:text-primary hover:translate-x-1 hover:shadow-[0_4px_16px_-6px_hsl(var(--primary)/0.3)] active:scale-95"
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {/* Hover shine sweep */}
                          <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/50 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full" />

                          <span className="relative z-10 grid place-items-center transition-transform duration-300 ease-out group-hover:scale-125 group-hover:-rotate-6">
                            <item.icon className="h-5 w-5 shrink-0" />
                          </span>

                          {open && (
                            <span className="relative z-10 text-base font-medium truncate">{item.title}</span>
                          )}

                          {isActive && open && (
                            <span className="relative z-10 ml-auto h-2 w-2 shrink-0 rounded-full bg-primary animate-dot-pulse" />
                          )}
                        </>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
