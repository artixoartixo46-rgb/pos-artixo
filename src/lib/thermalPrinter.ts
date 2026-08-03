// Direct ESC/POS thermal printer support over WebUSB.
// Works in Chrome/Edge only (WebUSB isn't supported in Safari/Firefox) - callers should
// always fall back to the existing browser print-dialog flow if this isn't available.

const DEVICE_STORAGE_KEY = "artixo_thermal_printer_device";
const WIDTH_STORAGE_KEY = "artixo_thermal_printer_width";
const AUTO_PRINT_STORAGE_KEY = "artixo_thermal_printer_auto";

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

  const now = new Date();

  init();
  align("center");
  bold(true);
  doubleHeight(true);
  push(truncate(data.businessName || "Artixo POS", Math.floor(width / 2)) + "\n");
  doubleHeight(false);
  bold(false);
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
    twoCol(qtyLabel, (item.price * item.quantity).toFixed(2));
  }
  hr();

  twoCol("Subtotal:", `Rs. ${data.subtotal.toFixed(2)}`);
  if (data.discountAmount > 0) twoCol("Discount:", `- Rs. ${data.discountAmount.toFixed(2)}`);
  bold(true);
  twoCol("TOTAL:", `Rs. ${data.total.toFixed(2)}`);
  bold(false);
  hr();

  twoCol("Paid By:", data.paymentMethod);
  twoCol("Paid Amount:", `Rs. ${data.paidAmount.toFixed(2)}`);
  twoCol(data.balance >= 0 ? "Change:" : "Balance Due:", `Rs. ${Math.abs(data.balance).toFixed(2)}`);
  hr();

  align("center");
  bold(true);
  push("Thank you! Visit Again\n");
  bold(false);
  push("Powered by Artixo\n");
  feed(4);

  // Full cut
  bytes.push(GS, 0x56, 0x00);

  return bytes;
}

export async function printReceiptDirect(data: ReceiptPrintData): Promise<void> {
  await sendBytes(buildReceiptBytes(data));
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
