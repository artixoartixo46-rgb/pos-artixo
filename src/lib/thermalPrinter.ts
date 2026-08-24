// Direct ESC/POS thermal printer support over WebUSB.
// Works in Chrome/Edge only (WebUSB isn't supported in Safari/Firefox) - callers should
// always fall back to the existing browser print-dialog flow if this isn't available.
import QRCode from "qrcode";
import artixoLogo from "@/assets/artixo-logo.png";

const DEVICE_STORAGE_KEY = "artixo_thermal_printer_device";
const WIDTH_STORAGE_KEY = "artixo_thermal_printer_width";
const AUTO_PRINT_STORAGE_KEY = "artixo_thermal_printer_auto";
const AUTO_DRAWER_STORAGE_KEY = "artixo_thermal_printer_auto_drawer";
const DIGITAL_RECEIPT_STORAGE_KEY = "artixo_digital_receipt_mode";

export interface SavedPrinterInfo {
  vendorId: number;
  productId: number;
  name?: string;
}

export interface ReceiptItem {
  name: string;
  quantity: number;
  price: number;
  unit_label?: string;
  item_discount?: number;
  item_discount_type?: "percentage" | "fixed";
}

export interface ReceiptPrintData {
  businessName?: string;
  businessAddress?: string;
  businessPhone?: string;
  invoiceNumber: string;
  items: ReceiptItem[];
  subtotal: number;
  discountAmount: number;
  total: number;
  paidAmount: number;
  balance: number;
  paymentMethod: string;
  customerName?: string;
}

let cachedDevice: USBDevice | null = null;
let cachedEndpointNumber: number | null = null;

export function isWebUSBSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.usb;
}

