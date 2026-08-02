import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, X, Building2, Phone, Mail, MapPin, FileText, Calendar, Hash, Receipt } from "lucide-react";

export interface ExtractedItem {
  product_name: string;
  quantity: number;
  unit_price: number;
  tax: number;
  total: number;
}

export interface ExtractedBillData {
  vendor_name: string;
  vendor_address: string;
  vendor_phone: string;
  vendor_email: string;
  gst_vat_number: string;
  bill_date: string;
  invoice_number: string;
  items: ExtractedItem[];
  subtotal: number;
  tax_amount: number;
  total_amount: number;
}

interface BillPreviewModalProps {
  open: boolean;
  onClose: () => void;
  extractedData: ExtractedBillData | null;
  onSave: (data: ExtractedBillData) => Promise<void>;
  isSaving: boolean;
}

export function BillPreviewModal({ open, onClose, extractedData, onSave, isSaving }: BillPreviewModalProps) {
  const [editedData, setEditedData] = useState<ExtractedBillData | null>(null);

  // Initialize edited data when extractedData changes
  if (extractedData && !editedData) {
    setEditedData({ ...extractedData });
  }

  const handleClose = () => {
    setEditedData(null);
    onClose();
  };

  const handleSave = async () => {
    if (editedData) {
      await onSave(editedData);
      setEditedData(null);
    }
  };

  const updateField = (field: keyof ExtractedBillData, value: string | number) => {
    if (editedData) {
      setEditedData({ ...editedData, [field]: value });
    }
  };

  const updateItem = (index: number, field: keyof ExtractedItem, value: string | number) => {
    if (editedData) {
      const newItems = [...editedData.items];
      newItems[index] = { ...newItems[index], [field]: value };
      
      // Recalculate totals
      const subtotal = newItems.reduce((sum, item) => sum + (Number(item.total) || 0), 0);
      const tax = newItems.reduce((sum, item) => sum + (Number(item.tax) || 0), 0);
      
      setEditedData({
        ...editedData,
        items: newItems,
        subtotal,
        tax_amount: tax,
        total_amount: subtotal + tax,
      });
    }
  };

  if (!editedData) return null;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="max-w-4xl max-h-[95vh] p-0 gap-0 bg-background border-border">
        <DialogHeader className="p-6 pb-4 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Receipt className="h-5 w-5 text-primary" />
            Invoice Preview - Review & Confirm
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 max-h-[calc(95vh-200px)]">
          <div className="p-6 space-y-6">
            {/* Vendor Information Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />
                Vendor Information
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="vendor_name" className="flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    Vendor Name
                  </Label>
                  <Input
                    id="vendor_name"
                    value={editedData.vendor_name}
                    onChange={(e) => updateField("vendor_name", e.target.value)}
                    placeholder="Vendor name"
                    className="bg-muted/50"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="vendor_phone" className="flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    Phone
                  </Label>
                  <Input
                    id="vendor_phone"
                    value={editedData.vendor_phone}
                    onChange={(e) => updateField("vendor_phone", e.target.value)}
                    placeholder="Phone number"
                    className="bg-muted/50"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="vendor_email" className="flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    Email
                  </Label>
                  <Input
                    id="vendor_email"
                    type="email"
                    value={editedData.vendor_email}
                    onChange={(e) => updateField("vendor_email", e.target.value)}
                    placeholder="Email address"
                    className="bg-muted/50"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="gst_vat_number" className="flex items-center gap-1">
                    <Hash className="h-3 w-3" />
                    GST/VAT Number
                  </Label>
                  <Input
                    id="gst_vat_number"
                    value={editedData.gst_vat_number}
                    onChange={(e) => updateField("gst_vat_number", e.target.value)}
                    placeholder="Tax registration number"
                    className="bg-muted/50"
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="vendor_address" className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    Address
                  </Label>
                  <Textarea
                    id="vendor_address"
                    value={editedData.vendor_address}
                    onChange={(e) => updateField("vendor_address", e.target.value)}
                    placeholder="Vendor address"
                    rows={2}
                    className="bg-muted/50"
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Invoice Details Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                Invoice Details
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="invoice_number" className="flex items-center gap-1">
                    <Hash className="h-3 w-3" />
                    Invoice Number
                  </Label>
                  <Input
                    id="invoice_number"
                    value={editedData.invoice_number}
                    onChange={(e) => updateField("invoice_number", e.target.value)}
                    placeholder="Invoice number"
                    className="bg-muted/50"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bill_date" className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Invoice Date
                  </Label>
                  <Input
                    id="bill_date"
                    type="date"
                    value={editedData.bill_date}
                    onChange={(e) => updateField("bill_date", e.target.value)}
                    className="bg-muted/50"
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Product Items Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-primary" />
                  Product Items
                </h3>
                <Badge variant="secondary">{editedData.items.length} items</Badge>
              </div>
              
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-[40%]">Product Name</TableHead>
                      <TableHead className="text-center w-[12%]">Qty</TableHead>
                      <TableHead className="text-right w-[16%]">Unit Price</TableHead>
                      <TableHead className="text-right w-[16%]">Tax</TableHead>
                      <TableHead className="text-right w-[16%]">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {editedData.items.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <Input
                            value={item.product_name}
                            onChange={(e) => updateItem(index, "product_name", e.target.value)}
                            className="h-8 bg-transparent border-0 focus:bg-muted/50"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => updateItem(index, "quantity", Number(e.target.value))}
                            className="h-8 text-center bg-transparent border-0 focus:bg-muted/50"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            value={item.unit_price}
                            onChange={(e) => updateItem(index, "unit_price", Number(e.target.value))}
                            className="h-8 text-right bg-transparent border-0 focus:bg-muted/50"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            value={item.tax}
                            onChange={(e) => updateItem(index, "tax", Number(e.target.value))}
                            className="h-8 text-right bg-transparent border-0 focus:bg-muted/50"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            value={item.total}
                            onChange={(e) => updateItem(index, "total", Number(e.target.value))}
                            className="h-8 text-right bg-transparent border-0 focus:bg-muted/50 font-medium"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                    {editedData.items.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                          No items detected
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            <Separator />

            {/* Totals Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Summary</h3>
              
              <div className="bg-muted/30 rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Subtotal</span>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">LKR</span>
                    <Input
                      type="number"
                      step="0.01"
                      value={editedData.subtotal}
                      onChange={(e) => updateField("subtotal", Number(e.target.value))}
                      className="w-32 text-right h-8 bg-transparent"
                    />
                  </div>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Tax</span>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">LKR</span>
                    <Input
                      type="number"
                      step="0.01"
                      value={editedData.tax_amount}
                      onChange={(e) => updateField("tax_amount", Number(e.target.value))}
                      className="w-32 text-right h-8 bg-transparent"
                    />
                  </div>
                </div>
                
                <Separator />
                
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-lg">Grand Total</span>
                  <div className="flex items-center gap-2">
                    <span className="text-primary font-medium">LKR</span>
                    <Input
                      type="number"
                      step="0.01"
                      value={editedData.total_amount}
                      onChange={(e) => updateField("total_amount", Number(e.target.value))}
                      className="w-32 text-right h-9 bg-transparent font-bold text-lg text-primary"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="p-6 pt-4 border-t border-border gap-2">
          <Button variant="outline" onClick={handleClose} disabled={isSaving}>
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Vendor & Bill
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
