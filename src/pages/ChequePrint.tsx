import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Printer, History, Plus, Eye, RotateCcw, Settings, TestTube } from "lucide-react";
import { amountToWords, formatChequeDate } from "@/utils/amountToWords";
import { format } from "date-fns";

interface Bank {
  id: string;
  bank_code: string;
  bank_name: string;
}

interface Cheque {
  id: string;
  cheque_number: string;
  payee_name: string;
  amount: number;
  amount_in_words: string;
  cheque_date: string;
  bank_name: string;
  bank_branch: string | null;
  account_number: string | null;
  status: string;
  print_count: number;
  created_at: string;
  last_printed_at: string | null;
}

interface PrintHistory {
  id: string;
  cheque_number: string;
  printed_at: string;
  print_type: string;
}

interface PrintCalibration {
  topOffset: number;
  leftOffset: number;
  testMode: boolean;
  orientation: 'portrait' | 'landscape';
}

export default function ChequePrint() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("new");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [selectedCheque, setSelectedCheque] = useState<Cheque | null>(null);
  
  // Form state
  const [payeeName, setPayeeName] = useState("");
  const [amount, setAmount] = useState("");
  const [amountWords, setAmountWords] = useState("");
  const [chequeDate, setChequeDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [chequeNumber, setChequeNumber] = useState("");
  const [autoNumber, setAutoNumber] = useState(true);
  const [selectedBank, setSelectedBank] = useState("");
  const [bankBranch, setBankBranch] = useState("");
  

  // Printer calibration state
  const [calibration, setCalibration] = useState<PrintCalibration>({
    topOffset: 0,
    leftOffset: 0,
    testMode: false,
    orientation: 'portrait',
  });

  // Fetch banks
  const { data: banks = [] } = useQuery({
    queryKey: ["banks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("banks")
        .select("*")
        .order("bank_name");
      if (error) throw error;
      return data as Bank[];
    },
  });

  // Fetch printer calibration settings
  const { data: settings } = useQuery({
    queryKey: ["settings-calibration"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("settings")
        .select("cheque_top_offset_mm, cheque_left_offset_mm, cheque_test_mode")
        .limit(1)
        .single();
      if (error && error.code !== "PGRST116") throw error;
      return data;
    },
  });

  useEffect(() => {
    if (settings) {
      setCalibration({
        topOffset: settings.cheque_top_offset_mm || 0,
        leftOffset: settings.cheque_left_offset_mm || 0,
        testMode: settings.cheque_test_mode || false,
        orientation: (settings as any).cheque_orientation || 'portrait',
      });
    }
  }, [settings]);

  // Fetch cheques
  const { data: cheques = [] } = useQuery({
    queryKey: ["cheques"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cheques")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Cheque[];
    },
  });

  // Fetch print history
  const { data: printHistory = [] } = useQuery({
    queryKey: ["cheque-print-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cheque_print_history")
        .select("*")
        .order("printed_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as PrintHistory[];
    },
  });

  // Save calibration mutation
  const saveCalibrationMutation = useMutation({
    mutationFn: async (cal: PrintCalibration) => {
      const { data: existing } = await supabase.from("settings").select("id").limit(1).single();
      
      if (existing) {
        const { error } = await supabase
          .from("settings")
          .update({
            cheque_top_offset_mm: cal.topOffset,
            cheque_left_offset_mm: cal.leftOffset,
            cheque_test_mode: cal.testMode,
            cheque_orientation: cal.orientation,
          } as any)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("settings")
          .insert([{
            cheque_top_offset_mm: cal.topOffset,
            cheque_left_offset_mm: cal.leftOffset,
            cheque_test_mode: cal.testMode,
            cheque_orientation: cal.orientation,
          } as any]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings-calibration"] });
      toast.success("Calibration settings saved");
    },
    onError: () => toast.error("Failed to save calibration settings"),
  });

  // Get next cheque number
  const fetchNextChequeNumber = async () => {
    const { data, error } = await supabase.rpc("get_next_cheque_number");
    if (error) {
      console.error("Error fetching cheque number:", error);
      return "CHQ000001";
    }
    return data;
  };

  useEffect(() => {
    if (autoNumber) {
      fetchNextChequeNumber().then(setChequeNumber);
    }
  }, [autoNumber]);

  // Auto-generate amount in words
  useEffect(() => {
    const numAmount = parseFloat(amount);
    if (!isNaN(numAmount) && numAmount > 0) {
      setAmountWords(amountToWords(numAmount));
    } else {
      setAmountWords("");
    }
  }, [amount]);

  // Save cheque mutation
  const saveMutation = useMutation({
    mutationFn: async (chequeData: {
      cheque_number: string;
      payee_name: string;
      amount: number;
      amount_in_words: string;
      cheque_date: string;
      bank_name: string;
      bank_branch: string | null;
      account_number: string | null;
    }) => {
      // Check for duplicate cheque number
      const { data: existing } = await supabase
        .from("cheques")
        .select("id")
        .eq("cheque_number", chequeData.cheque_number)
        .single();
      
      if (existing) {
        throw new Error("Cheque number already exists");
      }

      const { data, error } = await supabase
        .from("cheques")
        .insert([chequeData])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success("Cheque saved successfully");
      queryClient.invalidateQueries({ queryKey: ["cheques"] });
      setSelectedCheque(data);
      setPreviewOpen(true);
      resetForm();
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to save cheque");
    },
  });

  // Print cheque mutation
  const printMutation = useMutation({
    mutationFn: async ({ chequeId, isReprint }: { chequeId: string; isReprint: boolean }) => {
      // Update cheque print count and status
      const { error: updateError } = await supabase
        .from("cheques")
        .update({
          print_count: selectedCheque ? selectedCheque.print_count + 1 : 1,
          status: "printed",
          last_printed_at: new Date().toISOString(),
        })
        .eq("id", chequeId);
      
      if (updateError) throw updateError;

      // Log print history
      const { error: logError } = await supabase
        .from("cheque_print_history")
        .insert([{
          cheque_id: chequeId,
          cheque_number: selectedCheque?.cheque_number || "",
          print_type: isReprint ? "reprint" : "original",
        }]);
      
      if (logError) throw logError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cheques"] });
      queryClient.invalidateQueries({ queryKey: ["cheque-print-history"] });
    },
  });

  const resetForm = () => {
    setPayeeName("");
    setAmount("");
    setAmountWords("");
    setChequeDate(format(new Date(), "yyyy-MM-dd"));
    setAutoNumber(true);
    setSelectedBank("");
    setBankBranch("");
    
    fetchNextChequeNumber().then(setChequeNumber);
  };

  const handleSave = () => {
    if (!payeeName.trim()) {
      toast.error("Please enter payee name");
      return;
    }
    if (!amount || parseFloat(amount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    if (!selectedBank) {
      toast.error("Please select a bank");
      return;
    }
    if (!chequeNumber.trim()) {
      toast.error("Please enter cheque number");
      return;
    }

    const bankName = banks.find(b => b.id === selectedBank)?.bank_name || "";

    saveMutation.mutate({
      cheque_number: chequeNumber,
      payee_name: payeeName.toUpperCase(),
      amount: parseFloat(amount),
      amount_in_words: amountWords,
      cheque_date: chequeDate,
      bank_name: bankName,
      bank_branch: bankBranch || null,
      account_number: null,
    });
  };

  const handlePrint = (isReprint: boolean = false) => {
    if (!selectedCheque) return;

    // Check reprint restriction (for non-admin users)
    if (isReprint && selectedCheque.print_count > 0) {
      // In a real app, check admin status here
      const confirmReprint = window.confirm(
        "This cheque has already been printed. Are you sure you want to reprint?"
      );
      if (!confirmReprint) return;
    }

    // Create print window with cheque content
    const printWindow = window.open("", "_blank", "width=900,height=400");
    if (!printWindow) {
      toast.error("Please allow popups to print cheques");
      return;
    }

    const chequeDate = new Date(selectedCheque.cheque_date);
    const dateStr = formatChequeDate(chequeDate);
    const topOffset = calibration.topOffset;
    const leftOffset = calibration.leftOffset;
    const isTestMode = calibration.testMode;
    const orientation = calibration.orientation;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Print Cheque - ${selectedCheque.cheque_number}</title>
        <style>
          @page {
            size: 203mm 93mm;
            margin: 0 !important;
            padding: 0 !important;
          }
          @media print {
            html, body {
              width: 203mm !important;
              height: 93mm !important;
              margin: 0 !important;
              padding: 0 !important;
              overflow: hidden !important;
            }
          }
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          html, body {
            width: 203mm;
            height: 93mm;
            margin: 0;
            padding: 0;
            overflow: hidden;
          }
          body {
            position: relative;
            font-family: 'Courier New', monospace;
            font-weight: bold;
            color: #000;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .cheque-container {
            width: 203mm;
            height: 93mm;
            position: relative;
            margin-top: ${topOffset}mm;
            margin-left: ${leftOffset}mm;
            ${isTestMode ? `
              background-image: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="767" height="351"><rect fill="%23f0f8ff" width="767" height="351"/><rect fill="none" stroke="%23ccc" stroke-dasharray="5,5" x="2" y="2" width="763" height="347" rx="8"/><text x="383" y="175" text-anchor="middle" fill="%23999" font-size="24" font-family="Arial">CHEQUE TEST MODE</text><line x1="80" y1="60" x2="690" y2="60" stroke="%23ddd"/><line x1="80" y1="100" x2="560" y2="100" stroke="%23ddd"/><line x1="80" y1="140" x2="690" y2="140" stroke="%23ddd"/><line x1="80" y1="180" x2="690" y2="180" stroke="%23ddd"/><rect x="580" y="85" width="120" height="30" fill="none" stroke="%23ddd"/></svg>');
              background-size: 203mm 93mm;
              background-repeat: no-repeat;
            ` : ''}
          }
          /* Date position - top right (DD MM YYYY format) */
          .date-field {
            position: absolute;
            top: 9mm;
            right: 13mm;
            font-size: 11pt;
            letter-spacing: 3mm;
          }
          /* Payee name - "Pay" line */
          .payee-field {
            position: absolute;
            top: 22mm;
            left: 30mm;
            font-size: 10pt;
            max-width: 140mm;
            text-transform: uppercase;
            white-space: nowrap;
            overflow: hidden;
          }
          /* Amount in words - first line */
          .amount-words-1 {
            position: absolute;
            top: 32mm;
            left: 13mm;
            font-size: 9pt;
            max-width: 165mm;
            text-transform: uppercase;
          }
          /* Amount in words - second line if needed */
          .amount-words-2 {
            position: absolute;
            top: 40mm;
            left: 13mm;
            font-size: 9pt;
            max-width: 127mm;
            text-transform: uppercase;
          }
          /* Amount in figures - right side box */
          .amount-figures {
            position: absolute;
            top: 22mm;
            right: 8mm;
            font-size: 11pt;
            font-weight: bold;
            letter-spacing: 0.5mm;
          }
          /* Signature placeholder */
          .signature-field {
            position: absolute;
            bottom: 10mm;
            right: 20mm;
            font-size: 8pt;
            color: #666;
          }
          @media print {
            body {
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            @page {
              size: A4 ${orientation};
              margin: 0;
            }
          }
          @media screen {
            body {
              background: #f5f5f5;
              padding: 20mm;
            }
            .cheque-container {
              background: white;
              border: 1px solid #ddd;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
          }
        </style>
      </head>
      <body>
        <div class="cheque-container">
          <div class="date-field">${dateStr.split('/').join(' ')}</div>
          <div class="payee-field">${selectedCheque.payee_name}</div>
          <div class="amount-words-1">${selectedCheque.amount_in_words.substring(0, 70)}</div>
          ${selectedCheque.amount_in_words.length > 70 ? 
            `<div class="amount-words-2">${selectedCheque.amount_in_words.substring(70)}</div>` : ''}
          <div class="amount-figures">Rs. ${selectedCheque.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}/=</div>
          <div class="signature-field">Authorized Signature</div>
        </div>
        <script>
          window.onload = function() {
            window.print();
            window.onafterprint = function() {
              window.close();
            };
          };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();

    // Update print status
    printMutation.mutate({ chequeId: selectedCheque.id, isReprint });
    toast.success("Cheque sent to printer" + (isTestMode ? " (TEST MODE)" : ""));
  };

  const viewCheque = (cheque: Cheque) => {
    setSelectedCheque(cheque);
    setPreviewOpen(true);
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      pending: "outline",
      printed: "default",
      cancelled: "destructive",
      cleared: "secondary",
    };
    return <Badge variant={variants[status] || "outline"}>{status.toUpperCase()}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Cheque Printing</h1>
          <p className="text-muted-foreground">Print bank cheques with precise alignment</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 lg:w-[520px]">
          <TabsTrigger value="new" className="flex items-center gap-2">
            <Plus className="h-4 w-4" /> New Cheque
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="h-4 w-4" /> Cheques
          </TabsTrigger>
          <TabsTrigger value="log" className="flex items-center gap-2">
            <Printer className="h-4 w-4" /> Print Log
          </TabsTrigger>
          <TabsTrigger value="calibration" className="flex items-center gap-2">
            <Settings className="h-4 w-4" /> Calibration
          </TabsTrigger>
        </TabsList>

        <TabsContent value="new">
          <Card>
            <CardHeader>
              <CardTitle>Create New Cheque</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                {/* Cheque Number */}
                <div className="space-y-2">
                  <Label>Cheque Number</Label>
                  <div className="flex gap-2">
                    <Input
                      value={chequeNumber}
                      onChange={(e) => {
                        setAutoNumber(false);
                        setChequeNumber(e.target.value);
                      }}
                      placeholder="CHQ000001"
                      className="flex-1"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setAutoNumber(true);
                        fetchNextChequeNumber().then(setChequeNumber);
                      }}
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Cheque Date */}
                <div className="space-y-2">
                  <Label>Cheque Date</Label>
                  <Input
                    type="date"
                    value={chequeDate}
                    onChange={(e) => setChequeDate(e.target.value)}
                  />
                </div>

                {/* Payee Name */}
                <div className="space-y-2 md:col-span-2">
                  <Label>Payee Name (Pay To)</Label>
                  <Input
                    value={payeeName}
                    onChange={(e) => setPayeeName(e.target.value)}
                    placeholder="Enter payee name"
                    className="uppercase"
                  />
                </div>

                {/* Amount */}
                <div className="space-y-2">
                  <Label>Amount (LKR)</Label>
                  <Input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                  />
                </div>

                {/* Bank Selection */}
                <div className="space-y-2">
                  <Label>Bank</Label>
                  <Select value={selectedBank} onValueChange={setSelectedBank}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select bank" />
                    </SelectTrigger>
                    <SelectContent>
                      {banks.map((bank) => (
                        <SelectItem key={bank.id} value={bank.id}>
                          {bank.bank_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Amount in Words */}
                <div className="space-y-2 md:col-span-2">
                  <Label>Amount in Words</Label>
                  <Input
                    value={amountWords}
                    onChange={(e) => setAmountWords(e.target.value)}
                    placeholder="Amount in words (auto-generated)"
                    className="uppercase"
                  />
                </div>

                {/* Bank Branch */}
                <div className="space-y-2">
                  <Label>Bank Branch (Optional)</Label>
                  <Input
                    value={bankBranch}
                    onChange={(e) => setBankBranch(e.target.value)}
                    placeholder="Branch name"
                  />
                </div>

              </div>

              <div className="flex gap-3">
                <Button onClick={handleSave} disabled={saveMutation.isPending}>
                  <Printer className="h-4 w-4 mr-2" />
                  Save & Preview
                </Button>
                <Button variant="outline" onClick={resetForm}>
                  Clear Form
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Cheque History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cheque No.</TableHead>
                      <TableHead>Payee</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Bank</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Prints</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cheques.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          No cheques found
                        </TableCell>
                      </TableRow>
                    ) : (
                      cheques.map((cheque) => (
                        <TableRow key={cheque.id}>
                          <TableCell className="font-mono">{cheque.cheque_number}</TableCell>
                          <TableCell>{cheque.payee_name}</TableCell>
                          <TableCell>Rs. {cheque.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</TableCell>
                          <TableCell>{format(new Date(cheque.cheque_date), "dd/MM/yyyy")}</TableCell>
                          <TableCell>{cheque.bank_name}</TableCell>
                          <TableCell>{getStatusBadge(cheque.status)}</TableCell>
                          <TableCell>{cheque.print_count}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button size="sm" variant="ghost" onClick={() => viewCheque(cheque)}>
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                onClick={() => {
                                  setSelectedCheque(cheque);
                                  handlePrint(cheque.print_count > 0);
                                }}
                                disabled={cheque.status === 'cancelled'}
                              >
                                <Printer className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="log">
          <Card>
            <CardHeader>
              <CardTitle>Print History Log</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cheque No.</TableHead>
                      <TableHead>Print Type</TableHead>
                      <TableHead>Printed At</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {printHistory.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                          No print history
                        </TableCell>
                      </TableRow>
                    ) : (
                      printHistory.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="font-mono">{log.cheque_number}</TableCell>
                          <TableCell>
                            <Badge variant={log.print_type === "original" ? "default" : "secondary"}>
                              {log.print_type.toUpperCase()}
                            </Badge>
                          </TableCell>
                          <TableCell>{format(new Date(log.printed_at), "dd/MM/yyyy HH:mm:ss")}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="calibration">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Printer Calibration Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-muted/50 rounded-lg p-4 text-sm">
                <p className="font-medium mb-2">How to Calibrate:</p>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                  <li>Enable Test Mode below</li>
                  <li>Print a test cheque on plain A4 paper</li>
                  <li>Place the printed sheet over an original cheque</li>
                  <li>Measure the offset in millimeters</li>
                  <li>Adjust the Top and Left offset values</li>
                  <li>Repeat until alignment is perfect</li>
                  <li>Disable Test Mode for live printing</li>
                </ol>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="topOffset">Top Offset (mm)</Label>
                  <Input
                    id="topOffset"
                    type="number"
                    step="0.5"
                    value={calibration.topOffset}
                    onChange={(e) => setCalibration({ ...calibration, topOffset: parseFloat(e.target.value) || 0 })}
                    placeholder="0"
                  />
                  <p className="text-xs text-muted-foreground">
                    Positive = move down, Negative = move up
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="leftOffset">Left Offset (mm)</Label>
                  <Input
                    id="leftOffset"
                    type="number"
                    step="0.5"
                    value={calibration.leftOffset}
                    onChange={(e) => setCalibration({ ...calibration, leftOffset: parseFloat(e.target.value) || 0 })}
                    placeholder="0"
                  />
                  <p className="text-xs text-muted-foreground">
                    Positive = move right, Negative = move left
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="space-y-1">
                  <Label htmlFor="testMode" className="flex items-center gap-2">
                    <TestTube className="h-4 w-4" />
                    Test Mode
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Shows a background guide for alignment testing (automatically hidden in live printing)
                  </p>
                </div>
                <Switch
                  id="testMode"
                  checked={calibration.testMode}
                  onCheckedChange={(checked) => setCalibration({ ...calibration, testMode: checked })}
                />
              </div>

              <div className="space-y-2">
                <Label>Print Orientation</Label>
                <Select
                  value={calibration.orientation}
                  onValueChange={(value: 'portrait' | 'landscape') => 
                    setCalibration({ ...calibration, orientation: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select orientation" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="portrait">Portrait (A4 Vertical)</SelectItem>
                    <SelectItem value="landscape">Landscape (A4 Horizontal)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Choose based on how you feed the cheque into your printer
                </p>
              </div>

              <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 text-sm">
                <p className="font-medium text-destructive mb-2">Printer Settings (MUST SET MANUALLY):</p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li><strong>Scale:</strong> 100% (no scaling)</li>
                  <li><strong>Fit to page:</strong> OFF</li>
                  <li><strong>Margins:</strong> None</li>
                  <li><strong>Paper size:</strong> A4</li>
                  <li><strong>Paper feed:</strong> Manual / Rear tray</li>
                </ul>
              </div>

              <Button 
                onClick={() => saveCalibrationMutation.mutate(calibration)}
                disabled={saveCalibrationMutation.isPending}
                className="w-full"
              >
                Save Calibration Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Cheque Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Cheque Preview - {selectedCheque?.cheque_number}</DialogTitle>
          </DialogHeader>
          
          {selectedCheque && (
            <div className="space-y-4">
              {calibration.testMode && (
                <div className="bg-accent/20 border border-accent/50 rounded-lg p-3 flex items-center gap-2">
                  <TestTube className="h-4 w-4 text-accent" />
                  <span className="text-sm text-accent-foreground">Test Mode is enabled - background guide will be visible</span>
                </div>
              )}

              {/* Cheque Preview */}
              <div 
                className="relative bg-gradient-to-br from-secondary/20 to-accent/20 border-2 border-dashed border-primary/30 rounded-lg p-6"
                style={{ width: '100%', aspectRatio: '216 / 89' }}
              >
                {/* Bank Name */}
                <div className="absolute top-2 left-4 text-lg font-bold text-primary">
                  {selectedCheque.bank_name}
                </div>
                
                {/* Date */}
                <div className="absolute top-4 right-8 font-mono text-sm tracking-wider">
                  Date: <span className="font-bold">{formatChequeDate(new Date(selectedCheque.cheque_date))}</span>
                </div>
                
                {/* Payee */}
                <div className="absolute top-[25%] left-4 right-[25%]">
                  <span className="text-sm text-muted-foreground">Pay </span>
                  <span className="font-bold uppercase text-lg border-b-2 border-border pl-2 pr-4">
                    {selectedCheque.payee_name}
                  </span>
                </div>
                
                {/* Amount in Figures */}
                <div className="absolute top-[25%] right-4 bg-primary/10 border border-primary/30 px-4 py-1 rounded font-bold">
                  Rs. {selectedCheque.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}/=
                </div>
                
                {/* Amount in Words */}
                <div className="absolute top-[45%] left-4 right-8">
                  <span className="uppercase text-sm font-medium border-b border-border">
                    {selectedCheque.amount_in_words}
                  </span>
                </div>
                
                {/* Account Number */}
                {selectedCheque.account_number && (
                  <div className="absolute bottom-[25%] left-4 text-sm">
                    A/C: {selectedCheque.account_number}
                  </div>
                )}
                
                {/* Signature Area */}
                <div className="absolute bottom-4 right-8 text-sm text-muted-foreground border-t border-border pt-1 px-8">
                  Authorized Signature
                </div>
                
                {/* Cheque Number */}
                <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 font-mono text-xs tracking-widest text-muted-foreground">
                  {selectedCheque.cheque_number}
                </div>
              </div>
              
              <div className="bg-muted/50 rounded-lg p-4 text-sm">
                <p className="font-medium mb-2">Print Instructions:</p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li>Use manual paper feed on your printer</li>
                  <li>Set print scale to 100% (no scaling)</li>
                  <li>Set margins to None</li>
                  <li>Set paper size to A4</li>
                  <li>Place cheque with the left edge aligned to the paper guide</li>
                  <li>Signature to be added manually after printing</li>
                  {calibration.topOffset !== 0 && (
                    <li>Top offset: {calibration.topOffset}mm applied</li>
                  )}
                  {calibration.leftOffset !== 0 && (
                    <li>Left offset: {calibration.leftOffset}mm applied</li>
                  )}
                </ul>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>
              Close
            </Button>
            <Button 
              onClick={() => handlePrint(selectedCheque?.print_count ? selectedCheque.print_count > 0 : false)}
              disabled={!selectedCheque || selectedCheque.status === 'cancelled'}
            >
              <Printer className="h-4 w-4 mr-2" />
              {selectedCheque?.print_count ? 'Reprint' : 'Print Cheque'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
