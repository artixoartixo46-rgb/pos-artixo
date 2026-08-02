import { QRCodeSVG } from "qrcode.react";

interface QRCodeGeneratorProps {
  qrCodeNumber: string;
  itemName: string;
  price: number;
  sku?: string;
  size?: number;
}

// Generate compact JSON for QR code content
export function generateQRContent(qrCodeNumber: string, itemName: string, price: number, sku?: string): string {
  const qrData = {
    type: "item",
    item_id: qrCodeNumber,
    name: itemName,
    price: price,
    currency: "LKR",
    sku: sku || "",
    qty: 1,
    timestamp: Math.floor(Date.now() / 1000)
  };
  return JSON.stringify(qrData);
}

export function QRCodeGenerator({ qrCodeNumber, itemName, price, sku, size = 60 }: QRCodeGeneratorProps) {
  const qrData = generateQRContent(qrCodeNumber, itemName, price, sku);

  return (
    <QRCodeSVG 
      value={qrData} 
      size={size}
      level="M"
      includeMargin={false}
    />
  );
}

// Helper function to convert QR code SVG to data URL for printing
export function getQRCodeDataURL(qrCodeNumber: string, itemName: string, price: number, sku?: string, size: number = 60): Promise<string> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      resolve('');
      return;
    }

    // Create temporary div to render QR code
    const tempDiv = document.createElement('div');
    tempDiv.style.position = 'absolute';
    tempDiv.style.left = '-9999px';
    document.body.appendChild(tempDiv);
    
    // Create QR code data
    const qrData = generateQRContent(qrCodeNumber, itemName, price, sku);
    
    // Generate QR code as data URL
    import('qrcode').then((QRCode) => {
      QRCode.toDataURL(qrData, {
        width: size,
        margin: 1,
        errorCorrectionLevel: 'M'
      }).then((dataUrl) => {
        document.body.removeChild(tempDiv);
        resolve(dataUrl);
      }).catch(() => {
        document.body.removeChild(tempDiv);
        resolve('');
      });
    });
  });
}
