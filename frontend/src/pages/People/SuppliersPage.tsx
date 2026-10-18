import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { Supplier, SupplierLedgerEntry, BusinessSettings } from '../../types';
import { Building2, Plus, Search, DollarSign, BookOpen, Edit2, Archive, RotateCcw, AlertCircle, CreditCard, CheckCircle2, Receipt, Building, Clock } from 'lucide-react';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Modal } from '../../components/common/Modal';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { EmptyState } from '../../components/common/EmptyState';
import { LedgerStatementModal } from '../../components/ledger/LedgerStatementModal';
import { formatCurrency, formatMoney } from '../../utils/format';

interface SuppliersPageProps {
  settings: BusinessSettings | null;
}

export const SuppliersPage: React.FC<SuppliersPageProps> = ({ settings }) => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'active' | 'deactivated'>('active');
  const [loading, setLoading] = useState(false);

  // Add / Edit Modal
  const [showModal, setShowModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);

  // Pay Supplier Modal
  const [paySupplier, setPaySupplier] = useState<Supplier | null>(null);
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
  const [ledgerSupplier, setLedgerSupplier] = useState<Supplier | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<SupplierLedgerEntry[]>([]);
  const [loadingLedger, setLoadingLedger] = useState(false);

  // Deactivate Confirm
  const [deactivatingSupp, setDeactivatingSupp] = useState<Supplier | null>(null);

  const currency = settings?.currency || 'Rs.';

  const loadSuppliers = async () => {
    setLoading(true);
    try {
      const data = await api.getSuppliers({
        search: search.trim() || undefined,
        is_active: activeTab === 'active',
      });
      setSuppliers(data || []);
    } catch (err) {
      console.error('Failed to load suppliers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSuppliers();
  }, [search, activeTab]);

  const handleOpenAdd = () => {
    setEditingSupplier(null);
    setName('');
    setPhone('');
    setAddress('');
    setShowModal(true);
  };

  const handleOpenEdit = (s: Supplier) => {
    setEditingSupplier(s);
    setName(s.name);
    setPhone(s.phone || '');
    setAddress(s.address || '');
    setShowModal(true);
  };

  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSaving(true);
    try {
      if (editingSupplier) {
        await api.updateSupplier(editingSupplier.id, {
          name: name.trim(),
          phone: phone.trim() || undefined,
          address: address.trim() || undefined,
        });
      } else {
        await api.createSupplier({
          name: name.trim(),
          phone: phone.trim() || undefined,
          address: address.trim() || undefined,
        });
      }
      setShowModal(false);
      loadSuppliers();
    } catch (err: any) {
      alert(err.detail || 'Failed to save supplier');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenPayment = async (s: Supplier) => {
    setPaySupplier(s);
    setPayAmount(Number(s.current_due || 0));
    setPayMethod('Cash');
    setPayNotes('');
    setLoadingOpenBills(true);
    setOpenBills([]);
    try {
      const data = await api.getSupplierLedger(s.id);
      const billsMap: Record<string, { billReference: string; date: string; billAmount: number; paidSoFar: number; remainingDue: number }> = {};
      (data || []).forEach((e) => {
        const ref = e.bill_reference || (e.type === 'Purchase' ? e.reference : null);
        if (ref) {
          if (!billsMap[ref]) {
            billsMap[ref] = {
              billReference: ref,
              date: e.date,
              billAmount: Number(e.bill_amount) || Number(e.credit) || 0,
              paidSoFar: 0,
              remainingDue: Number(e.bill_amount) || Number(e.credit) || 0,
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
      // fallback
    } finally {
      setLoadingOpenBills(false);
    }
  };

  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paySupplier || payAmount <= 0) return;
    const maxDue = Number(paySupplier.current_due || 0);
    if (payAmount > maxDue) {
      alert(`Payment amount (${formatCurrency(payAmount, currency)}) cannot exceed current payable due (${formatCurrency(maxDue, currency)}).`);
      return;
    }

    setPaying(true);
    try {
      await api.recordSupplierPayment(paySupplier.id, {
        amount: payAmount,
        payment_method: payMethod,
        notes: payNotes.trim() || undefined,
      });
      setPaySupplier(null);
      loadSuppliers();
    } catch (err: any) {
      alert(err.detail || 'Failed to record supplier payment');
    } finally {
      setPaying(false);
    }
  };

  const handleOpenLedger = async (s: Supplier) => {
    setLedgerSupplier(s);
    setLoadingLedger(true);
    try {
      const data = await api.getSupplierLedger(s.id);
      setLedgerEntries(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingLedger(false);
    }
  };

  const handleDeactivate = async () => {
    if (!deactivatingSupp) return;
    try {
      await api.deactivateSupplier(deactivatingSupp.id);
      setDeactivatingSupp(null);
      loadSuppliers();
    } catch (err: any) {
      alert(err.detail || 'Failed to deactivate supplier');
    }
  };

  const handleRestore = async (id: number) => {
    try {
      await api.restoreSupplier(id);
      loadSuppliers();
    } catch (err: any) {
      alert(err.detail || 'Failed to restore supplier');
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight">Suppliers & Payables</h1>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            Manage wholesale distributors, payments, and credit obligations
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
              Active Suppliers
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
            + Add Supplier
          </Button>
        </div>
      </div>

      {/* Search Toolbar */}
      <div className="max-w-md">
        <Input
          placeholder="Search by Supplier name, ID, or Phone..."
          prefix={<Search className="h-4 w-4" />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Suppliers Table */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-400 dark:text-slate-500">Loading suppliers...</div>
        ) : suppliers.length === 0 ? (
          <EmptyState
            title={activeTab === 'active' ? 'No suppliers yet' : 'No deactivated suppliers'}
            description="Add suppliers to record purchases and track how much you owe them."
            actionText={activeTab === 'active' ? '+ Add Supplier' : undefined}
            onAction={activeTab === 'active' ? handleOpenAdd : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-800 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-6">Supplier ID</th>
                  <th className="py-3.5 px-6">Supplier Name</th>
                  <th className="py-3.5 px-6">Phone</th>
                  <th className="py-3.5 px-6">Address</th>
                  <th className="py-3.5 px-6 text-right">Total Purchases</th>
                  <th className="py-3.5 px-6 text-right">Total Paid</th>
                  <th className="py-3.5 px-6 text-right">Amount We Owe</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {suppliers.map((s) => {
                  const currentDueNum = Number(s.current_due || 0);
                  return (
                    <tr key={s.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/50 transition">
                      <td className="py-4 px-6 font-bold text-slate-900 dark:text-white">{s.supplier_id}</td>
                      <td className="py-4 px-6 font-bold text-slate-800 dark:text-slate-100">{s.name}</td>
                      <td className="py-4 px-6 text-slate-600 dark:text-slate-400">{s.phone || '—'}</td>
                      <td className="py-4 px-6 text-slate-400 dark:text-slate-500 text-xs">{s.address || '—'}</td>
                      <td className="py-4 px-6 text-right text-slate-700 dark:text-slate-300 font-medium">
                        {formatCurrency(s.total_purchases, currency)}
                      </td>
                      <td className="py-4 px-6 text-right text-emerald-600 dark:text-emerald-400 font-semibold">
                        {formatCurrency(s.total_paid, currency)}
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
                          {currentDueNum > 0 && s.is_active && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenPayment(s)}
                              className="text-xs py-1 px-2.5 font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 border-rose-200 dark:border-rose-800"
                            >
                              Pay Supplier
                            </Button>
                          )}
                          <button
                            onClick={() => handleOpenLedger(s)}
                            className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                            title="View Ledger Statement"
                          >
                            <BookOpen className="h-4 w-4" />
                          </button>
                          {s.is_active && (
                            <>
                              <button
                                onClick={() => handleOpenEdit(s)}
                                className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                                title="Edit Supplier"
                              >
                                <Edit2 className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => setDeactivatingSupp(s)}
                                className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
                                title="Deactivate Supplier"
                              >
                                <Archive className="h-4 w-4" />
                              </button>
                            </>
                          )}
                          {!s.is_active && (
                            <Button
                              variant="outline"
                              size="sm"
                              icon={<RotateCcw className="h-3.5 w-3.5" />}
                              onClick={() => handleRestore(s.id)}
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

      {/* Add / Edit Supplier Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingSupplier ? `Edit ${editingSupplier.name}` : 'Add New Supplier'}
        subtitle={editingSupplier ? editingSupplier.supplier_id : 'Enter supplier details below'}
        maxWidth="sm"
      >
        <form onSubmit={handleSaveSupplier} className="space-y-4">
          <Input
            label="Supplier Name *"
            placeholder="e.g. Supplier / Vendor Name"
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
              {editingSupplier ? 'Save Changes' : 'Create Supplier'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Record Payment Modal */}
      <Modal
        isOpen={Boolean(paySupplier)}
        onClose={() => setPaySupplier(null)}
        title={`Pay Supplier: ${paySupplier?.name}`}
        subtitle={`Account ID: ${paySupplier?.supplier_id}${paySupplier?.phone ? ` • Phone: ${paySupplier?.phone}` : ''}`}
        maxWidth="lg"
      >
        {paySupplier && (
          <form onSubmit={handleSavePayment} className="space-y-4">
            {/* 1. Account Summary KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Purchases</span>
                <span className="text-base font-black text-slate-800 dark:text-slate-100 mt-0.5 block">
                  {formatCurrency(paySupplier.total_purchases, currency)}
                </span>
              </div>
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Already Paid</span>
                <span className="text-base font-black text-emerald-600 dark:text-emerald-400 mt-0.5 block">
                  {formatCurrency(paySupplier.total_paid, currency)}
                </span>
              </div>
              <div className="p-3 rounded-2xl bg-rose-50/70 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800">
                <span className="text-[10px] font-bold text-rose-700 dark:text-rose-400 uppercase tracking-wider block">Current Payable Due</span>
                <span className="text-base font-black text-rose-600 dark:text-rose-400 mt-0.5 block">
                  {formatCurrency(paySupplier.current_due, currency)}
                </span>
              </div>
            </div>

            {/* 2. Open / Unpaid Purchase Orders List */}
            {openBills.length > 0 && (
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Receipt className="h-3.5 w-3.5 text-brand-600" />
                    Open Unpaid Purchases ({openBills.length})
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
                  max={Number(paySupplier.current_due || 0)}
                  prefix={currency}
                  placeholder="0.00"
                  value={payAmount || ''}
                  onChange={(e) => {
                    const val = Number(e.target.value.replace(/^0+(?=[1-9])/, ''));
                    setPayAmount(val);
                  }}
                  required
                  autoFocus
                />
                <div className="flex items-center gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => setPayAmount(Number(paySupplier.current_due || 0))}
                    className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 hover:underline bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800"
                  >
                    Full: {formatCurrency(paySupplier.current_due, currency)}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayAmount(Math.round((Number(paySupplier.current_due || 0) / 2) * 100) / 100)}
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
                  {(settings?.payment_accounts && settings.payment_accounts.length > 0
                    ? settings.payment_accounts
                    : ['Cash', 'Bank Transfer', 'Easypaisa', 'Jazzcash']
                  ).map((acc) => (
                    <option key={acc} value={acc}>
                      {acc}
                    </option>
                  ))}
                  <option value="Cheque">Cheque</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            <Input
              label="Notes / Voucher Reference (Optional)"
              placeholder="e.g. Cash paid to representative, online transfer ref, etc."
              value={payNotes}
              onChange={(e) => setPayNotes(e.target.value)}
            />

            {/* 4. Amount Remaining & Status Pill */}
            {(() => {
              const currentDueNum = Number(paySupplier.current_due || 0);
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
              <Button type="button" variant="secondary" onClick={() => setPaySupplier(null)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={paying}
                disabled={payAmount <= 0 || payAmount > Number(paySupplier?.current_due || 0)}
              >
                Make Payment
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Supplier Ledger Modal */}
      <LedgerStatementModal
        isOpen={Boolean(ledgerSupplier)}
        onClose={() => setLedgerSupplier(null)}
        entityType="supplier"
        entityId={ledgerSupplier?.supplier_id || ''}
        entityName={ledgerSupplier?.name || ''}
        entityPhone={ledgerSupplier?.phone}
        currentDue={Number(ledgerSupplier?.current_due || 0)}
        currency={currency}
        settings={settings}
        entries={ledgerEntries}
        loading={loadingLedger}
      />

      {/* Deactivate Friendly Confirm Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deactivatingSupp)}
        onClose={() => setDeactivatingSupp(null)}
        onConfirm={handleDeactivate}
        title={`Deactivate ${deactivatingSupp?.name}?`}
        message="You can find this supplier later under Deactivated Suppliers."
        confirmText="Deactivate"
        variant="danger"
      />
    </div>
  );
};