export function getSavedPrinterInfo(): SavedPrinterInfo | null {
  try {
    const raw = localStorage.getItem(DEVICE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function getPaperWidth(): 58 | 80 {
  return localStorage.getItem(WIDTH_STORAGE_KEY) === "58" ? 58 : 80;
}

export function setPaperWidth(width: 58 | 80) {
  localStorage.setItem(WIDTH_STORAGE_KEY, String(width));
}

export function isAutoDirectPrintEnabled(): boolean {
  return localStorage.getItem(AUTO_PRINT_STORAGE_KEY) === "1";
}

export function setAutoDirectPrintEnabled(enabled: boolean) {
  localStorage.setItem(AUTO_PRINT_STORAGE_KEY, enabled ? "1" : "0");
}

export function isAutoOpenDrawerEnabled(): boolean {
  return localStorage.getItem(AUTO_DRAWER_STORAGE_KEY) === "1";
}

export function setAutoOpenDrawerEnabled(enabled: boolean) {
  localStorage.setItem(AUTO_DRAWER_STORAGE_KEY, enabled ? "1" : "0");
}

// When on, a completed sale skips the paper receipt (thermal or browser-print) and instead
// shows a QR code the customer scans with their own phone to view the bill - saves paper.
// Manual "Digital Receipt" / "Print" buttons in POS Terminal still work regardless of this.
export function isDigitalReceiptModeEnabled(): boolean {
  return localStorage.getItem(DIGITAL_RECEIPT_STORAGE_KEY) === "1";
}

export function setDigitalReceiptModeEnabled(enabled: boolean) {
  localStorage.setItem(DIGITAL_RECEIPT_STORAGE_KEY, enabled ? "1" : "0");
}

export function forgetPrinter() {
  localStorage.removeItem(DEVICE_STORAGE_KEY);
  cachedDevice = null;
  cachedEndpointNumber = null;
}

async function claimPrinterInterface(device: USBDevice): Promise<number> {
  if (!device.opened) await device.open();
  if (device.configuration === null) {
    await device.selectConfiguration(1);
  }

  let ifaceNum = 0;
  let epNum = 1;
  const config = device.configuration;
  if (config) {
    outer: for (const iface of config.interfaces) {
      for (const ep of iface.alternate.endpoints) {
        if (ep.direction === "out") {
          ifaceNum = iface.interfaceNumber;
          epNum = ep.endpointNumber;
          break outer;
        }
      }
    }
  }

  await device.claimInterface(ifaceNum);
  cachedDevice = device;
  cachedEndpointNumber = epNum;
  return epNum;
}

// Prompts the browser's device picker (must be called from a user gesture, e.g. a button click).
export async function requestAndSavePrinter(): Promise<SavedPrinterInfo> {
  if (!navigator.usb) {
    throw new Error("WebUSB not supported in this browser. Use Chrome or Edge on desktop.");
  }
  const device = await navigator.usb.requestDevice({ filters: [] });
  await claimPrinterInterface(device);
  const info: SavedPrinterInfo = {
    vendorId: device.vendorId,
    productId: device.productId,
    name: device.productName,
  };
  localStorage.setItem(DEVICE_STORAGE_KEY, JSON.stringify(info));
  return info;
}

// Re-attaches to a previously-authorized printer without prompting the user again.
export async function getConnectedPrinter(): Promise<USBDevice | null> {
  if (!navigator.usb) return null;
  const saved = getSavedPrinterInfo();
  if (!saved) return null;

  if (cachedDevice && cachedDevice.opened) return cachedDevice;

  const devices = await navigator.usb.getDevices();
  const match = devices.find((d) => d.vendorId === saved.vendorId && d.productId === saved.productId);
  if (!match) return null;

  await claimPrinterInterface(match);
  return match;
}

async function sendBytes(bytes: number[]): Promise<void> {
  const device = await getConnectedPrinter();
  if (!device || cachedEndpointNumber === null) {
    throw new Error("No thermal printer connected. Connect one from Settings first.");
  }
  const data = new Uint8Array(bytes);
  const chunkSize = 4096;
  for (let offset = 0; offset < data.length; offset += chunkSize) {
    await device.transferOut(cachedEndpointNumber, data.slice(offset, offset + chunkSize));
  }
}

// ---- ESC/POS byte builder ----
const ESC = 0x1b;
const GS = 0x1d;

function buildReceiptBytes(data: ReceiptPrintData): number[] {
  const width = getPaperWidth() === 58 ? 32 : 48;
  const bytes: number[] = [];
  const encoder = new TextEncoder();
  const push = (s: string) => bytes.push(...Array.from(encoder.encode(s)));
  const init = () => bytes.push(ESC, 0x40);
  const align = (a: "left" | "center" | "right") =>
    bytes.push(ESC, 0x61, a === "left" ? 0 : a === "center" ? 1 : 2);
  const bold = (on: boolean) => bytes.push(ESC, 0x45, on ? 1 : 0);
  const doubleHeight = (on: boolean) => bytes.push(GS, 0x21, on ? 0x01 : 0x00);
  const feed = (n = 1) => push("\n".repeat(n));
  const hr = () => push("-".repeat(width) + "\n");
  const truncate = (s: string, max: number) => (s.length > max ? s.slice(0, Math.max(0, max - 1)) + "…" : s);
  const twoCol = (left: string, right: string) => {
    left = truncate(left, width - right.length - 1);
    const space = Math.max(1, width - left.length - right.length);
    push(left + " ".repeat(space) + right + "\n");
  };
  const center = (text: string) => {
    text = truncate(text, width);
    const pad = Math.max(0, Math.floor((width - text.length) / 2));
    push(" ".repeat(pad) + text + "\n");
  };
  // Prints a 2D QR symbol using the standard ESC/POS "GS ( k" command set (Epson TM-series
  // and virtually every clone thermal printer that supports QR at all implements this same
  // command set: select model 2, set module size + error correction, store data, then print).
  const qr = (data: string, moduleSize = 6) => {
    const dataBytes = Array.from(encoder.encode(data));
    const storeLen = dataBytes.length + 3;
    const pL = storeLen % 256;
    const pH = Math.floor(storeLen / 256) % 256;
    bytes.push(GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00); // select model 2
    bytes.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, moduleSize); // module size
    bytes.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31); // error correction: M
    bytes.push(GS, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30, ...dataBytes); // store data
    bytes.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30); // print stored symbol
  };

  const now = new Date();

  // Whole receipt prints in bold (ESC/POS "emphasized" mode) - thermal print heads fade
  // fast on regular-weight text, bold roughly doubles the dot strikes so it stays legible.
  init();
  bold(true);
  align("center");
  doubleHeight(true);
  push(truncate(data.businessName || "Artixo POS", Math.floor(width / 2)) + "\n");
  doubleHeight(false);
  if (data.businessAddress) center(data.businessAddress);
  if (data.businessPhone) center(data.businessPhone);

  align("left");
  hr();
  twoCol("Invoice:", data.invoiceNumber);
  twoCol("Date:", now.toLocaleDateString("en-GB"));
  twoCol("Time:", now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }));
  if (data.customerName) twoCol("Customer:", truncate(data.customerName, width - 10));
  hr();

  for (const item of data.items) {
    push(truncate(item.name, width) + "\n");
    const qtyLabel = `${item.quantity}${item.unit_label ? " " + item.unit_label : ""} x ${item.price.toFixed(2)}`;
    const lineGross = item.price * item.quantity;
    const itemDiscountAmt = item.item_discount
      ? Math.max(0, Math.min(item.item_discount_type === "fixed" ? item.item_discount : (lineGross * item.item_discount) / 100, lineGross))
      : 0;
    twoCol(qtyLabel, (lineGross - itemDiscountAmt).toFixed(2));
    if (itemDiscountAmt > 0) twoCol("  Item Discount:", `-${itemDiscountAmt.toFixed(2)}`);
  }
  hr();

  twoCol("Subtotal:", `Rs. ${data.subtotal.toFixed(2)}`);
  if (data.discountAmount > 0) twoCol("Discount:", `- Rs. ${data.discountAmount.toFixed(2)}`);
  doubleHeight(true);
  twoCol("TOTAL:", `Rs. ${data.total.toFixed(2)}`);
  doubleHeight(false);
  hr();

  twoCol("Paid By:", data.paymentMethod);
  twoCol("Paid Amount:", `Rs. ${data.paidAmount.toFixed(2)}`);
  twoCol(data.balance >= 0 ? "Change:" : "Balance Due:", `Rs. ${Math.abs(data.balance).toFixed(2)}`);
  hr();

  // Scan-to-return QR - opens the Returns page with this invoice pre-selected, from any
  // phone's camera or the in-app scanner on the Returns page.
  if (typeof window !== "undefined") {
    align("center");
    push("Scan to Return\n");
    qr(`${window.location.origin}/returns?invoice=${encodeURIComponent(data.invoiceNumber)}`);
    feed(1);
  }

  align("center");
  push("Thank you! Visit Again\n");
  push("Support: +94 75 412 0403\n");
  push("Powered by Artixo\n");
  bold(false);
  feed(4);

  // Full cut
  bytes.push(GS, 0x56, 0x00);

  return bytes;
}

