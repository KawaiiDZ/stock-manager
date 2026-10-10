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

/**
 * Safely updates an input or textarea element's value in a React-friendly manner,
 * ensuring React's internal value tracker is synchronized and onChange/onInput fire.
 */
export function setNativeInputValue(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string
) {
  try {
    const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    if (descriptor && descriptor.set) {
      descriptor.set.call(el, value);
    } else {
      el.value = value;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  } catch {
    el.value = value;
  }
}

export interface UseBarcodeScannerOptions {
  enabled?: boolean;
  onScan: (barcode: string) => void;
  minChars?: number;
  maxIntervalMs?: number;
  playBeep?: boolean;
}

interface ScanBuffer {
  chars: string[];
  times: number[];
  target: HTMLElement | null;
  initialVal: string;
  isBurst: boolean;
}

/**
 * Hook to capture hardware USB/Bluetooth barcode scanner inputs (HID Keyboard Emulation)
 *
 * Prevents rapid scanner keystrokes from leaking into focused inputs (such as POS search),
 * avoids repeat-scan concatenation, while preserving standard manual typing and pasting.
 */
export function useBarcodeScanner({
  enabled = true,
  onScan,
  minChars = 3,
  maxIntervalMs = 50,
  playBeep = true,
}: UseBarcodeScannerOptions) {
  const bufferRef = useRef<ScanBuffer>({
    chars: [],
    times: [],
    target: null,
    initialVal: '',
    isBurst: false,
  });
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore functional modifier shortcuts like Ctrl+C, Cmd+V, Cmd+R, Alt+F4
      // This guarantees paste operations (Cmd+V / Ctrl+V) are 100% unaffected.
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const now = Date.now();
      const buffer = bufferRef.current;

      // Handle Enter (end of hardware barcode scan or manual submission)
      if (e.key === 'Enter') {
        const fullCode = buffer.chars.join('').trim();
        const len = buffer.chars.length;

        // Check if keystroke timing qualifies as hardware scanner burst
        let isScannerBurst = buffer.isBurst;
        if (!isScannerBurst && len >= minChars && buffer.times.length === len) {
          let totalInterval = 0;
          for (let i = 1; i < len; i++) {
            totalInterval += buffer.times[i] - buffer.times[i - 1];
          }
          const avgInterval = totalInterval / (len - 1);
          if (avgInterval <= maxIntervalMs) {
            isScannerBurst = true;
          }
        }

        if (isScannerBurst && fullCode.length >= minChars) {
          // Prevent Enter from submitting forms or triggering search button click
          e.preventDefault();
          e.stopPropagation();

          // If scanner burst occurred while focused on an input element, ensure it's reverted
          if (buffer.target && (buffer.target.tagName === 'INPUT' || buffer.target.tagName === 'TEXTAREA')) {
            const inputEl = buffer.target as HTMLInputElement;
            setNativeInputValue(inputEl, buffer.initialVal);
          }

          // Reset buffer
          bufferRef.current = {
            chars: [],
            times: [],
            target: null,
            initialVal: '',
            isBurst: false,
          };

          if (playBeep) {
            playScanSuccessBeep();
          }

          onScanRef.current(fullCode);
          return;
        }

        // Reset buffer if not a scanner burst
        bufferRef.current = {
          chars: [],
          times: [],
          target: null,
          initialVal: '',
          isBurst: false,
        };
        return;
      }

      // Printable single character keys
      if (e.key.length === 1) {
        // If the gap since last character was too long (> 120ms), reset buffer for fresh input
        if (buffer.times.length > 0) {
          const lastTime = buffer.times[buffer.times.length - 1];
          if (now - lastTime > 120) {
            buffer.chars = [];
            buffer.times = [];
            buffer.target = null;
            buffer.initialVal = '';
            buffer.isBurst = false;
          }
        }

        if (buffer.times.length === 0) {
          // First character of potential scan
          const target = e.target as HTMLElement | null;
          let initialVal = '';
          if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
            initialVal = (target as HTMLInputElement).value || '';
          }

          buffer.target = target;
          buffer.initialVal = initialVal;
          buffer.chars = [e.key];
          buffer.times = [now];
          buffer.isBurst = false;
          // Do not prevent default yet; might be a human typing the first letter
        } else {
          // Second or subsequent character
          const lastTime = buffer.times[buffer.times.length - 1];
          const interval = now - lastTime;

          if (interval <= maxIntervalMs) {
            // High-speed keystroke detected (Scanner Burst)
            if (!buffer.isBurst) {
              buffer.isBurst = true;
              // Revert the first character that briefly entered the input
              if (buffer.target && (buffer.target.tagName === 'INPUT' || buffer.target.tagName === 'TEXTAREA')) {
                const inputEl = buffer.target as HTMLInputElement;
                setNativeInputValue(inputEl, buffer.initialVal);
              }
            }

            // Prevent character 2, 3, 4... from ever being typed into the input
            e.preventDefault();
            e.stopPropagation();

            buffer.chars.push(e.key);
            buffer.times.push(now);
          } else {
            // Human typing speed (> maxIntervalMs); reset buffer so normal typing continues
            buffer.chars = [e.key];
            buffer.times = [now];
            buffer.target = null;
            buffer.initialVal = '';
            buffer.isBurst = false;
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [enabled, minChars, maxIntervalMs, playBeep]);
}
