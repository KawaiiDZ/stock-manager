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

  useEffect(() => {
    if (isOpen) {
      setReceiptType(settings?.receipt_type === 'pdf' ? 'pdf' : 'thermal');
    }
  }, [isOpen, settings?.receipt_type]);

  const handlePrint = () => {
    if (!sale) return;
    if (receiptType === 'thermal') {
      const is58mm = (settings?.receipt_printer_type === '58mm');
      printElement('printable-thermal-receipt', {
        title: `Receipt_${sale.receipt_number}`,
        isThermal: true,
        paperWidth: is58mm ? '58mm' : '80mm',
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
  }, [isOpen, receiptType, sale, settings]);

  if (!sale) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Sale Receipt & Invoice"
      subtitle={`Receipt ${sale.receipt_number}`}
      maxWidth={receiptType === 'pdf' ? '4xl' : 'md'}
    >
      <div className="space-y-4">
        {/* Receipt Format Switcher */}
        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button
            type="button"
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold transition ${
              receiptType === 'thermal'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
            onClick={() => setReceiptType('thermal')}
          >
            <Receipt className="h-4 w-4 text-emerald-600" />
            Thermal Roll (80mm/58mm)
          </button>
          <button
            type="button"
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold transition ${
              receiptType === 'pdf'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
            onClick={() => setReceiptType('pdf')}
          >
            <FileText className="h-4 w-4 text-blue-600" />
            Standard PDF / A4 Invoice
          </button>
        </div>

        {/* Receipt Preview Stage with High-Contrast Paper Inspection Canvas */}
        <div className="bg-slate-200/80 p-4 sm:p-6 rounded-2xl max-h-[68vh] overflow-auto flex justify-center border border-slate-200 shadow-inner">
          {receiptType === 'thermal' ? (
            <div className="flex justify-center w-full">
              <div className="shadow-lg rounded-sm overflow-hidden bg-white print:shadow-none print:rounded-none">
                <ThermalReceipt
                  sale={sale}
                  settings={settings}
                  businessName={settings?.business_name}
                  phone={settings?.phone}
                  address={settings?.address}
                  currency={settings?.currency}
                  headerText={settings?.receipt_header}
                  footerText={settings?.receipt_footer}
                  printerType={settings?.receipt_printer_type}
                />
              </div>
            </div>
          ) : (
            <div className="w-full flex justify-center">
              <div className="shadow-xl rounded-lg overflow-hidden bg-white print:shadow-none print:rounded-none">
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

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button
            variant="primary"
            size="lg"
            className="flex-1 font-bold text-base"
            icon={<Printer className="h-5 w-5" />}
            onClick={handlePrint}
          >
            {receiptType === 'thermal' ? 'Print Thermal Receipt' : 'Print / Save as PDF'}
          </Button>

          {onNewSale ? (
            <Button
              variant="outline"
              size="lg"
              className="flex-1"
              icon={<Plus className="h-5 w-5" />}
              onClick={() => {
                onClose();
                onNewSale();
              }}
            >
              Next Sale
            </Button>
          ) : (
            <Button variant="secondary" size="lg" className="flex-1" onClick={onClose}>
              Close
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
};
