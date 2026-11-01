import React, { useState, useEffect, useRef } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { PlusCircle, Info, Sparkles, CheckCircle2 } from 'lucide-react';
import { api } from '../../services/api';
import { BusinessSettings, Sale } from '../../types';
import { formatCurrency } from '../../utils/format';

interface AddSaleBalanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  currency: string;
  settings?: BusinessSettings | null;
  onSuccess: (sale: Sale) => void;
}

export const AddSaleBalanceModal: React.FC<AddSaleBalanceModalProps> = ({
  isOpen,
  onClose,
  currency,
  settings,
  onSuccess,
}) => {
  const [amountStr, setAmountStr] = useState('');
  const [profitStr, setProfitStr] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [customerName, setCustomerName] = useState('Direct Entry');
  const [dateStr, setDateStr] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountInputRef = useRef<HTMLInputElement>(null);

  const paymentAccounts = React.useMemo(() => {
    if (settings?.payment_accounts && settings.payment_accounts.length > 0) {
      return settings.payment_accounts;
    }
    return ['Cash', 'Bank Transfer', 'Easypaisa', 'Jazzcash'];
  }, [settings?.payment_accounts]);

  useEffect(() => {
    if (isOpen) {
      setAmountStr('');
      setProfitStr('');
      setNotes('');
      setPaymentMethod('Cash');
      setCustomerName('Direct Entry');
      setDateStr(new Date().toISOString().split('T')[0]);
      setError(null);
      setSubmitting(false);
      setTimeout(() => {
        amountInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  const amount = parseFloat(amountStr) || 0;
  const profit = parseFloat(profitStr) || 0;
  const directCost = Math.max(0, amount - profit);

  const handleSetFullProfit = () => {
    if (amount > 0) {
      setProfitStr(amount.toString());
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (amount <= 0) {
      setError('Sale amount must be greater than zero.');
      return;
    }

    if (profit < 0) {
      setError('Profit cannot be negative.');
      return;
    }

    if (profit > amount) {
      setError('Profit cannot exceed the total sale amount.');
      return;
    }

    if (!notes.trim()) {
      setError('Please provide a note or description for this outside service/sale.');
      return;
    }

    setSubmitting(true);
    try {
      let createdDate: string | undefined = undefined;
      if (dateStr) {
        // Build ISO string preserving current time or noon
        const now = new Date();
        const [y, m, d] = dateStr.split('-').map(Number);
        const dt = new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds());
        createdDate = dt.toISOString();
      }

      const res = await api.addExternalSaleBalance({
        amount,
        profit,
        notes: notes.trim(),
        payment_method: paymentMethod,
        customer_name: customerName.trim() || 'Direct Entry',
        created_at: createdDate,
      });

      onSuccess(res);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to record external sale balance.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Balance in Total Sales" maxWidth="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Info Banner */}
        <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-xl p-3 flex items-start gap-2.5">
          <Info className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <div className="text-xs text-emerald-900 dark:text-emerald-200 leading-relaxed">
            Record revenue & profit for outside jobs, custom off-system services, or manual sales. This directly credits your total sales, records gross profit, and deposits into the selected payment account without touching product inventory.
          </div>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-semibold rounded-xl">
            {error}
          </div>
        )}

        {/* Note / Description (Required) */}
        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
            Note / Description <span className="text-rose-500">*</span>
          </label>
          <Input
            placeholder="e.g. Outside AC repair service, Emergency fitting job, etc."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="text-sm font-medium"
            required
          />
        </div>

        {/* Sale Amount & Profit Grid */}
        <div className="grid grid-cols-2 gap-3">
          {/* Sale Amount */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Sale Amount ({currency}) <span className="text-rose-500">*</span>
            </label>
            <input
              ref={amountInputRef}
              type="number"
              step="any"
              min="0.01"
              value={amountStr}
              onFocus={(e) => e.target.select()}
              onChange={(e) => {
                const val = e.target.value.replace(/^0+(?=[1-9])/, '');
                setAmountStr(val);
              }}
              className="w-full px-3 py-2 text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
              placeholder="0.00"
              required
            />
          </div>

          {/* Business Profit */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Profit ({currency}) <span className="text-rose-500">*</span>
              </label>
              <button
                type="button"
                onClick={handleSetFullProfit}
                className="text-[10px] font-bold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 transition"
              >
                100% (Pure Labor)
              </button>
            </div>
            <input
              type="number"
              step="any"
              min="0"
              max={amountStr || undefined}
              value={profitStr}
              onFocus={(e) => e.target.select()}
              onChange={(e) => {
                const val = e.target.value.replace(/^0+(?=[1-9])/, '');
                setProfitStr(val);
              }}
              className="w-full px-3 py-2 text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
              placeholder="0.00"
              required
            />
          </div>
        </div>

        {/* Cost & Profit Breakdown Summary */}
        <div className="grid grid-cols-2 gap-2 p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
          <div>
            <span className="text-slate-500 dark:text-slate-400">Recorded Cost:</span>
            <span className="ml-1 font-bold text-slate-700 dark:text-slate-200">
              {formatCurrency(directCost, currency)}
            </span>
          </div>
          <div className="text-right">
            <span className="text-slate-500 dark:text-slate-400">Net Profit:</span>
            <span className="ml-1 font-extrabold text-emerald-600 dark:text-emerald-400">
              {formatCurrency(profit, currency)}
            </span>
          </div>
        </div>

        {/* Deposit Account & Customer Grid */}
        <div className="grid grid-cols-2 gap-3">
          {/* Payment Account */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Deposit Account
            </label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
            >
              {paymentAccounts.map((acc) => (
                <option key={acc} value={acc}>
                  {acc}
                </option>
              ))}
            </select>
          </div>

          {/* Customer (Optional) */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Customer <span className="text-slate-400 font-normal">(Optional)</span>
            </label>
            <Input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Direct Entry"
              className="text-xs"
            />
          </div>
        </div>

        {/* Date */}
        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
            Date
          </label>
          <input
            type="date"
            value={dateStr}
            onChange={(e) => setDateStr(e.target.value)}
            className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={submitting}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {submitting ? 'Recording...' : 'Add Sale Balance'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
