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
import { Plus, Pencil, Trash2, MapPin } from "lucide-react";
import { toast } from "sonner";

export default function LocationMaster() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: "", code: "", address: "" });
  const qc = useQueryClient();
  const { data: locs, isLoading } = useQuery({ queryKey: ["locations"], queryFn: async () => { const { data, error } = await supabase.from("locations").select("*").order("name"); if (error) throw error; return data; } });
  const create = useMutation({ mutationFn: async (d: any) => { const { error } = await supabase.from("locations").insert([d]); if (error) throw error; }, onSuccess: () => { qc.invalidateQueries({ queryKey: ["locations"] }); toast.success("Created"); setIsDialogOpen(false); setForm({ name: "", code: "", address: "" }); }, onError: () => toast.error("Failed") });
  const update = useMutation({ mutationFn: async ({ id, data }: any) => { const { error } = await supabase.from("locations").update(data).eq("id", id); if (error) throw error; }, onSuccess: () => { qc.invalidateQueries({ queryKey: ["locations"] }); toast.success("Updated"); setIsDialogOpen(false); setEditing(null); setForm({ name: "", code: "", address: "" }); } });
  const del = useMutation({ mutationFn: async (id: string) => { const { error } = await supabase.from("locations").delete().eq("id", id); if (error) throw error; }, onSuccess: () => { qc.invalidateQueries({ queryKey: ["locations"] }); toast.success("Deleted"); } });

  return (<div className="space-y-6"><div className="flex items-center justify-between"><div><h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">Location Master</h1><p className="text-muted-foreground mt-2">Manage locations</p></div><Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}><DialogTrigger asChild><Button className="gap-2"><Plus className="h-4 w-4" />Add</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>{editing?"Edit":"Add"} Location</DialogTitle></DialogHeader><form onSubmit={(e)=>{e.preventDefault();if(!form.name.trim()||!form.code.trim()){toast.error("Name & code required");return;}editing?update.mutate({id:editing.id,data:form}):create.mutate(form);}} className="space-y-4"><div><Label>Name *</Label><Input value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})}/></div><div><Label>Code *</Label><Input value={form.code} onChange={(e)=>setForm({...form,code:e.target.value.toUpperCase()})}/></div><div><Label>Address</Label><Textarea value={form.address} onChange={(e)=>setForm({...form,address:e.target.value})} rows={3}/></div><Button type="submit" className="w-full">{editing?"Update":"Create"}</Button></form></DialogContent></Dialog></div><Card className="p-6 glass">{isLoading?<p className="text-center py-8">Loading...</p>:!locs?.length?<div className="text-center py-12"><MapPin className="h-12 w-12 mx-auto text-muted-foreground mb-4"/><p>No locations found.</p></div>:<Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Code</TableHead><TableHead>Address</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{locs.map((l:any)=>(<TableRow key={l.id}><TableCell className="font-medium">{l.name}</TableCell><TableCell><span className="px-2 py-1 bg-primary/10 text-primary rounded text-sm font-mono">{l.code}</span></TableCell><TableCell>{l.address||"-"}</TableCell><TableCell className="text-right"><div className="flex justify-end gap-2"><Button variant="ghost" size="icon" onClick={()=>{setEditing(l);setForm({name:l.name,code:l.code,address:l.address||""});setIsDialogOpen(true);}}><Pencil className="h-4 w-4"/></Button><Button variant="ghost" size="icon" onClick={()=>confirm("Delete?")&&del.mutate(l.id)} className="text-destructive"><Trash2 className="h-4 w-4"/></Button></div></TableCell></TableRow>))}</TableBody></Table>}</Card></div>);
}
