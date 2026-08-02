import React, { useRef } from 'react';
import html2canvas from 'html2canvas';
import artixoLogo from '@/assets/artixo-logo.png';

interface ReceiptItem {
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

interface ReceiptData {
  shopName: string;
  address: string;
  phone: string;
  invoiceNumber: string;
  date: string;
  time: string;
  items: ReceiptItem[];
  subtotal: number;
  discount: number;
  total: number;
  paidAmount: number;
  balance: number;
  paymentMethod: string;
  customerName?: string;
}

interface ReceiptPrinterProps {
  data: ReceiptData;
  onPrintComplete?: () => void;
}

export const ReceiptPrinter: React.FC<ReceiptPrinterProps> = ({ data, onPrintComplete }) => {
  const receiptRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={receiptRef}
      id="receipt-area"
      style={{
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
        <img 
          src={artixoLogo} 
          alt="Artixo" 
          style={{ width: '30mm', height: 'auto', margin: '0 auto 2mm auto', display: 'block' }} 
        />
        <div style={{ fontSize: '14px', fontWeight: 'bold' }}>{data.shopName}</div>
        <div style={{ fontSize: '9px' }}>{data.address}</div>
        <div style={{ fontSize: '9px' }}>{data.phone}</div>
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px dashed #000', margin: '2mm 0' }} />

      {/* Invoice Info */}
      <div style={{ marginBottom: '2mm' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Bill No:</span>
          <span>{data.invoiceNumber}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Date:</span>
          <span>{data.date}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Time:</span>
          <span>{data.time}</span>
        </div>
        {data.customerName && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Customer:</span>
            <span>{data.customerName}</span>
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
      {data.items.map((item, index) => (
        <div key={index} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1mm' }}>
          <span style={{ width: '45%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.name}
          </span>
          <span style={{ width: '15%', textAlign: 'center' }}>{item.quantity}</span>
          <span style={{ width: '20%', textAlign: 'right' }}>{item.unitPrice.toFixed(2)}</span>
          <span style={{ width: '20%', textAlign: 'right' }}>{item.totalPrice.toFixed(2)}</span>
        </div>
      ))}

      {/* Divider */}
      <div style={{ borderTop: '1px dashed #000', margin: '2mm 0' }} />

      {/* Totals */}
      <div style={{ marginBottom: '2mm' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Subtotal:</span>
          <span>Rs. {data.subtotal.toFixed(2)}</span>
        </div>
        {data.discount > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Discount:</span>
            <span>- Rs. {data.discount.toFixed(2)}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '12px', marginTop: '1mm' }}>
          <span>Grand Total:</span>
          <span>Rs. {data.total.toFixed(2)}</span>
        </div>
      </div>

      {/* Payment Info */}
      <div style={{ borderTop: '1px dashed #000', margin: '2mm 0' }} />
      <div style={{ marginBottom: '2mm' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Payment:</span>
          <span>{data.paymentMethod}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Paid:</span>
          <span>Rs. {data.paidAmount.toFixed(2)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
          <span>Balance:</span>
          <span>Rs. {data.balance.toFixed(2)}</span>
        </div>
      </div>

      {/* Footer */}
      <div style={{ borderTop: '1px dashed #000', margin: '2mm 0' }} />
      <div style={{ textAlign: 'center', marginTop: '3mm' }}>
        <div style={{ fontWeight: 'bold' }}>Thank You – Visit Again!</div>
        <div style={{ fontSize: '8px', marginTop: '1mm' }}>Powered by Artixo</div>
      </div>
    </div>
  );
};

// Print function using html2canvas
export const printReceipt = async (receiptElement: HTMLElement): Promise<boolean> => {
  try {
    // Convert receipt to canvas
    const canvas = await html2canvas(receiptElement, {
      scale: 2, // Higher resolution for better print quality
      backgroundColor: '#ffffff',
      logging: false,
      useCORS: true,
    });

    // Convert canvas to image
    const imageData = canvas.toDataURL('image/png');

    // Open print window
    const printWindow = window.open('', '_blank', 'width=300,height=600');
    
    if (!printWindow) {
      console.error('Popup blocked - please allow popups for printing');
      return false;
    }

    // Create print document with image
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Receipt</title>
          <style>
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            @page {
              size: 58mm auto;
              margin: 0;
            }
            @media print {
              body {
                width: 58mm;
                margin: 0;
                padding: 0;
              }
              img {
                width: 58mm !important;
                height: auto !important;
                max-width: 100% !important;
              }
            }
            body {
              width: 58mm;
              margin: 0 auto;
              padding: 0;
              background: #fff;
            }
            img {
              width: 100%;
              height: auto;
              display: block;
            }
          </style>
        </head>
        <body>
          <img src="${imageData}" alt="Receipt" />
        </body>
      </html>
    `);

    printWindow.document.close();

    // Wait for image to load then print
    const img = printWindow.document.querySelector('img');
    if (img) {
      img.onload = () => {
        setTimeout(() => {
          printWindow.focus();
          printWindow.print();
        }, 100);
      };
    }

    // Fallback print trigger
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 500);

    return true;
  } catch (error) {
    console.error('Print error:', error);
    return false;
  }
};

export default ReceiptPrinter;
