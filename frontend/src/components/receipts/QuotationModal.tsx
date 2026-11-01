import React, { useState, useEffect, useRef } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { PdfQuotationReceipt } from './PdfQuotationReceipt';
import { ThermalQuotationReceipt } from './ThermalQuotationReceipt';
import { Quotation, BusinessSettings } from '../../types';
import { Printer, FileText, Receipt, CheckCircle2, AlertTriangle, Share2 } from 'lucide-react';
import { printElement } from '../../utils/print';
import { rasterizeReceiptElementFast } from '../../utils/receiptRasterizer';
import { playReceiptCutBeep } from '../../utils/audio';
import { api } from '../../services/api';
import { WhatsAppShareModal } from '../common/WhatsAppShareModal';
import { formatQuotationWhatsAppMessage } from '../../utils/whatsapp';

interface QuotationModalProps {
  isOpen: boolean;
  onClose: () => void;
  quotation: Quotation | null;
  settings: BusinessSettings | null;
}

export const QuotationModal: React.FC<QuotationModalProps> = ({
  isOpen,
  onClose,
  quotation,
  settings,
}) => {
  const isThermalAllowed = settings?.enable_thermal_quotations !== false;
  const initialFormat =
    isThermalAllowed && settings?.quotation_receipt_type === 'thermal' ? 'thermal' : 'pdf';

  const [receiptType, setReceiptType] = useState<'thermal' | 'pdf'>(initialFormat);
  const [directPrinting, setDirectPrinting] = useState<boolean>(false);
  const [printSuccessMsg, setPrintSuccessMsg] = useState<string | null>(null);
  const [printErrorMsg, setPrintErrorMsg] = useState<string | null>(null);
  const [showShareModal, setShowShareModal] = useState<boolean>(false);
  const isPrintingRef = useRef<boolean>(false);

  const paperWidth: '80mm' | '58mm' = settings?.receipt_printer_type === '58mm' ? '58mm' : '80mm';
  const receiptLayout = settings?.thermal_layout || 'classic';

  useEffect(() => {
    if (isOpen) {
      if (!isThermalAllowed) {
        setReceiptType('pdf');
      } else {
        setReceiptType(settings?.quotation_receipt_type === 'thermal' ? 'thermal' : 'pdf');
      }
      setPrintSuccessMsg(null);
      setPrintErrorMsg(null);
    }
  }, [isOpen, settings?.enable_thermal_quotations, settings?.quotation_receipt_type, isThermalAllowed]);

  const handleBrowserPrint = () => {
    if (!quotation || isPrintingRef.current) return;
    isPrintingRef.current = true;
    setTimeout(() => {
      isPrintingRef.current = false;
    }, 1200);

    if (receiptType === 'thermal') {
      printElement('printable-thermal-quotation', {
        title: `Quotation_${quotation.quotation_number}`,
        isThermal: true,
        paperWidth: paperWidth,
      });
    } else {
      printElement('printable-pdf-quotation', {
        title: `Quotation_${quotation.quotation_number}`,
        isThermal: false,
      });
    }
  };

  const handleDirectThermalPrint = async () => {
    if (!quotation || isPrintingRef.current) return;
    try {
      isPrintingRef.current = true;
      setDirectPrinting(true);
      setPrintErrorMsg(null);
      setPrintSuccessMsg(null);

      const isRaster = (settings?.thermal_render_pipeline || 'raster_canvas') === 'raster_canvas';

      if (isRaster) {
        const rasterRes = await rasterizeReceiptElementFast('printable-thermal-quotation', { paperWidth });
        if (rasterRes) {
          const res = await api.printThermalRaster({
            image_data: rasterRes.dataUrl,
            compact_bitmap: rasterRes.compactBitmap,
            bitmap_width: rasterRes.widthDots,
            bitmap_height: rasterRes.heightDots,
            paper_width: paperWidth,
            printer_name: settings?.selected_thermal_printer || undefined,
            darkness: settings?.thermal_darkness || 'normal',
            printer_profile: settings?.thermal_printer_profile || 'standard_escpos',
            cut_mode: settings?.thermal_cut_mode || 'partial',
            feed_lines: settings?.thermal_feed_lines ?? 4,
          });

          if (settings?.thermal_beep_enabled ?? true) {
            playReceiptCutBeep();
          }

          setPrintSuccessMsg(`Quotation sent directly to ${res.printer}`);
          setTimeout(() => setPrintSuccessMsg(null), 4000);
          return;
        }
      }

      // Native ESC/POS direct print fallback
      const res = await api.printThermalDirect({
        quotation_id: quotation.id,
        printer_name: settings?.selected_thermal_printer || undefined,
        paper_width: paperWidth,
        header_style: settings?.thermal_header_style || 'logo_text',
        show_barcode: settings?.show_barcode ?? true,
        darkness: settings?.thermal_darkness || 'normal',
        layout: receiptLayout,
        printer_profile: settings?.thermal_printer_profile || 'standard_escpos',
        cut_mode: settings?.thermal_cut_mode || 'partial',
        feed_lines: settings?.thermal_feed_lines ?? 4,
        render_pipeline: 'native_text',
        beep_enabled: settings?.thermal_beep_enabled ?? true,
      });

      if (settings?.thermal_beep_enabled ?? true) {
        playReceiptCutBeep();
      }

      setPrintSuccessMsg(`Quotation sent directly to ${res.printer}`);
      setTimeout(() => setPrintSuccessMsg(null), 4000);
    } catch (err: any) {
      console.warn('Direct quotation thermal print failed, attempting browser print fallback:', err);
      setPrintErrorMsg(
        err.detail || 'Direct ESC/POS print failed. Use "Browser Print" or check printer connection.'
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
    const isDirect =
      settings?.thermal_print_mode !== 'browser_kiosk' &&
      settings?.thermal_print_mode !== 'browser';

    if (receiptType === 'thermal' && isDirect) {
      handleDirectThermalPrint();
    } else {
      handleBrowserPrint();
    }
  };

  useEffect(() => {
    if (!isOpen || !quotation) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        e.stopPropagation();
        handlePrint();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        handlePrint();
        return;
      }
      if (isThermalAllowed) {
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
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, quotation, settings, receiptType, isThermalAllowed, paperWidth, receiptLayout]);

  if (!quotation) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Commercial Quotation"
      subtitle={`Quotation ${quotation.quotation_number}`}
      maxWidth={receiptType === 'pdf' ? '5xl' : 'xl'}
      bodyClassName="p-0 flex flex-col flex-1 min-h-0 overflow-hidden h-[70vh] sm:h-[74vh] max-h-[600px]"
    >
      {/* 1. Format Switcher Bar (Only rendered when enable_thermal_quotations is active) */}
      {isThermalAllowed && (
        <div className="px-6 py-2.5 bg-white dark:bg-slate-900 shrink-0 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 w-full sm:w-auto">
            <button
              type="button"
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 py-1.5 px-4 rounded-lg text-xs font-bold transition ${
                receiptType === 'thermal'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
              onClick={() => setReceiptType('thermal')}
            >
              <Receipt className="h-4 w-4 text-emerald-600" />
              Thermal Quotation
            </button>
            <button
              type="button"
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 py-1.5 px-4 rounded-lg text-xs font-bold transition ${
                receiptType === 'pdf'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
              onClick={() => setReceiptType('pdf')}
            >
              <FileText className="h-4 w-4 text-blue-600" />
              Standard A4 Quotation
            </button>
          </div>

          {/* Hardware Destination Chip */}
          <div className="shrink-0 flex items-center">
            {receiptType === 'thermal' ? (
              <div
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 shadow-2xs"
                title={`Printer: ${settings?.selected_thermal_printer || 'Auto-detect'} (${paperWidth}, ${receiptLayout.toUpperCase()})`}
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
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 shadow-2xs"
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
      )}

      {/* 2. Scrollable Inspection Canvas */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto bg-slate-200/90 dark:bg-slate-950/80 p-4 sm:p-6 flex flex-col items-center justify-start shadow-inner overscroll-contain">
        {receiptType === 'thermal' && isThermalAllowed ? (
          <div className="py-2 flex justify-center w-full my-auto">
            <div className="shadow-xl rounded-lg overflow-hidden bg-white border border-slate-300/80 print:shadow-none print:rounded-none print:border-none">
              <ThermalQuotationReceipt
                quotation={quotation}
                settings={settings}
                paperWidth={paperWidth}
                layout={receiptLayout}
                headerStyle={settings?.thermal_header_style}
                showBarcode={settings?.show_barcode ?? true}
              />
            </div>
          </div>
        ) : (
          <div className="w-full max-w-full flex justify-center py-2">
            <div className="shadow-2xl rounded-xl overflow-visible bg-white print:shadow-none print:rounded-none max-w-full">
              <PdfQuotationReceipt
                quotation={quotation}
                settings={settings}
                businessName={settings?.business_name}
                phone={settings?.phone}
                address={settings?.address}
                currency={settings?.currency}
                headerText={settings?.receipt_header}
                footerText={settings?.quotation_terms}
              />
            </div>
          </div>
        )}
      </div>

      {/* Feedback Messages */}
      {printSuccessMsg && (
        <div className="px-6 py-2 bg-emerald-50 dark:bg-emerald-950/80 border-t border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-300 font-semibold flex items-center justify-between animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{printSuccessMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setPrintSuccessMsg(null)}
            className="text-emerald-700 hover:text-emerald-900 text-xs font-bold"
          >
            Dismiss
          </button>
        </div>
      )}

      {printErrorMsg && (
        <div className="px-6 py-2.5 bg-rose-50 dark:bg-rose-950/80 border-t border-rose-200 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-300 font-medium flex items-center justify-between animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />
            <span className="leading-snug">{printErrorMsg}</span>
          </div>
          <button
            type="button"
            onClick={handleBrowserPrint}
            className="shrink-0 px-2.5 py-1 bg-white dark:bg-slate-800 border border-rose-300 dark:border-rose-700 rounded-lg text-rose-700 dark:text-rose-300 text-xs font-bold hover:bg-rose-50"
          >
            Browser Print
          </button>
        </div>
      )}

      {/* 3. Action Controls (Fixed Bottom) */}
      <div className="px-6 py-3 bg-white dark:bg-slate-900 shrink-0 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-3">
        <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
          {receiptType === 'thermal' && isThermalAllowed ? (
            <>
              <Receipt className="h-4 w-4 text-emerald-600" />
              <span>Compact {paperWidth} thermal estimate format</span>
            </>
          ) : (
            <>
              <FileText className="h-4 w-4 text-indigo-600" />
              <span>Standard A4 commercial document format</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <Button type="button" variant="secondary" onClick={onClose} className="font-semibold">
            Close
          </Button>

          <Button
            type="button"
            variant="outline"
            size="md"
            icon={<Share2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
            onClick={() => setShowShareModal(true)}
            className="font-bold border-emerald-500/50 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
            title="Share Quotation via WhatsApp"
          >
            Share
          </Button>

          {/* Browser Print Fallback Button when in Direct Mode */}
          {receiptType === 'thermal' &&
            isThermalAllowed &&
            settings?.thermal_print_mode === 'direct_escpos' && (
              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={handleBrowserPrint}
                className="text-xs font-semibold"
                title="Print via standard system browser dialog"
              >
                Browser Print
              </Button>
            )}

          <Button
            type="button"
            variant="primary"
            icon={<Printer className="h-4 w-4" />}
            onClick={handlePrint}
            disabled={directPrinting}
            className={`font-bold shadow-md ${
              receiptType === 'thermal' && isThermalAllowed
                ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/20'
            }`}
          >
            {directPrinting
              ? 'Printing...'
              : receiptType === 'thermal' && isThermalAllowed
              ? 'Print Thermal Quotation'
              : 'Print A4 Quotation'}
          </Button>
        </div>
      </div>

      {/* WhatsApp Share Modal */}
      {quotation && (
        <WhatsAppShareModal
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          title="Share Quotation via WhatsApp"
          subtitle={`Quotation #${quotation.quotation_number} • ${quotation.customer_name}`}
          initialPhone={quotation.customer_phone}
          customerName={quotation.customer_name}
          defaultMessage={formatQuotationWhatsAppMessage(quotation, settings)}
        />
      )}
    </Modal>
  );
};
