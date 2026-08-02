import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Package, Plus, Barcode, Edit, Trash2, Search, Filter, Download, Check, ChevronsUpDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { QRCodeGenerator } from "@/components/QRCodeGenerator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function Items() {
  const [open, setOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [categoryComboOpen, setCategoryComboOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    category: "",
    brand: "",
    sub_category: "",
    price: "",
    cost: "",
    warranty: "",
    weight_kg: "",
    stock_quantity: "",
    min_stock_level: "",
    barcode: "",
    qr_code_number: "",
    invoice_number: "",
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Auto-generate QR code number when opening for new product
  useEffect(() => {
    if (open && !editingProduct) {
      generateQRCodeNumber();
    }
  }, [open, editingProduct]);

  const generateQRCodeNumber = async () => {
    try {
      const { data, error } = await supabase.rpc('get_next_qr_code_number');
      if (error) throw error;
      setFormData(prev => ({ ...prev, qr_code_number: data }));
    } catch (error) {
      console.error('Error generating QR code number:', error);
      toast({
        title: "QR Generation Failed",
        description: "Could not auto-generate QR number. You can enter it manually.",
        variant: "destructive",
      });
    }
  };

  const { data: products } = useQuery({
    queryKey: ["products-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  // Get unique categories for filter and combobox
  const categories = useMemo(() => 
    Array.from(new Set(products?.map(p => p.category).filter(Boolean))) as string[],
    [products]
  );

  // Filter products based on search and category
  const filteredProducts = products?.filter(product => {
    const matchesSearch = !searchTerm || 
      product.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.barcode?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = categoryFilter === "all" || product.category === categoryFilter;
    
    return matchesSearch && matchesCategory;
  });

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      if (editingProduct) {
        const { error } = await supabase
          .from("products")
          .update(data)
          .eq("id", editingProduct.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("products").insert(data);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({
        title: editingProduct ? "Product Updated" : "Product Added",
        description: "Product saved successfully!",
      });
      queryClient.invalidateQueries({ queryKey: ["products-all"] });
      setOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      console.error("Product save error:", error);
      toast({
        title: "Error",
        description: error?.message || "Failed to save product. Please check all fields.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Product Deleted",
        description: "Product removed successfully!",
      });
      queryClient.invalidateQueries({ queryKey: ["products-all"] });
      setDeleteDialogOpen(false);
      setProductToDelete(null);
    },
    onError: (err: any) => {
      toast({
        title: "Delete Failed",
        description: err.message?.includes("foreign")
          ? "Cannot delete — product has existing sales history."
          : "Failed to delete product. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleDeleteClick = (id: string) => {
    setProductToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (productToDelete) {
      deleteMutation.mutate(productToDelete);
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      category: "",
      brand: "",
      sub_category: "",
      price: "",
      cost: "",
      warranty: "",
      weight_kg: "",
      stock_quantity: "",
      min_stock_level: "",
      barcode: "",
      qr_code_number: "",
      invoice_number: "",
    });
    setEditingProduct(null);
  };

  const handleEdit = (product: any) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      category: product.category || "",
      brand: product.brand || "",
      sub_category: product.sub_category || "",
      price: product.price,
      cost: product.cost || "",
      warranty: product.warranty || "",
      weight_kg: product.weight_kg || "",
      stock_quantity: product.stock_quantity,
      min_stock_level: product.min_stock_level,
      barcode: product.barcode || "",
      qr_code_number: product.qr_code_number || "",
      invoice_number: product.invoice_number || "",
    });
    setOpen(true);
  };

  const generateBarcode = () => {
    // Sequential numeric barcode based on QR code number, padded to 13 digits
    const qrNum = parseInt(formData.qr_code_number) || 1001;
    const barcode = String(qrNum).padStart(13, '0');
    setFormData({ ...formData, barcode });
  };

  const generateAutoBarcode = () => {
    const qrNum = parseInt(formData.qr_code_number) || 1001;
    return String(qrNum).padStart(13, '0');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.price) {
      toast({ title: "Validation Error", description: "Product name and price are required.", variant: "destructive" });
      return;
    }

    const parsedPrice = parseFloat(formData.price) || 0;
    const parsedCost = formData.cost ? parseFloat(formData.cost) : null;
    const parsedWeight = formData.weight_kg ? parseFloat(formData.weight_kg) : 0;
    const parsedStock = formData.stock_quantity ? parseInt(formData.stock_quantity, 10) : 0;
    const parsedMinStock = formData.min_stock_level ? parseInt(formData.min_stock_level, 10) : 10;

    // Guard against negative values
    if (parsedPrice < 0 || (parsedCost !== null && parsedCost < 0) || parsedWeight < 0 || parsedStock < 0 || parsedMinStock < 0) {
      toast({ title: "Validation Error", description: "Numeric values cannot be negative.", variant: "destructive" });
      return;
    }

    // Duplicate product name check (case-insensitive) — only for new products
    if (!editingProduct) {
      const { data: existing } = await supabase
        .from("products")
        .select("id")
        .ilike("name", formData.name.trim())
        .limit(1);

      if (existing && existing.length > 0) {
        toast({
          title: "Duplicate Product",
          description: `A product named "${formData.name}" already exists.`,
          variant: "destructive",
        });
        return;
      }
    }

    const productData = {
      name: formData.name.trim(),
      category: formData.category || null,
      brand: formData.brand || null,
      sub_category: formData.sub_category || null,
      price: parsedPrice,
      cost: parsedCost,
      weight_kg: parsedWeight,
      stock_quantity: parsedStock,
      min_stock_level: parsedMinStock,
      barcode: formData.barcode || generateAutoBarcode(),
      warranty: formData.warranty || "No Warranty",
      qr_code_number: formData.qr_code_number || null,
      invoice_number: formData.invoice_number || null,
    };

    saveMutation.mutate(productData);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
            Items Management
          </h1>
          <p className="text-muted-foreground mt-2">Manage your product inventory</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="glass bg-primary hover:bg-primary/90" onClick={resetForm}>
              <Plus className="mr-2 h-4 w-4" />
              Add Product
            </Button>
          </DialogTrigger>
          <DialogContent className="!fixed glass-card border-border/50 w-full max-w-[900px]">
            <DialogHeader>
              <DialogTitle>{editingProduct ? "Edit Product" : "Add New Product"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Product Name *</Label>
                  <Input
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="glass border-border/50"
                  />
                </div>
                <div>
                  <Label>Category</Label>
                  <Popover open={categoryComboOpen} onOpenChange={setCategoryComboOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={categoryComboOpen}
                        className="w-full justify-between glass border-border/50 font-normal"
                      >
                        {formData.category || "Select or type category..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-full p-0 glass-card border-border/50" align="start">
                      <Command className="bg-transparent">
                        <CommandInput
                          placeholder="Search or type new category..."
                          onValueChange={(val) => {
                            setFormData(prev => ({ ...prev, category: val }));
                          }}
                        />
                        <CommandList>
                          <CommandEmpty>
                            <button
                              type="button"
                              className="w-full text-left px-2 py-1.5 text-sm hover:bg-accent rounded cursor-pointer"
                              onClick={() => {
                                setCategoryComboOpen(false);
                              }}
                            >
                              Use "{formData.category}" as new category
                            </button>
                          </CommandEmpty>
                          <CommandGroup>
                            {categories.map((cat) => (
                              <CommandItem
                                key={cat}
                                value={cat}
                                onSelect={(val) => {
                                  setFormData(prev => ({ ...prev, category: val }));
                                  setCategoryComboOpen(false);
                                }}
                              >
                                <Check className={cn("mr-2 h-4 w-4", formData.category === cat ? "opacity-100" : "opacity-0")} />
                                {cat}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label>Brand</Label>
                  <Input
                    value={formData.brand}
                    onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                    placeholder="Enter brand name"
                    className="glass border-border/50"
                  />
                </div>
                <div>
                  <Label>Sub Category</Label>
                  <Input
                    value={formData.sub_category}
                    onChange={(e) => setFormData({ ...formData, sub_category: e.target.value })}
                    placeholder="Select or type sub category"
                    className="glass border-border/50"
                  />
                </div>
                <div>
                  <Label>Price (LKR) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    className="glass border-border/50"
                  />
                </div>
                <div>
                  <Label>Cost (LKR)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.cost}
                    onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                    className="glass border-border/50"
                  />
                </div>
                <div>
                  <Label>Warranty</Label>
                  <Input
                    value={formData.warranty}
                    onChange={(e) => setFormData({ ...formData, warranty: e.target.value })}
                    placeholder="e.g. 6 months / 1 year"
                    className="glass border-border/50"
                  />
                </div>
                <div>
                  <Label>Weight (KG)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.weight_kg}
                    onChange={(e) => setFormData({ ...formData, weight_kg: e.target.value })}
                    placeholder="Enter weight in KG"
                    className="glass border-border/50"
                  />
                </div>
                <div>
                  <Label>Stock Quantity</Label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={formData.stock_quantity}
                    onChange={(e) => setFormData({ ...formData, stock_quantity: e.target.value })}
                    className="glass border-border/50"
                  />
                </div>
                <div>
                  <Label>Min Stock Level</Label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="10"
                    value={formData.min_stock_level}
                    onChange={(e) => setFormData({ ...formData, min_stock_level: e.target.value })}
                    className="glass border-border/50"
                  />
                </div>
                <div>
                  <Label>Barcode</Label>
                  <div className="flex gap-2">
                    <Input
                      value={formData.barcode}
                      onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                      className="glass border-border/50"
                    />
                    <Button type="button" variant="outline" className="glass" onClick={generateBarcode}>
                      <Barcode className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div>
                  <Label>QR Code Number</Label>
                  <Input
                    value={formData.qr_code_number}
                    readOnly
                    className="glass border-border/50 bg-muted/50"
                    placeholder="Auto-generated from 1001"
                  />
                </div>
                <div className="md:col-span-2">
                  <Label>Invoice Number</Label>
                  <Input
                    value={formData.invoice_number}
                    onChange={(e) => setFormData({ ...formData, invoice_number: e.target.value })}
                    placeholder="Enter invoice number"
                    className="glass border-border/50"
                  />
                </div>
              </div>
              
              {/* QR Code Preview */}
              {formData.qr_code_number && formData.name && formData.price && (
                <div className="border border-border/50 rounded-lg p-4 glass space-y-2">
                  <Label className="text-sm font-semibold">QR Code Preview</Label>
                  <div className="flex items-center justify-center p-4 bg-white rounded-lg">
                    <div className="text-center space-y-2">
                      <QRCodeGenerator 
                        qrCodeNumber={formData.qr_code_number}
                        itemName={formData.name}
                        price={parseFloat(formData.price) || 0}
                        size={120}
                      />
                      <div className="text-xs text-black">
                        <div className="font-semibold">{formData.name}</div>
                        <div>LKR {parseFloat(formData.price || "0").toFixed(2)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <Button type="submit" disabled={saveMutation.isPending} className="w-full bg-[#2CA6FF] hover:bg-[#2CA6FF]/90 text-white">
                {saveMutation.isPending ? "Saving..." : editingProduct ? "Update Product" : "Add Product"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search and Filter Bar */}
      <Card className="glass-card border-border/50">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or barcode..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 glass border-border/50"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full md:w-[200px] glass border-border/50 bg-card z-50">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Filter by category" />
              </SelectTrigger>
              <SelectContent className="glass-card border-border/50 bg-card z-50">
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category} value={category || ""}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" className="glass border-border/50">
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Products Table */}
      <Card className="glass-card border-border/50">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-border/50">
                  <TableHead className="text-left font-bold text-foreground">ID</TableHead>
                  <TableHead className="text-left font-bold text-foreground">Name</TableHead>
                  <TableHead className="text-center font-bold text-foreground">Category</TableHead>
                  <TableHead className="text-center font-bold text-foreground">Stock</TableHead>
                  <TableHead className="text-center font-bold text-foreground">Alert Level</TableHead>
                  <TableHead className="text-center font-bold text-foreground">Price</TableHead>
                  <TableHead className="text-center font-bold text-foreground">Barcode</TableHead>
                  <TableHead className="text-center font-bold text-foreground">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts && filteredProducts.length > 0 ? (
                  filteredProducts.map((product, index) => {
                    const isLowStock = (product.stock_quantity || 0) <= (product.min_stock_level || 0);
                    return (
                      <TableRow 
                        key={product.id} 
                        className="border-border/30 hover:bg-muted/50 transition-colors"
                      >
                        <TableCell className="text-left font-mono text-sm text-muted-foreground">
                          #{index + 1}
                        </TableCell>
                        <TableCell className="text-left font-bold">
                          {product.name}
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="px-3 py-1 rounded-full text-xs bg-primary/20 text-primary">
                            {product.category || "N/A"}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={`font-bold text-lg ${
                            isLowStock ? "text-red-500" : "text-green-500"
                          }`}>
                            {product.stock_quantity || 0}
                          </span>
                        </TableCell>
                        <TableCell className="text-center text-muted-foreground">
                          {product.min_stock_level || 0}
                        </TableCell>
                        <TableCell className="text-center font-semibold">
                          LKR {product.price ? Number(product.price).toFixed(2) : "0.00"}
                        </TableCell>
                        <TableCell className="text-center font-mono text-sm">
                          {product.barcode || "N/A"}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex justify-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="glass border-blue-500/50 hover:bg-blue-500/20 hover:border-blue-500"
                              onClick={() => handleEdit(product)}
                            >
                              <Edit className="h-3 w-3 mr-1" />
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="glass border-red-500/50 hover:bg-red-500/20 hover:border-red-500 text-red-500"
                              onClick={() => handleDeleteClick(product.id)}
                            >
                              <Trash2 className="h-3 w-3 mr-1" />
                              Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No products found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="glass-card border-border/50">
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the product
              from your inventory.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="glass border-border/50">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 hover:bg-red-600"
              onClick={handleDeleteConfirm}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
