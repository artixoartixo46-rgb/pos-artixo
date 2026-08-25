import { Suspense, lazy, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { SplashScreen } from "./components/SplashScreen";
import Layout from "./components/Layout";
import { AuthProvider } from "./contexts/AuthContext";

// Every page used to be a top-level import, so ALL of them (charts, jsPDF/html2canvas for
// report export, html5-qrcode, etc.) landed in one single JS bundle loaded before the very
// first paint - a couple MB of JS a cashier's phone had to fetch/parse just to see the
// Dashboard. Routing through React.lazy means each page only downloads when it's actually
// navigated to, and its own heavy dependencies (a chart library, a PDF exporter) come along
// with it instead of blocking everyone else's first load.
const Dashboard = lazy(() => import("./pages/Dashboard"));
const POSTerminal = lazy(() => import("./pages/POSTerminal"));
const Items = lazy(() => import("./pages/Items"));
const Reports = lazy(() => import("./pages/Reports"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const Vendors = lazy(() => import("./pages/Vendors"));
const ProductCategory = lazy(() => import("./pages/ProductCategory"));
const ProductReceiving = lazy(() => import("./pages/ProductReceiving"));
const OrderManagement = lazy(() => import("./pages/OrderManagement"));
const ProductInventory = lazy(() => import("./pages/ProductInventory"));
const StockTake = lazy(() => import("./pages/StockTake"));
const Returns = lazy(() => import("./pages/Returns"));
const CreditCustomers = lazy(() => import("./pages/CreditCustomers"));
const BarcodePrint = lazy(() => import("./pages/BarcodePrint"));
const CreditPurchaseHistory = lazy(() => import("./pages/CreditPurchaseHistory"));
const VendorCheckIn = lazy(() => import("./pages/VendorCheckIn"));
const Catalog = lazy(() => import("./pages/Catalog"));
const DigitalReceipt = lazy(() => import("./pages/DigitalReceipt"));
const DemandForecast = lazy(() => import("./pages/DemandForecast"));
const SystemHealth = lazy(() => import("./pages/SystemHealth"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Brief, full-screen fallback while a lazy page chunk downloads - only ever visible for a
// beat on a fresh navigation (the chunk is cached by the browser/service worker after that).
function RouteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Defaults (staleTime 0, refetchOnWindowFocus true) meant every tab switch or component
      // remount silently refired every query - extra load on a shop's often-slow connection
      // and a big part of the app feeling sluggish even when nothing had actually changed.
      // 30s is long enough to kill that chatter but short enough that stock/price edits from
      // another device still show up fast.
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const App = () => {
  const [showSplash, setShowSplash] = useState(true);

  return (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      {showSplash && <SplashScreen onFinish={() => setShowSplash(false)} />}
      <BrowserRouter>
        <Suspense fallback={<RouteFallback />}>
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
          {/* Standalone, no Layout/sidebar, deliberately NOT linked from the sidebar menu -
              developer-only diagnostics, gated by its own fingerprint/PIN screen. Reach it via
              the QR code in Settings > Developer Tools. */}
          <Route path="/system-health" element={<SystemHealth />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
  );
};

export default App;
