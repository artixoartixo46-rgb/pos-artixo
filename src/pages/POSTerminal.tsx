import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Minus, Trash2, ShoppingCart, Search, Printer, UserCheck, X, Wallet, Eye, EyeOff, Camera, Mic, MicOff, Weight as WeightIcon, PauseCircle, Clock, PlayCircle, Percent, QrCode, MessageCircle } from "lucide-react";
import { QRScanner } from "@/components/QRScanner";
import { ScaleConnectDialog } from "@/components/ScaleConnectDialog";
import {
  getScaleSettings,
  saveScaleSettings,
  connectSerialScale,
  disconnectSerialScale,
  connectBluetoothScale,
  disconnectBluetoothScale,
  type ScaleSettings,
  type ScaleStatus,
  type ScaleReading,
  type ScaleConnectionType,
} from "@/lib/scaleReader";
import { useToast } from "@/hooks/use-toast";
import { useRole } from "@/contexts/RoleContext";
import { useVoiceSearch, phoneticMatch } from "@/hooks/useVoiceSearch";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import html2canvas from "html2canvas";
import QRCode from "qrcode";
import {
  isWebUSBSupported,
  getSavedPrinterInfo,
  isAutoDirectPrintEnabled,
  isAutoOpenDrawerEnabled,
  isDigitalReceiptModeEnabled,
  printReceiptDirect,
  openCashDrawer,
  getPaperWidth,
} from "@/lib/thermalPrinter";
import artixoLogo from "@/assets/artixo-logo.png";

// Artixo support line, shown on printed receipts regardless of whether the shop has
// filled in its own phone number in Settings - same number used in the TopBar.
const SUPPORT_PHONE = "+94 75 412 0403";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import {
  getCachedPriceTiers,
  adjustCachedStock,
  queueOfflineSale,
  getPendingSales,
  searchCachedProducts,
  findCachedProductByCode,
} from "@/lib/offlineDb";
import { refreshOfflineCache, syncPendingSales } from "@/lib/offlineSync";
import { getItemDiscountAmount, getLineNetTotal } from "@/lib/cartMath";
import { openWhatsAppShare } from "@/lib/whatsapp";
import { WifiOff, RefreshCw } from "lucide-react";

interface PriceTier {
  min_qty: number;
  unit_price: number;
}

interface CartItem {
  line_key: string;
  product_id: string;
  name: string;
  price: number;
  base_price: number;
  quantity: number;
  barcode?: string;
  unit_label: string;
  sold_unit: "unit" | "case" | "weight";
  case_size?: number;
  case_price?: number;
  min_order_qty: number;
  is_weight_based: boolean;
  tiers: PriceTier[];
  item_discount: number;
  item_discount_type: DiscountType;
  /** Per-base-unit cost price, if the product has one on file - used only for the optional
   *  "Show Cost" cashier view below, never shown to the customer. */
  cost?: number;
}

// Given tiers (unsorted ok) and a quantity, return the best applicable unit price
function getTieredUnitPrice(basePrice: number, tiers: PriceTier[], quantity: number): number {
  if (!tiers || tiers.length === 0) return basePrice;
  const applicable = [...tiers]
    .filter((t) => quantity >= t.min_qty)
    .sort((a, b) => b.min_qty - a.min_qty);
  return applicable.length > 0 ? Number(applicable[0].unit_price) : basePrice;
}

// Compute the effective per-base-unit price for a cart line based on its mode and quantity
function computeLinePrice(item: Pick<CartItem, "base_price" | "case_size" | "case_price" | "sold_unit" | "tiers">, quantity: number): number {
  if (item.sold_unit === "case" && item.case_size && item.case_size > 0) {
    const caseTotal = item.case_price ?? item.base_price * item.case_size;
    return caseTotal / item.case_size;
  }
  return getTieredUnitPrice(item.base_price, item.tiers, quantity);
}

type DiscountType = "percentage" | "fixed";
type PaymentMethod = "Cash" | "Card" | "Credit";

interface CreditCustomer {
  id: string;
  name: string;
  phone: string;
  email: string;
  outstanding_balance: number;
}

interface CreditInvoice {
  id: string;
  invoice_number: string;
  sale_date: string;
  total_amount: number;
  paid_amount: number;
  balance: number;
  status: string;
  customer_name: string;
}

// Hold/Park Bill: a cashier building a big order can shelve it, serve someone else on the
// same counter, then resume it later. Stored in localStorage (not the server) since it's
// purely a per-till, same-shift working state - it also survives an accidental page refresh,
// which a big multi-item bill would otherwise lose entirely.
interface HeldBill {
  id: string;
  label: string;
  heldAt: string; // ISO timestamp
  cart: CartItem[];
  discount: number;
  discountType: DiscountType;
  paymentMethod: PaymentMethod;
  customerPaidAmount: number;
  selectedCustomer: CreditCustomer | null;
  total: number; // snapshot, just for the list preview
}

const HELD_BILLS_KEY = "pos_held_bills";

