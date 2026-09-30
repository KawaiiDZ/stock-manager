/**
 * Universal High-Fidelity Printing Utility for Stock Manager
 *
 * Uses an isolated hidden iframe pipeline to render and print documents.
 * This guarantees:
 * 1. Zero background contamination (no sidebars, topbars, or other app UI).
 * 2. Zero container clipping (no 100vh, max-h-[80vh], or overflow-y-auto truncation).
 * 3. Exact page sizing (@page 80mm/58mm for thermal rolls, A4 for corporate invoices/reports).
 * 4. Zero trailing blank pages.
 * 5. Full asset & style preservation (all Tailwind utility classes, custom fonts, images).
 * 6. Automatic descriptive PDF naming via iframe title.
 */

export interface PrintOptions {
  title?: string;
  isThermal?: boolean;
  paperWidth?: '58mm' | '80mm';
  isLabel?: boolean;
  labelWidth?: string;
  labelHeight?: string;
}

export const printElement = (
  elementIdOrRef: string | HTMLElement,
  options: PrintOptions = {}
): Promise<void> => {
  return new Promise((resolve) => {
    // 1. Resolve target element
    const targetElement =
      typeof elementIdOrRef === 'string'
        ? document.getElementById(elementIdOrRef)
        : elementIdOrRef;

    if (!targetElement) {
      console.error(`[PrintEngine] Target element not found:`, elementIdOrRef);
      resolve();
      return;
    }

    // 2. Clean up any existing print iframes
    document.querySelectorAll('[id^="print-iframe-"]').forEach((el) => el.remove());

    // 3. Create hidden sandbox iframe
    const iframe = document.createElement('iframe');
    iframe.id = `print-iframe-${Date.now()}`;
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';
    iframe.style.zIndex = '-9999';
    document.body.appendChild(iframe);

    const iframeWin = iframe.contentWindow;
    const iframeDoc = iframe.contentDocument || iframeWin?.document;

    if (!iframeWin || !iframeDoc) {
      iframe.remove();
      resolve();
      return;
    }

    const isLabel = Boolean(options.isLabel);
    const isThermal = Boolean(options.isThermal);
    const is58mm = options.paperWidth === '58mm';
    const rollWidth = is58mm ? '58mm' : '80mm';
    const labelW = options.labelWidth || '50mm';
    const labelH = options.labelHeight || '25mm';
    const docTitle = options.title || document.title;

    // Dynamically calculate exact receipt height in mm from rendered DOM
    let thermalHeightMm = 140;
    if (isThermal && targetElement) {
      const rect = targetElement.getBoundingClientRect();
      const scrollH = targetElement.scrollHeight;
      const offsetH = targetElement.offsetHeight;
      const measuredPx = Math.max(rect.height, scrollH, offsetH);
      if (measuredPx > 0) {
        // 1px = 25.4 / 96 mm (~0.264583 mm). Add small buffer for padding & cutter feed
        thermalHeightMm = Math.ceil((measuredPx * 25.4) / 96) + 4;
        thermalHeightMm = Math.max(50, thermalHeightMm);
      }
    }

    const buildThermalCss = (heightMm: number) => `
      @page {
        size: ${rollWidth} ${heightMm}mm !important;
        margin: 0mm !important;
      }
      @media print {
        @page {
          size: ${rollWidth} ${heightMm}mm !important;
          margin: 0mm !important;
        }
      }
      *, *::before, *::after {
        box-sizing: border-box !important;
        filter: none !important;
        -webkit-filter: none !important;
        backdrop-filter: none !important;
        box-shadow: none !important;
        text-shadow: none !important;
        -webkit-column-break-inside: avoid !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        background: #ffffff !important;
        color: #000000 !important;
        width: ${rollWidth} !important;
        max-width: ${rollWidth} !important;
        height: auto !important;
        min-height: 0 !important;
        max-height: none !important;
        overflow: visible !important;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        page-break-before: avoid !important;
        break-before: avoid !important;
        page-break-after: avoid !important;
        break-after: avoid !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        orphans: 1 !important;
        widows: 1 !important;
      }
      #print-root {
        width: ${rollWidth} !important;
        max-width: ${rollWidth} !important;
        height: auto !important;
        min-height: 0 !important;
        max-height: none !important;
        margin: 0 !important;
        padding: 0 !important;
        color: #000000 !important;
        overflow: visible !important;
        page-break-before: avoid !important;
        break-before: avoid !important;
        page-break-after: avoid !important;
        break-after: avoid !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      #print-root * {
        color: #000000 !important;
        border-color: #000000 !important;
        text-rendering: geometricPrecision !important;
      }
      #print-root h1, #print-root h2, #print-root h3, #print-root strong, #print-root b, #print-root .font-bold, #print-root .font-black {
        font-weight: 700 !important;
      }
      #print-root .border-dashed, #print-root .border-dotted {
        border-style: solid !important;
        border-bottom-width: 1px !important;
        border-color: #000000 !important;
      }
      #print-root > div {
        width: 100% !important;
        max-width: ${rollWidth} !important;
        height: auto !important;
        min-height: 0 !important;
        max-height: none !important;
        margin: 0 !important;
        padding: 2mm ${is58mm ? '1.5mm' : '3mm'} 4mm ${is58mm ? '1.5mm' : '3mm'} !important;
        box-shadow: none !important;
        border: none !important;
        border-radius: 0 !important;
        overflow: visible !important;
        page-break-before: avoid !important;
        break-before: avoid !important;
        page-break-after: avoid !important;
        break-after: avoid !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      #print-root > div:last-child {
        page-break-after: avoid !important;
        break-after: avoid !important;
        margin-bottom: 0 !important;
      }
      .no-print, button, .btn-no-print {
        display: none !important;
      }
      /* Prevent mid-receipt page breaks and cuts in continuous rolls */
      table, thead, tbody, tfoot, tr, td, th, .sale-item, .receipt-section, .receipt-row, .receipt-totals, .receipt-barcode, .receipt-header, .receipt-footer {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        page-break-before: avoid !important;
        break-before: avoid !important;
        page-break-after: avoid !important;
        break-after: avoid !important;
      }
    `;

    // 4. Construct print media stylesheet
    let printCss = '';
    if (isLabel) {
      printCss = `
        @page {
          size: ${labelW} ${labelH} !important;
          margin: 0 !important;
        }
        *, *::before, *::after {
          box-sizing: border-box !important;
        }
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          background: #ffffff !important;
          color: #000000 !important;
          width: ${labelW} !important;
          height: ${labelH} !important;
          font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        #print-root {
          width: ${labelW} !important;
          margin: 0 !important;
          padding: 0 !important;
        }
        .barcode-label-sheet {
          display: block !important;
          margin: 0 !important;
          padding: 0 !important;
        }
        .barcode-label-item {
          width: ${labelW} !important;
          height: ${labelH} !important;
          max-width: ${labelW} !important;
          max-height: ${labelH} !important;
          page-break-after: always !important;
          break-after: page !important;
          page-break-inside: avoid !important;
          break-inside: avoid !important;
          overflow: hidden !important;
          box-sizing: border-box !important;
          padding: 1mm 1.5mm !important;
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          justify-content: space-between !important;
          text-align: center !important;
        }
        .barcode-label-item:last-child {
          page-break-after: avoid !important;
          break-after: avoid !important;
        }
        .no-print, button, .btn-no-print {
          display: none !important;
        }
      `;
    } else if (isThermal) {
      printCss = buildThermalCss(thermalHeightMm);
    } else {
      printCss = `
        @page {
          size: A4 portrait !important;
          margin: 10mm 12mm 12mm 12mm !important;
        }
        *, *::before, *::after {
          box-sizing: border-box !important;
        }
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          background: #ffffff !important;
          color: #0f172a !important;
          font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        #print-root {
          width: 100% !important;
          max-width: 100% !important;
          margin: 0 !important;
          padding: 0 !important;
        }
        #print-root > div {
          width: 100% !important;
          max-width: 100% !important;
          min-width: 100% !important;
          min-height: 0 !important;
          margin: 0 !important;
          padding: 0 !important;
          box-shadow: none !important;
          border: none !important;
          border-radius: 0 !important;
        }
        .pdf-content-body {
          flex: 1 1 auto !important;
        }
        .pdf-footer-stamp {
          margin-top: auto !important;
          break-inside: avoid !important;
          page-break-inside: avoid !important;
        }
        table {
          width: 100% !important;
          border-collapse: collapse !important;
        }
        thead {
          display: table-header-group !important;
        }
        tr {
          break-inside: avoid !important;
          page-break-inside: avoid !important;
        }
        .print-avoid-break {
          break-inside: avoid !important;
          page-break-inside: avoid !important;
        }
        .no-print, button, .btn-no-print {
          display: none !important;
        }
      `;
    }

    // 5. Initialize iframe content
    iframeDoc.open();
    iframeDoc.write(
      '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' +
        docTitle +
        '</title></head><body><div id="print-root"></div></body></html>'
    );
    iframeDoc.close();

    // 6. Transfer all stylesheets from host document
    // First, inlined CSS rules (synchronous, zero network delay)
    let inlinedCss = '';
    try {
      for (let i = 0; i < document.styleSheets.length; i++) {
        const sheet = document.styleSheets[i];
        try {
          const rules = sheet.cssRules || sheet.rules;
          if (rules) {
            for (let j = 0; j < rules.length; j++) {
              inlinedCss += rules[j].cssText + '\\n';
            }
          }
        } catch {
          // Cross-origin access restriction (CORS) - will fallback to link tag below
        }
      }
    } catch {
      // Ignored
    }

    const stripHostPageRules = (cssText: string) => {
      return cssText.replace(/@page\s*\{[^}]*\}/gi, '');
    };

    if (inlinedCss) {
      if (isThermal || isLabel) {
        inlinedCss = stripHostPageRules(inlinedCss);
      }
      const inlinedStyleEl = iframeDoc.createElement('style');
      inlinedStyleEl.textContent = inlinedCss;
      iframeDoc.head.appendChild(inlinedStyleEl);
    }

    // Also clone all link[rel="stylesheet"] and style elements from host
    const linkPromises: Promise<void>[] = [];
    document.head.querySelectorAll('style, link[rel="stylesheet"]').forEach((node) => {
      const clone = node.cloneNode(true) as HTMLElement;
      if (clone.tagName === 'STYLE' && (isThermal || isLabel)) {
        clone.textContent = stripHostPageRules(clone.textContent || '');
      }
      if (clone.tagName === 'LINK' && (clone as HTMLLinkElement).rel === 'stylesheet') {
        linkPromises.push(
          new Promise<void>((linkRes) => {
            clone.onload = () => linkRes();
            clone.onerror = () => linkRes();
          })
        );
      }
      iframeDoc.head.appendChild(clone);
    });

    // Append our print-specific CSS
    const printStyleEl = iframeDoc.createElement('style');
    printStyleEl.textContent = printCss;
    iframeDoc.head.appendChild(printStyleEl);

    // 7. Clone target document into iframe #print-root
    const printRoot = iframeDoc.getElementById('print-root');
    if (printRoot) {
      const clone = targetElement.cloneNode(true) as HTMLElement;
      // Remove screen-only container constraints & enforce print visibility
      clone.classList.remove(
        'shadow-2xl',
        'shadow-xl',
        'shadow-lg',
        'shadow-md',
        'shadow-sm',
        'shadow-inner',
        'border',
        'rounded-2xl',
        'rounded-lg',
        'rounded-sm'
      );
      clone.style.display = 'block';
      clone.style.visibility = 'visible';
      clone.style.width = '100%';
      clone.style.maxHeight = 'none';
      clone.style.overflow = 'visible';
      printRoot.appendChild(clone);
    }

    // 8. Wait for images and web fonts to load before printing
    const images = Array.from(iframeDoc.images);
    const imagePromises = images.map((img) => {
      if (img.complete) return Promise.resolve();
      return new Promise<void>((imgRes) => {
        img.onload = () => imgRes();
        img.onerror = () => imgRes();
      });
    });

    const fontPromise = (iframeDoc as any).fonts?.ready
      ? (iframeDoc as any).fonts.ready
      : Promise.resolve();

    // Safety timeout so printing never hangs if an external image or font stalls
    const timeoutPromise = new Promise<void>((res) => setTimeout(res, 600));

    // 9. Execute print
    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      try {
        iframe.remove();
      } catch {}
      resolve();
    };

    const doPrint = () => {
      setTimeout(() => {
        try {
          if (isThermal) {
            try {
              const rootDiv = iframeDoc.querySelector('#print-root > div') as HTMLElement;
              const printRoot = iframeDoc.getElementById('print-root');
              const target = rootDiv || printRoot;
              if (target) {
                const rect = target.getBoundingClientRect();
                const actualH = Math.max(target.scrollHeight, target.offsetHeight, Math.ceil(rect.height));
                if (actualH > 0) {
                  const actualMm = Math.max(50, Math.ceil((actualH * 25.4) / 96) + 4);
                  thermalHeightMm = actualMm;
                  printStyleEl.textContent = buildThermalCss(actualMm);
                }
              }
            } catch {}
          }
          iframeWin.focus();
          iframeWin.addEventListener('afterprint', cleanup);
          iframeWin.print();
          // Fallback cleanup if afterprint doesn't fire (e.g. some headless/older browsers)
          setTimeout(cleanup, 10000);
        } catch (err) {
          console.error('[PrintEngine] Print invocation failed:', err);
          cleanup();
        }
      }, 100);
    };

    Promise.race([Promise.all([...linkPromises, ...imagePromises, fontPromise]), timeoutPromise]).then(doPrint);
  });
};
