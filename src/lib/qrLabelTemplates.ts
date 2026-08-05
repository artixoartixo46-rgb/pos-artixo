// QR sticker label design templates for the thermal print function.
// Every template targets the same universal roll size (50mm x 25mm per label,
// 2 labels side-by-side) but lays the QR code, name and price out differently.

export interface QRTemplateItem {
  name: string;
  price: number;
  qrCodeNumber: string;
  qrDataUrl: string;
}

export interface QRLabelTemplate {
  id: string;
  name: string;
  description: string;
  /** CSS scoped to `.tpl-<id>` — sizes/positions the QR + text inside the label */
  css: string;
  /** Returns the inner HTML for one label, given the item and a name-fitting helper */
  renderLabel: (item: QRTemplateItem, fitName: (name: string, maxChars: number) => string) => string;
}

export const LABEL_W = 50; // mm
export const LABEL_H = 25; // mm
export const COLS = 2;
export const PAGE_W = LABEL_W * COLS;

export const QR_LABEL_TEMPLATES: QRLabelTemplate[] = [
  {
    id: "classic",
    name: "Classic",
    description: "QR on the left, name/price/number stacked on the right",
    css: `
      .tpl-classic { display: flex; align-items: center; padding: 1.5mm 2mm; }
      .tpl-classic .qr-box { flex-shrink: 0; width: 20mm; height: 20mm; display: flex; align-items: center; justify-content: center; }
      .tpl-classic .qr-box img { width: 20mm; height: 20mm; image-rendering: pixelated; }
      .tpl-classic .info { flex: 1; padding-left: 1.5mm; overflow: hidden; min-width: 0; }
      .tpl-classic .name { font-size: 7pt; font-weight: bold; line-height: 1.15; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #000; }
      .tpl-classic .price { font-size: 9pt; font-weight: bold; color: #000; margin-top: 0.5mm; }
      .tpl-classic .code { font-size: 6pt; color: #000; margin-top: 0.3mm; }
    `,
    renderLabel: (item, fitName) => `
      <div class="qr-box"><img src="${item.qrDataUrl}" /></div>
      <div class="info">
        <div class="name">${fitName(item.name, 16)}</div>
        <div class="price">Rs.${item.price.toFixed(2)}</div>
        <div class="code">#${item.qrCodeNumber}</div>
      </div>
    `,
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "Large centered QR only — fastest to scan, smallest text footprint",
    css: `
      .tpl-minimal { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 1mm; }
      .tpl-minimal .qr-box img { width: 19mm; height: 19mm; image-rendering: pixelated; }
      .tpl-minimal .price { font-size: 7.5pt; font-weight: bold; color: #000; margin-top: 0.3mm; }
    `,
    renderLabel: (item) => `
      <div class="qr-box"><img src="${item.qrDataUrl}" /></div>
      <div class="price">Rs.${item.price.toFixed(2)}</div>
    `,
  },
  {
    id: "large-qr",
    name: "Large QR",
    description: "QR fills most of the label; name and price shown as a small caption",
    css: `
      .tpl-large-qr { display: flex; align-items: center; padding: 0.8mm; }
      .tpl-large-qr .qr-box { flex-shrink: 0; width: 23mm; height: 23mm; display: flex; align-items: center; justify-content: center; }
      .tpl-large-qr .qr-box img { width: 23mm; height: 23mm; image-rendering: pixelated; }
      .tpl-large-qr .info { flex: 1; padding-left: 1mm; overflow: hidden; min-width: 0; }
      .tpl-large-qr .name { font-size: 5.5pt; font-weight: 600; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #000; }
      .tpl-large-qr .price { font-size: 6.5pt; font-weight: bold; color: #000; margin-top: 0.5mm; }
    `,
    renderLabel: (item, fitName) => `
      <div class="qr-box"><img src="${item.qrDataUrl}" /></div>
      <div class="info">
        <div class="name">${fitName(item.name, 10)}</div>
        <div class="price">Rs.${item.price.toFixed(2)}</div>
      </div>
    `,
  },
  {
    id: "boxed",
    name: "Boxed",
    description: "Bordered frame, everything centered — name on top, QR middle, price on the bottom",
    css: `
      .tpl-boxed { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 1mm 1.5mm; border: 0.3mm solid #000; margin: 0.5mm; box-sizing: border-box; }
      .tpl-boxed .name { font-size: 6pt; font-weight: bold; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #000; max-width: 100%; }
      .tpl-boxed .qr-box { margin: 0.5mm 0; }
      .tpl-boxed .qr-box img { width: 14mm; height: 14mm; image-rendering: pixelated; }
      .tpl-boxed .price { font-size: 8.5pt; font-weight: bold; color: #000; }
      .tpl-boxed .code { font-size: 5.5pt; color: #333; }
    `,
    renderLabel: (item, fitName) => `
      <div class="name">${fitName(item.name, 18)}</div>
      <div class="qr-box"><img src="${item.qrDataUrl}" /></div>
      <div class="price">Rs.${item.price.toFixed(2)}</div>
      <div class="code">#${item.qrCodeNumber}</div>
    `,
  },
  {
    id: "price-tag",
    name: "Price Tag",
    description: "Big bold price dominates, small QR + name on the left — built for shelf tags",
    css: `
      .tpl-price-tag { display: flex; align-items: center; padding: 1.5mm 2mm; }
      .tpl-price-tag .left { flex-shrink: 0; display: flex; flex-direction: column; align-items: center; width: 13mm; }
      .tpl-price-tag .left img { width: 12mm; height: 12mm; image-rendering: pixelated; }
      .tpl-price-tag .left .name { font-size: 5pt; font-weight: 600; margin-top: 0.3mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 13mm; color: #000; }
      .tpl-price-tag .right { flex: 1; text-align: right; padding-left: 1mm; }
      .tpl-price-tag .right .price { font-size: 13pt; font-weight: 800; color: #000; line-height: 1; }
      .tpl-price-tag .right .code { font-size: 5.5pt; color: #000; margin-top: 0.5mm; }
    `,
    renderLabel: (item, fitName) => `
      <div class="left">
        <img src="${item.qrDataUrl}" />
        <div class="name">${fitName(item.name, 9)}</div>
      </div>
      <div class="right">
        <div class="price">Rs.${item.price.toFixed(2)}</div>
        <div class="code">#${item.qrCodeNumber}</div>
      </div>
    `,
  },
  {
    id: "reverse",
    name: "Reverse",
    description: "Mirror of Classic — name/price/number on the left, QR on the right",
    css: `
      .tpl-reverse { display: flex; align-items: center; padding: 1.5mm 2mm; }
      .tpl-reverse .info { flex: 1; padding-right: 1.5mm; overflow: hidden; min-width: 0; }
      .tpl-reverse .name { font-size: 7pt; font-weight: bold; line-height: 1.15; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #000; }
      .tpl-reverse .price { font-size: 9pt; font-weight: bold; color: #000; margin-top: 0.5mm; }
      .tpl-reverse .code { font-size: 6pt; color: #000; margin-top: 0.3mm; }
      .tpl-reverse .qr-box { flex-shrink: 0; width: 20mm; height: 20mm; display: flex; align-items: center; justify-content: center; }
      .tpl-reverse .qr-box img { width: 20mm; height: 20mm; image-rendering: pixelated; }
    `,
    renderLabel: (item, fitName) => `
      <div class="info">
        <div class="name">${fitName(item.name, 16)}</div>
        <div class="price">Rs.${item.price.toFixed(2)}</div>
        <div class="code">#${item.qrCodeNumber}</div>
      </div>
      <div class="qr-box"><img src="${item.qrDataUrl}" /></div>
    `,
  },
  {
    id: "compact-square",
    name: "Compact Square",
    description: "Small centered QR, name and price squeezed onto one tight line below",
    css: `
      .tpl-compact-square { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 0.8mm; }
      .tpl-compact-square .qr-box img { width: 15mm; height: 15mm; image-rendering: pixelated; }
      .tpl-compact-square .line { font-size: 6.5pt; font-weight: bold; color: #000; margin-top: 0.6mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 46mm; }
      .tpl-compact-square .code { font-size: 5pt; color: #333; margin-top: 0.2mm; }
    `,
    renderLabel: (item, fitName) => `
      <div class="qr-box"><img src="${item.qrDataUrl}" /></div>
      <div class="line">${fitName(item.name, 14)} · Rs.${item.price.toFixed(2)}</div>
      <div class="code">#${item.qrCodeNumber}</div>
    `,
  },
  {
    id: "elegant-frame",
    name: "Elegant Frame",
    description: "Double-line border with the name up top, QR centered, price bold at the bottom",
    css: `
      .tpl-elegant-frame { display: flex; flex-direction: column; align-items: center; justify-content: space-between; padding: 1.2mm; border: 0.25mm double #000; margin: 0.4mm; box-sizing: border-box; }
      .tpl-elegant-frame .name { font-size: 5.5pt; font-weight: 600; letter-spacing: 0.2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; color: #000; }
      .tpl-elegant-frame .qr-box img { width: 13mm; height: 13mm; image-rendering: pixelated; }
      .tpl-elegant-frame .bottom-row { display: flex; align-items: baseline; gap: 1.5mm; }
      .tpl-elegant-frame .price { font-size: 8pt; font-weight: 800; color: #000; }
      .tpl-elegant-frame .code { font-size: 5pt; color: #333; }
    `,
    renderLabel: (item, fitName) => `
      <div class="name">${fitName(item.name, 20)}</div>
      <div class="qr-box"><img src="${item.qrDataUrl}" /></div>
      <div class="bottom-row">
        <div class="price">Rs.${item.price.toFixed(2)}</div>
        <div class="code">#${item.qrCodeNumber}</div>
      </div>
    `,
  },
  {
    id: "discount-tag",
    name: "Discount Tag",
    description: "Bold oversized price top-left like a shelf discount tag, tiny QR tucked in the corner",
    css: `
      .tpl-discount-tag { position: relative; display: flex; flex-direction: column; justify-content: center; padding: 1.5mm 2mm; border: 0.3mm dashed #000; margin: 0.4mm; box-sizing: border-box; }
      .tpl-discount-tag .price { font-size: 12pt; font-weight: 800; color: #000; line-height: 1; }
      .tpl-discount-tag .name { font-size: 5.5pt; font-weight: 600; margin-top: 0.6mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 32mm; color: #000; }
      .tpl-discount-tag .code { font-size: 5pt; color: #333; margin-top: 0.2mm; }
      .tpl-discount-tag .qr-box { position: absolute; right: 1.5mm; bottom: 1.5mm; }
      .tpl-discount-tag .qr-box img { width: 10mm; height: 10mm; image-rendering: pixelated; }
    `,
    renderLabel: (item, fitName) => `
      <div class="price">Rs.${item.price.toFixed(2)}</div>
      <div class="name">${fitName(item.name, 16)}</div>
      <div class="code">#${item.qrCodeNumber}</div>
      <div class="qr-box"><img src="${item.qrDataUrl}" /></div>
    `,
  },
];

const FAVORITE_TEMPLATE_KEY = "pos_qr_label_template";

export function getFavoriteTemplateId(): string {
  const saved = localStorage.getItem(FAVORITE_TEMPLATE_KEY);
  if (saved && QR_LABEL_TEMPLATES.some((t) => t.id === saved)) return saved;
  return QR_LABEL_TEMPLATES[0].id;
}

export function setFavoriteTemplateId(id: string) {
  localStorage.setItem(FAVORITE_TEMPLATE_KEY, id);
}

export function getTemplateById(id: string): QRLabelTemplate {
  return QR_LABEL_TEMPLATES.find((t) => t.id === id) || QR_LABEL_TEMPLATES[0];
}
