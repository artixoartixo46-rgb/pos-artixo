import { useEffect, useRef } from "react";

interface UseHardwareScannerOptions {
  /** Called with the decoded string once a fast burst of keystrokes ends in Enter. */
  onScan: (code: string) => void;
  /** Elements whose keystrokes should never be hijacked - typically a scan <Input> that already
   *  has its own onChange/onKeyDown wired up and would otherwise double-handle the same scan. */
  ignoreRefs?: React.RefObject<HTMLElement>[];
  /** Set to false to fully detach the listener, e.g. while a dialog/camera scanner covering the
   *  page is open, or the page isn't in "scanning mode" right now. Defaults to true. */
  enabled?: boolean;
}

/**
 * Hardware 2D barcode/QR scanners - whether a countertop "presentation" unit or a handheld
 * trigger gun - almost universally connect as a USB/Bluetooth HID keyboard ("keyboard wedge"):
 * they type the decoded value into whatever element currently has focus, firing every keystroke
 * within a few milliseconds of the last, then send Enter. On a touch-only tablet/kiosk there's no
 * mouse to click back into one specific field between scans, so focus can drift to a button, a
 * table row, a quantity box, or nowhere at all - and a scan aimed at "the input" goes missing or
 * corrupts whatever field it landed in instead.
 *
 * This listens at the document level and reconstructs scans from raw keydown events, completely
 * independent of whatever currently has focus, so a scan works no matter where the last tap
 * landed. Genuine human typing is never hijacked: real typing is far slower per-keystroke than
 * this heuristic's threshold, so any field not explicitly listed in `ignoreRefs` stays perfectly
 * safe for a person to type into by hand.
 */
export function useHardwareScanner({ onScan, ignoreRefs = [], enabled = true }: UseHardwareScannerOptions) {
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  });

  useEffect(() => {
    if (!enabled) return;

    let buffer = "";
    let lastKeyTime = 0;
    const SCANNER_MAX_GAP_MS = 60; // hardware scanners fire keystrokes far faster than any human types
    const MIN_SCAN_LENGTH = 4;

    const handleKeydown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ignoreRefs.some((ref) => ref.current === target)) return;

      const now = Date.now();
      if (now - lastKeyTime > SCANNER_MAX_GAP_MS) buffer = "";
      lastKeyTime = now;

      if (e.key === "Enter") {
        if (buffer.length >= MIN_SCAN_LENGTH) {
          e.preventDefault();
          onScanRef.current(buffer);
        }
        buffer = "";
        return;
      }
      if (e.key.length === 1) buffer += e.key;
    };

    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
}
