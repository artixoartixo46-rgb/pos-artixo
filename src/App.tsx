import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import POSTerminal from "./pages/POSTerminal";
import Items from "./pages/Items";
import Reports from "./pages/Reports";
import SettingsPage from "./pages/SettingsPage";
import Vendors from "./pages/Vendors";
import ProductCategory from "./pages/ProductCategory";
import LocationMaster from "./pages/LocationMaster";
import ProductReceiving from "./pages/ProductReceiving";
import ProductInventory from "./pages/ProductInventory";
import CreditCustomers from "./pages/CreditCustomers";
import BarcodePrint from "./pages/BarcodePrint";
import SyncQRCodes from "./pages/SyncQRCodes";
import ChequePrint from "./pages/ChequePrint";
import CreditPurchaseHistory from "./pages/CreditPurchaseHistory";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout><Dashboard /></Layout>} />
          <Route path="/pos" element={<Layout><POSTerminal /></Layout>} />
          <Route path="/items" element={<Layout><Items /></Layout>} />
          <Route path="/product-category" element={<Layout><ProductCategory /></Layout>} />
          <Route path="/vendors" element={<Layout><Vendors /></Layout>} />
          <Route path="/credit-customers" element={<Layout><CreditCustomers /></Layout>} />
          <Route path="/credit-purchase-history" element={<Layout><CreditPurchaseHistory /></Layout>} />
          <Route path="/location-master" element={<Layout><LocationMaster /></Layout>} />
          <Route path="/product-receiving" element={<Layout><ProductReceiving /></Layout>} />
          <Route path="/product-inventory" element={<Layout><ProductInventory /></Layout>} />
          <Route path="/barcode-print" element={<Layout><BarcodePrint /></Layout>} />
          <Route path="/sync-qr-codes" element={<Layout><SyncQRCodes /></Layout>} />
          <Route path="/cheque-print" element={<Layout><ChequePrint /></Layout>} />
          <Route path="/reports" element={<Layout><Reports /></Layout>} />
          <Route path="/settings" element={<Layout><SettingsPage /></Layout>} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
