import { useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SplashScreen } from "./components/SplashScreen";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import POSTerminal from "./pages/POSTerminal";
import Items from "./pages/Items";
import Reports from "./pages/Reports";
import SettingsPage from "./pages/SettingsPage";
import Vendors from "./pages/Vendors";
import ProductCategory from "./pages/ProductCategory";
import ProductReceiving from "./pages/ProductReceiving";
import OrderManagement from "./pages/OrderManagement";
import ProductInventory from "./pages/ProductInventory";
import StockTake from "./pages/StockTake";
import Returns from "./pages/Returns";
import CreditCustomers from "./pages/CreditCustomers";
import BarcodePrint from "./pages/BarcodePrint";
import CreditPurchaseHistory from "./pages/CreditPurchaseHistory";
import VendorCheckIn from "./pages/VendorCheckIn";
import Catalog from "./pages/Catalog";
import DigitalReceipt from "./pages/DigitalReceipt";
import DemandForecast from "./pages/DemandForecast";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => {
  const [showSplash, setShowSplash] = useState(true);

  return (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      {showSplash && <SplashScreen onFinish={() => setShowSplash(false)} />}
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout><Dashboard /></Layout>} />
          <Route path="/pos" element={<Layout><POSTerminal /></Layout>} />
          <Route path="/items" element={<Layout><Items /></Layout>} />
          <Route path="/product-category" element={<Layout><ProductCategory /></Layout>} />
          <Route path="/vendors" element={<Layout><Vendors /></Layout>} />
          <Route path="/order-management" element={<Layout><OrderManagement /></Layout>} />
          <Route path="/credit-customers" element={<Layout><CreditCustomers /></Layout>} />
          <Route path="/credit-purchase-history" element={<Layout><CreditPurchaseHistory /></Layout>} />
          <Route path="/product-receiving" element={<Layout><ProductReceiving /></Layout>} />
          <Route path="/product-inventory" element={<Layout><ProductInventory /></Layout>} />
          <Route path="/stock-take" element={<Layout><StockTake /></Layout>} />
          <Route path="/returns" element={<Layout><Returns /></Layout>} />
          <Route path="/barcode-print" element={<Layout><BarcodePrint /></Layout>} />
          <Route path="/reports" element={<Layout><Reports /></Layout>} />
          <Route path="/demand-forecast" element={<Layout><DemandForecast /></Layout>} />
          <Route path="/settings" element={<Layout><SettingsPage /></Layout>} />
          {/* Standalone, no Layout/sidebar - a vendor's own phone lands here after scanning
              the receiving-counter QR, no login involved. */}
          <Route path="/vendor-checkin" element={<VendorCheckIn />} />
          <Route path="/catalog" element={<Catalog />} />
          {/* Standalone, no Layout/sidebar - customer's own phone lands here after scanning
              the "Digital Receipt" QR shown at checkout, no login involved. */}
          <Route path="/receipt/:invoiceNumber" element={<DigitalReceipt />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  );
};

export default App;
