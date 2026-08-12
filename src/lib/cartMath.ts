// Per-line (per-product) discount math for the POS cart. Kept in one shared place so the
// live cart in POSTerminal.tsx and the offline-sale replay in offlineSync.ts (which re-derives
// sale_items from a queued cart snapshot) never drift out of sync with each other.

export type DiscountType = "percentage" | "fixed";

export interface DiscountableLine {
  price: number;
  quantity: number;
  item_discount?: number;
  item_discount_type?: DiscountType;
}

// The discount amount for one cart line, clamped so it can never exceed the line's own
// gross total (e.g. a stray "150% off" typo doesn't produce a negative line).
export function getItemDiscountAmount(item: DiscountableLine): number {
  const lineGross = item.price * item.quantity;
  if (!item.item_discount) return 0;
  const raw = item.item_discount_type === "fixed" ? item.item_discount : (lineGross * item.item_discount) / 100;
  return Math.max(0, Math.min(raw, lineGross));
}

// Line total after its own per-product discount (but before any whole-bill discount).
export function getLineNetTotal(item: DiscountableLine): number {
  return item.price * item.quantity - getItemDiscountAmount(item);
}