export async function printReceiptDirect(data: ReceiptPrintData): Promise<void> {
  await sendBytes(buildReceiptBytes(data));
}

// Browser print-dialog fallback, used both by the live POS checkout flow and by "reprint"
// callers elsewhere (Dashboard's Recent Sales, Purchase History, etc.) that only have the
// already-saved sale/sale_items rows to work with, not a live cart. Marked "REPRINT" in the
// header so it's never mistaken for the original ticket.
export async function printReceiptInBrowser(data: ReceiptPrintData, isReprint = false): Promise<void> {
  const printWindow = window.open("", "_blank", "width=320,height=600");
  if (!printWindow) {
    throw new Error("Popup blocked - please allow popups to print the receipt.");
  }

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-GB");
  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  const widthMm = getPaperWidth();
  const logoUrl = artixoLogo.startsWith("http") ? artixoLogo : `${window.location.origin}${artixoLogo}`;
  const businessName = data.businessName || "Artixo POS";

  const returnUrl = `${window.location.origin}/returns?invoice=${encodeURIComponent(data.invoiceNumber)}`;
  const returnQrDataUrl = await QRCode.toDataURL(returnUrl, { width: 200, margin: 1, errorCorrectionLevel: "M" }).catch(() => "");

  const itemsHTML = data.items
    .map((item, idx) => {
      const lineGross = item.quantity * item.price;
      const itemDiscountAmt = item.item_discount
        ? item.item_discount_type === "percentage"
          ? (lineGross * item.item_discount) / 100
          : item.item_discount
        : 0;
      const lineNet = lineGross - itemDiscountAmt;
      return `
      <div class="item">
        <div class="item-name"><span class="item-no">${String(idx + 1).padStart(2, "0")}</span>${item.name}</div>
        <div class="item-row">
          <span class="item-qty">${item.quantity}${item.unit_label ? ` ${item.unit_label}` : ""} &times; ${item.price.toFixed(2)}</span>
          <span class="item-amt">Rs. ${lineNet.toFixed(2)}</span>
        </div>
        ${itemDiscountAmt > 0 ? `
        <div class="item-row" style="color:#b00020;">
          <span class="item-qty">Item Discount</span>
          <span class="item-amt">- Rs. ${itemDiscountAmt.toFixed(2)}</span>
        </div>
        ` : ""}
      </div>
    `;
    })
    .join("");

  const receiptHTML = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Receipt - ${data.invoiceNumber}</title>
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
          .header .reprint-badge { display: inline-block; font-size: 8px; font-weight: 900; color: #fff; background: #b00020; text-transform: uppercase; letter-spacing: 1px; padding: 2px 8px; border-radius: 8px; margin: 0 0 4px 4px; }
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
            <div class="tagline">Wholesale Grocery POS</div>${isReprint ? '<span class="reprint-badge">Reprint</span>' : ""}
            ${data.businessAddress ? `<p>${data.businessAddress}</p>` : ""}
            ${data.businessPhone ? `<p>${data.businessPhone}</p>` : ""}
          </div>

          <div class="zigzag"></div>

          <div class="info">
            <div class="info-row">
              <span>Invoice</span>
              <span class="val">${data.invoiceNumber}</span>
            </div>
            <div class="info-row">
              <span>${isReprint ? "Reprinted On" : "Date"}</span>
              <span class="val">${dateStr}&nbsp;&nbsp;${timeStr}</span>
            </div>
            ${data.customerName ? `
            <div class="info-row">
              <span>Customer</span>
              <span class="val">${data.customerName}</span>
            </div>
            ` : ""}
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
              <span>Rs. ${data.subtotal.toFixed(2)}</span>
            </div>
            ${data.discountAmount > 0 ? `
            <div class="row discount">
              <span>Discount</span>
              <span>- Rs. ${data.discountAmount.toFixed(2)}</span>
            </div>
            ` : ""}
            <div class="row grand">
              <span>TOTAL</span>
              <span>Rs. ${data.total.toFixed(2)}</span>
            </div>
          </div>

          <div class="payment">
            <div class="info-row">
              <span>Paid By</span>
              <span class="badge">${data.paymentMethod}</span>
            </div>
            <div class="info-row">
              <span>Paid Amount</span>
              <span class="val">Rs. ${data.paidAmount.toFixed(2)}</span>
            </div>
            <div class="info-row due">
              <span>${data.balance >= 0 ? "Change" : "Balance Due"}</span>
              <span class="val">Rs. ${Math.abs(data.balance).toFixed(2)}</span>
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
            ` : ""}
            <div class="support">Support: +94 75 412 0403</div>
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
}

// One-call "reprint" helper for pages that only have a saved sale/sale_items record (Dashboard's
// Recent Sales, Purchase History, etc.) rather than a live cart: tries the connected thermal
// printer first (same as checkout), falls back to the browser print dialog on any failure.
export async function reprintReceipt(data: ReceiptPrintData): Promise<void> {
  const canDirectPrint = isWebUSBSupported() && !!getSavedPrinterInfo() && isAutoDirectPrintEnabled();
  if (canDirectPrint) {
    try {
      await printReceiptDirect(data);
      return;
    } catch {
      // fall through to browser print
    }
  }
  await printReceiptInBrowser(data, true);
}

// Cash drawer kick pulse - the standard ESC/POS "ESC p m t1 t2" real-time drawer command.
// Only works if the cash drawer is wired into the thermal printer's own drawer-kick port
// (the usual setup - most receipt printers have one) rather than plugged in separately.
// m=0 selects drawer pin 2 (the common wiring); t1/t2 are the on/off pulse widths.
export async function openCashDrawer(): Promise<void> {
  await sendBytes([ESC, 0x70, 0x00, 0x19, 0xfa]);
}

export interface DirectPrintLabel {
  name: string;
  price: number;
  qrCodeNumber: string;
  quantity: number;
}

// Direct ESC/POS printing for QR price labels, reusing the SAME WebUSB connection/native QR
// command as printReceiptDirect() above. This exists because BarcodePrint.tsx's original
// label print went through the browser's Print dialog (an HTML page rendered by the OS print
// driver) - fine for a real Windows-driven label printer, but most 58mm thermal RECEIPT
// printers (like the one already connected here for bills) have no real GDI rasterization
// driver at all, so that HTML page came out as a blank sticker even though the on-screen print
// preview looked correct. Printing the label the exact same way the receipt already prints
// correctly - as raw ESC/POS text plus the printer's own built-in QR generator (GS ( k), not a
// browser-rendered image - sidesteps the driver entirely and matches how other POS software
// prints on the same hardware. Each label is cut off the roll as its own strip.
function buildLabelBytes(labels: DirectPrintLabel[]): number[] {
  const width = getPaperWidth() === 58 ? 32 : 48;
  const bytes: number[] = [];
  const encoder = new TextEncoder();
  const push = (s: string) => bytes.push(...Array.from(encoder.encode(s)));
  const init = () => bytes.push(ESC, 0x40);
  const align = (a: "left" | "center" | "right") =>
    bytes.push(ESC, 0x61, a === "left" ? 0 : a === "center" ? 1 : 2);
  const bold = (on: boolean) => bytes.push(ESC, 0x45, on ? 1 : 0);
  const doubleHeight = (on: boolean) => bytes.push(GS, 0x21, on ? 0x01 : 0x00);
  const feed = (n = 1) => push("\n".repeat(n));
  const truncate = (s: string, max: number) => (s.length > max ? s.slice(0, Math.max(0, max - 1)) + "…" : s);
  const cut = () => bytes.push(GS, 0x56, 0x00);
  const qr = (data: string, moduleSize = 5) => {
    const dataBytes = Array.from(encoder.encode(data));
    const storeLen = dataBytes.length + 3;
    const pL = storeLen % 256;
    const pH = Math.floor(storeLen / 256) % 256;
    bytes.push(GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00);
    bytes.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, moduleSize);
    bytes.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31);
    bytes.push(GS, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30, ...dataBytes);
    bytes.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30);
  };

  init();
  for (const label of labels) {
    for (let i = 0; i < label.quantity; i++) {
      align("center");
      qr(String(label.qrCodeNumber));
      feed(1);
      bold(true);
      push(truncate(label.name, width) + "\n");
      doubleHeight(true);
      push(`Rs. ${label.price.toFixed(2)}` + "\n");
      doubleHeight(false);
      bold(false);
      push(`#${label.qrCodeNumber}` + "\n");
      feed(1);
      cut();
    }
  }
  return bytes;
}

export async function printLabelsDirect(labels: DirectPrintLabel[]): Promise<void> {
  await sendBytes(buildLabelBytes(labels));
}

export async function printTestReceipt(businessName?: string): Promise<void> {
  await printReceiptDirect({
    businessName: businessName || "Artixo POS",
    invoiceNumber: "TEST-0001",
    items: [
      { name: "Sample Item A", quantity: 2, price: 150 },
      { name: "Sample Item B (Case)", quantity: 12, price: 45, unit_label: "pcs" },
    ],
    subtotal: 840,
    discountAmount: 40,
    total: 800,
    paidAmount: 800,
    balance: 0,
    paymentMethod: "Cash",
  });
}
