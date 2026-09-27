import { useEffect, useRef } from 'react';

/**
 * Play a short, crisp POS confirmation beep via the Web Audio API
 */
export function playScanSuccessBeep() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    // 1760 Hz (Note A6) - standard POS scanner frequency
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1760, ctx.currentTime);
    
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
  } catch {
    // AudioContext blocked by user autoplay policy or unavailable
  }
}

export interface UseBarcodeScannerOptions {
  enabled?: boolean;
  onScan: (barcode: string) => void;
  minChars?: number;
  maxIntervalMs?: number;
  playBeep?: boolean;
}

/**
 * Hook to capture hardware USB/Bluetooth barcode scanner inputs (HID Keyboard Emulation)
 */
export function useBarcodeScanner({
  enabled = true,
  onScan,
  minChars = 3,
  maxIntervalMs = 50,
  playBeep = true,
}: UseBarcodeScannerOptions) {
  const bufferRef = useRef<{ chars: string[]; times: number[] }>({ chars: [], times: [] });
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore functional modifier shortcuts like Ctrl+C, Cmd+R, Alt+F4
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const now = Date.now();
      const buffer = bufferRef.current;

      if (e.key === 'Enter') {
        const fullCode = buffer.chars.join('').trim();
        const len = buffer.chars.length;

        // Check if keystroke timing qualifies as hardware scanner burst
        let isScannerBurst = false;
        if (len >= minChars && buffer.times.length === len) {
          let totalInterval = 0;
          for (let i = 1; i < len; i++) {
            totalInterval += buffer.times[i] - buffer.times[i - 1];
          }
          const avgInterval = totalInterval / (len - 1);
          // Scanners typically enter characters in 10-35ms
          if (avgInterval <= maxIntervalMs) {
            isScannerBurst = true;
          }
        }

        // Reset buffer
        bufferRef.current = { chars: [], times: [] };

        if (isScannerBurst && fullCode.length >= minChars) {
          // If scanner burst occurred while focused on an input element, clean it up
          const target = e.target as HTMLElement | null;
          if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
            const inputEl = target as HTMLInputElement;
            // If the input value ends with the scanned code, strip it so the field isn't corrupted
            if (inputEl.value && inputEl.value.endsWith(fullCode)) {
              inputEl.value = inputEl.value.slice(0, -fullCode.length);
              inputEl.dispatchEvent(new Event('input', { bubbles: true }));
            }
          }

          e.preventDefault();
          e.stopPropagation();

          if (playBeep) {
            playScanSuccessBeep();
          }

          onScanRef.current(fullCode);
        }
        return;
      }

      // Printable single character keys
      if (e.key.length === 1) {
        // If the gap since last character was too long, reset buffer for a fresh scan
        if (buffer.times.length > 0) {
          const lastTime = buffer.times[buffer.times.length - 1];
          if (now - lastTime > 150) {
            buffer.chars = [];
            buffer.times = [];
          }
        }

        buffer.chars.push(e.key);
        buffer.times.push(now);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [enabled, minChars, maxIntervalMs, playBeep]);
}
