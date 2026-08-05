import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Cable, Bluetooth, Weight, Loader2, Unplug } from "lucide-react";
import {
  BAUD_RATE_OPTIONS,
  isWebSerialSupported,
  isWebBluetoothSupported,
  type ScaleSettings,
  type ScaleStatus,
  type ScaleReading,
  type ScaleConnectionType,
} from "@/lib/scaleReader";

interface ScaleConnectDialogProps {
  open: boolean;
  onClose: () => void;
  status: ScaleStatus;
  connectionType: ScaleConnectionType | null;
  reading: ScaleReading | null;
  settings: ScaleSettings;
  onSettingsChange: (settings: ScaleSettings) => void;
  onConnectSerial: () => void;
  onConnectBluetooth: () => void;
  onDisconnect: () => void;
}

export function ScaleConnectDialog({
  open,
  onClose,
  status,
  connectionType,
  reading,
  settings,
  onSettingsChange,
  onConnectSerial,
  onConnectBluetooth,
  onDisconnect,
}: ScaleConnectDialogProps) {
  const serialSupported = isWebSerialSupported();
  const bluetoothSupported = isWebBluetoothSupported();

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="glass-card border-border/50 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Weight className="h-5 w-5 text-primary" />
            Weighing Scale
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {status === "connected" ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Badge variant="default" className="gap-1 bg-green-600 hover:bg-green-600">
                  {connectionType === "bluetooth" ? <Bluetooth className="h-3 w-3" /> : <Cable className="h-3 w-3" />}
                  Connected ({connectionType === "bluetooth" ? "Bluetooth" : "USB / Serial"})
                </Badge>
                <Button size="sm" variant="destructive" onClick={onDisconnect} className="gap-1">
                  <Unplug className="h-3.5 w-3.5" />
                  Disconnect
                </Button>
              </div>

              <div className="glass rounded-lg border border-border/50 p-4 text-center">
                <p className="text-3xl font-bold tabular-nums">
                  {reading ? reading.weightKg.toFixed(3) : "0.000"} <span className="text-lg text-muted-foreground">kg</span>
                </p>
                <p className="text-xs mt-1">
                  {reading ? (
                    reading.stable ? (
                      <span className="text-green-600">● Stable</span>
                    ) : (
                      <span className="text-amber-500">● Reading...</span>
                    )
                  ) : (
                    <span className="text-muted-foreground">Waiting for data from scale...</span>
                  )}
                </p>
                {reading && (
                  <p className="text-[10px] text-muted-foreground mt-2 font-mono truncate">raw: {reading.raw}</p>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                Go to a weight-based item in the cart and tap "Capture" to fill in this weight.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-2">
                <Button
                  onClick={onConnectSerial}
                  disabled={!serialSupported || status === "connecting"}
                  className="justify-start gap-2"
                  variant="outline"
                >
                  {status === "connecting" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cable className="h-4 w-4" />}
                  Connect via USB / Serial Cable
                </Button>
                {!serialSupported && (
                  <p className="text-xs text-muted-foreground -mt-1 ml-1">Not supported in this browser - use Chrome or Edge on desktop.</p>
                )}

                <Button
                  onClick={onConnectBluetooth}
                  disabled={!bluetoothSupported || status === "connecting"}
                  className="justify-start gap-2"
                  variant="outline"
                >
                  {status === "connecting" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bluetooth className="h-4 w-4" />}
                  Connect via Bluetooth
                </Button>
                {!bluetoothSupported && (
                  <p className="text-xs text-muted-foreground -mt-1 ml-1">Not supported in this browser - use Chrome or Edge on desktop.</p>
                )}
              </div>

              <div className="glass rounded-lg border border-border/50 p-3 space-y-3">
                <p className="text-xs font-medium text-muted-foreground">Serial settings (adjust if your scale doesn't respond)</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Baud rate</Label>
                    <Select
                      value={String(settings.baudRate)}
                      onValueChange={(v) => onSettingsChange({ ...settings, baudRate: Number(v) })}
                    >
                      <SelectTrigger className="h-8 glass border-border/50 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {BAUD_RATE_OPTIONS.map((rate) => (
                          <SelectItem key={rate} value={String(rate)}>
                            {rate}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Weight unit sent</Label>
                    <Select
                      value={settings.unit}
                      onValueChange={(v: "auto" | "kg" | "g") => onSettingsChange({ ...settings, unit: v })}
                    >
                      <SelectTrigger className="h-8 glass border-border/50 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Auto-detect</SelectItem>
                        <SelectItem value="kg">Kilograms</SelectItem>
                        <SelectItem value="g">Grams</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Works with any scale that sends weight as text over USB-serial or a Bluetooth serial-bridge (9600 baud is the most common default).
                </p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
