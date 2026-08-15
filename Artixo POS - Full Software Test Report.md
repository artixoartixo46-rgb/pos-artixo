# Artixo POS — Full Software Test Report
Date: 15 Aug 2026
Method: Full code-level review across all 23 pages + core libraries (billing, inventory, credit/customers, dashboard/reports). Live in-browser click-through was not run this pass (Chrome extension wasn't connected) — code review + type-check (`tsc --noEmit`, passed clean) were used instead.

Findings are grouped by severity. "Critical" = real money/stock/security risk in live production use. "Moderate" = confusing or wrong in specific situations. "Minor" = cosmetic or edge-case only.

---

## CRITICAL

### Billing (POS Terminal)
1. **Checkout is not atomic.** Sale → credit balance update → stock deduction happen as separate steps with no rollback. If the connection drops mid-checkout, the app resubmits the *whole cart as a new sale* on retry — risk of a duplicate sale with stock deducted twice and a customer double-charged on credit.
2. **Bill-level discount has no upper limit.** A discount % over 100 or a fixed amount bigger than the subtotal can push the total negative, and nothing stops the sale from saving with a negative total.
3. **Credit-sale paid amount isn't checked at all.** A wrong/negative number typed into "amount paid" for a credit sale flows straight into the customer's balance — could inflate what a customer owes with no validation.
4. **No stock check when adding to cart or at checkout.** Products can be sold past zero stock indefinitely — nothing blocks overselling.

### Inventory
5. **Stock Take overwrites, doesn't merge.** If a sale or delivery happens on another device between counting stock and hitting "Apply," that other change gets silently wiped out by the count.
6. **Product Receiving isn't atomic** — same partial-failure risk as checkout: if saving a multi-item delivery fails partway, some items are marked received and stock-bumped, others aren't, with no automatic fix.
7. **"Sync QR Codes" can report success when it actually failed.** If some products fail to update, the tool still shows "Successfully synced" for all of them.

### Customers / Public Pages
8. **The public Returns page (`/returns`) has no login check at all.** Anyone with the link can search every invoice (leaking customer names/totals), and can process a fake return on any invoice they find — which restocks inventory and adjusts a real customer's credit balance, no authentication required.

### Reports / Dashboard
9. **Reports, low-stock suggestions, and demand forecasting silently cut off at 1000 rows.** Once the shop has more than ~1000 sales/items in the lookback window, these numbers quietly stop matching reality with no warning shown.

---

## MODERATE
- Reprinted receipts from the till don't show a "REPRINT" watermark (only reprints from the Dashboard do) — a duplicate paper receipt looks identical to the original.
- Cheque print-count can under-count on rapid double-clicks, weakening the "already printed" warning.
- Adding a new Credit Customer right after closing an Edit dialog without saving can silently update the wrong customer instead of creating a new one.
- Credit Customers list and Purchase History show an overpaid ("advance credit") balance as a plain red number instead of the clearer red/green labeling already fixed on the POS Terminal dialog.
- Deleting a credit customer or vendor with an outstanding balance/history shows only a generic "Delete?" popup, no warning about the balance.
- Vendor Check-In (public page) lets anyone submit a check-in as any real vendor — no identity check, though staff still verify physically before stock changes.
- Dashboard's sale-detail popup can show "Rs. Infinity" for a line item with quantity 0.
- Location Master: closing "Add" without saving, then reopening, can show stale data from the last edit.
- Forecast/report day-boundaries use UTC internally, so sales between midnight and ~5:30am local time get counted on the wrong calendar day.

## MINOR
- Zero or negative quantities can be typed into a few quantity fields (Order Management, Stock Take) without being rejected.
- A few dialogs don't fully reset their form when closed without saving (Items, Location Master) — not currently visible to users but fragile.
- "Transactions" stat on Dashboard is capped at 5 regardless of actual sales count that day.
- Duplicate barcodes across two products would silently resolve to the wrong one on scan (no uniqueness warning).

---

## Recommendation
Items 1–9 (Critical) are the ones that can actually cost money or leak data in daily use — especially #8 (public Returns page fraud risk) and #2/#3/#4 (discount, credit, and stock validation gaps at the till). Suggest fixing those first.
