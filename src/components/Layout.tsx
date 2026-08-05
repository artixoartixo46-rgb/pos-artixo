import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import TopBar from "@/components/TopBar";
import ChatWidget from "@/components/ChatWidget";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <div className="h-svh w-full overflow-hidden flex flex-col">
        <TopBar />
        <div className="flex flex-1 min-h-0 w-full pt-14">
          <AppSidebar />
          <main className="flex-1 p-4 md:p-6 overflow-auto">{children}</main>
        </div>
      </div>
      <ChatWidget />
    </SidebarProvider>
  );
}
