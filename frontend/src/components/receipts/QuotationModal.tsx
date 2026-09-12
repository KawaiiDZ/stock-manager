import React, { useEffect } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { PdfQuotationReceipt } from './PdfQuotationReceipt';
import { Quotation, BusinessSettings } from '../../types';
import { Printer, FileText } from 'lucide-react';
import { printElement } from '../../utils/print';

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
  const handlePrint = () => {
    if (!quotation) return;
    printElement('printable-pdf-quotation', {
      title: `Quotation_${quotation.quotation_number}`,
      isThermal: false,
    });
  };

  useEffect(() => {
    if (!isOpen || !quotation) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        e.stopPropagation();
        handlePrint();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, quotation, settings]);

  if (!quotation) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Commercial Quotation"
      subtitle={`Quotation ${quotation.quotation_number}`}
      maxWidth="4xl"
    >
      <div className="space-y-4">
        {/* Printable View Stage with High-Contrast Paper Inspection Canvas */}
        <div className="bg-slate-200/80 p-4 sm:p-6 rounded-2xl max-h-[68vh] overflow-auto flex justify-center border border-slate-200 shadow-inner">
          <div className="w-full flex justify-center">
            <div className="shadow-xl rounded-lg overflow-hidden bg-white print:shadow-none print:rounded-none">
              <PdfQuotationReceipt
                quotation={quotation}
                settings={settings}
                businessName={settings?.business_name}
                phone={settings?.phone}
                address={settings?.address}
                currency={settings?.currency}
                headerText={settings?.receipt_header}
                footerText={settings?.receipt_footer}
              />
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex justify-between items-center pt-2 border-t border-slate-100">
          <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
            <FileText className="h-4 w-4 text-indigo-600" />
            <span>Standard A4 printable format</span>
          </div>

          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Close
            </Button>
            <Button
              type="button"
              variant="primary"
              icon={<Printer className="h-4 w-4" />}
              onClick={handlePrint}
              className="font-bold bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-600/20"
            >
              Print Quotation
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
