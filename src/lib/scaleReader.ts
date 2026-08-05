// Digital weighing scale integration - lets the POS read live weight from a connected
// electronic scale instead of the cashier typing it in by hand for loose/weight-based items
// (rice, dal, vegetables, etc).
//
// Two connection paths are supported, covering the vast majority of retail scales:
//   1. Serial (Web Serial API) - the common path. Most digital retail scales speak RS232 and
//      are plugged in via a USB-to-serial cable, which the OS/browser sees as a serial port.
//   2. Bluetooth (Web Bluetooth API) - for scales with a BLE serial-bridge adapter. Most of
//      these expose the Nordic UART Service, which we try first, then fall back to scanning
//      for any notifiable characteristic so odd/unbranded adapters still have a shot at working.
//
// Every scale brand/model speaks a slightly different text protocol (different framing,
// different stability markers, grams vs kilograms). Rather than hard-coding one brand, this
// uses a small generic parser (parseScaleLine) that pulls the first signed decimal number out
// of whatever text the scale sends, plus a configurable baud rate + unit setting so a cashier
// (or whoever sets this up) can tune it to their exact device without touching code.
//
// Chrome/Edge desktop only - both APIs are unavailable in Safari/Firefox and on mobile browsers.
// Requires HTTPS (production is fine; localhost also works for dev).

const SETTINGS_KEY = "artixo_scale_settings";

export type ScaleConnectionType = "serial" | "bluetooth";
export type ScaleStatus = "disconnected" | "connecting" | "connected";

export interface ScaleSettings {
  baudRate: number; // 9600 is the most common default across retail scales
  dataBits: 7 | 8;
  stopBits: 1 | 2;
  parity: "none" | "even" | "odd";
  unit: "auto" | "kg" | "g"; // "auto" detects kg/g from the raw text; falls back to kg
}

export const DEFAULT_SCALE_SETTINGS: ScaleSettings = {
  baudRate: 9600,
  dataBits: 8,
  stopBits: 1,
  parity: "none",
  unit: "auto",
};

export const BAUD_RATE_OPTIONS = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200];

export interface ScaleReading {
  weightKg: number;
  stable: boolean;
  raw: string;
  timestamp: number;
}

export function isWebSerialSupported(): boolean {
  return typeof navigator !== "undefined" && !!(navigator as any).serial;
}

export function isWebBluetoothSupported(): boolean {
  return typeof navigator !== "undefined" && !!(navigator as any).bluetooth;
}

export function getScaleSettings(): ScaleSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SCALE_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SCALE_SETTINGS };
  } catch {
    return { ...DEFAULT_SCALE_SETTINGS };
  }
}

export function saveScaleSettings(settings: ScaleSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// Pulls the first signed decimal number out of a scale's raw text line, and figures out
// unit + stability from common tokens used across brands (Essae, Avery, Contech, CAS, etc).
// Handles formats like: "ST,GS,+  1.250,kg" / "US,NT,+0.000 kg" / "+00012g" / plain "1.250"
export function parseScaleLine(raw: string, settings: ScaleSettings): ScaleReading | null {
  const text = raw.trim();
  if (!text) return null;

  const numberMatch = text.match(/[+-]?\d+(\.\d+)?/);
  if (!numberMatch) return null;
  const value = parseFloat(numberMatch[0]);
  if (Number.isNaN(value)) return null;

  const lower = text.toLowerCase();
  const detectedUnit: "kg" | "g" = lower.includes("kg") ? "kg" : lower.includes(" g") || lower.endsWith("g") ? "g" : "kg";
  const unit: "kg" | "g" = settings.unit === "auto" ? detectedUnit : settings.unit;
  const weightKg = unit === "g" ? value / 1000 : value;

  // "ST"/"stable" = stable reading, "US"/"UNS"/"unstable" = still moving. Default stable if
  // the scale doesn't send a marker at all (some cheap models never do).
  const stable = !(lower.includes("us,") || lower.includes(",us") || lower.includes("uns") || lower.includes("unstable"));

  return { weightKg, stable, raw: text, timestamp: Date.now() };
}

// ---- Serial (USB / USB-to-serial cable) ----

let serialPort: any = null;
let serialCloseFn: (() => Promise<void>) | null = null;

export async function connectSerialScale(
  settings: ScaleSettings,
  onReading: (reading: ScaleReading) => void,
  onDisconnect: () => void
): Promise<void> {
  const nav = navigator as any;
  if (!nav.serial) throw new Error("Web Serial not supported. Use Chrome or Edge on a desktop computer.");

  const port = await nav.serial.requestPort();
  await port.open({
    baudRate: settings.baudRate,
    dataBits: settings.dataBits,
    stopBits: settings.stopBits,
    parity: settings.parity,
  });
  serialPort = port;

  const textDecoder = new TextDecoderStream();
  const readableClosed = port.readable.pipeTo(textDecoder.writable).catch(() => {});
  const reader = textDecoder.readable.getReader();

  let buffer = "";
  let cancelled = false;

  const readLoop = async () => {
    try {
      while (!cancelled) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          buffer += value;
          const lines = buffer.split(/[\r\n]+/);
          buffer = lines.pop() || "";
          for (const line of lines) {
            const reading = parseScaleLine(line, settings);
            if (reading) onReading(reading);
          }
        }
      }
    } catch {
      // port closed or device unplugged mid-read - fall through to disconnect cleanup below
    } finally {
      serialPort = null;
      serialCloseFn = null;
      onDisconnect();
    }
  };
  readLoop();

  serialCloseFn = async () => {
    cancelled = true;
    try {
      await reader.cancel();
    } catch {
      /* ignore */
    }
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
    try {
      await readableClosed;
    } catch {
      /* ignore */
    }
    try {
      await port.close();
    } catch {
      /* ignore */
    }
  };
}

