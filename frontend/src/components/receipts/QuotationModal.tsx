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
      maxWidth="5xl"
      bodyClassName="p-0 flex flex-col flex-1 min-h-0 overflow-hidden h-[76vh] sm:h-[80vh] max-h-[720px]"
    >
      {/* 1. Scrollable Inspection Canvas (Full Viewport Height) */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto bg-slate-200/90 p-4 sm:p-6 flex flex-col items-center shadow-inner overscroll-contain">
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
              footerText={settings?.receipt_footer}
            />
          </div>
        </div>
      </div>

      {/* 2. Action Controls (Fixed Bottom) */}
      <div className="px-6 py-3 bg-white shrink-0 border-t border-slate-200 flex justify-between items-center">
        <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
          <FileText className="h-4 w-4 text-indigo-600" />
          <span>Standard A4 commercial format</span>
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" onClick={onClose} className="font-semibold">
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
    </Modal>
  );
};
