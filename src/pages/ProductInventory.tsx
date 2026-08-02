import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, Package } from "lucide-react";

export default function ProductInventory() {
  const [searchTerm, setSearchTerm] = useState("");

  const { data: products } = useQuery({
    queryKey: ["inventory", searchTerm],
    queryFn: async () => {
      let query = supabase.from("products").select("*");
      
      if (searchTerm) {
        query = query.or(`name.ilike.%${searchTerm}%,barcode.ilike.%${searchTerm}%`);
      }
      
      const { data, error } = await query.order("name");
      if (error) throw error;
      return data || [];
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
          Product Inventory
        </h1>
        <p className="text-muted-foreground mt-2">View and manage current stock levels</p>
      </div>

      <Card className="glass-card border-border/50">
        <CardHeader>
          <CardTitle>Inventory Status</CardTitle>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search inventory..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 glass border-border/50"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {products?.map((product) => (
              <div
                key={product.id}
                className="flex items-center justify-between p-4 glass-card border-border/30 glass-hover"
              >
                <div className="flex items-center gap-4">
                  <Package className="h-8 w-8 text-primary" />
                  <div>
                    <p className="font-semibold">{product.name}</p>
                    <p className="text-sm text-muted-foreground">{product.category}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-primary">{product.stock_quantity}</p>
                  <p className="text-xs text-muted-foreground">units in stock</p>
                  {product.stock_quantity <= product.min_stock_level && (
                    <p className="text-xs text-destructive font-medium mt-1">Low Stock!</p>
                  )}
                </div>
              </div>
            ))}
            {products?.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <p>No inventory records found.</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
