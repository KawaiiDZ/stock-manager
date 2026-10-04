import React, { useState } from 'react';
import { api } from '../../services/api';
import { Product, BusinessSettings } from '../../types';
import { Modal } from '../../components/common/Modal';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { AlertCircle } from 'lucide-react';
import { enqueueRestockDelta } from '../../services/offlineQueue';

interface StockAdjustmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  settings: BusinessSettings | null;
  onStockAdjusted: () => void;
}

export const StockAdjustmentModal: React.FC<StockAdjustmentModalProps> = ({
  isOpen,
  onClose,
  product,
  settings,
  onStockAdjusted,
}) => {
  const [newStock, setNewStock] = useState<number>(product ? product.current_stock : 0);
  const [reason, setReason] = useState('Physical count audit');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  React.useEffect(() => {
    if (product) {
      setNewStock(product.current_stock);
      setReason('Physical count audit');
      setErrorMsg(null);
    }
  }, [product]);

  if (!product) return null;

  const diff = Number(newStock || 0) - product.current_stock;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newStock < 0) {
      setErrorMsg('Stock quantity cannot be negative.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      await api.adjustProductStock(product.id, {
        new_stock: Number(newStock),
        reason: reason.trim() || undefined,
      });
      onStockAdjusted();
      onClose();
    } catch (err: any) {
      if (!navigator.onLine || err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError') || err.message?.includes('Host unreachable')) {
        enqueueRestockDelta(product.id, diff, product.purchase_price, product.barcode, product.name);
        alert(`Host is currently offline. Stock change of ${diff > 0 ? '+' : ''}${diff} units for "${product.name}" has been queued locally and will automatically sync when reconnected!`);
        onStockAdjusted();
        onClose();
        return;
      }
      setErrorMsg(err.detail || 'Failed to adjust stock.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Adjust Stock: ${product.name}`}
      subtitle={`Product ID: ${product.product_id}`}
      maxWidth="sm"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {errorMsg && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-400 text-xs font-medium">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="p-3.5 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
          <span className="text-slate-500 dark:text-slate-400">Current In-Stock Count:</span>
          <span className="font-bold text-slate-800 dark:text-white text-sm">{product.current_stock} units</span>
        </div>

        <Input
          label="Actual Physical Stock Count *"
          type="number"
          min="0"
          value={newStock}
          onChange={(e) => setNewStock(Number(e.target.value))}
          required
          autoFocus
        />

        <div className="text-xs flex items-center justify-between font-semibold px-1">
          <span className="text-slate-500 dark:text-slate-400">Net Adjustment:</span>
          <span
            className={
              diff > 0
                ? 'text-brand-600 dark:text-brand-400 font-bold'
                : diff < 0
                ? 'text-rose-700 dark:text-rose-400 font-bold'
                : 'text-slate-500 dark:text-slate-400'
            }
          >
            {diff > 0 ? `+${diff} (Add)` : diff < 0 ? `${diff} (Deduct)` : 'No change'}
          </span>
        </div>

        <Input
          label="Reason for Adjustment"
          placeholder="e.g. Physical inventory count correction, damaged goods"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={loading}>
            Save Adjustment
          </Button>
        </div>
      </form>
    </Modal>
  );
};
