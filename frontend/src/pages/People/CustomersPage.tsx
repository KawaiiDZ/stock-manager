import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { Customer, CustomerLedgerEntry, BusinessSettings } from '../../types';
import { Users, Plus, Search, DollarSign, BookOpen, Edit2, Archive, RotateCcw, AlertCircle, CreditCard, CheckCircle2, Receipt, ShoppingBag, Clock } from 'lucide-react';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Modal } from '../../components/common/Modal';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { Badge } from '../../components/common/Badge';
import { EmptyState } from '../../components/common/EmptyState';
import { LedgerStatementModal } from '../../components/ledger/LedgerStatementModal';
import { formatCurrency, formatMoney } from '../../utils/format';

interface CustomersPageProps {
  settings: BusinessSettings | null;
}

export const CustomersPage: React.FC<CustomersPageProps> = ({ settings }) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'active' | 'deactivated'>('active');
  const [loading, setLoading] = useState(false);

  // Add / Edit Modal
  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);

  // Receive Payment Modal
  const [paymentCustomer, setPaymentCustomer] = useState<Customer | null>(null);
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payMethod, setPayMethod] = useState<string>('Cash');
  const [payNotes, setPayNotes] = useState('');
  const [paying, setPaying] = useState(false);
  const [loadingOpenBills, setLoadingOpenBills] = useState(false);
  const [openBills, setOpenBills] = useState<Array<{
    billReference: string;
    date: string;
    billAmount: number;
    paidSoFar: number;
    remainingDue: number;
  }>>([]);

  // Ledger Modal
  const [ledgerCustomer, setLedgerCustomer] = useState<Customer | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<CustomerLedgerEntry[]>([]);
  const [loadingLedger, setLoadingLedger] = useState(false);

  // Deactivate Confirm
  const [deactivatingCust, setDeactivatingCust] = useState<Customer | null>(null);

  const currency = settings?.currency || 'Rs.';

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const data = await api.getCustomers({
        search: search.trim() || undefined,
        is_active: activeTab === 'active',
      });
      setCustomers(data || []);
    } catch (err) {
      console.error('Failed to load customers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, [search, activeTab]);

  const handleOpenAdd = () => {
    setEditingCustomer(null);
    setName('');
    setPhone('');
    setAddress('');
    setShowModal(true);
  };

  const handleOpenEdit = (c: Customer) => {
    setEditingCustomer(c);
    setName(c.name);
    setPhone(c.phone || '');
    setAddress(c.address || '');
    setShowModal(true);
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSaving(true);
    try {
      if (editingCustomer) {
        await api.updateCustomer(editingCustomer.id, {
          name: name.trim(),
          phone: phone.trim() || undefined,
          address: address.trim() || undefined,
        });
      } else {
        await api.createCustomer({
          name: name.trim(),
          phone: phone.trim() || undefined,
          address: address.trim() || undefined,
        });
      }
      setShowModal(false);
      loadCustomers();
    } catch (err: any) {
      alert(err.detail || 'Failed to save customer');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenPayment = async (c: Customer) => {
    setPaymentCustomer(c);
    setPayAmount(Number(c.current_due || 0));
    setPayMethod('Cash');
    setPayNotes('');
    setLoadingOpenBills(true);
    setOpenBills([]);
    try {
      const data = await api.getCustomerLedger(c.id);
      const billsMap: Record<string, { billReference: string; date: string; billAmount: number; paidSoFar: number; remainingDue: number }> = {};
      (data || []).forEach((e) => {
        const ref = e.bill_reference || (e.type === 'Sale' ? e.reference : null);
        if (ref) {
          if (!billsMap[ref]) {
            billsMap[ref] = {
              billReference: ref,
              date: e.date,
              billAmount: Number(e.bill_amount) || Number(e.debit) || 0,
              paidSoFar: 0,
              remainingDue: Number(e.bill_amount) || Number(e.debit) || 0,
            };
          }
          if (e.bill_amount != null && Number(e.bill_amount) > 0) {
            billsMap[ref].billAmount = Number(e.bill_amount);
          }
          if (e.bill_remaining != null) {
            billsMap[ref].remainingDue = Number(e.bill_remaining);
            billsMap[ref].paidSoFar = Math.max(0, billsMap[ref].billAmount - Number(e.bill_remaining));
          }
        }
      });
      const unpaidList = Object.values(billsMap).filter((b) => b.remainingDue > 0.009);
      setOpenBills(unpaidList);
    } catch {
      // fallback if ledger fails
    } finally {
      setLoadingOpenBills(false);
    }
  };

  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentCustomer || payAmount <= 0) return;
    const maxDue = Number(paymentCustomer.current_due || 0);
    if (payAmount > maxDue) {
      alert(`Payment amount (${formatCurrency(payAmount, currency)}) cannot exceed current balance due (${formatCurrency(maxDue, currency)}).`);
      return;
    }

    setPaying(true);
    try {
      await api.recordCustomerPayment(paymentCustomer.id, {
        amount: payAmount,
        payment_method: payMethod,
        notes: payNotes.trim() || undefined,
      });
      setPaymentCustomer(null);
      loadCustomers();
    } catch (err: any) {
      alert(err.detail || 'Failed to receive payment');
    } finally {
      setPaying(false);
    }
  };

  const handleOpenLedger = async (c: Customer) => {
    setLedgerCustomer(c);
    setLoadingLedger(true);
    try {
      const data = await api.getCustomerLedger(c.id);
      setLedgerEntries(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingLedger(false);
    }
  };

  const handleDeactivate = async () => {
    if (!deactivatingCust) return;
    try {
      await api.deactivateCustomer(deactivatingCust.id);
      setDeactivatingCust(null);
      loadCustomers();
    } catch (err: any) {
      alert(err.detail || 'Failed to deactivate customer');
    }
  };

  const handleRestore = async (id: number) => {
    try {
      await api.restoreCustomer(id);
      loadCustomers();
    } catch (err: any) {
      alert(err.detail || 'Failed to restore customer');
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight">Customers & Dues</h1>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            Track customer accounts, credit balances, and payment histories
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-slate-200/70 dark:bg-slate-800 p-1.5 rounded-2xl text-xs font-bold">
            <button
              onClick={() => setActiveTab('active')}
              className={`px-3.5 py-1.5 rounded-xl transition ${
                activeTab === 'active' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Active Customers
            </button>
            <button
              onClick={() => setActiveTab('deactivated')}
              className={`px-3.5 py-1.5 rounded-xl transition ${
                activeTab === 'deactivated' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Deactivated
            </button>
          </div>

          <Button
            variant="primary"
            size="md"
            icon={<Plus className="h-4 w-4" />}
            onClick={handleOpenAdd}
          >
            + Add Customer
          </Button>
        </div>
      </div>

      {/* Search Toolbar */}
      <div className="max-w-md">
        <Input
          placeholder="Search by Customer name, ID, or Phone..."
          prefix={<Search className="h-4 w-4" />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Customer Table */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-400 dark:text-slate-500">Loading customers...</div>
        ) : customers.length === 0 ? (
          <EmptyState
            title={activeTab === 'active' ? 'No customers yet' : 'No deactivated customers'}
            description="Customer accounts with unpaid credit balances or purchase histories will appear here."
            actionText={activeTab === 'active' ? '+ Add Customer' : undefined}
            onAction={activeTab === 'active' ? handleOpenAdd : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-800 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-6">Customer ID</th>
                  <th className="py-3.5 px-6">Customer Name</th>
                  <th className="py-3.5 px-6">Phone</th>
                  <th className="py-3.5 px-6">Address</th>
                  <th className="py-3.5 px-6 text-right">Total Purchases</th>
                  <th className="py-3.5 px-6 text-right">Total Paid</th>
                  <th className="py-3.5 px-6 text-right">Outstanding Due</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {customers.map((c) => {
                  const currentDueNum = Number(c.current_due || 0);
                  return (
                    <tr key={c.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/50 transition">
                      <td className="py-4 px-6 font-bold text-slate-900 dark:text-white">{c.customer_id}</td>
                      <td className="py-4 px-6 font-bold text-slate-800 dark:text-slate-100">
                        {c.name}
                        {c.customer_id === 'C-000001' && (
                          <span className="ml-2 text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded font-semibold border border-slate-200/60 dark:border-slate-700">
                            Default Walk-in
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-slate-600 dark:text-slate-400">{c.phone || '—'}</td>
                      <td className="py-4 px-6 text-slate-400 dark:text-slate-500 text-xs">{c.address || '—'}</td>
                      <td className="py-4 px-6 text-right text-slate-700 dark:text-slate-300 font-medium">
                        {formatCurrency(c.total_sales, currency)}
                      </td>
                      <td className="py-4 px-6 text-right text-emerald-600 dark:text-emerald-400 font-semibold">
                        {formatCurrency(c.total_paid, currency)}
                      </td>
                      <td className="py-4 px-6 text-right">
                        {currentDueNum > 0 ? (
                          <span className="font-black text-rose-600 dark:text-rose-400">
                            {formatCurrency(currentDueNum, currency)}
                          </span>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500 font-semibold">Rs. 0.00</span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {currentDueNum > 0 && c.is_active && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenPayment(c)}
                              className="text-xs py-1 px-2.5 font-bold text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-950/40 hover:bg-brand-100 dark:hover:bg-brand-900/60 border-brand-200 dark:border-brand-800"
                            >
                              Receive Payment
                            </Button>
                          )}
                          <button
                            onClick={() => handleOpenLedger(c)}
                            className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                            title="View Ledger Statement"
                          >
                            <BookOpen className="h-4 w-4" />
                          </button>
                          {c.is_active && c.customer_id !== 'C-000001' && (
                            <>
                              <button
                                onClick={() => handleOpenEdit(c)}
                                className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                                title="Edit Customer"
                              >
                                <Edit2 className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => setDeactivatingCust(c)}
                                className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
                                title="Deactivate Customer"
                              >
                                <Archive className="h-4 w-4" />
                              </button>
                            </>
                          )}
                          {!c.is_active && (
                            <Button
                              variant="outline"
                              size="sm"
                              icon={<RotateCcw className="h-3.5 w-3.5" />}
                              onClick={() => handleRestore(c.id)}
                              className="text-xs py-1 px-2.5 font-semibold text-brand-700 dark:text-brand-300 hover:bg-brand-50 dark:hover:bg-brand-950/40"
                            >
                              Restore
                            </Button>
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

      {/* Add / Edit Customer Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingCustomer ? `Edit ${editingCustomer.name}` : 'Add New Customer'}
        subtitle={editingCustomer ? editingCustomer.customer_id : 'Enter customer details below'}
        maxWidth="sm"
      >
        <form onSubmit={handleSaveCustomer} className="space-y-4">
          <Input
            label="Customer Name *"
            placeholder="e.g. Customer Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />
          <Input
            label="Phone Number"
            placeholder="e.g. Phone Number"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <Input
            label="Address"
            placeholder="e.g. Address / City"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={saving}>
              {editingCustomer ? 'Save Changes' : 'Create Customer'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Receive Payment Modal */}
      <Modal
        isOpen={Boolean(paymentCustomer)}
        onClose={() => setPaymentCustomer(null)}
        title={`Receive Payment: ${paymentCustomer?.name}`}
        subtitle={`Account ID: ${paymentCustomer?.customer_id}${paymentCustomer?.phone ? ` • Phone: ${paymentCustomer?.phone}` : ''}`}
        maxWidth="lg"
      >
        {paymentCustomer && (
          <form onSubmit={handleSavePayment} className="space-y-4">
            {/* 1. Account Summary KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Invoiced</span>
                <span className="text-base font-black text-slate-800 dark:text-slate-100 mt-0.5 block">
                  {formatCurrency(paymentCustomer.total_sales, currency)}
                </span>
              </div>
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Already Paid</span>
                <span className="text-base font-black text-emerald-600 dark:text-emerald-400 mt-0.5 block">
                  {formatCurrency(paymentCustomer.total_paid, currency)}
                </span>
              </div>
              <div className="p-3 rounded-2xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider block">Current Balance Due</span>
                <span className="text-base font-black text-rose-600 dark:text-rose-400 mt-0.5 block">
                  {formatCurrency(paymentCustomer.current_due, currency)}
                </span>
              </div>
            </div>

            {/* 2. Open / Unpaid Bills List */}
            {openBills.length > 0 && (
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Receipt className="h-3.5 w-3.5 text-brand-600" />
                    Open Unpaid Bills ({openBills.length})
                  </span>
                  <span className="text-[11px] text-slate-400">Click a bill to pay its exact balance</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto pr-0.5">
                  {openBills.map((b) => (
                    <div
                      key={b.billReference}
                      onClick={() => setPayAmount(b.remainingDue)}
                      className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-emerald-500 hover:shadow-2xs transition cursor-pointer flex flex-col justify-between"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-900 dark:text-white font-mono">#{b.billReference}</span>
                        <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-1.5 py-0.2 rounded border border-rose-200 dark:border-rose-800">
                          Due: {formatCurrency(b.remainingDue, currency)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
                        <span>Billed: {formatCurrency(b.billAmount, currency)}</span>
                        <span>Paid: {formatCurrency(b.paidSoFar, currency)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 3. Payment Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Input
                  label="Payment Amount *"
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={Number(paymentCustomer.current_due || 0)}
                  prefix={currency}
                  value={payAmount || ''}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setPayAmount(val);
                  }}
                  required
                  autoFocus
                />
                <div className="flex items-center gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => setPayAmount(Number(paymentCustomer.current_due || 0))}
                    className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 hover:underline bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800"
                  >
                    Full: {formatCurrency(paymentCustomer.current_due, currency)}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayAmount(Math.round((Number(paymentCustomer.current_due || 0) / 2) * 100) / 100)}
                    className="text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:underline bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700"
                  >
                    50% Half
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Payment Method
                </label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                  className="w-full py-2 px-3 rounded-xl text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="Cash">Cash</option>
                  <option value="Card">Credit / Debit Card</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Cheque">Cheque</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            <Input
              label="Notes / Voucher Reference (Optional)"
              placeholder="e.g. Cash received at counter, cheque #, etc."
              value={payNotes}
              onChange={(e) => setPayNotes(e.target.value)}
            />

            {/* 4. Amount Remaining & Status Pill */}
            {(() => {
              const currentDueNum = Number(paymentCustomer.current_due || 0);
              const isOverpayment = payAmount > currentDueNum;
              const newRemaining = Math.max(0, currentDueNum - payAmount);

              return (
                <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Amount Remaining:
                    </span>
                    <span
                      className={`text-sm font-black ${
                        isOverpayment
                          ? 'text-rose-600 dark:text-rose-400'
                          : newRemaining === 0 && payAmount > 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-slate-900 dark:text-white'
                      }`}
                    >
                      {formatCurrency(newRemaining, currency)}
                    </span>
                  </div>

                  {/* Status Pill: Green (Full), Yellow (Still Due), Red (Overpaid) */}
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full border shadow-2xs ${
                      isOverpayment
                        ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800'
                        : newRemaining === 0 && payAmount > 0
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800'
                        : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800'
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isOverpayment
                          ? 'bg-rose-500 animate-pulse'
                          : newRemaining === 0 && payAmount > 0
                          ? 'bg-emerald-500'
                          : 'bg-amber-500'
                      }`}
                    />
                    {isOverpayment
                      ? 'Overpaid'
                      : newRemaining === 0 && payAmount > 0
                      ? 'Full'
                      : 'Still Due'}
                  </span>
                </div>
              );
            })()}

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => setPaymentCustomer(null)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={paying}
                disabled={payAmount <= 0 || payAmount > Number(paymentCustomer?.current_due || 0)}
              >
                Receive Payment
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Customer Ledger Modal */}
      <LedgerStatementModal
        isOpen={Boolean(ledgerCustomer)}
        onClose={() => setLedgerCustomer(null)}
        entityType="customer"
        entityId={ledgerCustomer?.customer_id || ''}
        entityName={ledgerCustomer?.name || ''}
        entityPhone={ledgerCustomer?.phone}
        currentDue={Number(ledgerCustomer?.current_due || 0)}
        currency={currency}
        settings={settings}
        entries={ledgerEntries}
        loading={loadingLedger}
      />

      {/* Deactivate Friendly Confirm Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deactivatingCust)}
        onClose={() => setDeactivatingCust(null)}
        onConfirm={handleDeactivate}
        title={`Deactivate ${deactivatingCust?.name}?`}
        message="You can find this customer later under Deactivated Customers."
        confirmText="Deactivate"
        variant="danger"
      />
    </div>
  );
};
