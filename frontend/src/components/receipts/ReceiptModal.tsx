import React from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { ThermalReceipt } from './ThermalReceipt';
import { Sale, BusinessSettings } from '../../types';
import { Printer, Check, Plus } from 'lucide-react';

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
  if (!sale) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Sale Completed"
      subtitle={`Receipt ${sale.receipt_number}`}
      maxWidth="md"
    >
      <div className="space-y-4">
        {/* Receipt Preview */}
        <div className="bg-slate-100 p-4 rounded-xl max-h-[50vh] overflow-y-auto flex justify-center">
          <ThermalReceipt
            sale={sale}
            businessName={settings?.business_name}
            phone={settings?.phone}
            address={settings?.address}
            currency={settings?.currency}
            headerText={settings?.receipt_header}
            footerText={settings?.receipt_footer}
            printerType={settings?.receipt_printer_type}
          />
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
            Print Receipt
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
