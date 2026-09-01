import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { Sale, BusinessSettings } from '../../types';
import { ShoppingBag, Search, Eye, Printer, RotateCcw, DollarSign, Calendar } from 'lucide-react';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Modal } from '../../components/common/Modal';
import { Badge } from '../../components/common/Badge';
import { DateFilter } from '../../components/common/DateFilter';
import { EmptyState } from '../../components/common/EmptyState';
import { ReceiptModal } from '../../components/receipts/ReceiptModal';
import { formatCurrency, formatMoney } from '../../utils/format';

interface SalesHistoryPageProps {
  settings: BusinessSettings | null;
  onNavigateToReturn?: (saleId: number) => void;
  onNavigateToNewSale?: () => void;
}

export const SalesHistoryPage: React.FC<SalesHistoryPageProps> = ({
  settings,
  onNavigateToReturn,
  onNavigateToNewSale,
}) => {
  const [sales, setSales] = useState<Sale[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState<string | undefined>();
  const [endDate, setEndDate] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  // Print Modal
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);

  // Receive Due Modal
  const [paymentSale, setPaymentSale] = useState<Sale | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentNotes, setPaymentNotes] = useState('');
  const [submittingPayment, setSubmittingPayment] = useState(false);

  const currency = settings?.currency || 'Rs.';

  const loadSales = async () => {
    setLoading(true);
    try {
      const data = await api.getSales({
        search: search.trim() || undefined,
        payment_status: statusFilter === 'all' ? undefined : statusFilter,
        start_date: startDate,
        end_date: endDate,
      });
      setSales(data || []);
    } catch (err) {
      console.error('Failed to load sales:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSales();
  }, [search, statusFilter, startDate, endDate]);

  const handleOpenPayment = (sale: Sale) => {
    setPaymentSale(sale);
    setPaymentAmount(Number(sale.due_amount || 0));
    setPaymentNotes('');
  };

  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentSale || paymentAmount <= 0) return;

    setSubmittingPayment(true);
    try {
      await api.recordSalePayment(paymentSale.id, paymentAmount, 'Cash');
      setPaymentSale(null);
      loadSales();
    } catch (err: any) {
      alert(err.detail || 'Failed to record payment');
    } finally {
      setSubmittingPayment(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">Sales History</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            View completed transactions, reprint receipts, and collect customer balances
          </p>
        </div>

        {onNavigateToNewSale && (
          <Button
            variant="primary"
            size="md"
            icon={<ShoppingBag className="h-4 w-4" />}
            onClick={onNavigateToNewSale}
          >
            + New Sale
          </Button>
        )}
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        <div className="flex flex-1 flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="flex-1 max-w-sm">
            <Input
              placeholder="Search by Receipt # or Customer..."
              prefix={<Search className="h-4 w-4" />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-white border border-slate-200 text-sm font-semibold rounded-xl px-4 py-2.5 text-slate-700 focus:outline-none focus:border-emerald-500 shadow-sm cursor-pointer"
          >
            <option value="all">All Payment Statuses</option>
            <option value="PAID">Fully Paid</option>
            <option value="PARTIALLY_PAID">Partially Paid</option>
            <option value="UNPAID">Unpaid (Credit)</option>
            <option value="RETURNED">Returned</option>
            <option value="PARTIALLY_RETURNED">Partially Returned</option>
          </select>
        </div>

        <DateFilter
          onFilterChange={(start, end) => {
            setStartDate(start);
            setEndDate(end);
          }}
        />
      </div>

      {/* Sales Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-400">Loading sales history...</div>
        ) : sales.length === 0 ? (
          <EmptyState
            title="No sales transactions found"
            description="Completed sales will appear here with instant receipt reprinting."
            actionText={onNavigateToNewSale ? '+ Create First Sale' : undefined}
            onAction={onNavigateToNewSale}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-6">Receipt #</th>
                  <th className="py-3.5 px-6">Date & Time</th>
                  <th className="py-3.5 px-6">Customer</th>
                  <th className="py-3.5 px-6 text-right">Items</th>
                  <th className="py-3.5 px-6 text-right">Total Amount</th>
                  <th className="py-3.5 px-6 text-right">Paid</th>
                  <th className="py-3.5 px-6 text-right">Due Balance</th>
                  <th className="py-3.5 px-6 text-center">Status</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sales.map((sale) => {
                  const dueNum = Number(sale.due_amount || 0);
                  const returnedNum = Number(sale.total_returned_amount || 0);
                  return (
                    <tr key={sale.id} className="hover:bg-slate-50/60 transition">
                      <td className="py-4 px-6 font-bold text-slate-900">
                        <div className="flex flex-col">
                          <span>{sale.receipt_number}</span>
                          {returnedNum > 0 && (
                            <span className="text-[10px] text-purple-600 font-semibold">
                              ({formatCurrency(returnedNum, currency)} returned)
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-6 text-slate-500 text-xs">
                        {new Date(sale.created_at).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}{' '}
                        {new Date(sale.created_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="py-4 px-6 font-medium text-slate-800">
                        {sale.customer_name || 'Walk-in Customer'}
                      </td>
                      <td className="py-4 px-6 text-right text-slate-500 text-xs">
                        {sale.items ? sale.items.length : 0} items
                      </td>
                      <td className="py-4 px-6 text-right font-bold text-slate-900">
                        {formatCurrency(sale.total_amount, currency)}
                      </td>
                      <td className="py-4 px-6 text-right text-emerald-700 font-semibold">
                        {formatCurrency(sale.paid_amount, currency)}
                      </td>
                      <td className="py-4 px-6 text-right font-semibold text-rose-700">
                        {dueNum > 0 ? formatCurrency(dueNum, currency) : '—'}
                      </td>
                      <td className="py-4 px-6 text-center">
                        <Badge status={sale.payment_status} />
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {dueNum > 0 && sale.payment_status !== 'RETURNED' && (
                            <button
                              onClick={() => handleOpenPayment(sale)}
                              className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-semibold text-xs hover:bg-emerald-100 transition"
                              title="Receive Payment"
                            >
                              Receive Due
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setSelectedSale(sale);
                              setShowReceiptModal(true);
                            }}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition"
                            title="View & Print Receipt"
                          >
                            <Printer className="h-4 w-4" />
                          </button>
                          {onNavigateToReturn && (
                            <button
                              onClick={() => onNavigateToReturn(sale.id)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-amber-700 hover:bg-amber-50 transition"
                              title="Return Items"
                            >
                              <RotateCcw className="h-4 w-4" />
                            </button>
                          )}
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

      {/* Receipt Modal */}
      <ReceiptModal
        isOpen={showReceiptModal}
        onClose={() => {
          setShowReceiptModal(false);
          setSelectedSale(null);
        }}
        sale={selectedSale}
        settings={settings}
      />

      {/* Receive Due Payment Modal */}
      <Modal
        isOpen={Boolean(paymentSale)}
        onClose={() => setPaymentSale(null)}
        title={`Receive Payment for ${paymentSale?.receipt_number}`}
        subtitle={`Remaining Due: ${formatCurrency(paymentSale?.due_amount, currency)}`}
        maxWidth="sm"
      >
        <form onSubmit={handleSavePayment} className="space-y-4">
          <Input
            label="Payment Amount *"
            type="number"
            step="0.01"
            max={paymentSale?.due_amount}
            value={paymentAmount}
            onChange={(e) => setPaymentAmount(Number(e.target.value))}
            prefix={currency}
            required
            autoFocus
          />
          <Input
            label="Notes (Optional)"
            placeholder="e.g. Cash paid at counter"
            value={paymentNotes}
            onChange={(e) => setPaymentNotes(e.target.value)}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setPaymentSale(null)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={submittingPayment}>
              Receive Payment
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
