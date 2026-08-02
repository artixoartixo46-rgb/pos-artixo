import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Users, Camera, FileText, BookOpen, Upload, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { BillPreviewModal, ExtractedBillData } from "@/components/BillPreviewModal";

type Vendor = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  gst_vat_number: string | null;
  opening_balance: number | null;
  current_balance: number | null;
};

type VendorLedgerEntry = {
  id: string;
  description: string;
  invoice_number: string | null;
  debit: number;
  credit: number;
  balance: number;
  transaction_date: string;
};

type VendorBill = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  total_amount: number;
  items: any[];
  status: string;
  created_at: string;
};

export default function Vendors() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    gst_vat_number: "",
    opening_balance: "0",
  });
  
  // OCR Scanner state
  const [scanDialogOpen, setScanDialogOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Preview modal state
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [extractedData, setExtractedData] = useState<ExtractedBillData | null>(null);
  
  // Ledger state
  const [ledgerDialogOpen, setLedgerDialogOpen] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  
  const queryClient = useQueryClient();

  const { data: vendors, isLoading } = useQuery({
    queryKey: ["vendors"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendors")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as Vendor[];
    },
  });

  const { data: vendorLedger, isLoading: ledgerLoading } = useQuery({
    queryKey: ["vendor-ledger", selectedVendor?.id],
    queryFn: async () => {
      if (!selectedVendor) return [];
      const { data, error } = await supabase
        .from("vendor_ledger")
        .select("*")
        .eq("vendor_id", selectedVendor.id)
        .order("transaction_date", { ascending: false });
      if (error) throw error;
      return data as VendorLedgerEntry[];
    },
    enabled: !!selectedVendor,
  });

  const { data: vendorBills } = useQuery({
    queryKey: ["vendor-bills", selectedVendor?.id],
    queryFn: async () => {
      if (!selectedVendor) return [];
      const { data, error } = await supabase
        .from("vendor_bills")
        .select("*")
        .eq("vendor_id", selectedVendor.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as VendorBill[];
    },
    enabled: !!selectedVendor,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase.from("vendors").insert([{
        name: data.name,
        phone: data.phone || null,
        email: data.email || null,
        address: data.address || null,
        gst_vat_number: data.gst_vat_number || null,
        opening_balance: parseFloat(data.opening_balance) || 0,
        current_balance: parseFloat(data.opening_balance) || 0,
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendors"] });
      toast.success("Vendor created successfully");
      setIsDialogOpen(false);
      resetForm();
    },
    onError: () => toast.error("Failed to create vendor"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const { error } = await supabase.from("vendors").update({
        name: data.name,
        phone: data.phone || null,
        email: data.email || null,
        address: data.address || null,
        gst_vat_number: data.gst_vat_number || null,
        opening_balance: parseFloat(data.opening_balance) || 0,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendors"] });
      toast.success("Vendor updated successfully");
      setIsDialogOpen(false);
      setEditingVendor(null);
      resetForm();
    },
    onError: () => toast.error("Failed to update vendor"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vendors").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendors"] });
      toast.success("Vendor deleted successfully");
    },
    onError: () => toast.error("Failed to delete vendor"),
  });

  const resetForm = () => {
    setFormData({ name: "", phone: "", email: "", address: "", gst_vat_number: "", opening_balance: "0" });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error("Vendor name is required");
      return;
    }
    if (editingVendor) {
      updateMutation.mutate({ id: editingVendor.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEdit = (vendor: Vendor) => {
    setEditingVendor(vendor);
    setFormData({
      name: vendor.name,
      phone: vendor.phone || "",
      email: vendor.email || "",
      address: vendor.address || "",
      gst_vat_number: vendor.gst_vat_number || "",
      opening_balance: String(vendor.opening_balance || 0),
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this vendor?")) {
      deleteMutation.mutate(id);
    }
  };

  const handleDialogClose = () => {
    setIsDialogOpen(false);
    setEditingVendor(null);
    resetForm();
  };

  const handleViewLedger = (vendor: Vendor) => {
    setSelectedVendor(vendor);
    setLedgerDialogOpen(true);
  };

  // OCR Functions
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setSelectedImage(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCameraCapture = () => {
    if (fileInputRef.current) {
      fileInputRef.current.setAttribute("capture", "environment");
      fileInputRef.current.click();
    }
  };

  const handleFileUpload = () => {
    if (fileInputRef.current) {
      fileInputRef.current.removeAttribute("capture");
      fileInputRef.current.click();
    }
  };

  // Process OCR - now just extracts and shows preview
  const processOCR = async () => {
    if (!selectedImage) {
      toast.error("Please select an image first");
      return;
    }

    setIsProcessing(true);

    try {
      console.log("Invoking scan-vendor-bill edge function (preview mode)...");
      
      const { data, error } = await supabase.functions.invoke("scan-vendor-bill", {
        body: { image_base64: selectedImage, action: "preview" },
      });

      console.log("Edge function response:", { data, error });

      if (error) {
        console.error("Edge function error:", error);
        if (error.message?.includes("429")) {
          toast.error("AI rate limit exceeded. Please try again in a moment.");
        } else if (error.message?.includes("402")) {
          toast.error("AI service payment required. Please add credits.");
        } else {
          toast.error(`Edge function error: ${error.message}`);
        }
        return;
      }

      if (!data) {
        toast.error("No response from OCR service");
        return;
      }

      if (data.success && data.extracted_data) {
        setExtractedData(data.extracted_data);
        setScanDialogOpen(false);
        setPreviewModalOpen(true);
        toast.success("Bill scanned! Please review the details.");
      } else {
        toast.error(data.error || "OCR processing failed");
        console.error("OCR processing failed:", data);
      }
    } catch (error: any) {
      console.error("OCR error:", error);
      toast.error(error.message || "Failed to send request to Edge Function");
    } finally {
      setIsProcessing(false);
    }
  };

  // Save the confirmed bill data
  const handleSaveBill = async (data: ExtractedBillData) => {
    setIsSaving(true);

    try {
      console.log("Saving bill data...", data);
      
      const { data: response, error } = await supabase.functions.invoke("scan-vendor-bill", {
        body: { action: "save", extracted_data: data },
      });

      console.log("Save response:", { response, error });

      if (error) {
        console.error("Save error:", error);
        toast.error(`Failed to save: ${error.message}`);
        return;
      }

      if (!response) {
        toast.error("No response from server");
        return;
      }

      if (response.success) {
        toast.success(response.message || "Bill saved successfully!");
        setPreviewModalOpen(false);
        setExtractedData(null);
        setSelectedImage(null);
        queryClient.invalidateQueries({ queryKey: ["vendors"] });
        queryClient.invalidateQueries({ queryKey: ["products"] });
      } else {
        toast.error(response.error || "Failed to save bill");
      }
    } catch (error: any) {
      console.error("Save error:", error);
      toast.error(error.message || "Failed to save bill");
    } finally {
      setIsSaving(false);
    }
  };

  const closeScanDialog = () => {
    setScanDialogOpen(false);
    setSelectedImage(null);
  };

  const closePreviewModal = () => {
    setPreviewModalOpen(false);
    setExtractedData(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            Vendors
          </h1>
          <p className="text-muted-foreground mt-2">Manage your suppliers and vendors</p>
        </div>
        <div className="flex gap-2">
          {/* Scan Bill Button */}
          <Dialog open={scanDialogOpen} onOpenChange={setScanDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Camera className="h-4 w-4" />
                Scan Bill
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Scan Vendor Bill (OCR)
                </DialogTitle>
              </DialogHeader>
              
              <div className="space-y-4">
                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                
                {/* Upload buttons */}
                <div className="flex gap-3">
                  <Button onClick={handleCameraCapture} variant="outline" className="flex-1 gap-2">
                    <Camera className="h-4 w-4" />
                    Capture Photo
                  </Button>
                  <Button onClick={handleFileUpload} variant="outline" className="flex-1 gap-2">
                    <Upload className="h-4 w-4" />
                    Upload Bill
                  </Button>
                </div>

                {/* Image preview */}
                {selectedImage && (
                  <div className="relative">
                    <img 
                      src={selectedImage} 
                      alt="Bill preview" 
                      className="w-full max-h-64 object-contain rounded-lg border border-border"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 right-2 bg-background/80"
                      onClick={() => setSelectedImage(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}

                {/* Process button */}
                <Button 
                  onClick={processOCR} 
                  disabled={!selectedImage || isProcessing}
                  className="w-full gap-2"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Extracting Data with AI...
                    </>
                  ) : (
                    <>
                      <FileText className="h-4 w-4" />
                      Process with OCR
                    </>
                  )}
                </Button>

                <p className="text-xs text-muted-foreground text-center">
                  Upload a bill image. After OCR, you'll see a preview to review and edit before saving.
                </p>
              </div>
            </DialogContent>
          </Dialog>

          {/* Add Vendor Button */}
          <Dialog open={isDialogOpen} onOpenChange={handleDialogClose}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Add Vendor
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{editingVendor ? "Edit Vendor" : "Add New Vendor"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name">Vendor Name *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Enter vendor name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="Enter phone number"
                    />
                  </div>
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="Enter email address"
                    />
                  </div>
                  <div>
                    <Label htmlFor="gst">GST/VAT Number</Label>
                    <Input
                      id="gst"
                      value={formData.gst_vat_number}
                      onChange={(e) => setFormData({ ...formData, gst_vat_number: e.target.value })}
                      placeholder="Enter GST/VAT number"
                    />
                  </div>
                  <div>
                    <Label htmlFor="opening_balance">Opening Balance</Label>
                    <Input
                      id="opening_balance"
                      type="number"
                      value={formData.opening_balance}
                      onChange={(e) => setFormData({ ...formData, opening_balance: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label htmlFor="address">Address</Label>
                    <Textarea
                      id="address"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      placeholder="Enter vendor address"
                      rows={2}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={handleDialogClose}>
                    Cancel
                  </Button>
                  <Button type="submit">
                    {editingVendor ? "Update Vendor" : "Add Vendor"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Bill Preview Modal */}
      <BillPreviewModal
        open={previewModalOpen}
        onClose={closePreviewModal}
        extractedData={extractedData}
        onSave={handleSaveBill}
        isSaving={isSaving}
      />

      {/* Vendors Table */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Users className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">All Vendors</h2>
        </div>
        
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : vendors && vendors.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendor Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>GST/VAT</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vendors.map((vendor) => (
                <TableRow key={vendor.id}>
                  <TableCell className="font-medium">{vendor.name}</TableCell>
                  <TableCell>{vendor.phone || "-"}</TableCell>
                  <TableCell>{vendor.email || "-"}</TableCell>
                  <TableCell>{vendor.gst_vat_number || "-"}</TableCell>
                  <TableCell className={`text-right font-medium ${(vendor.current_balance || 0) < 0 ? 'text-green-500' : ''}`}>
                    LKR {(vendor.current_balance || 0).toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleViewLedger(vendor)}
                        title="View Ledger"
                      >
                        <BookOpen className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(vendor)}
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(vendor.id)}
                        className="text-destructive hover:text-destructive"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No vendors found. Add your first vendor to get started.</p>
          </div>
        )}
      </Card>

      {/* Vendor Ledger Dialog */}
      <Dialog open={ledgerDialogOpen} onOpenChange={setLedgerDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Vendor Ledger - {selectedVendor?.name}
            </DialogTitle>
          </DialogHeader>

          {selectedVendor && (
            <div className="space-y-4">
              {/* Vendor Summary */}
              <div className="grid grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
                <div>
                  <p className="text-sm text-muted-foreground">Opening Balance</p>
                  <p className="text-lg font-semibold">LKR {(selectedVendor.opening_balance || 0).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Current Balance</p>
                  <p className={`text-lg font-semibold ${(selectedVendor.current_balance || 0) < 0 ? 'text-green-500' : ''}`}>
                    LKR {(selectedVendor.current_balance || 0).toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Bills</p>
                  <p className="text-lg font-semibold">{vendorBills?.length || 0}</p>
                </div>
              </div>

              {/* Ledger Table */}
              <ScrollArea className="h-[400px]">
                {ledgerLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : vendorLedger && vendorLedger.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Invoice #</TableHead>
                        <TableHead className="text-right">Debit</TableHead>
                        <TableHead className="text-right">Credit</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {vendorLedger.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell>
                            {new Date(entry.transaction_date).toLocaleDateString()}
                          </TableCell>
                          <TableCell>{entry.description}</TableCell>
                          <TableCell>{entry.invoice_number || "-"}</TableCell>
                          <TableCell className="text-right text-destructive">
                            {entry.debit > 0 ? `LKR ${entry.debit.toFixed(2)}` : "-"}
                          </TableCell>
                          <TableCell className="text-right text-green-500">
                            {entry.credit > 0 ? `LKR ${entry.credit.toFixed(2)}` : "-"}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            LKR {entry.balance.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No ledger entries found.
                  </div>
                )}
              </ScrollArea>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
