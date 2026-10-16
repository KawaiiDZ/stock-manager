import React, { useState, useEffect, useRef } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { ThermalReceipt } from './ThermalReceipt';
import { PdfInvoiceReceipt } from './PdfInvoiceReceipt';
import { Sale, BusinessSettings } from '../../types';
import { Printer, Plus, Receipt, FileText, CheckCircle2, AlertTriangle, Activity } from 'lucide-react';
import { api } from '../../services/api';
import { printElement } from '../../utils/print';
import { rasterizeReceiptElement, rasterizeReceiptElementFast } from '../../utils/receiptRasterizer';
import { playReceiptCutBeep } from '../../utils/audio';
import { PrinterDiagnosticsModal } from '../printing/PrinterDiagnosticsModal';

interface ReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  sale: Sale | null;
  settings: BusinessSettings | null;
  onNewSale?: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  isOpen,
  onClose,
  sale,
  settings,
  onNewSale,
}) => {
  const [receiptType, setReceiptType] = useState<'thermal' | 'pdf'>('thermal');
  const [directPrinting, setDirectPrinting] = useState<boolean>(false);
  const [printSuccessMsg, setPrintSuccessMsg] = useState<string | null>(null);
  const [printErrorMsg, setPrintErrorMsg] = useState<string | null>(null);
  const [showDiagnosticsModal, setShowDiagnosticsModal] = useState(false);
  const isPrintingRef = useRef<boolean>(false);

  // Directly derive roll geometry and layout from user settings
  const paperWidth: '80mm' | '58mm' = settings?.receipt_printer_type === '58mm' ? '58mm' : '80mm';
  const receiptLayout = settings?.thermal_layout || 'classic';

  useEffect(() => {
    if (isOpen) {
      setReceiptType(settings?.receipt_type === 'pdf' ? 'pdf' : 'thermal');
      setPrintSuccessMsg(null);
      setPrintErrorMsg(null);
    }
  }, [isOpen, settings?.receipt_type]);

  const handleBrowserPrint = () => {
    if (!sale || isPrintingRef.current) return;
    isPrintingRef.current = true;
    setTimeout(() => {
      isPrintingRef.current = false;
    }, 1200);

    if (receiptType === 'thermal') {
      printElement('printable-thermal-receipt', {
        title: `Receipt_${sale.receipt_number}`,
        isThermal: true,
        paperWidth: paperWidth,
      });
    } else {
      const invoiceName = (settings?.invoice_title || 'Invoice').replace(/\s+/g, '_');
      printElement('printable-pdf-invoice', {
        title: `${invoiceName}_${sale.receipt_number}`,
        isThermal: false,
      });
    }
  };

  const handleDirectPrint = async () => {
    if (!sale || isPrintingRef.current) return;
    try {
      isPrintingRef.current = true;
      setDirectPrinting(true);
      setPrintErrorMsg(null);
      setPrintSuccessMsg(null);

      const isRaster = settings?.thermal_render_pipeline === 'raster_canvas';

      // Capture exact visible DOM element snapshot and quantize to 1-bit monochrome if raster canvas pipeline is requested
      const rasterRes = isRaster
        ? await rasterizeReceiptElementFast('printable-thermal-receipt', { paperWidth })
        : null;

      const res = await api.printThermalDirect({
        sale_id: sale.id,
        printer_name: settings?.selected_thermal_printer || undefined,
        paper_width: paperWidth,
        header_style: settings?.thermal_header_style || 'logo_text',
        show_barcode: settings?.show_barcode ?? true,
        darkness: settings?.thermal_darkness || 'normal',
        layout: receiptLayout,
        printer_profile: settings?.thermal_printer_profile || 'standard_escpos',
        cut_mode: settings?.thermal_cut_mode || 'partial',
        feed_lines: settings?.thermal_feed_lines ?? 4,
        render_pipeline: isRaster ? 'raster_canvas' : 'native_text',
        beep_enabled: settings?.thermal_beep_enabled ?? true,
        raster_image: rasterRes?.dataUrl || undefined,
        compact_bitmap: rasterRes?.compactBitmap || undefined,
        bitmap_width: rasterRes?.widthDots || undefined,
        bitmap_height: rasterRes?.heightDots || undefined,
      });

      if (settings?.thermal_beep_enabled ?? true) {
        playReceiptCutBeep();
      }

      setPrintSuccessMsg(`Receipt sent directly to ${res.printer}`);
      setTimeout(() => setPrintSuccessMsg(null), 4000);
    } catch (err: any) {
      setPrintErrorMsg(
        err.detail || 'Direct ESC/POS print failed. Check printer connection or click "Browser Print" below.'
      );
    } finally {
      setDirectPrinting(false);
      setTimeout(() => {
        isPrintingRef.current = false;
      }, 1000);
    }
  };

  const handlePrint = () => {
    if (isPrintingRef.current) return;
    if (receiptType === 'thermal' && settings?.thermal_print_mode === 'direct_escpos') {
      handleDirectPrint();
    } else {
      handleBrowserPrint();
    }
  };

  useEffect(() => {
    if (!isOpen || !sale) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl+P or Enter prints the current receipt format
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        handlePrint();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        handlePrint();
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setReceiptType('thermal');
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setReceiptType('pdf');
        return;
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, receiptType, paperWidth, receiptLayout, sale, settings]);

  if (!sale) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Sale Receipt & Invoice"
      subtitle={`Receipt ${sale.receipt_number}`}
      maxWidth={receiptType === 'pdf' ? '5xl' : 'xl'}
      bodyClassName="p-0 flex flex-col flex-1 min-h-0 overflow-hidden h-[70vh] sm:h-[74vh] max-h-[600px]"
    >
      {/* 1. Format Switcher Bar (Only Thermal and A4 options) */}
      <div className="px-6 py-2.5 bg-white shrink-0 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 w-full sm:w-auto">
          <button
            type="button"
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 py-1.5 px-4 rounded-lg text-xs font-bold transition ${
              receiptType === 'thermal'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
            onClick={() => setReceiptType('thermal')}
          >
            <Receipt className="h-4 w-4 text-emerald-600" />
            Thermal Receipt
          </button>
          <button
            type="button"
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 py-1.5 px-4 rounded-lg text-xs font-bold transition ${
              receiptType === 'pdf'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
            onClick={() => setReceiptType('pdf')}
          >
            <FileText className="h-4 w-4 text-blue-600" />
            Standard A4 Invoice
          </button>
        </div>

        {/* Hardware Destination Small Pill */}
        <div className="shrink-0 flex items-center">
          {receiptType === 'thermal' ? (
            <div
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 shadow-2xs transition hover:bg-slate-200/70 dark:hover:bg-slate-700/70"
              title={`Printer: ${settings?.selected_thermal_printer || 'Auto-detect Thermal Printer'} (${paperWidth}, ${receiptLayout.toUpperCase()})`}
            >
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  settings?.thermal_print_mode === 'direct_escpos' ? 'bg-emerald-500 animate-pulse' : 'bg-blue-500'
                }`}
              />
              <Printer className="h-3.5 w-3.5 text-slate-500 shrink-0" />
              <span className="font-semibold text-slate-800 dark:text-slate-200 max-w-[130px] sm:max-w-[170px] truncate">
                {settings?.selected_thermal_printer || 'Auto-detect'}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold uppercase tracking-wider">
                {paperWidth}
              </span>
            </div>
          ) : (
            <div
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 shadow-2xs transition hover:bg-slate-200/70 dark:hover:bg-slate-700/70"
              title={`Printer: ${settings?.selected_a4_printer || 'System Default A4 Printer'} (A4 Document)`}
            >
              <span className="w-2 h-2 rounded-full shrink-0 bg-blue-500" />
              <Printer className="h-3.5 w-3.5 text-slate-500 shrink-0" />
              <span className="font-semibold text-slate-800 dark:text-slate-200 max-w-[130px] sm:max-w-[170px] truncate">
                {settings?.selected_a4_printer || 'System Default'}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold uppercase tracking-wider">
                A4
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 2. Scrollable Inspection Canvas (Full Viewport Height) */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto bg-slate-200/90 p-4 sm:p-5 flex flex-col items-center justify-start shadow-inner overscroll-contain">
        {receiptType === 'thermal' ? (
          <div className="py-2 flex justify-center w-full my-auto">
            <div className="shadow-xl rounded-lg overflow-hidden bg-white border border-slate-300/80 print:shadow-none print:rounded-none print:border-none">
              <ThermalReceipt
                sale={sale}
                settings={settings}
                businessName={settings?.business_name}
                phone={settings?.phone}
                address={settings?.address}
                currency={settings?.currency}
                headerText={settings?.receipt_header}
                footerText={settings?.receipt_footer}
                paperWidth={paperWidth}
                printerType={paperWidth}
                headerStyle={settings?.thermal_header_style || 'logo_text'}
                showBarcode={settings?.show_barcode ?? true}
                layout={receiptLayout}
              />
            </div>
          </div>
        ) : (
          <div className="w-full max-w-full flex justify-center py-2">
            <div className="shadow-2xl rounded-xl overflow-visible bg-white print:shadow-none print:rounded-none max-w-full">
              <PdfInvoiceReceipt
                sale={sale}
                settings={settings}
                businessName={settings?.business_name}
                phone={settings?.phone}
                address={settings?.address}
                currency={settings?.currency}
                headerText={settings?.receipt_header}
                footerText={settings?.receipt_footer}
                documentTitle={settings?.invoice_title}
              />
            </div>
          </div>
        )}
      </div>

      {/* Status Notifications */}
      {directPrinting && (
        <div className="px-6 py-2.5 bg-emerald-600 text-white text-xs font-bold flex items-center justify-center gap-2 border-t border-emerald-500 shadow-sm animate-pulse">
          <Printer className="h-4 w-4 animate-bounce shrink-0" />
          <span>Printing receipt directly to {settings?.selected_thermal_printer || 'printer'}... Please wait.</span>
        </div>
      )}
      {printSuccessMsg && (
        <div className="px-6 py-2 bg-emerald-50 border-t border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{printSuccessMsg}</span>
        </div>
      )}
      {printErrorMsg && (
        <div className="px-6 py-2 bg-amber-50 border-t border-amber-200 text-amber-800 text-xs font-semibold flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <span>{printErrorMsg}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleBrowserPrint}
              className="px-2 py-0.5 text-[11px] font-bold text-slate-700 bg-white hover:bg-slate-100 rounded border border-slate-300 transition shrink-0"
              title="Open browser print dialogue as manual fallback"
            >
              Open Browser Print
            </button>
            <button
              type="button"
              onClick={() => setShowDiagnosticsModal(true)}
              className="px-2 py-0.5 text-[11px] font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 rounded border border-amber-300 transition shrink-0 flex items-center gap-1"
            >
              <Activity className="h-3 w-3 text-amber-700" />
              <span>Diagnose</span>
            </button>
          </div>
        </div>
      )}

      {/* 3. Action Footer (Fixed Bottom) */}
      <div className="px-6 py-3 bg-white shrink-0 border-t border-slate-200 flex flex-col gap-2.5">
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            variant="primary"
            size="lg"
            className={`flex-1 font-bold text-sm sm:text-base whitespace-nowrap shadow-md flex items-center justify-center gap-1.5 ${
              receiptType === 'thermal'
                ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                : 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20'
            }`}
            icon={<Printer className="h-5 w-5" />}
            loading={directPrinting}
            onClick={handlePrint}
          >
            {receiptType === 'thermal' ? 'Print Thermal Receipt' : 'Print A4 Invoice'}
          </Button>

          {onNewSale ? (
            <Button
              variant="outline"
              size="lg"
              className="font-semibold"
              icon={<Plus className="h-5 w-5" />}
              onClick={() => {
                onClose();
                onNewSale();
              }}
            >
              Next Sale
            </Button>
          ) : (
            <Button variant="secondary" size="lg" className="font-semibold" onClick={onClose}>
              Close
            </Button>
          )}
        </div>

        <div className="flex items-center justify-center gap-3 text-xs text-slate-400 font-medium">
          <span>Press <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded text-[11px] font-mono font-bold text-slate-700 shadow-2xs">Enter</kbd> to Print</span>
          <span>&bull;</span>
          <span><kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded text-[11px] font-mono font-bold text-slate-700 shadow-2xs">←</kbd> <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded text-[11px] font-mono font-bold text-slate-700 shadow-2xs">→</kbd> Toggle Format</span>
          <span>&bull;</span>
          <span><kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded text-[11px] font-mono font-bold text-slate-700 shadow-2xs">Esc</kbd> Close</span>
        </div>
      </div>

      {/* Printer Diagnostics Modal */}
      <PrinterDiagnosticsModal
        isOpen={showDiagnosticsModal}
        onClose={() => setShowDiagnosticsModal(false)}
        settings={settings}
      />
    </Modal>
  );
};
