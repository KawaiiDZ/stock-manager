import React, { useState, useEffect, useRef } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { ShoppingBag, Info, Plus } from 'lucide-react';
import { formatCurrency } from '../../utils/format';

interface AddToBillModalProps {
  isOpen: boolean;
  onClose: () => void;
  currency: string;
  initialName?: string;
  onAdd: (item: { name: string; quantity: number; unit_price: number; notes?: string }) => void;
}

export const AddToBillModal: React.FC<AddToBillModalProps> = ({
  isOpen,
  onClose,
  currency,
  initialName = '',
  onAdd,
}) => {
  const [name, setName] = useState('');
  const [quantityStr, setQuantityStr] = useState('1');
  const [priceStr, setPriceStr] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setQuantityStr('1');
      setPriceStr('');
      setNotes('');
      setError(null);
      setTimeout(() => {
        nameInputRef.current?.focus();
        if (initialName) {
          nameInputRef.current?.select();
        }
      }, 50);
    }
  }, [isOpen, initialName]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanName = name.trim();
    if (!cleanName) {
      setError('Please enter an item name or description.');
      return;
    }

    const qty = parseFloat(quantityStr);
    if (isNaN(qty) || qty <= 0) {
      setError('Quantity must be greater than zero.');
      return;
    }

    const price = parseFloat(priceStr);
    if (isNaN(price) || price < 0) {
      setError('Price cannot be negative.');
      return;
    }

    onAdd({
      name: cleanName,
      quantity: qty,
      unit_price: price,
      notes: notes.trim() || undefined,
    });

    onClose();
  };

  const qty = parseFloat(quantityStr) || 0;
  const price = parseFloat(priceStr) || 0;
  const lineTotal = Math.max(0, qty * price);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Sourced Item to Bill" maxWidth="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Info Banner */}
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl p-3 flex items-start gap-2.5">
          <Info className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
            <span className="font-bold">Zero-Profit Sourced Item:</span> Items sourced from elsewhere are billed to the customer at the specified price without affecting business gross profit and without altering your product inventory.
          </div>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-semibold rounded-xl">
            {error}
          </div>
        )}

        {/* Item Name */}
        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
            Item Name / Description <span className="text-rose-500">*</span>
          </label>
          <Input
            ref={nameInputRef}
            placeholder="e.g. Outside Spare Part, Market Sourced Cable, etc."
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="text-sm font-medium"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Quantity */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Quantity <span className="text-rose-500">*</span>
            </label>
            <input
              type="number"
              step="any"
              min="0.001"
              value={quantityStr}
              onFocus={(e) => e.target.select()}
              onChange={(e) => {
                const val = e.target.value.replace(/^0+(?=[1-9])/, '');
                setQuantityStr(val);
              }}
              className="w-full px-3 py-2 text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500 transition"
              placeholder="1"
              required
            />
          </div>

          {/* Unit Price */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Unit Price ({currency}) <span className="text-rose-500">*</span>
            </label>
            <input
              type="number"
              step="any"
              min="0"
              value={priceStr}
              onFocus={(e) => e.target.select()}
              onChange={(e) => {
                const val = e.target.value.replace(/^0+(?=[1-9])/, '');
                setPriceStr(val);
              }}
              className="w-full px-3 py-2 text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500 transition"
              placeholder="0.00"
              required
            />
          </div>
        </div>

        {/* Note / Source */}
        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
            Note / Sourced From <span className="text-slate-400 font-normal">(Optional)</span>
          </label>
          <Input
            placeholder="e.g. Bought from Vendor X across the street"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="text-xs"
          />
        </div>

        {/* Live Total Pill */}
        <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Total Sourced Bill:</span>
          <span className="text-base font-black text-amber-600 dark:text-amber-400">
            {formatCurrency(lineTotal, currency)}
          </span>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" className="bg-amber-600 hover:bg-amber-700 text-white">
            <Plus className="h-4 w-4 mr-1.5" />
            Add to Bill
          </Button>
        </div>
      </form>
    </Modal>
  );
};
