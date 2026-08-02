import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, AlertCircle, RefreshCw, Database } from "lucide-react";
import { toast } from "sonner";

export default function SyncQRCodes() {
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [syncedCount, setSyncedCount] = useState(0);
  const queryClient = useQueryClient();

  // Fetch products without QR codes
  const { data: productsWithoutQR, refetch } = useQuery({
    queryKey: ["products-without-qr"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, qr_code_number")
        .is("qr_code_number", null)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch products with QR codes
  const { data: productsWithQR } = useQuery({
    queryKey: ["products-with-qr"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, qr_code_number")
        .not("qr_code_number", "is", null)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const syncAllProducts = async () => {
    if (!productsWithoutQR || productsWithoutQR.length === 0) {
      toast.info("All products already have QR codes!");
      return;
    }

    setSyncing(true);
    setProgress(0);
    setSyncedCount(0);

    try {
      const total = productsWithoutQR.length;

      for (let i = 0; i < total; i++) {
        const product = productsWithoutQR[i];

        // Get next QR code number
        const { data: nextQR, error: qrError } = await supabase.rpc('get_next_qr_code_number');
        
        if (qrError) {
          console.error(`Failed to generate QR for ${product.name}:`, qrError);
          continue;
        }

        // Update product with QR code number
        const { error: updateError } = await supabase
          .from('products')
          .update({ qr_code_number: nextQR })
          .eq('id', product.id);

        if (updateError) {
          console.error(`Failed to update ${product.name}:`, updateError);
          continue;
        }

        setSyncedCount(i + 1);
        setProgress(((i + 1) / total) * 100);
      }

      toast.success(`Successfully synced ${total} products with QR codes!`);
      
      // Refresh data
      queryClient.invalidateQueries({ queryKey: ["products-without-qr"] });
      queryClient.invalidateQueries({ queryKey: ["products-with-qr"] });
      queryClient.invalidateQueries({ queryKey: ["products-all"] });
      refetch();
      
    } catch (error) {
      console.error("Sync error:", error);
      toast.error("Failed to sync some products. Check console for details.");
    } finally {
      setSyncing(false);
      setProgress(0);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
          Sync QR Code Numbers
        </h1>
        <p className="text-muted-foreground mt-2">
          Assign QR code numbers to existing products
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Products Without QR Codes */}
        <Card className="glass-card border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-orange-500" />
              Products Without QR Codes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-3xl font-bold text-orange-500">
                  {productsWithoutQR?.length || 0}
                </p>
                <Database className="h-8 w-8 text-muted-foreground" />
              </div>
              
              {productsWithoutQR && productsWithoutQR.length > 0 ? (
                <>
                  <div className="max-h-[300px] overflow-y-auto space-y-2">
                    {productsWithoutQR.slice(0, 10).map((product) => (
                      <div
                        key={product.id}
                        className="p-2 glass-card border-border/30 rounded text-sm"
                      >
                        {product.name}
                      </div>
                    ))}
                    {productsWithoutQR.length > 10 && (
                      <p className="text-xs text-muted-foreground text-center">
                        ...and {productsWithoutQR.length - 10} more
                      </p>
                    )}
                  </div>

                  <Button
                    onClick={syncAllProducts}
                    disabled={syncing}
                    className="w-full bg-primary hover:bg-primary/90"
                  >
                    {syncing ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        Syncing... ({syncedCount}/{productsWithoutQR.length})
                      </>
                    ) : (
                      <>
                        <Database className="mr-2 h-4 w-4" />
                        Sync All Products
                      </>
                    )}
                  </Button>

                  {syncing && (
                    <div className="space-y-2">
                      <Progress value={progress} className="w-full" />
                      <p className="text-xs text-center text-muted-foreground">
                        {progress.toFixed(0)}% Complete
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-8">
                  <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    All products have QR codes!
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Products With QR Codes */}
        <Card className="glass-card border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              Products With QR Codes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-3xl font-bold text-green-500">
                  {productsWithQR?.length || 0}
                </p>
                <CheckCircle2 className="h-8 w-8 text-green-500" />
              </div>
              
              {productsWithQR && productsWithQR.length > 0 && (
                <div className="max-h-[300px] overflow-y-auto space-y-2">
                  {productsWithQR.slice(0, 10).map((product) => (
                    <div
                      key={product.id}
                      className="p-2 glass-card border-border/30 rounded text-sm flex justify-between items-center"
                    >
                      <span>{product.name}</span>
                      <span className="text-xs text-primary font-mono">
                        #{product.qr_code_number}
                      </span>
                    </div>
                  ))}
                  {productsWithQR.length > 10 && (
                    <p className="text-xs text-muted-foreground text-center">
                      ...and {productsWithQR.length - 10} more
                    </p>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Instructions */}
      <Card className="glass-card border-border/50 border-primary/30">
        <CardContent className="pt-6">
          <div className="space-y-3">
            <h3 className="font-semibold text-primary">How QR Code Sync Works:</h3>
            <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
              <li>The system auto-generates QR code numbers starting from 1001</li>
              <li>Click "Sync All Products" to assign QR numbers to all existing products</li>
              <li>Each product will receive a unique sequential QR code number</li>
              <li>New products added through the Items page will automatically get QR numbers</li>
              <li>QR codes can be printed as labels from the "Label Print" page</li>
              <li>In POS Terminal, scanning a QR code will instantly add the item to cart</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
