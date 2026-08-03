import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, UserCheck, Building2 } from "lucide-react";
import { toast } from "sonner";

const CUSTOMER_TYPE_LABELS: Record<string, string> = {
  retail: "Retail",
  wholesale: "Wholesale",
  b2b: "B2B",
};

export default function CreditCustomers() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<any>(null);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    outstanding_balance: "0",
    customer_type: "retail",
    business_name: "",
  });
  const queryClient = useQueryClient();

  const { data: customers, isLoading } = useQuery({
    queryKey: ["credit-customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("credit_customers").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const { error } = await supabase.from("credit_customers").insert([{ ...data, outstanding_balance: parseFloat(data.outstanding_balance) }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credit-customers"] });
      toast.success("Customer created");
      setIsDialogOpen(false);
      setFormData({ name: "", phone: "", email: "", address: "", outstanding_balance: "0", customer_type: "retail", business_name: "" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: any) => {
      const { error } = await supabase.from("credit_customers").update({ ...data, outstanding_balance: parseFloat(data.outstanding_balance) }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credit-customers"] });
      toast.success("Customer updated");
      setIsDialogOpen(false);
      setEditingCustomer(null);
      setFormData({ name: "", phone: "", email: "", address: "", outstanding_balance: "0", customer_type: "retail", business_name: "" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("credit_customers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credit-customers"] });
      toast.success("Customer deleted");
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">Credit Customers</h1>
          <p className="text-muted-foreground mt-2">Manage customers with credit accounts</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild><Button className="gap-2"><Plus className="h-4 w-4" />Add Customer</Button></DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>{editingCustomer ? "Edit" : "Add"} Customer</DialogTitle></DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); if (!formData.name.trim()) { toast.error("Name required"); return; } editingCustomer ? updateMutation.mutate({ id: editingCustomer.id, data: formData }) : createMutation.mutate(formData); }} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Name *</Label><Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} /></div>
                <div><Label>Phone</Label><Input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Account Type</Label>
                  <Select value={formData.customer_type} onValueChange={(v) => setFormData({ ...formData, customer_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="retail">Retail</SelectItem>
                      <SelectItem value="wholesale">Wholesale</SelectItem>
                      <SelectItem value="b2b">B2B</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Business Name</Label><Input value={formData.business_name} onChange={(e) => setFormData({ ...formData, business_name: e.target.value })} placeholder="For wholesale/B2B accounts" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Email</Label><Input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} /></div>
                <div><Label>Balance (LKR)</Label><Input type="number" step="0.01" value={formData.outstanding_balance} onChange={(e) => setFormData({ ...formData, outstanding_balance: e.target.value })} /></div>
              </div>
              <div><Label>Address</Label><Textarea value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} rows={3} /></div>
              <Button type="submit" className="w-full">{editingCustomer ? "Update" : "Create"}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      <div className="flex gap-2">
        {["all", "retail", "wholesale", "b2b"].map((t) => (
          <Button key={t} size="sm" variant={typeFilter === t ? "default" : "outline"} onClick={() => setTypeFilter(t)}>
            {t === "all" ? "All" : CUSTOMER_TYPE_LABELS[t]}
          </Button>
        ))}
      </div>
      <Card className="p-6 glass">
        {isLoading ? <p className="text-center py-8">Loading...</p> : !customers?.length ? <div className="text-center py-12"><UserCheck className="h-12 w-12 mx-auto text-muted-foreground mb-4" /><p className="text-muted-foreground">No customers found.</p></div> : (
          <Table>
            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead>Phone</TableHead><TableHead>Email</TableHead><TableHead className="text-right">Balance</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>{customers.filter((c: any) => typeFilter === "all" || (c.customer_type || "retail") === typeFilter).map((c: any) => (<TableRow key={c.id}><TableCell className="font-medium">{c.name}{c.business_name && <span className="block text-xs text-muted-foreground flex items-center gap-1"><Building2 className="h-3 w-3" />{c.business_name}</span>}</TableCell><TableCell><Badge variant={c.customer_type === "b2b" ? "default" : c.customer_type === "wholesale" ? "secondary" : "outline"}>{CUSTOMER_TYPE_LABELS[c.customer_type || "retail"]}</Badge></TableCell><TableCell>{c.phone || "-"}</TableCell><TableCell>{c.email || "-"}</TableCell><TableCell className="text-right font-semibold">LKR {Number(c.outstanding_balance ?? 0).toFixed(2)}</TableCell><TableCell className="text-right"><div className="flex justify-end gap-2"><Button variant="ghost" size="icon" onClick={() => { setEditingCustomer(c); setFormData({ name: c.name, phone: c.phone || "", email: c.email || "", address: c.address || "", outstanding_balance: String(c.outstanding_balance ?? 0), customer_type: c.customer_type || "retail", business_name: c.business_name || "" }); setIsDialogOpen(true); }}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => confirm("Delete?") && deleteMutation.mutate(c.id)} className="text-destructive"><Trash2 className="h-4 w-4" /></Button></div></TableCell></TableRow>))}</TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
