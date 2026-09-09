import React from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { PdfQuotationReceipt } from './PdfQuotationReceipt';
import { Quotation, BusinessSettings } from '../../types';
import { Printer, FileText } from 'lucide-react';

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
  if (!quotation) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Commercial Quotation"
      subtitle={`Quotation ${quotation.quotation_number}`}
      maxWidth="4xl"
    >
      <div className="space-y-4">
        {/* Printable View Container */}
        <div className="bg-slate-100 p-4 rounded-xl max-h-[65vh] overflow-y-auto flex justify-center">
          <div className="w-full flex justify-center">
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
