import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { Purchase, Product, BusinessSettings } from '../../types';
import { Truck, Plus, Search, Eye, Calendar, DollarSign, AlertCircle } from 'lucide-react';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Modal } from '../../components/common/Modal';
import { Badge } from '../../components/common/Badge';
import { EmptyState } from '../../components/common/EmptyState';
import { formatCurrency, formatMoney } from '../../utils/format';

import { NewPurchaseModal } from './NewPurchaseModal';

interface PurchasesPageProps {
  settings: BusinessSettings | null;
}

export const PurchasesPage: React.FC<PurchasesPageProps> = ({ settings }) => {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  // New Purchase Modal
  const [showNewModal, setShowNewModal] = useState(false);

  // Detail Modal
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null);

  // Payment Modal
  const [paymentPurchase, setPaymentPurchase] = useState<Purchase | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<string>('Cash');
  const [submittingPayment, setSubmittingPayment] = useState<boolean>(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const currency = settings?.currency || 'Rs.';

  const loadData = async () => {
    setLoading(true);
    try {
      const [poData, prods] = await Promise.all([
        api.getPurchases({ search: search.trim() || undefined }),
        api.getProducts({ is_active: true }),
      ]);
      setPurchases(poData || []);
      setProducts(prods || []);
    } catch (err) {
      console.error('Failed to load purchases:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [search]);

  const handleOpenNewPurchase = () => {
    setShowNewModal(true);
  };

  const handleSavePurchasePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentPurchase || paymentAmount <= 0) return;

    if (paymentAmount > Number(paymentPurchase.due_amount || 0)) {
      setPaymentError(
        `Payment amount cannot exceed remaining due of ${formatCurrency(
          paymentPurchase.due_amount,
          currency
        )}`
      );
      return;
    }

    setSubmittingPayment(true);
    setPaymentError(null);
    try {
      await api.addPurchasePayment(paymentPurchase.id, paymentAmount, paymentMethod);
      setPaymentPurchase(null);
      loadData();
    } catch (err: any) {
      setPaymentError(err.detail || 'Failed to record purchase payment.');
    } finally {
      setSubmittingPayment(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight">Stock Purchases</h1>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            Record inventory buying, batch costs, and supplier obligations
          </p>
        </div>

        <Button
          variant="primary"
          size="md"
          icon={<Plus className="h-4 w-4" />}
          onClick={handleOpenNewPurchase}
        >
          + New Purchase
        </Button>
      </div>

      {/* Search Toolbar */}
      <div className="max-w-md">
        <Input
          placeholder="Search by Purchase # or Supplier..."
          prefix={<Search className="h-4 w-4" />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Purchases Table */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-400 dark:text-slate-500">Loading purchase orders...</div>
        ) : purchases.length === 0 ? (
          <EmptyState
            title="No purchases yet"
            description="Buy inventory from suppliers to add stock and create FIFO cost batches."
            actionText="+ New Purchase"
            onAction={handleOpenNewPurchase}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-800 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-6">Purchase #</th>
                  <th className="py-3.5 px-6">Date</th>
                  <th className="py-3.5 px-6">Supplier</th>
                  <th className="py-3.5 px-6 text-right">Items</th>
                  <th className="py-3.5 px-6 text-right">Total Cost</th>
                  <th className="py-3.5 px-6 text-right">Paid</th>
                  <th className="py-3.5 px-6 text-right">Due to Supplier</th>
                  <th className="py-3.5 px-6 text-center">Status</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {purchases.map((po) => {
                  const dueNum = Number(po.due_amount || 0);
                  return (
                    <tr key={po.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/50 transition">
                      <td className="py-4 px-6 font-bold text-slate-900 dark:text-white">{po.purchase_number}</td>
                      <td className="py-4 px-6 text-slate-500 dark:text-slate-400 text-xs">
                        {new Date(po.created_at).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="py-4 px-6 font-semibold text-slate-800 dark:text-slate-100">
                        {po.supplier_name || 'Unknown'}
                      </td>
                      <td className="py-4 px-6 text-right text-slate-500 dark:text-slate-400 text-xs">
                        {po.items ? po.items.length : 0} items
                      </td>
                      <td className="py-4 px-6 text-right font-bold text-slate-900 dark:text-white">
                        {formatCurrency(po.total_amount, currency)}
                      </td>
                      <td className="py-4 px-6 text-right text-emerald-600 dark:text-emerald-400 font-semibold">
                        {formatCurrency(po.paid_amount, currency)}
                      </td>
                      <td className="py-4 px-6 text-right font-semibold text-rose-600 dark:text-rose-400">
                        {dueNum > 0 ? formatCurrency(dueNum, currency) : '—'}
                      </td>
                      <td className="py-4 px-6 text-center">
                        <Badge status={po.payment_status} />
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {dueNum > 0 && (
                            <button
                              onClick={() => {
                                setPaymentPurchase(po);
                                setPaymentAmount(dueNum);
                                setPaymentMethod('Cash');
                                setPaymentError(null);
                              }}
                              className="px-2.5 py-1 rounded-lg text-xs font-bold text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-950/40 hover:bg-brand-100 dark:hover:bg-brand-900/60 border border-brand-200 dark:border-brand-800 transition flex items-center gap-1"
                              title="Record Payment on this Purchase"
                            >
                              <DollarSign className="h-3.5 w-3.5" />
                              Pay
                            </button>
                          )}
                          <button
                            onClick={() => setSelectedPurchase(po)}
                            className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                            title="View Purchase Details"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New Purchase Modal */}
      <NewPurchaseModal
        isOpen={showNewModal}
        onClose={() => setShowNewModal(false)}
        products={products}
        settings={settings}
        onPurchaseCreated={loadData}
      />

      {/* View Purchase Detail Modal */}
      <Modal
        isOpen={Boolean(selectedPurchase)}
        onClose={() => setSelectedPurchase(null)}
        title={`Purchase ${selectedPurchase?.purchase_number}`}
        subtitle={`Supplier: ${selectedPurchase?.supplier_name}`}
        maxWidth="lg"
      >
        {selectedPurchase && (
          <div className="space-y-4">
            <div className="p-3.5 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-800 flex justify-between items-center text-xs">
              <div>
                <span className="text-slate-400 dark:text-slate-500">Date: </span>
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  {new Date(selectedPurchase.created_at).toLocaleString()}
                </span>
              </div>
              <Badge status={selectedPurchase.payment_status} />
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                Purchased Items
              </h4>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden text-sm">
                {selectedPurchase.items?.map((it) => (
                  <div key={it.id} className="p-3 flex justify-between bg-white dark:bg-slate-800">
                    <div>
                      <div className="font-bold text-slate-800 dark:text-slate-100">{it.product_name}</div>
                      <div className="text-xs text-slate-400 dark:text-slate-500">
                        {it.quantity} units @ {formatCurrency(it.unit_cost, currency)}
                      </div>
                    </div>
                    <div className="font-bold text-slate-900 dark:text-white">
                      {formatCurrency(it.total_cost, currency)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-brand-50 dark:bg-brand-950/40 text-brand-950 dark:text-brand-100 border border-brand-100 dark:border-brand-900/50 flex justify-between items-center text-sm font-bold">
              <span>Total Purchase Value:</span>
              <span className="text-lg">{formatCurrency(selectedPurchase.total_amount, currency)}</span>
            </div>
          </div>
        )}
      </Modal>

      {/* Record Purchase Payment Modal */}
      <Modal
        isOpen={Boolean(paymentPurchase)}
        onClose={() => setPaymentPurchase(null)}
        title={`Record Payment for ${paymentPurchase?.purchase_number}`}
        subtitle={`Supplier: ${paymentPurchase?.supplier_name || 'Direct / No Supplier'}`}
        maxWidth="sm"
      >
        {paymentPurchase && (
          <form onSubmit={handleSavePurchasePayment} className="space-y-4">
            {paymentError && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs font-medium">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{paymentError}</span>
              </div>
            )}

            <div className="p-3.5 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-2 text-xs">
              <div className="flex justify-between items-center text-slate-500 dark:text-slate-400">
                <span>Total Amount:</span>
                <span className="font-bold text-slate-800 dark:text-slate-100">{formatCurrency(paymentPurchase.total_amount, currency)}</span>
              </div>
              <div className="flex justify-between items-center text-slate-500 dark:text-slate-400">
                <span>Already Paid:</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(paymentPurchase.paid_amount, currency)}</span>
              </div>
              <div className="flex justify-between items-center pt-1.5 border-t border-slate-200 dark:border-slate-700">
                <span className="font-bold text-slate-700 dark:text-slate-300">Remaining Due:</span>
                <span className="font-extrabold text-rose-600 dark:text-rose-400 text-sm">{formatCurrency(paymentPurchase.due_amount, currency)}</span>
              </div>
            </div>

            <div>
              <Input
                label="Payment Amount *"
                type="number"
                step="0.01"
                min="0.01"
                max={Number(paymentPurchase.due_amount || 0)}
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(Number(e.target.value))}
                required
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                Payment Method *
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 focus:outline-none focus:border-brand-500"
              >
                <option value="Cash">Cash</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Card">Card</option>
                <option value="Cheque">Cheque</option>
                <option value="Online">Online</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={() => setPaymentPurchase(null)}
                disabled={submittingPayment}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={submittingPayment || paymentAmount <= 0}
              >
                {submittingPayment ? 'Recording...' : `Record Payment (${formatCurrency(paymentAmount, currency)})`}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};
