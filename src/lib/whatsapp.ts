// Shared helper for the "free, no-setup" way this app sends WhatsApp messages: a wa.me link
// that opens WhatsApp (Web/Desktop/App, whichever is logged in) with the message pre-filled -
// the cashier/owner still taps Send once, but no WhatsApp Business API, Meta approval, or
// per-message cost is involved. Used by Order Management (vendor purchase orders) and POS
// Terminal (digital bill to customer).

// wa.me needs digits only, with country code and no leading 0 - default to Sri Lanka (+94)
// since that's this business's locale (matches the support number already used in the TopBar).
export function toWhatsAppNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("94")) return digits;
  if (digits.startsWith("0")) return "94" + digits.slice(1);
  return digits;
}

export function openWhatsAppShare(phone: string, text: string) {
  const waNumber = toWhatsAppNumber(phone);
  window.open(`https://wa.me/${waNumber}?text=${encodeURIComponent(text)}`, "_blank");
}
