import React, { useEffect } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Barcode, Plus, Copy, Check, AlertCircle } from 'lucide-react';

export interface UnregisteredBarcodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  barcode: string;
  onRegister: (barcode: string) => void;
  contextText?: string;
}

export const UnregisteredBarcodeModal: React.FC<UnregisteredBarcodeModalProps> = ({
  isOpen,
  onClose,
  barcode,
  onRegister,
  contextText,
}) => {
  const [copied, setCopied] = React.useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setCopied(false);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onRegister(barcode);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, barcode, onRegister]);

  const handleCopy = () => {
    navigator.clipboard?.writeText(barcode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Unregistered Barcode Detected"
      subtitle="A barcode was scanned that is not currently in your system"
      maxWidth="md"
    >
      <div className="space-y-5 py-1">
        {/* Scanned Barcode Display Box */}
        <div className="flex flex-col items-center justify-center p-5 rounded-2xl bg-amber-50/70 border border-amber-200/80 text-center">
          <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center mb-3 text-amber-700">
            <Barcode className="h-5 w-5" />
          </div>

          <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider mb-1">
            Scanned Barcode / Code
          </span>

          <div className="inline-flex items-center gap-2 bg-white px-4 py-2 rounded-xl border border-amber-300 shadow-sm font-mono text-base font-black text-slate-900 tracking-wider">
            <span>{barcode}</span>
            <button
              type="button"
              onClick={handleCopy}
              className="text-slate-400 hover:text-slate-700 transition p-1 rounded-lg hover:bg-slate-100"
              title="Copy barcode"
            >
              {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Informative message */}
        <div className="space-y-2 text-center sm:text-left">
          <p className="text-sm font-medium text-slate-700 leading-relaxed">
            No existing product, SKU, or item ID matches this barcode. Would you like to enter and register this product into the app now?
          </p>
          {contextText && (
            <p className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200/60 inline-block">
              {contextText}
            </p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
          <Button type="button" variant="secondary" onClick={onClose} className="font-semibold">
            Dismiss
          </Button>
          <Button
            type="button"
            variant="primary"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => onRegister(barcode)}
            className="font-bold bg-emerald-600 hover:bg-emerald-700 shadow-sm"
          >
            + Register Product
          </Button>
        </div>
      </div>
    </Modal>
  );
};
