import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { ThermalReceipt } from './ThermalReceipt';
import { PdfInvoiceReceipt } from './PdfInvoiceReceipt';
import { Sale, BusinessSettings } from '../../types';
import { Printer, Plus, Receipt, FileText } from 'lucide-react';

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

  if (!sale) return null;

  const handlePrint = () => {
    window.print();
  };

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

        {/* Receipt Preview */}
        <div className="bg-slate-100 p-4 rounded-xl max-h-[60vh] overflow-y-auto flex justify-center">
          {receiptType === 'thermal' ? (
            <div id="printable-thermal-receipt" className="flex justify-center w-full">
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
          ) : (
            <div className="w-full flex justify-center">
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
