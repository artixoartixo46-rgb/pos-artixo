import { LayoutDashboard, ShoppingCart, Package, BarChart3, Settings, Users, FolderOpen, TruckIcon, Archive, UserCheck, QrCode, History } from "lucide-react";
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
  { title: "Credit Customers", url: "/credit-customers", icon: UserCheck },
  { title: "Purchase History", url: "/credit-purchase-history", icon: History },
  { title: "Product Receiving", url: "/product-receiving", icon: TruckIcon },
  { title: "Product Inventory", url: "/product-inventory", icon: Archive },
  { title: "QR Code Print", url: "/barcode-print", icon: QrCode },
  { title: "Reports", url: "/reports", icon: BarChart3 },
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const { open } = useSidebar();

  return (
    <Sidebar className="glass border-r border-border/20">
      <SidebarContent className="p-2">
        {/* Logo */}
        <div className="px-4 py-5 flex items-center gap-3">
          <img src={artixoLogo} alt="Artixo" className="h-10 w-10 object-contain" />
          <div>
            <h1 className="text-2xl font-bold iridescent-glow tracking-tight">Artixo</h1>
            <p className="text-xs text-muted-foreground mt-0.5 tracking-wide">Point of Sale System</p>
          </div>
        </div>

        <SidebarGroup>
          <SidebarGroupLabel className="text-muted-foreground/70 text-[10px] uppercase tracking-widest px-2 mb-1">
            Main Menu
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-2 py-2.5 rounded-xl transition-all duration-300 ${
                          isActive
                            ? "glass-card bg-primary/15 text-primary border-primary/25 shadow-[0_0_20px_-4px_hsl(var(--primary)/0.3)]"
                            : "text-sidebar-foreground/80 hover:bg-muted/30 hover:text-foreground"
                        }`
                      }
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {open && <span className="text-sm font-medium">{item.title}</span>}
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