export async function disconnectSerialScale(): Promise<void> {
  if (serialCloseFn) {
    const close = serialCloseFn;
    serialCloseFn = null;
    await close();
  }
  serialPort = null;
}

// ---- Bluetooth (BLE UART-bridge scales) ----

const NUS_SERVICE = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const NUS_TX_CHARACTERISTIC = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"; // scale -> app (notify)

let bleDevice: any = null;
let bleCharacteristic: any = null;

export async function connectBluetoothScale(
  settings: ScaleSettings,
  onReading: (reading: ScaleReading) => void,
  onDisconnect: () => void
): Promise<void> {
  const nav = navigator as any;
  if (!nav.bluetooth) throw new Error("Web Bluetooth not supported. Use Chrome or Edge on a desktop computer.");

  const device = await nav.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: [NUS_SERVICE],
  });
  bleDevice = device;
  device.addEventListener("gattserverdisconnected", () => {
    bleDevice = null;
    bleCharacteristic = null;
    onDisconnect();
  });

  const server = await device.gatt.connect();

  let characteristic: any = null;
  try {
    const service = await server.getPrimaryService(NUS_SERVICE);
    characteristic = await service.getCharacteristic(NUS_TX_CHARACTERISTIC);
  } catch {
    // Not a Nordic UART style device - fall back to scanning every advertised service for
    // any characteristic that supports notify, so unknown/unbranded adapters get a chance too.
    const services = await server.getPrimaryServices();
    for (const service of services) {
      const chars = await service.getCharacteristics();
      const notifiable = chars.find((c: any) => c.properties?.notify);
      if (notifiable) {
        characteristic = notifiable;
        break;
      }
    }
  }

  if (!characteristic) {
    try {
      device.gatt.disconnect();
    } catch {
      /* ignore */
    }
    bleDevice = null;
    throw new Error("Connected, but couldn't find a weight data channel on this device.");
  }

  bleCharacteristic = characteristic;
  let buffer = "";
  characteristic.addEventListener("characteristicvaluechanged", (event: any) => {
    const value: DataView = event.target.value;
    const bytes = new Uint8Array(value.buffer);
    buffer += new TextDecoder().decode(bytes);
    const lines = buffer.split(/[\r\n]+/);
    buffer = lines.pop() || "";
    for (const line of lines) {
      const reading = parseScaleLine(line, settings);
      if (reading) onReading(reading);
    }
  });
  await characteristic.startNotifications();
}

export async function disconnectBluetoothScale(): Promise<void> {
  try {
    if (bleCharacteristic) await bleCharacteristic.stopNotifications();
  } catch {
    /* ignore */
  }
  try {
    if (bleDevice?.gatt?.connected) bleDevice.gatt.disconnect();
  } catch {
    /* ignore */
  }
  bleDevice = null;
  bleCharacteristic = null;
}

export function isScaleConnected(): boolean {
  return !!serialPort || !!bleDevice;
}
