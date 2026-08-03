// IndexedDB layer for offline POS billing: caches the product catalog + price tiers so the
// POS Terminal can keep ringing up sales with no network, and queues completed sales locally
// until they can be synced back to Supabase.
import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "artixo-pos-offline";
const DB_VERSION = 1;

export interface CachedProduct {
  id: string;
  [key: string]: unknown;
}

export interface CachedPriceTier {
  id: string;
  product_id: string;
  min_qty: number;
  unit_price: number;
}

export interface PendingSale {
  localId: string;
  createdAt: string; // ISO timestamp of when the sale actually happened (offline)
  status: "pending" | "syncing" | "failed";
  errorMessage?: string;
  payload: {
    cart: any[];
    subtotal: number;
    discountAmount: number;
    total: number;
    paidAmount: number;
    balance: number;
    paymentMethod: string;
    customerId?: string | null;
    customerName?: string | null;
    customerPhone?: string | null;
  };
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("products")) {
          db.createObjectStore("products", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("price_tiers")) {
          const store = db.createObjectStore("price_tiers", { keyPath: "id" });
          store.createIndex("product_id", "product_id");
        }
        if (!db.objectStoreNames.contains("pending_sales")) {
          db.createObjectStore("pending_sales", { keyPath: "localId" });
        }
      },
    });
  }
  return dbPromise;
}

export async function cacheProducts(products: CachedProduct[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("products", "readwrite");
  await tx.store.clear();
  for (const p of products) await tx.store.put(p);
  await tx.done;
}

export async function getCachedProducts(): Promise<CachedProduct[]> {
  const db = await getDb();
  return db.getAll("products");
}

// Client-side equivalent of the server search (name/barcode/qr_code_number contains match),
// used when the network fetch fails or the device is offline.
export async function searchCachedProducts(searchTerm: string, limit = 20): Promise<CachedProduct[]> {
  const all = await getCachedProducts();
  if (!searchTerm) return all.slice(0, limit);
  const term = searchTerm.toLowerCase();
  return all
    .filter((p: any) =>
      String(p.name || "").toLowerCase().includes(term) ||
      String(p.barcode || "").toLowerCase().includes(term) ||
      String(p.qr_code_number || "").toLowerCase().includes(term)
    )
    .slice(0, limit);
}

export async function findCachedProductByCode(code: string): Promise<CachedProduct | null> {
  const all = await getCachedProducts();
  const match = all.find((p: any) => p.barcode === code || p.qr_code_number === code);
  return match || null;
}

export async function cachePriceTiers(tiers: CachedPriceTier[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("price_tiers", "readwrite");
  await tx.store.clear();
  for (const t of tiers) await tx.store.put(t);
  await tx.done;
}

export async function getCachedPriceTiers(): Promise<CachedPriceTier[]> {
  const db = await getDb();
  return db.getAll("price_tiers");
}

// Optimistically adjust cached stock so back-to-back offline sales don't oversell
// the same item before the cache is next refreshed from the server.
export async function adjustCachedStock(productId: string, deltaQty: number): Promise<void> {
  const db = await getDb();
  const product = await db.get("products", productId);
  if (!product) return;
  const current = Number((product as any).stock_quantity ?? 0);
  (product as any).stock_quantity = current - deltaQty;
  await db.put("products", product);
}

export async function queueOfflineSale(payload: PendingSale["payload"]): Promise<PendingSale> {
  const db = await getDb();
  const sale: PendingSale = {
    localId: (crypto as any).randomUUID ? crypto.randomUUID() : `local_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    createdAt: new Date().toISOString(),
    status: "pending",
    payload,
  };
  await db.put("pending_sales", sale);
  return sale;
}

export async function getPendingSales(): Promise<PendingSale[]> {
  const db = await getDb();
  const all = await db.getAll("pending_sales");
  return all.sort((a: PendingSale, b: PendingSale) => a.createdAt.localeCompare(b.createdAt));
}

export async function updatePendingSale(sale: PendingSale): Promise<void> {
  const db = await getDb();
  await db.put("pending_sales", sale);
}

export async function removePendingSale(localId: string): Promise<void> {
  const db = await getDb();
  await db.delete("pending_sales", localId);
}
