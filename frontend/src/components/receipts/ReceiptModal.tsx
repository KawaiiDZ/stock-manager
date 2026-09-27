import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { ThermalReceipt } from './ThermalReceipt';
import { PdfInvoiceReceipt } from './PdfInvoiceReceipt';
import { Sale, BusinessSettings } from '../../types';
import { Printer, Plus, Receipt, FileText } from 'lucide-react';

import { printElement } from '../../utils/print';

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
  const [paperWidth, setPaperWidth] = useState<'80mm' | '58mm'>('80mm');

  useEffect(() => {
    if (isOpen) {
      setReceiptType(settings?.receipt_type === 'pdf' ? 'pdf' : 'thermal');
      setPaperWidth(settings?.receipt_printer_type === '58mm' ? '58mm' : '80mm');
    }
  }, [isOpen, settings?.receipt_type, settings?.receipt_printer_type]);

  const handlePrint = () => {
    if (!sale) return;
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

  useEffect(() => {
    if (!isOpen || !sale) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        e.stopPropagation();
        handlePrint();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, receiptType, paperWidth, sale, settings]);

  if (!sale) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Sale Receipt & Invoice"
      subtitle={`Receipt ${sale.receipt_number}`}
      maxWidth={receiptType === 'pdf' ? '5xl' : 'xl'}
      bodyClassName="p-0 flex flex-col h-[88vh] max-h-[880px]"
    >
      {/* 1. Format Switcher Bar (Fixed Top) */}
      <div className="px-6 py-3 bg-white shrink-0 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 w-full sm:w-auto">
          <button
            type="button"
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 py-1.5 px-3.5 rounded-lg text-xs font-bold transition ${
              receiptType === 'thermal'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
            onClick={() => setReceiptType('thermal')}
          >
            <Receipt className="h-4 w-4 text-emerald-600" />
            Thermal Roll
          </button>
          <button
            type="button"
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 py-1.5 px-3.5 rounded-lg text-xs font-bold transition ${
              receiptType === 'pdf'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
            onClick={() => setReceiptType('pdf')}
          >
            <FileText className="h-4 w-4 text-blue-600" />
            Standard PDF / A4
          </button>
        </div>

        {/* Thermal Roll Width Selector */}
        {receiptType === 'thermal' && (
          <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1 rounded-xl border border-slate-200">
            <span className="text-[11px] font-bold uppercase text-slate-400">Roll:</span>
            <button
              type="button"
              onClick={() => setPaperWidth('80mm')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                paperWidth === '80mm'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              80mm (Standard)
            </button>
            <button
              type="button"
              onClick={() => setPaperWidth('58mm')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                paperWidth === '58mm'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              58mm (Compact)
            </button>
          </div>
        )}
      </div>

      {/* 2. Scrollable Inspection Canvas (Full Viewport Height) */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto bg-slate-200/90 p-4 sm:p-6 flex flex-col items-center justify-start shadow-inner overscroll-contain">
        {receiptType === 'thermal' ? (
          <div className="py-4 my-auto flex justify-center w-full">
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

      {/* 3. Action Footer (Fixed Bottom) */}
      <div className="px-6 py-3.5 bg-white shrink-0 border-t border-slate-200 flex flex-col sm:flex-row gap-3">
        <Button
          variant="primary"
          size="lg"
          className="flex-1 font-bold text-sm sm:text-base whitespace-nowrap bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-600/20"
          icon={<Printer className="h-5 w-5" />}
          onClick={handlePrint}
        >
          {receiptType === 'thermal' ? `Print Thermal Receipt (${paperWidth})` : 'Print / Save as PDF'}
        </Button>

        {onNewSale ? (
          <Button
            variant="outline"
            size="lg"
            className="flex-1 font-semibold"
            icon={<Plus className="h-5 w-5" />}
            onClick={() => {
              onClose();
              onNewSale();
            }}
          >
            Next Sale
          </Button>
        ) : (
          <Button variant="secondary" size="lg" className="flex-1 font-semibold" onClick={onClose}>
            Close
          </Button>
        )}
      </div>
    </Modal>
  );
};