function loadHeldBills(): HeldBill[] {
  try {
    const raw = localStorage.getItem(HELD_BILLS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHeldBills(bills: HeldBill[]) {
  try {
    localStorage.setItem(HELD_BILLS_KEY, JSON.stringify(bills));
  } catch {
    // storage full/unavailable - held bills just won't survive a refresh, non-fatal
  }
}

function formatHeldAgo(iso: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m ago`;
}

export default function POSTerminal() {
  const isOnline = useOnlineStatus();
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  // "all" = no category filter. Lets a cashier jump straight to e.g. "Vegetables" instead of
  // scrolling/typing - loose produce has no barcode to scan, so a fast tap-to-browse path
  // matters more here than for packaged/barcoded goods.
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [lastScannedQR, setLastScannedQR] = useState("");
  const [discount, setDiscount] = useState<number>(0);
  const [discountType, setDiscountType] = useState<DiscountType>("percentage");
  const [editingDiscountLineKey, setEditingDiscountLineKey] = useState<string | null>(null);
  // Off by default and not persisted across reloads - cost/margin is only for the cashier
  // deciding how much room there is to negotiate a price, it should never be left switched on
  // and visible to whoever glances at the till screen next (including the customer).
  const [showCost, setShowCost] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Cash");
  const [customerPaidAmount, setCustomerPaidAmount] = useState<number>(0);
  const [selectedCustomer, setSelectedCustomer] = useState<CreditCustomer | null>(null);
  const [heldBills, setHeldBills] = useState<HeldBill[]>(() => loadHeldBills());
  const [heldBillsOpen, setHeldBillsOpen] = useState(false);
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [customerSearchTerm, setCustomerSearchTerm] = useState("");
  const [creditAccountOpen, setCreditAccountOpen] = useState(false);
  const [creditPaymentOpen, setCreditPaymentOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<CreditInvoice | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [creditPaymentMethod, setCreditPaymentMethod] = useState<string>("Cash");
  const [paymentRemarks, setPaymentRemarks] = useState<string>("");
  const [viewCustomer, setViewCustomer] = useState<CreditCustomer | null>(null);
  const [qrScannerOpen, setQrScannerOpen] = useState(false);
  const [scaleDialogOpen, setScaleDialogOpen] = useState(false);
  const [scaleStatus, setScaleStatus] = useState<ScaleStatus>("disconnected");
  const [scaleConnectionType, setScaleConnectionType] = useState<ScaleConnectionType | null>(null);
  const [scaleReading, setScaleReading] = useState<ScaleReading | null>(null);
  const [scaleSettings, setScaleSettings] = useState<ScaleSettings>(getScaleSettings());
  const [lastReceiptData, setLastReceiptData] = useState<{
    invoiceNumber: string;
    items: CartItem[];
    subtotal: number;
    discountAmount: number;
    total: number;
    paidAmount: number;
    balance: number;
    paymentMethod: string;
    customerName?: string;
    customerPhone?: string | null;
  } | null>(null);
  const [voiceLanguage, setVoiceLanguage] = useState<string>("en-US");
  const [showVoicePreview, setShowVoicePreview] = useState(false);
  const [digitalReceiptOpen, setDigitalReceiptOpen] = useState(false);
  const [digitalReceiptQrUrl, setDigitalReceiptQrUrl] = useState("");
  const [digitalReceiptLink, setDigitalReceiptLink] = useState("");
  // Pre-filled from the attached customer's phone (if any) when the dialog opens, but always
  // editable - a walk-in customer with no account on file can still get the bill sent to
  // whatever number the cashier types in on the spot.
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const { toast } = useToast();
  const { cashierId, cashierName } = useRole();
  const queryClient = useQueryClient();
  const receiptRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scanDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Short beep for scan feedback (barcode gun users bill fast without watching the screen)
  const playScanBeep = useCallback((success: boolean) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = success ? 880 : 220;
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (success ? 0.12 : 0.25));
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + (success ? 0.12 : 0.25));
    } catch {
      // Audio not available (e.g. no user gesture yet) - fail silently
    }
  }, []);

  const { data: products } = useQuery({
    queryKey: ["products", searchTerm, categoryFilter],
    queryFn: async () => {
      if (!navigator.onLine) {
        return await searchCachedProducts(searchTerm);
      }
      try {
        let query = supabase.from("products").select("*");

        if (searchTerm) {
          query = query.or(`name.ilike.%${searchTerm}%,barcode.ilike.%${searchTerm}%,qr_code_number.ilike.%${searchTerm}%`);
        }
        if (categoryFilter !== "all") {
          query = query.eq("category", categoryFilter);
        }

        // Typing a search term already narrows results to a handful of matches, so 20 is
        // plenty. Browsing a category with no search term (the whole point of the category
        // tabs below) needs a bigger ceiling or most of that category would never show up.
        const limit = !searchTerm && categoryFilter !== "all" ? 60 : 20;
        const { data, error } = await query.limit(limit);
        if (error) throw error;
        return data || [];
      } catch (err) {
        // Network hiccup - fall back to the last cached catalog so billing keeps going.
        return await searchCachedProducts(searchTerm);
      }
    },
  });

  // Category tabs above the product grid - merges the managed Product Category list with any
  // legacy category strings already sitting on products (same reasoning as the Items page).
  const { data: managedCategories } = useQuery({
    // Deliberately NOT "product-categories" - that key belongs to the Product Category page's
    // own full-row query. Sharing it with this narrower `select("name")` query corrupts
    // whichever page reads the cache second (missing id/created_at crashes that page's render).
    queryKey: ["product-category-names"],
    queryFn: async () => {
      const { data, error } = await supabase.from("product_categories").select("name").order("name");
      if (error) throw error;
      return data as { name: string }[];
    },
  });

  const { data: allProductCategories } = useQuery({
    queryKey: ["all-product-categories-for-pos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("category");
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60_000,
  });

  const posCategories = useMemo(() => {
    const fromProducts = (allProductCategories?.map((p: any) => p.category).filter(Boolean) || []) as string[];
    const fromManaged = (managedCategories?.map(c => c.name).filter(Boolean) || []) as string[];
    return Array.from(new Set([...fromManaged, ...fromProducts])).sort((a, b) => a.localeCompare(b));
  }, [allProductCategories, managedCategories]);

  // Sort the currently-visible grid by how often each product actually sells (last 30 days),
  // so a cashier who taps "Vegetables" sees tomato/onion/potato at the very top instead of
  // having to scroll an alphabetical list to find what's sold a hundred times today. Scoped to
  // a 10-minute cache since it's about general ranking, not something that needs to be live.
  const { data: salesFrequency } = useQuery({
    queryKey: ["pos-sales-frequency-30d"],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const { data: sales, error: sErr } = await supabase
        .from("sales")
        .select("id")
        .gte("sale_date", since.toISOString());
      if (sErr) throw sErr;
      const saleIds = (sales || []).map((s: any) => s.id);
      if (saleIds.length === 0) return new Map<string, number>();

      const { data: items, error: iErr } = await supabase
        .from("sale_items")
        .select("product_id, quantity")
        .in("sale_id", saleIds);
      if (iErr) throw iErr;

      const qtyByProduct = new Map<string, number>();
      for (const item of items || []) {
        if (!item.product_id) continue;
        qtyByProduct.set(item.product_id, (qtyByProduct.get(item.product_id) || 0) + Number(item.quantity || 0));
      }
      return qtyByProduct;
    },
    staleTime: 10 * 60_000,
  });

  const sortedProducts = useMemo<any[] | undefined>(() => {
    if (!products) return undefined;
    const freq = salesFrequency || new Map<string, number>();
    return [...(products as any[])].sort((a: any, b: any) => {
      const diff = (freq.get(b.id) || 0) - (freq.get(a.id) || 0);
      if (diff !== 0) return diff;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
  }, [products, salesFrequency]);

  const { data: shopSettings } = useQuery({
    queryKey: ["settings-for-receipt"],
    queryFn: async () => {
      const { data, error } = await supabase.from("settings").select("business_name, address, phone").limit(1).single();
      if (error && error.code !== "PGRST116") throw error;
      return data;
    },
  });

  const { data: allTiers } = useQuery({
    queryKey: ["product-price-tiers-all"],
    queryFn: async () => {
      if (!navigator.onLine) return getCachedPriceTiers();
      try {
        const { data, error } = await supabase.from("product_price_tiers").select("*");
        if (error) throw error;
        return data || [];
      } catch (err) {
        return getCachedPriceTiers();
      }
    },
  });

  const tiersForProduct = useCallback(
    (productId: string): PriceTier[] =>
      (allTiers || [])
        .filter((t: any) => t.product_id === productId)
        .map((t: any) => ({ min_qty: Number(t.min_qty), unit_price: Number(t.unit_price) })),
    [allTiers]
  );

  // ---- Offline billing: cache warmup + queued-sale sync ----
  const refreshPendingSyncCount = useCallback(async () => {
    const pending = await getPendingSales();
    setPendingSyncCount(pending.length);
  }, []);

  const runSync = useCallback(async () => {
    if (!navigator.onLine) return;
    setIsSyncing(true);
    try {
      const result = await syncPendingSales();
      await refreshPendingSyncCount();
      if (result.succeeded > 0 || result.failed > 0) {
        queryClient.invalidateQueries({ queryKey: ["products"] });
        queryClient.invalidateQueries({ queryKey: ["today-sales"] });
        queryClient.invalidateQueries({ queryKey: ["credit-customers"] });
      }
      if (result.succeeded > 0) {
        toast({
          title: "Synced",
          description: `${result.succeeded} offline sale${result.succeeded === 1 ? "" : "s"} synced to the server.`,
        });
      }
      if (result.failed > 0) {
        toast({
          title: "Sync issue",
          description: `${result.failed} offline sale${result.failed === 1 ? "" : "s"} couldn't sync - will retry.`,
          variant: "destructive",
        });
      }
    } catch {
      // best-effort; leave items queued for next attempt
    } finally {
      setIsSyncing(false);
    }
  }, [queryClient, toast, refreshPendingSyncCount]);

  // On mount: warm the offline cache and flush any sales queued from a previous offline session.
  useEffect(() => {
    refreshPendingSyncCount();
    if (navigator.onLine) {
      refreshOfflineCache().catch(() => {});
      runSync();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When connectivity comes back, refresh the catalog cache and flush the queue automatically.
  useEffect(() => {
    if (isOnline) {
      refreshOfflineCache().catch(() => {});
      runSync();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  // Build a full CartItem for a real product row, given a selling mode and starting quantity
  const buildCartLine = useCallback(
    (product: any, soldUnit: CartItem["sold_unit"], quantity: number): CartItem => {
      const base = {
        line_key: `${product.id}_${soldUnit}`,
        product_id: product.id,
        name: product.name,
        base_price: Number(product.price) || 0,
        quantity,
        barcode: product.barcode,
        unit_label: product.unit_label || "pcs",
        sold_unit: soldUnit,
        case_size: product.case_size ? Number(product.case_size) : undefined,
        case_price: product.case_price != null ? Number(product.case_price) : undefined,
        min_order_qty: Number(product.min_order_qty) || 1,
        is_weight_based: !!product.is_weight_based,
        tiers: tiersForProduct(product.id),
        item_discount: 0,
        item_discount_type: "percentage" as DiscountType,
        cost: product.cost != null ? Number(product.cost) : undefined,
      };
      return { ...base, price: computeLinePrice(base, quantity) };
    },
    [tiersForProduct]
  );

  // Find best matching product using phonetic matching
  const findBestMatch = useCallback((input: string, productList: any[]) => {
    let bestMatch = null;
    let bestScore = 0;
    
    for (const product of productList) {
      const nameScore = phoneticMatch(input, product.name);
      const categoryScore = product.category ? phoneticMatch(input, product.category) * 0.5 : 0;
      const brandScore = product.brand ? phoneticMatch(input, product.brand) * 0.3 : 0;
      
      const totalScore = Math.max(nameScore, nameScore + categoryScore, nameScore + brandScore);
      
      if (totalScore > bestScore) {
        bestScore = totalScore;
        bestMatch = product;
      }
    }
    
    return bestScore > 0.4 ? bestMatch : null;
  }, []);

  // Voice search handler - defined after products
  const handleVoiceResult = useCallback(async (transcript: string) => {
    console.log("Voice transcript:", transcript);
    setSearchTerm(transcript);
    setShowVoicePreview(true);
    
    // Process voice commands
    const lowerTranscript = transcript.toLowerCase().trim();
    
    // Voice command: "checkout" or "proceed to bill"
    if (lowerTranscript.includes("checkout") || lowerTranscript.includes("proceed to bill") || lowerTranscript.includes("complete sale")) {
      if (cart.length > 0) {
        toast({
          title: "Ready for Checkout",
          description: "Please confirm payment details to complete sale",
        });
        document.getElementById("payment-section")?.scrollIntoView({ behavior: "smooth" });
        setSearchTerm("");
        return;
      } else {
        toast({
          title: "Cart Empty",
          description: "Add items to cart before checkout",
          variant: "destructive",
        });
        return;
      }
    }
    
    // Hide preview after a delay
    setTimeout(() => setShowVoicePreview(false), 3000);
  }, [cart, toast]);

  // Effect to handle voice commands that need products data
  useEffect(() => {
    if (!showVoicePreview || !searchTerm || !products) return;
    
    const lowerTranscript = searchTerm.toLowerCase().trim();
    
    // Voice command: "add this" - add first matching product
    if (lowerTranscript.includes("add this") || lowerTranscript.includes("add item")) {
      const productName = lowerTranscript.replace(/add (this|item)/g, "").trim();
      if (productName && products.length > 0) {
        const matchedProduct = findBestMatch(productName, products);
        if (matchedProduct) {
          addToCart(matchedProduct);
          toast({
            title: "Added via Voice",
            description: `${matchedProduct.name} added to cart`,
          });
          setSearchTerm("");
          setShowVoicePreview(false);
          return;
        }
      }
    }
    
    // Voice command: "remove this"
    if (lowerTranscript.includes("remove this") || lowerTranscript.includes("remove item")) {
      const productName = lowerTranscript.replace(/remove (this|item)/g, "").trim();
      if (productName && cart.length > 0) {
        const matchedCartItem = cart.find(item => 
          phoneticMatch(productName, item.name) > 0.6
        );
        if (matchedCartItem) {
          removeFromCart(matchedCartItem.line_key);
          toast({
            title: "Removed via Voice",
            description: `${matchedCartItem.name} removed from cart`,
          });
          setSearchTerm("");
          setShowVoicePreview(false);
          return;
        }
      }
    }

    // Auto-add product if there's a strong match (not a command)
    if (!lowerTranscript.includes("add") && !lowerTranscript.includes("remove") && 
        !lowerTranscript.includes("checkout") && !lowerTranscript.includes("bill") &&
        products.length > 0) {
      const bestMatch = findBestMatch(searchTerm, products);
      if (bestMatch && phoneticMatch(searchTerm, bestMatch.name) > 0.8) {
        addToCart(bestMatch);
        toast({
          title: "Product Added via Voice",
          description: `${bestMatch.name} added to cart`,
        });
        setSearchTerm("");
        setShowVoicePreview(false);
      }
    }
  }, [products, searchTerm, showVoicePreview, cart, findBestMatch, toast]);

  const handleVoiceError = useCallback((error: string) => {
    toast({
      title: "Voice Input Error",
      description: error,
      variant: "destructive",
    });
  }, [toast]);

  const {
    isListening,
    transcript: voiceTranscript,
    toggleListening,
    isSupported: voiceSupported,
    error: voiceError,
  } = useVoiceSearch({
    language: voiceLanguage,
    onResult: handleVoiceResult,
    onError: handleVoiceError,
  });

  // Toggle voice language
  const toggleVoiceLanguage = useCallback(() => {
    setVoiceLanguage(prev => prev === "en-US" ? "ta-LK" : "en-US");
    toast({
      title: "Voice Language Changed",
      description: voiceLanguage === "en-US" ? "தமிழ் (Tamil)" : "English",
    });
  }, [voiceLanguage, toast]);

  // Interface for QR JSON items (supports new format and legacy)
  interface QRJsonItem {
    type?: string;
    item_id?: string;
    id?: string;
    itemCode?: string;
    name?: string;
    itemName?: string;
    qty?: number;
    quantity?: number;
    price?: number;
    unitPrice?: number;
    currency?: string;
    sku?: string;
    timestamp?: number;
  }

  // Check if string is valid JSON
  const isValidJSON = (str: string): boolean => {
    try {
      const parsed = JSON.parse(str);
      return typeof parsed === 'object' && parsed !== null;
    } catch {
      return false;
    }
  };

  // Map QR item keys to POS format (supports new format with item_id and legacy)
  const mapQRItemToPOS = (item: QRJsonItem) => ({
    itemCode: item.item_id || item.id || item.itemCode || '',
    itemName: item.name || item.itemName || '',
    quantity: item.qty || item.quantity || 1,
    unitPrice: item.price || item.unitPrice || 0,
    total: (item.qty || item.quantity || 1) * (item.price || item.unitPrice || 0),
  });

  // Process JSON QR code with items array or single item
  const handleJSONQRScan = async (jsonString: string) => {
    try {
      const parsed = JSON.parse(jsonString);
      
      // Check if it's a single item QR (new format with type: "item")
      if (parsed.type === "item" && parsed.item_id) {
        // Single item QR code - add directly to cart
        const { data: existingProduct } = await supabase
          .from("products")
          .select("*")
          .eq("qr_code_number", parsed.item_id)
          .limit(1)
          .single();

        if (existingProduct) {
          addToCart(existingProduct);
          toast({
            title: "Item Added via QR!",
            description: `${existingProduct.name} added to cart`,
          });
        } else {
          // Add as temporary item if not in database
          const tempId = `temp_${parsed.item_id}_${Date.now()}`;
          const qty = parsed.qty || 1;
          const tempPrice = parsed.price || 0;
          setCart(prev => [...prev, {
            line_key: tempId,
            product_id: tempId,
            name: parsed.name || "Unknown Item",
            price: tempPrice,
            base_price: tempPrice,
            quantity: qty,
            unit_label: "pcs",
            sold_unit: "unit",
            min_order_qty: 1,
            is_weight_based: false,
            tiers: [],
          }]);
          toast({
            title: "Item Added",
            description: `${parsed.name || "Unknown Item"} added to cart`,
          });
        }
        setSearchTerm("");
        setLastScannedQR(jsonString);
        setTimeout(() => setLastScannedQR(""), 500);
        return;
      }
      
      // Check for items array (bulk items)
      if (!parsed.items || !Array.isArray(parsed.items)) {
        toast({
          title: "Invalid QR Format",
          description: "QR code must contain an 'items' array or be a single item",
          variant: "destructive",
        });
        return;
      }

      // Map items to POS format
      const mappedItems = parsed.items.map(mapQRItemToPOS);

      // Send to backend API
      const { data, error } = await supabase.functions.invoke('qr-add-items', {
        body: { items: mappedItems },
      });

      if (error) {
        console.error('Backend error:', error);
        toast({
          title: "Error",
          description: "Failed to process QR items",
          variant: "destructive",
        });
        return;
      }

      if (data.status === 'error') {
        toast({
          title: "QR Processing Error",
          description: data.message,
          variant: "destructive",
        });
        return;
      }

      // Add validated items to cart
      const savedItems = data.data?.savedItems || [];
      for (const item of savedItems) {
        // Check if product exists in database by itemCode (qr_code_number)
        const { data: existingProduct } = await supabase
          .from("products")
          .select("*")
          .eq("qr_code_number", item.itemCode)
          .limit(1)
          .single();

        if (existingProduct) {
          // Add existing product to cart (as a "unit" line)
          const lineKey = `${existingProduct.id}_unit`;
          const existingCartItem = cart.find(c => c.line_key === lineKey);
          if (existingCartItem) {
            const newQty = existingCartItem.quantity + item.quantity;
            setCart(prev => prev.map(c =>
              c.line_key === lineKey
                ? { ...c, quantity: newQty, price: computeLinePrice(c, newQty) }
                : c
            ));
          } else {
            setCart(prev => [...prev, buildCartLine(existingProduct, "unit", item.quantity)]);
          }
        } else {
          // Add as temporary item (no real product_id)
          const tempId = `temp_${item.itemCode}_${Date.now()}`;
          setCart(prev => [...prev, {
            line_key: tempId,
            product_id: tempId,
            name: item.itemName,
            price: item.unitPrice,
            base_price: item.unitPrice,
            quantity: item.quantity,
            unit_label: "pcs",
            sold_unit: "unit",
            min_order_qty: 1,
            is_weight_based: false,
            tiers: [],
          }]);
        }
      }

      toast({
        title: "QR Items Loaded!",
        description: `${savedItems.length} item(s) added to cart`,
      });

      setSearchTerm("");
      setLastScannedQR(jsonString);
      setTimeout(() => setLastScannedQR(""), 500);

    } catch (error) {
      console.error('JSON parse error:', error);
      toast({
        title: "Invalid QR Code",
        description: "Could not parse QR code data",
        variant: "destructive",
      });
    }
  };

  // Add a scanned product to the cart, refocus the search bar, and give audio/visual feedback
  // so a cashier can keep firing a USB/Bluetooth barcode gun without touching the mouse/keyboard.
  const addScannedProduct = (product: any, rawCode: string) => {
    addToCart(product);
    setLastScannedQR(rawCode);
    playScanBeep(true);
    toast({
      title: "Item Scanned!",
      description: `${product.name} added to cart`,
    });
    setSearchTerm("");
    setTimeout(() => setLastScannedQR(""), 300);
    // Barcode guns type into whatever has focus - keep focus on the search bar so the next scan works immediately.
    requestAnimationFrame(() => searchInputRef.current?.focus());
  };

  // Auto-add to cart when a code is scanned - via camera QR, or a USB/Bluetooth barcode gun
  // (which behaves like a keyboard: it types the code into the focused field, then sends Enter).
  // A customer built a list on the public /catalog page and is showing us its QR at the
  // till - merge every item straight into the cart in one go instead of scanning one by one.
  const handleCatalogListScan = async (items: { product_id: string; qty: number }[]) => {
    const productIds = (items || []).map((i) => i.product_id).filter(Boolean);
    if (productIds.length === 0) return;

    const { data: matchedProducts, error } = await supabase.from("products").select("*").in("id", productIds);
    if (error || !matchedProducts) {
      toast({ title: "Error", description: "Failed to load the customer's list", variant: "destructive" });
      return;
    }

    let addedCount = 0;
    setCart((prevCart) => {
      const nextCart = [...prevCart];
      for (const item of items) {
        const product = matchedProducts.find((p) => p.id === item.product_id);
        if (!product) continue;
        const lineKey = `${product.id}_unit`;
        const existingIndex = nextCart.findIndex((c) => c.line_key === lineKey);
        if (existingIndex >= 0) {
          const newQty = nextCart[existingIndex].quantity + item.qty;
          nextCart[existingIndex] = { ...nextCart[existingIndex], quantity: newQty, price: computeLinePrice(nextCart[existingIndex], newQty) };
        } else {
          nextCart.push(buildCartLine(product, "unit", item.qty));
        }
        addedCount++;
      }
      return nextCart;
    });

    toast({ title: "Customer's List Loaded!", description: `${addedCount} item(s) added to cart` });
  };

  const handleQRScan = async (qrContent: string) => {
    if (!qrContent || qrContent === lastScannedQR) return;

    let qrNumber: string | null = null;

    // Check if content is JSON (camera-scanned QR labels from this app)
    if (isValidJSON(qrContent)) {
      try {
        const parsed = JSON.parse(qrContent);
        // Handle single-item QR (from our label printer): { type:"item", item_id:"1001", ... }
        if (parsed.type === "item" && parsed.item_id) {
          qrNumber = String(parsed.item_id);
        } else if (parsed.type === "catalog_list" && Array.isArray(parsed.items)) {
          // Legacy format: full item list embedded directly in the QR
          await handleCatalogListScan(parsed.items);
          setLastScannedQR(qrContent);
          setTimeout(() => setLastScannedQR(""), 500);
          return;
        } else if (parsed.type === "catalog_session" && parsed.code) {
          // Customer's self-built list from the public catalog page, referenced by a short code
          // (kept short specifically so hardware barcode/QR scanners can decode it reliably -
          // the full item list used to be embedded directly and was too dense for some scanners).
          setLastScannedQR(qrContent);
          const { data: session, error } = await supabase
            .from("catalog_checkout_sessions")
            .select("items, expires_at")
            .eq("code", parsed.code)
            .maybeSingle();
          if (error || !session) {
            playScanBeep(false);
            toast({ title: "Code not found", description: "This checkout code is invalid or already used.", variant: "destructive" });
          } else if (new Date(session.expires_at) < new Date()) {
            playScanBeep(false);
            toast({ title: "Code expired", description: "Ask the customer to regenerate their list QR.", variant: "destructive" });
          } else {
            await handleCatalogListScan(session.items as { product_id: string; qty: number }[]);
            await supabase.from("catalog_checkout_sessions").update({ consumed_at: new Date().toISOString() }).eq("code", parsed.code);
          }
          setTimeout(() => setLastScannedQR(""), 500);
          return;
        } else if (parsed.qr) {
          // Legacy format: { qr:"1001", name:"...", price:... }
          qrNumber = String(parsed.qr);
        } else if (parsed.items && Array.isArray(parsed.items)) {
          // Bulk items JSON
          await handleJSONQRScan(qrContent);
          return;
        }
      } catch {
        // Not valid JSON, fall through
      }
    }

    // Real product barcodes (from a USB/Bluetooth scanner reading packaging, EAN/UPC/Code128 etc.)
    // live in the `barcode` column - try an exact match first since that's the common case.
    if (!qrNumber && qrContent.trim().length >= 4) {
      const trimmed = qrContent.trim();
      if (!navigator.onLine) {
        const cached = await findCachedProductByCode(trimmed);
        if (cached) {
          addScannedProduct(cached, qrContent);
          return;
        }
      } else {
        try {
          const { data: byBarcode, error: barcodeError } = await supabase
            .from("products")
            .select("*")
            .eq("barcode", trimmed)
            .limit(1);

          if (!barcodeError && byBarcode && byBarcode.length > 0) {
            addScannedProduct(byBarcode[0], qrContent);
            return;
          }
        } catch {
          const cached = await findCachedProductByCode(trimmed);
          if (cached) {
            addScannedProduct(cached, qrContent);
            return;
          }
        }
      }
    }

    // Fall back to this app's internal QR code number (from QR Code Print labels)
    if (!qrNumber) {
      const isQRNumber = /^\d+$/.test(qrContent) && parseInt(qrContent) >= 1001;
      if (isQRNumber) {
        qrNumber = qrContent;
      }
    }

    if (qrNumber) {
      if (!navigator.onLine) {
        const cached = await findCachedProductByCode(qrNumber);
        if (cached) {
          addScannedProduct(cached, qrContent);
        } else {
          playScanBeep(false);
          toast({ title: "Unknown Code (offline)", description: `No cached product for: ${qrNumber}`, variant: "destructive" });
        }
        return;
      }
      try {
        const { data: matchedProducts, error } = await supabase
          .from("products")
          .select("*")
          .eq("qr_code_number", qrNumber)
          .limit(1);

        if (!error && matchedProducts && matchedProducts.length > 0) {
          addScannedProduct(matchedProducts[0], qrContent);
          return;
        }
      } catch {
        // fall through to cache check below
      }
      const cached = await findCachedProductByCode(qrNumber);
      if (cached) {
        addScannedProduct(cached, qrContent);
      } else {
        playScanBeep(false);
        toast({
          title: "Unknown Code",
          description: `No product found for: ${qrNumber}`,
          variant: "destructive",
        });
      }
    }
  };

  // Keep a ref to the latest handleQRScan so the global listener below (which only runs its
  // setup effect once) never closes over stale cart/state from an earlier render.
  const handleQRScanRef = useRef(handleQRScan);
  useEffect(() => {
    handleQRScanRef.current = handleQRScan;
  });

  // Hardware barcode/QR scanners act like a keyboard: they "type" the decoded value into
  // whatever element currently has focus, then send Enter. That works fine on a desktop/laptop
  // where the search bar reliably holds focus - but on a touch-only POS terminal (no mouse, no
  // physical keyboard) there's nothing to click into the search bar, so focus drifts to whatever
  // was last tapped (a product tile, a button, or nothing at all) and the scan silently goes
  // nowhere. This listens at the document level and reconstructs scanner input from raw
  // keystrokes - completely independent of what currently has focus - so a scan works no matter
  // where the cashier last tapped. It only steps back when a *different* real text field (one the
  // cashier deliberately clicked/tapped into, e.g. Discount or Customer search) has focus, so
  // normal human typing elsewhere on the page is never hijacked.
  useEffect(() => {
    let buffer = "";
    let lastKeyTime = 0;
    const SCANNER_MAX_GAP_MS = 60; // hardware scanners fire keystrokes far faster than any human types
    const MIN_SCAN_LENGTH = 4;

    const handleGlobalKeydown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isOtherTextField =
        (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) && target !== searchInputRef.current;
      if (isOtherTextField) return; // a human deliberately focused this field - let them type normally
      if (target === searchInputRef.current) return; // already handled by handleSearchChange/handleSearchKeyDown

      const now = Date.now();
      if (now - lastKeyTime > SCANNER_MAX_GAP_MS) buffer = "";
      lastKeyTime = now;

      if (e.key === "Enter") {
        if (buffer.length >= MIN_SCAN_LENGTH) {
          e.preventDefault();
          handleQRScanRef.current(buffer);
        }
        buffer = "";
        return;
      }
      if (e.key.length === 1) buffer += e.key;
    };

    document.addEventListener("keydown", handleGlobalKeydown);
    return () => document.removeEventListener("keydown", handleGlobalKeydown);
  }, []);

  // Watch for scanner/typed input in the search bar (debounced so normal typing doesn't spam lookups)
  const handleSearchChange = (value: string) => {
    setSearchTerm(value);

    if (scanDebounceRef.current) clearTimeout(scanDebounceRef.current);
    scanDebounceRef.current = setTimeout(() => {
      handleQRScan(value);
    }, 150);
  };

  // Barcode guns send an Enter keystroke right after the code - act on it immediately
  // instead of waiting for the debounce, so billing feels instant.
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (scanDebounceRef.current) clearTimeout(scanDebounceRef.current);
      handleQRScan(searchTerm);
    }
  };

  const { data: creditCustomers } = useQuery({
    queryKey: ["credit-customers", customerSearchTerm],
    queryFn: async () => {
      let query = supabase.from("credit_customers").select("*");
      
      if (customerSearchTerm) {
        query = query.or(`name.ilike.%${customerSearchTerm}%,phone.ilike.%${customerSearchTerm}%`);
      }
      
      const { data, error } = await query.limit(10);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: creditInvoices } = useQuery({
    queryKey: ["credit-invoices", viewCustomer?.id],
    queryFn: async () => {
      if (!viewCustomer) return [];
      
      const { data, error } = await supabase
        .from("sales")
        .select("*")
        .eq("customer_id", viewCustomer.id)
        .in("status", ["open", "partial"])
        .order("sale_date", { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!viewCustomer,
  });

  // Auto print sale receipt
  const printSaleReceipt = async (saleData: {
    invoiceNumber: string;
    items: CartItem[];
    subtotal: number;
    discountAmount: number;
    total: number;
    paidAmount: number;
    balance: number;
    paymentMethod: string;
    customerName?: string;
  }) => {
    const printWindow = window.open('', '_blank', 'width=320,height=600');
    if (!printWindow) {
      toast({
        title: "Popup Blocked",
        description: "Please allow popups to print receipt",
        variant: "destructive",
      });
      return;
    }

    const now = new Date();
    const dateStr = now.toLocaleDateString('en-GB');
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    const widthMm = getPaperWidth(); // 58 or 80
    const logoUrl = artixoLogo.startsWith('http') ? artixoLogo : `${window.location.origin}${artixoLogo}`;
    const businessName = shopSettings?.business_name || 'Artixo POS';
    const businessAddress = shopSettings?.address || '';
    const businessPhone = shopSettings?.phone || '';

    // Scan-to-return QR - lets a phone camera (or the in-app scanner on the Returns page)
    // jump straight to this invoice instead of typing the invoice number in by hand.
    const returnUrl = `${window.location.origin}/returns?invoice=${encodeURIComponent(saleData.invoiceNumber)}`;
    const returnQrDataUrl = await QRCode.toDataURL(returnUrl, { width: 200, margin: 1, errorCorrectionLevel: "M" }).catch(() => "");

    const formatQty = (item: CartItem) =>
      item.is_weight_based ? item.quantity.toFixed(3) : String(item.quantity);

    const itemsHTML = saleData.items.map((item, idx) => {
      const itemDiscountAmt = getItemDiscountAmount(item);
      const lineNet = getLineNetTotal(item);
      return `
      <div class="item">
        <div class="item-name"><span class="item-no">${String(idx + 1).padStart(2, '0')}</span>${item.name}</div>
        <div class="item-row">
          <span class="item-qty">${formatQty(item)}${item.unit_label ? ` ${item.unit_label}` : ''} &times; ${(item.price ?? 0).toFixed(2)}</span>
          <span class="item-amt">Rs. ${lineNet.toFixed(2)}</span>
        </div>
        ${itemDiscountAmt > 0 ? `
        <div class="item-row" style="color:#b00020;">
          <span class="item-qty">Item Discount</span>
          <span class="item-amt">- Rs. ${itemDiscountAmt.toFixed(2)}</span>
        </div>
        ` : ''}
      </div>
    `;
    }).join('');

    const receiptHTML = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Receipt - ${saleData.invoiceNumber}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            @page { size: ${widthMm}mm auto; margin: 0; }
            @media print {
              body { width: ${widthMm}mm; margin: 0; padding: 2mm; }
            }
            body {
              font-family: 'Consolas', 'Courier New', monospace;
              font-weight: 700;
              font-size: 11px;
              width: ${widthMm}mm;
              margin: 0 auto;
              padding: 3mm;
              background: #fff;
              color: #000;
              line-height: 1.45;
            }
            .ticket { border: 2.5px solid #000; padding: 4mm 3mm; }
            .zigzag { height: 5px; margin: 0 -3mm 6px -3mm; background-image: linear-gradient(135deg, #fff 50%, transparent 50%), linear-gradient(-135deg, #fff 50%, transparent 50%); background-size: 8px 10px; background-position: bottom; background-repeat: repeat-x; background-color: #000; }
            .zigzag.bottom { margin: 6px -3mm 0 -3mm; }
            .header { text-align: center; margin-bottom: 8px; }
            .header img { width: 16mm; height: auto; margin: 0 auto 3px auto; display: block; }
            .header h1 { font-size: 17px; font-weight: 900; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 3px; }
            .header .tagline { display: inline-block; font-size: 8px; font-weight: 800; color: #fff; background: #000; text-transform: uppercase; letter-spacing: 1px; padding: 2px 8px; border-radius: 8px; margin-bottom: 4px; }
            .header p { font-size: 9.5px; font-weight: 700; color: #000; }
            .divider-stars { text-align: center; font-size: 10px; font-weight: 900; letter-spacing: 3px; margin: 7px 0; }
            .divider { border-top: 2px dashed #000; margin: 7px 0; }
            .info-row { display: flex; justify-content: space-between; margin: 3px 0; font-size: 10.5px; font-weight: 700; }
            .info-row .val { font-weight: 900; }
            .items-head { display: flex; justify-content: space-between; font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; background: #000; color: #fff; padding: 3px 4px; margin-bottom: 6px; }
            .items { margin: 6px 0; }
            .item { margin-bottom: 6px; }
            .item-no { display: inline-block; font-weight: 900; color: #fff; background: #000; font-size: 8px; padding: 1px 4px; border-radius: 3px; margin-right: 5px; }
            .item-name { font-size: 11.5px; font-weight: 800; }
            .item-row { display: flex; justify-content: space-between; font-size: 10.5px; font-weight: 700; color: #000; margin-top: 2px; padding-left: 20px; }
            .item-amt { font-weight: 900; }
            .totals .row { display: flex; justify-content: space-between; margin: 3px 0; font-size: 11px; font-weight: 800; }
            .totals .discount { color: #b00020; }
            .totals .grand { font-size: 16px; font-weight: 900; background: #000; color: #fff; padding: 6px 5px; margin-top: 6px; letter-spacing: 0.5px; }
            .payment { margin: 8px 0; }
            .payment .badge { display: inline-block; font-weight: 900; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.5px; border: 2px solid #000; padding: 1px 8px; border-radius: 10px; }
            .payment .due { font-weight: 900; font-size: 13px; border-top: 2px solid #000; padding-top: 4px; margin-top: 4px; }
            .footer { text-align: center; margin-top: 14px; font-size: 10px; font-weight: 700; }
            .footer .thanks { font-weight: 900; font-size: 14px; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 4px; }
            .footer .stamp { display: inline-block; border: 2px solid #000; border-radius: 50%; padding: 6px 10px; font-weight: 900; font-size: 9px; letter-spacing: 1px; transform: rotate(-6deg); margin: 4px 0; }
            .footer .return-qr { margin: 8px 0 2px 0; }
            .footer .return-qr img { width: 20mm; height: 20mm; image-rendering: pixelated; }
            .footer .return-qr .label { font-size: 8.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 2px; }
            .footer .support { font-size: 9.5px; font-weight: 700; color: #000; margin-top: 6px; }
            .footer .powered { font-size: 8.5px; font-weight: 800; color: #000; margin-top: 8px; letter-spacing: 0.6px; }
          </style>
        </head>
        <body>
          <div class="ticket">
            <div class="header">
              <img src="${logoUrl}" alt="Artixo" />
              <h1>${businessName}</h1>
              <div class="tagline">Wholesale Grocery POS</div>
              ${businessAddress ? `<p>${businessAddress}</p>` : ''}
              ${businessPhone ? `<p>${businessPhone}</p>` : ''}
            </div>

            <div class="zigzag"></div>

            <div class="info">
              <div class="info-row">
                <span>Invoice</span>
                <span class="val">${saleData.invoiceNumber}</span>
              </div>
              <div class="info-row">
                <span>Date</span>
                <span class="val">${dateStr}&nbsp;&nbsp;${timeStr}</span>
              </div>
              ${saleData.customerName ? `
              <div class="info-row">
                <span>Customer</span>
                <span class="val">${saleData.customerName}</span>
              </div>
              ` : ''}
            </div>

            <div class="divider-stars">&#9670; &#9670; &#9670; &#9670; &#9670; &#9670; &#9670;</div>

            <div class="items">
              <div class="items-head">
                <span>Item</span>
                <span>Amount</span>
              </div>
              ${itemsHTML}
            </div>

            <div class="divider"></div>

            <div class="totals">
              <div class="row">
                <span>Subtotal</span>
                <span>Rs. ${saleData.subtotal.toFixed(2)}</span>
              </div>
              ${saleData.discountAmount > 0 ? `
              <div class="row discount">
                <span>Discount</span>
                <span>- Rs. ${saleData.discountAmount.toFixed(2)}</span>
              </div>
              ` : ''}
              <div class="row grand">
                <span>TOTAL</span>
                <span>Rs. ${saleData.total.toFixed(2)}</span>
              </div>
            </div>

            <div class="payment">
              <div class="info-row">
                <span>Paid By</span>
                <span class="badge">${saleData.paymentMethod}</span>
              </div>
              <div class="info-row">
                <span>Paid Amount</span>
                <span class="val">Rs. ${saleData.paidAmount.toFixed(2)}</span>
              </div>
              <div class="info-row due">
                <span>${saleData.balance >= 0 ? 'Change' : 'Balance Due'}</span>
                <span class="val">Rs. ${Math.abs(saleData.balance).toFixed(2)}</span>
              </div>
            </div>

            <div class="zigzag bottom"></div>

            <div class="footer">
              <div class="thanks">Thank You!</div>
              <div class="stamp">VISIT<br/>AGAIN</div>
              ${returnQrDataUrl ? `
              <div class="return-qr">
                <img src="${returnQrDataUrl}" alt="Scan to return" />
                <div class="label">Scan to Return</div>
              </div>
              ` : ''}
              <div class="support">Support: ${SUPPORT_PHONE}</div>
              <div class="powered">POWERED BY ARTIXO POS</div>
            </div>
          </div>
        </body>
      </html>
    `;

    printWindow.document.write(receiptHTML);
    printWindow.document.close();
    
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.focus();
        printWindow.print();
      }, 200);
    };
    
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 400);
  };

  // Paper-free alternative to printReceipt(): builds a QR the customer scans with their own
  // phone to view the bill at /receipt/:invoiceNumber (public page, reads straight from
  // Supabase). Only works for invoices that have actually been written to the sales table -
  // offline-queued sales use a local placeholder invoice number until they sync, so callers
  // should keep using printReceipt() for those.
  // autoSendPhone: only passed right after a real checkout completes (see onSuccess below), never
  // on a manual reopen of this dialog - so re-viewing an old receipt never re-fires WhatsApp.
  const showDigitalReceipt = async (invoiceNumber: string, autoSendPhone?: string | null) => {
    const link = `${window.location.origin}/receipt/${encodeURIComponent(invoiceNumber)}`;
    try {
      const qrUrl = await QRCode.toDataURL(link, { width: 320, margin: 1, errorCorrectionLevel: "M" });
      setDigitalReceiptQrUrl(qrUrl);
      setDigitalReceiptLink(link);
      setWhatsappPhone(autoSendPhone || lastReceiptData?.customerPhone || "");
      setDigitalReceiptOpen(true);
      // Payment done -> WhatsApp opens on its own with the bill pre-filled, no extra tap inside
      // the app needed. Only when a phone number is actually on file for this sale (credit
      // customer, or a walk-in whose number was entered) - a plain cash sale with no phone
      // attached still just shows the QR, nothing pops up. WhatsApp itself still requires one
      // tap on its own Send button - no free method can skip that last step from outside WhatsApp.
      if (autoSendPhone) {
        const message = `Thank you for your purchase! View your bill here: ${link}`;
        openWhatsAppShare(autoSendPhone, message);
      }
    } catch {
      toast({
        title: "Couldn't generate QR",
        description: "Falling back to printing the receipt instead.",
        variant: "destructive",
      });
      if (lastReceiptData) printReceipt(lastReceiptData);
    }
  };

  // wa.me link method: no WhatsApp Business API, no Meta approval, no per-message cost - just
  // opens WhatsApp (Web/Desktop/App, whichever the cashier/owner is logged into) with the bill
  // link pre-filled in the message box. One manual tap to actually send. Works for a walk-in
  // customer too - the phone field is editable even when no customer is attached to the sale.
  const sendDigitalReceiptViaWhatsApp = () => {
    if (!whatsappPhone.trim()) {
      toast({
        title: "Enter a phone number",
        description: "Type the customer's WhatsApp number to send the bill.",
        variant: "destructive",
      });
      return;
    }
    const message = `Thank you for your purchase! View your bill here: ${digitalReceiptLink}`;
    openWhatsAppShare(whatsappPhone, message);
  };

  // Prints a sale receipt: direct to a connected USB thermal printer if available/enabled,
  // otherwise falls back to the browser print dialog (and always falls back on any error).
  const printReceipt = async (saleData: {
    invoiceNumber: string;
    items: CartItem[];
    subtotal: number;
    discountAmount: number;
    total: number;
    paidAmount: number;
    balance: number;
    paymentMethod: string;
    customerName?: string;
  }) => {
    const canDirectPrint = isWebUSBSupported() && !!getSavedPrinterInfo() && isAutoDirectPrintEnabled();
    if (canDirectPrint) {
      try {
        await printReceiptDirect({
          businessName: shopSettings?.business_name || undefined,
          businessAddress: shopSettings?.address || undefined,
          businessPhone: shopSettings?.phone || undefined,
          invoiceNumber: saleData.invoiceNumber,
          items: saleData.items.map((item) => ({
            name: item.name,
            quantity: item.quantity,
            price: item.price,
            unit_label: item.unit_label,
            item_discount: item.item_discount,
            item_discount_type: item.item_discount_type,
          })),
          subtotal: saleData.subtotal,
          discountAmount: saleData.discountAmount,
          total: saleData.total,
          paidAmount: saleData.paidAmount,
          balance: saleData.balance,
          paymentMethod: saleData.paymentMethod,
          customerName: saleData.customerName,
        });
        return;
      } catch (err: any) {
        toast({
          title: "Thermal printer unavailable",
          description: (err?.message || "Falling back to browser print.") + " Using browser print instead.",
          variant: "destructive",
        });
        // fall through to browser print
      }
    }
    await printSaleReceipt(saleData);
  };

  const isNetworkError = (err: any) => {
    if (!navigator.onLine) return true;
    const msg = String(err?.message || err || "").toLowerCase();
    return msg.includes("failed to fetch") || msg.includes("network") || msg.includes("load failed");
  };

  const createSaleMutation = useMutation({
    mutationFn: async () => {
      // Validate cart
      if (cart.length === 0) {
        throw new Error("Cart is empty");
      }

      const saleSubtotal = cart.reduce((sum, item) => sum + getLineNetTotal(item), 0);
      const saleDiscountAmount = discountType === "percentage"
        ? (saleSubtotal * discount) / 100
        : discount;
      const totalAmount = saleSubtotal - saleDiscountAmount;
      const saleBalance = customerPaidAmount - totalAmount;

      // Validation based on payment method
      if (paymentMethod !== "Credit" && customerPaidAmount < totalAmount) {
        throw new Error("Insufficient payment amount");
      }

      if (paymentMethod === "Credit" && !selectedCustomer) {
        throw new Error("Please select a credit customer");
      }

      const queueOffline = async () => {
        const localInvoice = `OFFLINE-${Date.now().toString(36).toUpperCase()}`;
        await queueOfflineSale({
          cart,
          subtotal: saleSubtotal,
          discountAmount: saleDiscountAmount,
          total: totalAmount,
          paidAmount: customerPaidAmount,
          balance: saleBalance,
          paymentMethod,
          customerId: selectedCustomer?.id || null,
          customerName: selectedCustomer?.name || null,
          customerPhone: selectedCustomer?.phone || null,
          cashierId: cashierId || null,
          cashierName: cashierName || null,
        });
        for (const item of cart) {
          if (!item.product_id || item.product_id.startsWith("temp_")) continue;
          await adjustCachedStock(item.product_id, item.quantity);
        }
        await refreshPendingSyncCount();
        return {
          sale: null,
          offline: true as const,
          receiptData: {
            invoiceNumber: localInvoice,
            items: [...cart],
            subtotal: saleSubtotal,
            discountAmount: saleDiscountAmount,
            total: totalAmount,
            paidAmount: customerPaidAmount,
            balance: saleBalance,
            paymentMethod,
            customerName: selectedCustomer?.name,
            customerPhone: selectedCustomer?.phone || null,
          },
        };
      };

      if (!navigator.onLine) {
        return queueOffline();
      }

      try {
        const invoiceNumber = await supabase.rpc("generate_invoice_number");
        if (invoiceNumber.error) throw invoiceNumber.error;

        // Determine invoice status
        let status = "closed";
        if (paymentMethod === "Credit") {
          if (customerPaidAmount === 0) {
            status = "open";
          } else if (customerPaidAmount < totalAmount) {
            status = "partial";
          }
        }

        const { data: sale, error: saleError } = await supabase
          .from("sales")
          .insert({
            invoice_number: invoiceNumber.data,
            customer_id: selectedCustomer?.id || null,
            customer_name: selectedCustomer?.name || null,
            customer_phone: selectedCustomer?.phone || null,
            cashier_id: cashierId || null,
            cashier_name: cashierName || null,
            subtotal: saleSubtotal,
            discount_amount: saleDiscountAmount,
            total_amount: totalAmount,
            payment_method: paymentMethod,
            paid_amount: customerPaidAmount,
            balance: saleBalance,
            status,
          })
          .select()
          .single();

        if (saleError) throw saleError;

        // Update credit customer outstanding balance atomically (delta, not a stale read-then-write)
        if (paymentMethod === "Credit" && selectedCustomer) {
          const { error: updateError } = await supabase.rpc("adjust_credit_balance", {
            p_customer_id: selectedCustomer.id,
            p_delta: totalAmount - customerPaidAmount,
          });
          if (updateError) throw updateError;
        }

        const saleItems = cart.map((item) => ({
          sale_id: sale.id,
          product_id: item.product_id,
          product_name: item.name,
          quantity: item.quantity,
          unit_price: item.quantity > 0 ? getLineNetTotal(item) / item.quantity : item.price,
          total_price: getLineNetTotal(item),
          sold_unit: item.sold_unit,
        }));

        const { error: itemsError } = await supabase.from("sale_items").insert(saleItems);
        if (itemsError) throw itemsError;

        // Aggregate quantity per real product_id first, in case the same product
        // was added as both a "unit" line and a "case" line — avoids double-deducting stock.
        const stockDeductions = new Map<string, number>();
        for (const item of cart) {
          if (!item.product_id || item.product_id.startsWith("temp_")) continue;
          stockDeductions.set(item.product_id, (stockDeductions.get(item.product_id) || 0) + item.quantity);
        }

        for (const [productId, qty] of stockDeductions.entries()) {
          const { error: stockError } = await supabase.rpc("decrement_stock", {
            p_product_id: productId,
            p_qty: qty,
          });
          if (stockError) throw stockError;
        }

        // Return data for receipt printing
        return {
          sale,
          offline: false as const,
          receiptData: {
            invoiceNumber: invoiceNumber.data,
            items: [...cart],
            subtotal: saleSubtotal,
            discountAmount: saleDiscountAmount,
            total: totalAmount,
            paidAmount: customerPaidAmount,
            balance: saleBalance,
            paymentMethod,
            customerName: selectedCustomer?.name,
            customerPhone: selectedCustomer?.phone || null,
          }
        };
      } catch (err) {
        // Connection dropped mid-checkout - don't block billing, queue it for later sync.
        if (isNetworkError(err)) {
          return queueOffline();
        }
        throw err;
      }
    },
    onSuccess: (data) => {
      // Store last receipt data for reprinting
      setLastReceiptData(data.receiptData);

      // Auto print receipt (works offline too - direct thermal print and browser print both do) -
      // unless Digital Receipt mode is on, in which case show a scan-to-view QR instead to save
      // paper. Offline-queued sales don't have a real invoice in the DB yet, so those still print.
      if (isDigitalReceiptModeEnabled() && !data.offline) {
        showDigitalReceipt(data.receiptData.invoiceNumber, data.receiptData.customerPhone);
      } else {
        printReceipt(data.receiptData);
      }

      // Cash sale + a connected thermal printer with the drawer wired into it + the setting
      // turned on in Settings - pop the drawer so the cashier doesn't need a separate key/button.
      // Never blocks or fails the sale itself if the drawer isn't set up.
      if (paymentMethod === "Cash" && isWebUSBSupported() && getSavedPrinterInfo() && isAutoOpenDrawerEnabled()) {
        openCashDrawer().catch(() => {
          // silent - drawer may be unplugged/not wired to this printer, sale already succeeded
        });
      }

      if (data.offline) {
        toast({
          title: "Saved Offline",
          description: "No internet - sale queued and will sync automatically once you're back online.",
        });
      } else {
        const message = paymentMethod === "Credit"
          ? "Credit sale recorded successfully!"
          : "Transaction recorded successfully!";

        toast({
          title: "Sale Completed",
          description: message,
        });
      }

      // Clear cart and reset form
      setCart([]);
      setDiscount(0);
      setCustomerPaidAmount(0);
      setSelectedCustomer(null);
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["today-sales"] });
      queryClient.invalidateQueries({ queryKey: ["credit-customers"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to complete sale",
        variant: "destructive",
      });
    },
  });

  // Validate payment and calculate settle/advance amounts
  const validatePayment = (outstanding: number, payAmount: number) => {
    if (outstanding === 0) {
      return { success: false, message: "Invoice fully settled already." };
    }
    if (payAmount <= 0) {
      return { success: false, message: "Enter a valid payment amount." };
    }
    const settleAmount = Math.min(payAmount, Math.abs(outstanding));
    const advanceAmount = payAmount > Math.abs(outstanding) ? payAmount - Math.abs(outstanding) : 0;
    return {
      success: true,
      settleAmount,
      advanceAmount,
      message: advanceAmount > 0 ? "Payment success with advance credit." : "Payment successful.",
    };
  };

  const processCreditPaymentMutation = useMutation({
    mutationFn: async () => {
      if (!selectedInvoice || !viewCustomer) {
        throw new Error("Invoice or customer not selected");
      }

      const outstanding = selectedInvoice.balance || 0;
      
      // Validate payment
      const validation = validatePayment(outstanding, paymentAmount);
      if (!validation.success) {
        throw new Error(validation.message);
      }

      const { settleAmount, advanceAmount } = validation;
      const balanceBefore = viewCustomer.outstanding_balance || 0;
      const newInvoiceBalance = Math.max(0, outstanding - settleAmount);
      const newPaidAmount = (selectedInvoice.paid_amount || 0) + settleAmount;
      const newStatus = newInvoiceBalance === 0 ? "closed" : "partial";
      
      // Customer balance decreases by settleAmount, but if there's advance, it goes negative (credit)
      const balanceAfter = balanceBefore - settleAmount - advanceAmount;

      // Update invoice
      const { error: invoiceError } = await supabase
        .from("sales")
        .update({
          paid_amount: newPaidAmount,
          balance: newInvoiceBalance,
          status: newStatus,
        })
        .eq("id", selectedInvoice.id);

      if (invoiceError) throw invoiceError;

      // Update customer balance (negative = advance credit)
      const { error: customerError } = await supabase
        .from("credit_customers")
        .update({ outstanding_balance: balanceAfter })
        .eq("id", viewCustomer.id);

      if (customerError) throw customerError;

      // Record payment history with remarks including advance info
      const paymentRemarksFinal = advanceAmount > 0 
        ? `${paymentRemarks ? paymentRemarks + " | " : ""}Advance credit: Rs. ${advanceAmount.toFixed(2)}`
        : paymentRemarks;

      const { error: historyError } = await supabase
        .from("credit_payment_history")
        .insert({
          customer_id: viewCustomer.id,
          invoice_id: selectedInvoice.id,
          invoice_number: selectedInvoice.invoice_number,
          payment_amount: paymentAmount,
          payment_method: creditPaymentMethod,
          remarks: paymentRemarksFinal,
          balance_before: balanceBefore,
          balance_after: balanceAfter,
        });

      if (historyError) throw historyError;

      return {
        invoice: selectedInvoice,
        customer: viewCustomer,
        paymentAmount,
        settleAmount,
        advanceAmount,
        balanceAfter: newInvoiceBalance,
        customerBalanceAfter: balanceAfter,
        invoiceStatus: newStatus === "closed" ? "PAID" : "PARTIAL",
      };
    },
    onSuccess: (data) => {
      const successMessage = data.advanceAmount > 0 
        ? `Payment successful! Rs. ${data.advanceAmount.toFixed(2)} added as advance credit.`
        : `Payment successful! Invoice status: ${data.invoiceStatus}`;
      
      toast({
        title: "Payment Processed",
        description: successMessage,
      });

      // Print receipt
      handlePrintCreditReceipt(data);

      // Reset states
      setCreditPaymentOpen(false);
      setSelectedInvoice(null);
      setPaymentAmount(0);
      setCreditPaymentMethod("Cash");
      setPaymentRemarks("");

      // Refresh data and update viewCustomer
      queryClient.invalidateQueries({ queryKey: ["credit-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["credit-customers"] });
      
      // Update viewCustomer with new balance
      if (viewCustomer) {
        setViewCustomer({ ...viewCustomer, outstanding_balance: data.customerBalanceAfter });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to process payment",
        variant: "destructive",
      });
    },
  });

  // Uses the functional setCart(prev => ...) form throughout (never reads the `cart` closure
  // directly) so that a hardware scanner fired rapidly - e.g. scanning several units of the same
  // product back-to-back - can't lose an increment to a stale-state race: each scan's lookup is
  // async, so two scans in quick succession can otherwise both compute "existing quantity" from
  // the same pre-update cart and stomp on each other's result.
  const addToCart = (product: any, mode: "unit" | "case" = "unit") => {
    const isCase = mode === "case" && product.case_size && Number(product.case_size) > 0;
    const isWeightBased = !isCase && !!product.is_weight_based;
    const soldUnit: CartItem["sold_unit"] = isCase ? "case" : isWeightBased ? "weight" : "unit";
    const lineKey = `${product.id}_${soldUnit}`;
    const caseSize = product.case_size ? Number(product.case_size) : undefined;
    const minOrderQty = Number(product.min_order_qty) || 1;

    setCart((prevCart) => {
      const existingItem = prevCart.find((item) => item.line_key === lineKey);
      if (existingItem) {
        const step = isCase ? (caseSize || 1) : isWeightBased ? 0.1 : 1;
        const newQuantity = existingItem.quantity + step;
        return prevCart.map((item) =>
          item.line_key === lineKey
            ? { ...item, quantity: newQuantity, price: computeLinePrice(item, newQuantity) }
            : item
        );
      }
      const scaleQty = isWeightBased && scaleStatus === "connected" && scaleReading ? scaleReading.weightKg : null;
      const initialQuantity = isCase
        ? (caseSize || 1)
        : Math.max(minOrderQty, scaleQty && scaleQty > 0 ? scaleQty : isWeightBased ? 0.1 : 1);
      return [...prevCart, buildCartLine(product, soldUnit, initialQuantity)];
    });
  };

  const updateQuantity = (lineKey: string, change: number) => {
    setCart((prevCart) =>
      prevCart
        .map((item) => {
          if (item.line_key !== lineKey) return item;
          const step = item.sold_unit === "case" ? Math.sign(change) * (item.case_size || 1) : change;
          const floor = item.sold_unit === "unit" ? item.min_order_qty : 0;
          const newQuantity = Math.max(0, item.quantity + step);
          if (newQuantity > 0 && newQuantity < floor) return item; // don't go below min order qty; remove via trash instead
          return { ...item, quantity: newQuantity, price: computeLinePrice(item, newQuantity) };
        })
        .filter((item) => item.quantity > 0)
    );
  };

  const setLineQuantity = (lineKey: string, newQuantity: number) => {
    if (newQuantity < 0) return;
    setCart((prevCart) =>
      prevCart.map((item) =>
        item.line_key === lineKey
          ? { ...item, quantity: newQuantity, price: computeLinePrice(item, newQuantity) }
          : item
      )
    );
  };

  const handleScaleDisconnect = () => {
    setScaleStatus("disconnected");
    setScaleConnectionType(null);
    setScaleReading(null);
  };

  const handleConnectSerialScale = async () => {
    setScaleStatus("connecting");
    try {
      await connectSerialScale(scaleSettings, (reading) => setScaleReading(reading), handleScaleDisconnect);
      setScaleStatus("connected");
      setScaleConnectionType("serial");
    } catch (error: any) {
      setScaleStatus("disconnected");
      toast({
        title: "Scale connection failed",
        description: error.message || "Could not connect to the scale.",
        variant: "destructive",
      });
    }
  };

  const handleConnectBluetoothScale = async () => {
    setScaleStatus("connecting");
    try {
      await connectBluetoothScale(scaleSettings, (reading) => setScaleReading(reading), handleScaleDisconnect);
      setScaleStatus("connected");
      setScaleConnectionType("bluetooth");
    } catch (error: any) {
      setScaleStatus("disconnected");
      toast({
        title: "Scale connection failed",
        description: error.message || "Could not connect to the scale.",
        variant: "destructive",
      });
    }
  };

  const handleDisconnectScale = async () => {
    await disconnectSerialScale();
    await disconnectBluetoothScale();
    handleScaleDisconnect();
  };

  const handleScaleSettingsChange = (settings: ScaleSettings) => {
    setScaleSettings(settings);
    saveScaleSettings(settings);
  };

  const captureScaleWeight = (lineKey: string) => {
    if (!scaleReading) return;
    setLineQuantity(lineKey, Number(scaleReading.weightKg.toFixed(3)));
  };

  const removeFromCart = (lineKey: string) => {
    setCart((prevCart) => prevCart.filter((item) => item.line_key !== lineKey));
  };

  // Per-product discount: independent from the whole-bill Discount field below - e.g. one
  // damaged/near-expiry item can get 20% off while the rest of the bill is at full price.
  const updateItemDiscount = (lineKey: string, value: number, type: DiscountType) => {
    setCart((prevCart) =>
      prevCart.map((item) =>
        item.line_key === lineKey
          ? { ...item, item_discount: Math.max(0, value || 0), item_discount_type: type }
          : item
      )
    );
  };

  const subtotal = cart.reduce((sum, item) => sum + getLineNetTotal(item), 0);
  const discountAmount = discountType === "percentage" 
    ? (subtotal * discount) / 100 
    : discount;
  const total = subtotal - discountAmount;
  const balance = customerPaidAmount - total;

  // Hold/Park Bill: shelve the in-progress cart so this counter is free for the next
  // customer, then pick it back up later exactly where it was left off.
  const holdCurrentBill = () => {
    if (cart.length === 0) {
      toast({ title: "Cart is empty", description: "Add items before holding a bill.", variant: "destructive" });
      return;
    }
    const label = selectedCustomer?.name || `Hold #${heldBills.length + 1}`;
    const newHold: HeldBill = {
      id: crypto.randomUUID(),
      label,
      heldAt: new Date().toISOString(),
      cart,
      discount,
      discountType,
      paymentMethod,
      customerPaidAmount,
      selectedCustomer,
      total,
    };
    const updated = [...heldBills, newHold];
    setHeldBills(updated);
    saveHeldBills(updated);

    setCart([]);
    setDiscount(0);
    setCustomerPaidAmount(0);
    setSelectedCustomer(null);
    setPaymentMethod("Cash");
    setSearchTerm("");

    toast({ title: "Bill Held", description: `"${label}" saved - resume it anytime from Held Bills.` });
    requestAnimationFrame(() => searchInputRef.current?.focus());
  };

  const resumeHeldBill = (id: string) => {
    const bill = heldBills.find((b) => b.id === id);
    if (!bill) return;
    if (cart.length > 0 && !window.confirm("Current cart has items that will be replaced. Continue?")) {
      return;
    }
    setCart(bill.cart);
    setDiscount(bill.discount);
    setDiscountType(bill.discountType);
    setPaymentMethod(bill.paymentMethod);
    setCustomerPaidAmount(bill.customerPaidAmount);
    setSelectedCustomer(bill.selectedCustomer);

    const updated = heldBills.filter((b) => b.id !== id);
    setHeldBills(updated);
    saveHeldBills(updated);
    setHeldBillsOpen(false);
    toast({ title: "Bill Resumed", description: `"${bill.label}" loaded back into the cart.` });
  };

  const deleteHeldBill = (id: string) => {
    const bill = heldBills.find((b) => b.id === id);
    const updated = heldBills.filter((b) => b.id !== id);
    setHeldBills(updated);
    saveHeldBills(updated);
    if (bill) toast({ title: "Held Bill Discarded", description: `"${bill.label}" removed.` });
  };

  const handlePrintBill = async () => {
    if (!receiptRef.current) {
      toast({
        title: "Error",
        description: "Receipt container not found",
        variant: "destructive",
      });
      return;
    }

    try {
      // Convert receipt to canvas image
      const canvas = await html2canvas(receiptRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        logging: false,
        useCORS: true,
      });

      const imageData = canvas.toDataURL('image/png');

      const printWindow = window.open('', '_blank', 'width=300,height=600');
      if (!printWindow) {
        toast({
          title: "Popup Blocked",
          description: "Please allow popups for this site to print receipts",
          variant: "destructive",
        });
        return;
      }

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Receipt</title>
            <style>
              * { margin: 0; padding: 0; box-sizing: border-box; }
              @page { size: 58mm auto; margin: 0; }
              @media print {
                body { width: 58mm; margin: 0; padding: 0; }
                img { width: 58mm !important; height: auto !important; max-width: 100% !important; }
              }
              body { width: 58mm; margin: 0 auto; padding: 0; background: #fff; }
              img { width: 100%; height: auto; display: block; }
            </style>
          </head>
          <body>
            <img src="${imageData}" alt="Receipt" />
          </body>
        </html>
      `);

      printWindow.document.close();

      setTimeout(() => {
        printWindow.focus();
        printWindow.print();
      }, 300);

    } catch (error) {
      console.error('Print error:', error);
      toast({
        title: "Print Error",
        description: "Failed to generate receipt image",
        variant: "destructive",
      });
    }
  };

  const handlePrintCreditReceipt = (data: any) => {
    const printWindow = window.open('', '_blank', 'height=600,width=800');
    if (!printWindow) {
      toast({
        title: "Popup Blocked",
        description: "Please allow popups for this site to print receipts",
        variant: "destructive",
      });
      return;
    }

    const receiptHTML = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Credit Payment Receipt</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              padding: 20px; 
              max-width: 80mm;
              margin: 0 auto;
            }
            .header { 
              text-align: center; 
              margin-bottom: 20px; 
              border-bottom: 2px solid #333;
              padding-bottom: 10px;
            }
            .header h1 { margin: 0; font-size: 20px; }
            .header h2 { margin: 5px 0; font-size: 16px; font-weight: normal; }
            .details { margin: 15px 0; }
            .details div { 
              display: flex; 
              justify-content: space-between; 
              margin: 8px 0; 
              padding: 5px;
            }
            .details .label { font-weight: bold; }
            .payment-section {
              background: #f8f9fa;
              padding: 15px;
              margin: 15px 0;
              border-radius: 8px;
              border: 2px solid #00A86B;
            }
            .payment-section .amount {
              font-size: 20px;
              font-weight: bold;
              color: #00A86B;
            }
            .balance-section {
              text-align: center;
              padding: 10px;
              margin: 15px 0;
              border-top: 2px dashed #333;
              border-bottom: 2px dashed #333;
            }
            .balance-section .balance {
              font-size: 18px;
              font-weight: bold;
            }
            .footer { 
              text-align: center; 
              margin-top: 20px; 
              font-size: 12px;
              border-top: 2px solid #333;
              padding-top: 10px;
            }
            .footer p { margin: 5px 0; }
            @media print {
              body { padding: 10px; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>ARTIXO POS</h1>
            <h2>Credit Payment Receipt</h2>
          </div>
          
          <div class="details">
            <div>
              <span class="label">Date:</span>
              <span>${format(new Date(), "dd/MM/yyyy HH:mm")}</span>
            </div>
            <div>
              <span class="label">Invoice No:</span>
              <span>${data.invoice.invoice_number}</span>
            </div>
            <div>
              <span class="label">Customer:</span>
              <span>${data.customer.name}</span>
            </div>
            <div>
              <span class="label">Payment Method:</span>
              <span>${creditPaymentMethod}</span>
            </div>
          </div>

          <div class="payment-section">
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
              <span class="label">Total Invoice:</span>
              <span>Rs. ${(data.invoice.total_amount || 0).toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
              <span class="label">Previously Paid:</span>
              <span>Rs. ${(data.invoice.paid_amount || 0).toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; border-top: 2px solid #333; padding-top: 10px;">
              <span class="label">Amount Paid Now:</span>
              <span class="amount">Rs. ${(data.paymentAmount || 0).toFixed(2)}</span>
            </div>
            ${data.advanceAmount > 0 ? `
            <div style="display: flex; justify-content: space-between; margin-top: 10px; padding: 8px; background: #d4edda; border-radius: 4px;">
              <span class="label">Advance Credit:</span>
              <span style="color: #155724; font-weight: bold;">Rs. ${data.advanceAmount.toFixed(2)}</span>
            </div>
            ` : ''}
          </div>

          <div class="balance-section">
            <div style="margin-bottom: 5px;">Invoice Balance Remaining</div>
            <div class="balance">Rs. ${(data.balanceAfter || 0).toFixed(2)}</div>
            ${data.customerBalanceAfter < 0 ? `
            <div style="margin-top: 10px; color: #155724; font-weight: bold;">
              Customer has Rs. ${Math.abs(data.customerBalanceAfter).toFixed(2)} advance credit
            </div>
            ` : ''}
          </div>

          ${paymentRemarks ? `
            <div style="margin: 15px 0; padding: 10px; background: #f8f9fa; border-radius: 5px;">
              <div class="label">Remarks:</div>
              <div style="margin-top: 5px;">${paymentRemarks}</div>
            </div>
          ` : ''}

          <div class="footer">
            <p>Thank you for your payment!</p>
            <p>Visit Again - Artixo POS</p>
            <p style="font-size: 11px;">Support: ${SUPPORT_PHONE}</p>
            <p style="font-size: 10px; color: #666;">Powered by Artixo POS</p>
          </div>
        </body>
      </html>
    `;

    printWindow.document.write(receiptHTML);
    printWindow.document.close();
    
    // Wait for content to load before printing
    printWindow.onload = function() {
      setTimeout(() => {
        printWindow.focus();
        printWindow.print();
      }, 250);
    };
    
    // Fallback if onload doesn't fire
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 500);
  };

  const handleOpenCreditAccount = (customer: CreditCustomer) => {
    setViewCustomer(customer);
    setCreditAccountOpen(true);
  };

  const handleOpenPaymentModal = (invoice: any) => {
    setSelectedInvoice(invoice);
    setPaymentAmount(invoice.balance);
    setCreditPaymentOpen(true);
  };

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-2xl font-bold bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
          POS Terminal
        </h1>
        <div className="flex justify-between items-center mt-1">
          <p className="text-sm text-muted-foreground">Create new sale and manage transactions</p>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="glass border-border/50">
                <Wallet className="mr-2 h-4 w-4" />
                Manage Credit Payments
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[400px] p-0 glass-card border-border/50">
              <Command>
                <CommandInput 
                  placeholder="Search credit customer..." 
                  value={customerSearchTerm}
                  onValueChange={setCustomerSearchTerm}
                />
                <CommandList>
                  <CommandEmpty>No customer found.</CommandEmpty>
                  <CommandGroup>
                    {creditCustomers?.map((customer) => (
                      <CommandItem
                        key={customer.id}
                        value={customer.name}
                        onSelect={() => {
                          handleOpenCreditAccount(customer);
                          setCustomerSearchTerm("");
                        }}
                        className="cursor-pointer"
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        <div className="flex-1">
                          <p className="font-medium">{customer.name}</p>
                          <p className="text-xs text-muted-foreground">{customer.phone}</p>
                        </div>
                        <span className="text-sm font-semibold text-destructive">
                          Rs. {(customer.outstanding_balance || 0).toFixed(2)}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Offline / sync status */}
      {(!isOnline || pendingSyncCount > 0) && (
        <div className={`flex items-center justify-between gap-3 p-3 rounded-lg border text-sm ${!isOnline ? "bg-destructive/10 border-destructive/30 text-destructive" : "bg-amber-500/10 border-amber-500/30 text-amber-600"}`}>
          <span className="flex items-center gap-2">
            {!isOnline ? <WifiOff className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
            {!isOnline
              ? "Offline — billing still works, sales will sync automatically once you're back online."
              : `${pendingSyncCount} offline sale${pendingSyncCount === 1 ? "" : "s"} waiting to sync.`}
            {pendingSyncCount > 0 && !isOnline && ` (${pendingSyncCount} queued)`}
          </span>
          {isOnline && pendingSyncCount > 0 && (
            <Button size="sm" variant="outline" onClick={runSync} disabled={isSyncing}>
              {isSyncing ? "Syncing..." : "Sync Now"}
            </Button>
          )}
        </div>
      )}

      {/* Credit Customer Search */}
      <Card className="glass-card border-border/50">
        <CardContent className="p-3">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground mb-1 block">Credit Customer (Optional)</label>
              <Popover open={customerSearchOpen} onOpenChange={setCustomerSearchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between glass border-border/50"
                  >
                    {selectedCustomer ? (
                      <span className="flex items-center gap-2">
                        <UserCheck className="h-4 w-4 text-primary" />
                        {selectedCustomer.name}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Search credit customer...</span>
                    )}
                    <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0 glass-card border-border/50">
                  <Command>
                    <CommandInput 
                      placeholder="Search by name or phone..." 
                      value={customerSearchTerm}
                      onValueChange={setCustomerSearchTerm}
                    />
                    <CommandList>
                      <CommandEmpty>No customer found.</CommandEmpty>
                      <CommandGroup>
                        {creditCustomers?.map((customer) => (
                          <CommandItem
                            key={customer.id}
                            value={customer.name}
                            onSelect={() => {
                              setSelectedCustomer(customer);
                              setCustomerSearchOpen(false);
                              setPaymentMethod("Credit");
                            }}
                            className="cursor-pointer"
                          >
                            <UserCheck className="mr-2 h-4 w-4" />
                            <div className="flex-1">
                              <p className="font-medium">{customer.name}</p>
                              <p className="text-xs text-muted-foreground">{customer.phone}</p>
                            </div>
                            <span className="text-sm font-semibold">
                              Rs. {(customer.outstanding_balance || 0).toFixed(2)}
                            </span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            {selectedCustomer && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setSelectedCustomer(null);
                  setPaymentMethod("Cash");
                }}
                className="mt-4"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          {selectedCustomer && (
            <div className="mt-2 p-2 glass-card border-border/30 rounded-md">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium">{selectedCustomer.name}</p>
                  <p className="text-xs text-muted-foreground">{selectedCustomer.phone}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Outstanding Balance</p>
                  <p className="text-lg font-bold text-orange-400">
                    Rs. {(selectedCustomer.outstanding_balance || 0).toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
        <div className="space-y-4 lg:order-2">
          <Card className="glass-card border-border/50">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="flex items-center justify-between text-lg">
                <span>Products</span>
                {voiceSupported && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {voiceLanguage === "en-US" ? "EN" : "த"}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={toggleVoiceLanguage}
                      className="text-xs h-6 px-2"
                    >
                      {voiceLanguage === "en-US" ? "தமிழ்" : "English"}
                    </Button>
                  </div>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {/* flex-wrap + a full-width basis for the search field on small screens: without it the
                  four fixed-width action buttons below (Scan QR / Scale / Hold Bill / Held) refuse to
                  shrink and squeeze the flex-1 search input down to ~0px on a phone, making it look
                  broken even though it works fine on a wide laptop screen. */}
              <div className="flex flex-wrap gap-2">
                <div className="relative w-full min-w-0 sm:w-auto sm:flex-1 sm:basis-64">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
                  <Input
                    ref={searchInputRef}
                    placeholder={isListening ? "Listening..." : "Search, scan barcode, or speak product name..."}
                    value={isListening && voiceTranscript ? voiceTranscript : searchTerm}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    className={`pl-10 pr-12 glass border-border/50 transition-all ${isListening ? 'voice-listening border-primary' : ''}`}
                    autoFocus
                  />
                  {/* Voice input button inside search bar */}
                  {voiceSupported && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={toggleListening}
                      className={`absolute right-1 top-1/2 transform -translate-y-1/2 h-8 w-8 rounded-full transition-all ${
                        isListening
                          ? 'bg-primary text-primary-foreground mic-active'
                          : 'hover:bg-muted'
                      }`}
                      title={isListening ? "Stop listening" : "Voice search (en-US / தமிழ்)"}
                    >
                      {isListening ? (
                        <div className="relative">
                          <MicOff className="h-4 w-4" />
                        </div>
                      ) : (
                        <Mic className="h-4 w-4" />
                      )}
                    </Button>
                  )}

                  {/* Voice preview tooltip */}
                  {showVoicePreview && voiceTranscript && (
                    <div className="absolute left-0 right-0 top-full mt-1 z-50 glass-card border-border/50 p-2 rounded-md animate-in fade-in slide-in-from-top-1">
                      <p className="text-xs text-muted-foreground">Voice detected:</p>
                      <p className="text-sm font-medium text-primary">{voiceTranscript}</p>
                    </div>
                  )}
                </div>
                <Button
                  onClick={() => setQrScannerOpen(true)}
                  className="shrink-0 bg-primary hover:bg-primary/90"
                >
                  <Camera className="h-4 w-4 mr-2" />
                  Scan QR
                </Button>
                <Button
                  onClick={() => setScaleDialogOpen(true)}
                  variant="outline"
                  className="shrink-0 glass gap-2"
                >
                  <WeightIcon className={`h-4 w-4 ${scaleStatus === "connected" ? "text-green-600" : ""}`} />
                  {scaleStatus === "connected" ? `${scaleReading ? scaleReading.weightKg.toFixed(3) : "0.000"} kg` : "Scale"}
                </Button>
                <Button
                  onClick={holdCurrentBill}
                  variant="outline"
                  className="shrink-0 glass gap-2"
                  disabled={cart.length === 0}
                  title="Park this bill and free up the counter for the next customer"
                >
                  <PauseCircle className="h-4 w-4" />
                  Hold Bill
                </Button>
                <Button
                  onClick={() => setHeldBillsOpen(true)}
                  variant="outline"
                  className="shrink-0 glass gap-2 relative"
                  title="Resume a previously held bill"
                >
                  <Clock className="h-4 w-4" />
                  Held
                  {heldBills.length > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold grid place-items-center">
                      {heldBills.length}
                    </span>
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                USB/Bluetooth barcode scanner? Just plug it in (or pair it) and scan — it types straight into the search bar above and adds the item automatically.
              </p>

              {/* Voice commands help */}
              {isListening && (
                <div className="text-xs text-muted-foreground mt-3 p-2 glass-card rounded-md border-border/30">
                  <p className="font-medium text-primary mb-1">Voice Commands:</p>
                  <ul className="space-y-0.5">
                    <li>"<span className="text-foreground">[product name]</span>" - Search & auto-add</li>
                    <li>"<span className="text-foreground">Add [product name]</span>" - Add to cart</li>
                    <li>"<span className="text-foreground">Remove [product name]</span>" - Remove from cart</li>
                    <li>"<span className="text-foreground">Checkout</span>" - Proceed to bill</li>
                  </ul>
                </div>
              )}

              {/* Category quick-filter - loose produce like vegetables has no barcode to scan, so
                  tapping straight to a category (then the top-ranked item within it) is the
                  fastest path for high-volume, low-ticket sales. */}
              {posCategories.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  <button
                    onClick={() => setCategoryFilter("all")}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      categoryFilter === "all"
                        ? "bg-primary text-primary-foreground border-primary"
                        : "glass border-border/50 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    All
                  </button>
                  {posCategories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setCategoryFilter(cat)}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                        categoryFilter === cat
                          ? "bg-primary text-primary-foreground border-primary"
                          : "glass border-border/50 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 max-h-[600px] overflow-y-auto mt-4">
                {sortedProducts?.map((product) => {
                  const hasCase = product.case_size && Number(product.case_size) > 1;
                  const caseTotal = product.case_price != null
                    ? Number(product.case_price)
                    : Number(product.price) * Number(product.case_size || 1);
                  return (
                    <div
                      key={product.id}
                      className="glass-card glass-hover p-4 text-left border-border/30"
                    >
                      <button onClick={() => addToCart(product)} className="w-full text-left">
                        <p className="font-semibold">{product.name}</p>
                        <p className="text-sm text-muted-foreground">{product.category}</p>
                        <p className="text-lg font-bold text-primary mt-2">
                          Rs. {product.price ? Number(product.price).toFixed(2) : '0.00'}
                          <span className="text-xs text-muted-foreground font-normal"> /{product.unit_label || "pcs"}</span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Stock: {product.stock_quantity}
                          {product.min_order_qty > 1 && ` · Min order: ${product.min_order_qty}`}
                        </p>
                      </button>
                      {hasCase && (
                        <button
                          onClick={() => addToCart(product, "case")}
                          className="mt-2 w-full text-xs rounded-md border border-primary/30 bg-primary/10 hover:bg-primary/20 text-primary py-1.5 font-medium"
                        >
                          + Case ({product.case_size} {product.unit_label || "pcs"} = Rs. {caseTotal.toFixed(2)})
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 lg:order-1 lg:sticky lg:top-4 lg:self-start">
          <Card className="glass-card border-border/50">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="flex items-center justify-between text-lg">
                <span className="flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5 text-primary" />
                  Current Sale
                </span>
                <Button
                  type="button"
                  variant={showCost ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowCost((v) => !v)}
                  className={`h-7 text-xs gap-1.5 ${showCost ? "" : "glass"}`}
                  title="Show cost price and margin per item - for you only, turn off before handing the screen to a customer"
                >
                  {showCost ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  Cost
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className={`space-y-2 mb-3 ${cart.length > 3 ? "max-h-[180px] overflow-y-auto pr-1" : ""}`}>
                {cart.map((item) => {
                  const itemDiscountAmt = getItemDiscountAmount(item);
                  const lineGross = item.price * item.quantity;
                  const lineNet = lineGross - itemDiscountAmt;
                  const isEditingDiscount = editingDiscountLineKey === item.line_key;
                  const costTotal = item.cost != null ? item.cost * item.quantity : null;
                  const profit = costTotal != null ? lineNet - costTotal : null;
                  const marginPct = costTotal != null && lineNet > 0 ? (profit! / lineNet) * 100 : null;
                  // Largest discount (off the pre-discount line total) that still breaks even -
                  // i.e. how far a cashier can go before this item stops making any profit.
                  const maxDiscount =
                    costTotal != null && lineGross > 0
                      ? { rs: Math.max(0, lineGross - costTotal), pct: Math.max(0, ((lineGross - costTotal) / lineGross) * 100) }
                      : null;
                  return (
                  <div
                    key={item.line_key}
                    className="p-2 glass-card border-border/30 space-y-1"
                  >
                  <div
                    className="flex items-center justify-between"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-sm">
                        {item.name}
                        {item.sold_unit === "case" && (
                          <span className="ml-1 text-xs text-primary font-normal">(case)</span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Rs. {item.price ? Number(item.price).toFixed(2) : '0.00'} / {item.unit_label || "pcs"}
                        {item.min_order_qty > 1 && item.sold_unit === "unit" && ` · min ${item.min_order_qty}`}
                      </p>
                      {showCost && (
                        costTotal != null ? (
                          <p className={`text-[11px] font-medium ${profit! >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                            Cost Rs. {costTotal.toFixed(2)} · Profit Rs. {profit!.toFixed(2)}{marginPct != null ? ` (${marginPct.toFixed(0)}%)` : ""}
                          </p>
                        ) : (
                          <p className="text-[11px] text-muted-foreground italic">No cost on file for this product</p>
                        )
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {item.is_weight_based ? (
                        <>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.quantity}
                            onChange={(e) => setLineQuantity(item.line_key, parseFloat(e.target.value) || 0)}
                            className="w-16 h-7 glass border-border/50 text-center"
                          />
                          {scaleStatus === "connected" && (
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-7 w-7 glass"
                              title={`Capture ${scaleReading ? scaleReading.weightKg.toFixed(3) : "0.000"} kg from scale`}
                              onClick={() => captureScaleWeight(item.line_key)}
                            >
                              <WeightIcon className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </>
                      ) : (
                        <>
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-7 w-7 glass"
                            onClick={() => updateQuantity(item.line_key, item.sold_unit === "case" ? -(item.case_size || 1) : -1)}
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </Button>
                          <span className="w-7 text-center font-bold text-sm">
                            {item.sold_unit === "case" ? item.quantity / (item.case_size || 1) : item.quantity}
                          </span>
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-7 w-7 glass"
                            onClick={() => updateQuantity(item.line_key, item.sold_unit === "case" ? (item.case_size || 1) : 1)}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                      <Button
                        size="icon"
                        variant="destructive"
                        className="h-7 w-7 ml-1"
                        onClick={() => removeFromCart(item.line_key)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="ml-3 text-right">
                      {itemDiscountAmt > 0 && (
                        <p className="text-[10px] text-muted-foreground line-through">
                          Rs. {lineGross.toFixed(2)}
                        </p>
                      )}
                      <p className="font-bold text-primary text-sm">
                        Rs. {item.price ? lineNet.toFixed(2) : '0.00'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pl-0.5">
                    <button
                      type="button"
                      onClick={() => setEditingDiscountLineKey(isEditingDiscount ? null : item.line_key)}
                      className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      <Percent className="h-3 w-3" />
                      {itemDiscountAmt > 0 ? `Discount: -Rs. ${itemDiscountAmt.toFixed(2)}` : "Add discount"}
                    </button>
                    {item.item_discount > 0 && (
                      <button
                        type="button"
                        onClick={() => updateItemDiscount(item.line_key, 0, item.item_discount_type)}
                        className="text-[11px] text-red-400 hover:text-red-500"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  {isEditingDiscount && (
                    <div className="space-y-1 pt-0.5">
                      <div className="flex gap-1.5 items-center">
                        <select
                          value={item.item_discount_type}
                          onChange={(e) => updateItemDiscount(item.line_key, item.item_discount, e.target.value as DiscountType)}
                          className="glass border-border/50 rounded-md px-1.5 h-7 text-xs bg-background/50"
                        >
                          <option value="percentage">%</option>
                          <option value="fixed">Rs.</option>
                        </select>
                        <Input
                          type="number"
                          min="0"
                          value={item.item_discount || ""}
                          placeholder="0"
                          onChange={(e) => updateItemDiscount(item.line_key, Number(e.target.value) || 0, item.item_discount_type)}
                          className={`glass border-border/50 h-7 text-xs flex-1 ${profit != null && profit < 0 ? "border-destructive text-destructive" : ""}`}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs glass px-2"
                          onClick={() => setEditingDiscountLineKey(null)}
                        >
                          Done
                        </Button>
                      </div>
                      {/* Cost-aware suggestion: the largest discount this item can take before the
                          sale stops making a profit on it, computed from the product's cost price -
                          only shown once "Cost" is switched on above, since it's the same margin info. */}
                      {showCost && (
                        maxDiscount ? (
                          <div className="flex items-center justify-between gap-2 text-[11px]">
                            <span className={profit != null && profit < 0 ? "text-destructive font-medium" : "text-muted-foreground"}>
                              {profit != null && profit < 0
                                ? `⚠ Rs. ${Math.abs(profit).toFixed(2)} below cost`
                                : `Max without loss: Rs. ${maxDiscount.rs.toFixed(2)} (${maxDiscount.pct.toFixed(1)}%)`}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                updateItemDiscount(
                                  item.line_key,
                                  item.item_discount_type === "percentage" ? Number(maxDiscount.pct.toFixed(1)) : Number(maxDiscount.rs.toFixed(2)),
                                  item.item_discount_type
                                )
                              }
                              className="text-primary hover:underline shrink-0"
                            >
                              Use max
                            </button>
                          </div>
                        ) : (
                          <p className="text-[11px] text-muted-foreground italic">No cost on file - can't suggest a safe discount</p>
                        )
                      )}
                    </div>
                  )}
                  </div>
                  );
                })}
                {cart.length === 0 && (
                  <p className="text-center text-muted-foreground text-sm py-3">
                    Cart is empty. Add products to start.
                  </p>
                )}
              </div>

              <div className="space-y-2 pt-2 border-t border-border/50">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal:</span>
                  <span className="font-medium">Rs. {subtotal.toFixed(2)}</span>
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Discount</label>
                  <div className="flex gap-2">
                    <select
                      value={discountType}
                      onChange={(e) => setDiscountType(e.target.value as DiscountType)}
                      className="glass border-border/50 rounded-md px-2 h-9 text-sm bg-background/50"
                    >
                      <option value="percentage">%</option>
                      <option value="fixed">Rs.</option>
                    </select>
                    <Input
                      type="number"
                      value={discount}
                      onChange={(e) => setDiscount(Number(e.target.value))}
                      placeholder="0"
                      min="0"
                      className="glass border-border/50 h-9"
                    />
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Discount Amount:</span>
                    <span className="font-medium text-red-400">-Rs. {discountAmount.toFixed(2)}</span>
                  </div>
                </div>

                <div className="flex justify-between text-lg font-bold pt-1 border-t border-border/50">
                  <span>Total:</span>
                  <span className="text-primary">Rs. {total.toFixed(2)}</span>
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Payment Method</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                    className="w-full glass border-border/50 rounded-md px-3 h-9 bg-background/50"
                  >
                    <option value="Cash">Cash</option>
                    <option value="Card">Card</option>
                    <option value="Credit">Credit</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">
                    Customer Paid Amount {paymentMethod === "Credit" && "(Partial payment allowed)"}
                  </label>
                  <Input
                    type="number"
                    value={customerPaidAmount || ""}
                    onChange={(e) => setCustomerPaidAmount(Number(e.target.value))}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    className="glass border-border/50 h-9"
                  />
                </div>

                {customerPaidAmount > 0 && (
                  <div className="flex justify-between text-sm font-semibold">
                    <span className="text-muted-foreground">
                      {paymentMethod === "Credit" ? "Remaining Balance:" : "Balance:"}
                    </span>
                    <span className={balance >= 0 ? "text-green-400" : "text-orange-400"}>
                      Rs. {Math.abs(balance).toFixed(2)}
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Button
                    variant="outline"
                    className="h-12 border-2 border-border/60 font-bold uppercase tracking-wide text-xs rounded-xl"
                    disabled={cart.length === 0}
                    onClick={handlePrintBill}
                  >
                    <Printer className="h-4 w-4 mr-1" />
                    Print
                  </Button>
                  <Button
                    variant="outline"
                    className="h-12 border-2 border-border/60 font-bold uppercase tracking-wide text-xs rounded-xl"
                    disabled={!lastReceiptData}
                    onClick={() => lastReceiptData && printReceipt(lastReceiptData)}
                  >
                    <Printer className="h-4 w-4 mr-1" />
                    Reprint
                  </Button>
                  <Button
                    variant="outline"
                    className="h-12 border-2 border-border/60 font-bold uppercase tracking-wide text-xs rounded-xl"
                    disabled={!lastReceiptData}
                    onClick={() => lastReceiptData && showDigitalReceipt(lastReceiptData.invoiceNumber)}
                  >
                    <QrCode className="h-4 w-4 mr-1" />
                    Digital
                  </Button>
                  <Button
                    className="h-12 bg-primary hover:bg-primary/90 text-white font-extrabold uppercase tracking-wide text-xs rounded-xl shadow-[0_6px_20px_-4px_hsl(var(--primary)/0.5)]"
                    disabled={
                      cart.length === 0 ||
                      (paymentMethod !== "Credit" && customerPaidAmount < total) ||
                      (paymentMethod === "Credit" && !selectedCustomer)
                    }
                    onClick={() => createSaleMutation.mutate()}
                  >
                    {paymentMethod === "Credit" ? "Credit Bill" : "Pay"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Credit Payment Management Dialog */}
      <Dialog open={creditAccountOpen} onOpenChange={setCreditAccountOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto glass-card">
          <DialogHeader>
            <DialogTitle className="text-2xl">Customer Credit Account</DialogTitle>
          </DialogHeader>
          
          {viewCustomer && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 p-4 glass-card border-border/30 rounded-lg">
                <div>
                  <p className="text-sm text-muted-foreground">Customer Name</p>
                  <p className="text-lg font-semibold">{viewCustomer.name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Phone</p>
                  <p className="text-lg font-semibold">{viewCustomer.phone}</p>
                </div>
                <div className="col-span-2">
                  {/* outstanding_balance is a running ledger of (total invoiced - total paid) for this
                      customer - positive means they owe the shop, negative means they've paid more
                      than they've been billed (an advance/store-credit balance, not a debt). Shown
                      as a bare red negative number this confused staff into thinking something was
                      wrong, so label + color it explicitly based on which side of zero it's on. */}
                  <p className="text-sm text-muted-foreground">
                    {viewCustomer.outstanding_balance > 0
                      ? "Total Credit Balance (Owed to Shop)"
                      : viewCustomer.outstanding_balance < 0
                      ? "Advance Credit (Shop Owes Customer)"
                      : "Total Credit Balance"}
                  </p>
                  <p className={`text-2xl font-bold ${
                    viewCustomer.outstanding_balance > 0
                      ? "text-destructive"
                      : viewCustomer.outstanding_balance < 0
                      ? "text-green-500"
                      : "text-muted-foreground"
                  }`}>
                    Rs. {Math.abs(viewCustomer.outstanding_balance || 0).toFixed(2)}
                  </p>
                  {viewCustomer.outstanding_balance < 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      This customer paid more than they were billed on a past settlement. It isn't applied
                      automatically to future purchases - remember to account for it manually next time
                      they buy on credit.
                    </p>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-3">Outstanding Invoices</h3>
                <div className="border border-border/50 rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead>Invoice No</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Total (LKR)</TableHead>
                        <TableHead>Paid (LKR)</TableHead>
                        <TableHead>Balance (LKR)</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {creditInvoices && creditInvoices.length > 0 ? (
                        creditInvoices.map((invoice) => (
                          <TableRow key={invoice.id}>
                            <TableCell className="font-medium">{invoice.invoice_number}</TableCell>
                            <TableCell>{format(new Date(invoice.sale_date), "dd/MM/yyyy")}</TableCell>
                            <TableCell>Rs. {(invoice.total_amount || 0).toFixed(2)}</TableCell>
                            <TableCell>Rs. {(invoice.paid_amount || 0).toFixed(2)}</TableCell>
                            <TableCell className="font-bold text-destructive">
                              Rs. {(invoice.balance || 0).toFixed(2)}
                            </TableCell>
                            <TableCell>
                              <span className={`px-2 py-1 rounded-full text-xs ${
                                invoice.status === 'open' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'
                              }`}>
                                {invoice.status === 'open' ? 'Unpaid' : 'Partial'}
                              </span>
                            </TableCell>
                            <TableCell>
                              <Button
                                size="sm"
                                className="bg-primary hover:bg-primary/90"
                                onClick={() => handleOpenPaymentModal(invoice)}
                              >
                                Settle Payment
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                            No outstanding invoices
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Credit Payment Modal */}
      <Dialog open={creditPaymentOpen} onOpenChange={setCreditPaymentOpen}>
        <DialogContent className="glass-card">
          <DialogHeader>
            <DialogTitle>Settle Credit Payment</DialogTitle>
          </DialogHeader>
          
          {selectedInvoice && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 p-4 glass-card border-border/30 rounded-lg">
                <div>
                  <Label className="text-muted-foreground">Invoice No</Label>
                  <p className="font-semibold">{selectedInvoice.invoice_number}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Outstanding Amount</Label>
                  <p className="text-xl font-bold text-destructive">
                    Rs. {(selectedInvoice.balance || 0).toFixed(2)}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="payment-amount">Amount to Pay (LKR) *</Label>
                <Input
                  id="payment-amount"
                  type="number"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(Number(e.target.value))}
                  min={0}
                  step="0.01"
                  className="glass border-border/50"
                />
                {paymentAmount > (selectedInvoice.balance || 0) && (
                  <p className="text-sm text-green-400">
                    Rs. {(paymentAmount - (selectedInvoice.balance || 0)).toFixed(2)} will be added as advance credit
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="payment-method">Payment Method *</Label>
                <Select value={creditPaymentMethod} onValueChange={setCreditPaymentMethod}>
                  <SelectTrigger className="glass border-border/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="Card">Card</SelectItem>
                    <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="remarks">Remarks (Optional)</Label>
                <Textarea
                  id="remarks"
                  value={paymentRemarks}
                  onChange={(e) => setPaymentRemarks(e.target.value)}
                  placeholder="Add any notes about this payment..."
                  className="glass border-border/50"
                  rows={3}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setCreditPaymentOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-primary hover:bg-primary/90"
                  onClick={() => processCreditPaymentMutation.mutate()}
                  disabled={paymentAmount <= 0 || (selectedInvoice.balance || 0) === 0}
                >
                  {processCreditPaymentMutation.isPending ? "Processing..." : "Confirm Payment"}
                </Button>
              </div>
              {(selectedInvoice.balance || 0) === 0 && (
                <p className="text-sm text-yellow-400 text-center">Invoice already settled.</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Held Bills - park a big order mid-build, serve someone else, resume it later */}
      <Dialog open={heldBillsOpen} onOpenChange={setHeldBillsOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              Held Bills
            </DialogTitle>
          </DialogHeader>
          {heldBills.length === 0 ? (
            <p className="text-center text-muted-foreground py-10 text-sm">
              No held bills. Use "Hold Bill" to park the current cart and free up the counter.
            </p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {heldBills.map((bill) => (
                <div key={bill.id} className="flex items-center justify-between gap-3 p-3 border rounded-xl glass-card">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{bill.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {bill.cart.length} item{bill.cart.length === 1 ? "" : "s"} · Rs. {bill.total.toFixed(2)} · {formatHeldAgo(bill.heldAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button size="sm" variant="destructive" className="h-8" onClick={() => deleteHeldBill(bill.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" className="h-8 gap-1.5 bg-primary hover:bg-primary/90" onClick={() => resumeHeldBill(bill.id)}>
                      <PlayCircle className="h-3.5 w-3.5" />
                      Resume
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Hidden Receipt Area for Image-based Printing */}
      <div 
        ref={receiptRef}
        style={{
          position: 'absolute',
          left: '-9999px',
          top: 0,
          width: '58mm',
          padding: '2mm',
          backgroundColor: '#ffffff',
          fontFamily: 'Consolas, monospace',
          fontSize: '10px',
          color: '#000000',
          lineHeight: '1.3',
        }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '3mm' }}>
          <div style={{ fontSize: '14px', fontWeight: 'bold' }}>Artixo POS</div>
          <div style={{ fontSize: '9px' }}>Point of Sale Receipt</div>
        </div>

        {/* Divider */}
        <div style={{ borderTop: '1px dashed #000', margin: '2mm 0' }} />

        {/* Invoice Info */}
        <div style={{ marginBottom: '2mm' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Date:</span>
            <span>{new Date().toLocaleDateString()}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Time:</span>
            <span>{new Date().toLocaleTimeString()}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Payment:</span>
            <span>{paymentMethod}</span>
          </div>
          {selectedCustomer && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Customer:</span>
              <span>{selectedCustomer.name}</span>
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={{ borderTop: '1px dashed #000', margin: '2mm 0' }} />

        {/* Items Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', marginBottom: '1mm' }}>
          <span style={{ width: '45%' }}>Item</span>
          <span style={{ width: '15%', textAlign: 'center' }}>Qty</span>
          <span style={{ width: '20%', textAlign: 'right' }}>Price</span>
          <span style={{ width: '20%', textAlign: 'right' }}>Total</span>
        </div>

        {/* Items */}
        {cart.map((item, index) => (
          <div key={index} style={{ marginBottom: '1mm' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ width: '45%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.name}
              </span>
              <span style={{ width: '15%', textAlign: 'center' }}>{item.quantity}</span>
              <span style={{ width: '20%', textAlign: 'right' }}>{(item.price ?? 0).toFixed(2)}</span>
              <span style={{ width: '20%', textAlign: 'right' }}>{getLineNetTotal(item).toFixed(2)}</span>
            </div>
            {getItemDiscountAmount(item) > 0 && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', color: '#b00020', fontSize: '9px' }}>
                <span>- Rs. {getItemDiscountAmount(item).toFixed(2)} discount</span>
              </div>
            )}
          </div>
        ))}

        {/* Divider */}
        <div style={{ borderTop: '1px dashed #000', margin: '2mm 0' }} />

        {/* Totals */}
        <div style={{ marginBottom: '2mm' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Subtotal:</span>
            <span>Rs. {subtotal.toFixed(2)}</span>
          </div>
          {discountAmount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Discount:</span>
              <span>- Rs. {discountAmount.toFixed(2)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '12px', marginTop: '1mm' }}>
            <span>Grand Total:</span>
            <span>Rs. {total.toFixed(2)}</span>
          </div>
        </div>

        {/* Payment Info */}
        <div style={{ borderTop: '1px dashed #000', margin: '2mm 0' }} />
        <div style={{ marginBottom: '2mm' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Paid:</span>
            <span>Rs. {customerPaidAmount.toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
            <span>{balance >= 0 ? 'Change:' : 'Balance:'}</span>
            <span>Rs. {Math.abs(balance).toFixed(2)}</span>
          </div>
        </div>

        {/* Footer */}
        <div style={{ borderTop: '1px dashed #000', margin: '2mm 0' }} />
        <div style={{ textAlign: 'center', marginTop: '3mm' }}>
          <div style={{ fontWeight: 'bold' }}>Thank You – Visit Again!</div>
          <div style={{ fontSize: '8px', marginTop: '1mm' }}>Powered by Artixo</div>
        </div>
      </div>

      {/* QR Scanner Modal */}
      <QRScanner
        open={qrScannerOpen}
        onClose={() => setQrScannerOpen(false)}
        onScan={(data) => {
          handleQRScan(data);
          setQrScannerOpen(false);
        }}
      />

      <ScaleConnectDialog
        open={scaleDialogOpen}
        onClose={() => setScaleDialogOpen(false)}
        status={scaleStatus}
        connectionType={scaleConnectionType}
        reading={scaleReading}
        settings={scaleSettings}
        onSettingsChange={handleScaleSettingsChange}
        onConnectSerial={handleConnectSerialScale}
        onConnectBluetooth={handleConnectBluetoothScale}
        onDisconnect={handleDisconnectScale}
      />

      {/* Digital Receipt QR - customer scans with their own phone to view the bill, no paper used */}
      <Dialog open={digitalReceiptOpen} onOpenChange={setDigitalReceiptOpen}>
        <DialogContent className="glass-card max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5" />
              Digital Receipt
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3 py-2">
            <p className="text-sm text-muted-foreground text-center">
              Ask the customer to scan this with their phone camera to view the bill.
            </p>
            {digitalReceiptQrUrl && (
              <img
                src={digitalReceiptQrUrl}
                alt="Scan to view digital receipt"
                className="w-56 h-56 rounded-lg bg-white p-2"
              />
            )}
            {digitalReceiptLink && (
              <a
                href={digitalReceiptLink}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-primary underline break-all text-center"
              >
                {digitalReceiptLink}
              </a>
            )}

            {/* wa.me link method: pre-filled from the attached customer's phone if there is one,
                but always editable - a walk-in with no account can still get the bill sent. */}
            <div className="w-full space-y-2 pt-1 border-t border-border/50">
              <Input
                type="tel"
                placeholder="Customer WhatsApp number"
                value={whatsappPhone}
                onChange={(e) => setWhatsappPhone(e.target.value)}
              />
              <Button
                className="w-full gap-2 bg-[#25D366] hover:bg-[#1ebe5b] text-white"
                onClick={sendDigitalReceiptViaWhatsApp}
              >
                <MessageCircle className="h-4 w-4" />
                Send via WhatsApp
              </Button>
            </div>

            <Button
              variant="outline"
              className="w-full"
              onClick={() => lastReceiptData && printReceipt(lastReceiptData)}
            >
              <Printer className="h-4 w-4 mr-1" />
              Print Instead
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
