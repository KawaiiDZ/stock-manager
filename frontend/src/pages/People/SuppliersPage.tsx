import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { Supplier, SupplierLedgerEntry, BusinessSettings } from '../../types';
import { Building2, Plus, Search, DollarSign, BookOpen, Edit2, Archive, RotateCcw } from 'lucide-react';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Modal } from '../../components/common/Modal';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { EmptyState } from '../../components/common/EmptyState';
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
  const [payNotes, setPayNotes] = useState('');
  const [paying, setPaying] = useState(false);

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

  const handleOpenPayment = (s: Supplier) => {
    setPaySupplier(s);
    setPayAmount(Number(s.current_due || 0));
    setPayNotes('');
  };

  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paySupplier || payAmount <= 0) return;
    setPaying(true);
    try {
      await api.recordSupplierPayment(paySupplier.id, {
        amount: payAmount,
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
        subtitle={`Current Payable Due: ${formatCurrency(paySupplier?.current_due, currency)}`}
        maxWidth="sm"
      >
        <form onSubmit={handleSavePayment} className="space-y-4">
          <div className="space-y-1">
            <Input
              label={`Payment Amount (Max: ${formatCurrency(paySupplier?.current_due, currency)}) *`}
              type="number"
              step="0.01"
              min="0.01"
              max={Number(paySupplier?.current_due || 0)}
              prefix={currency}
              value={payAmount}
              onChange={(e) => setPayAmount(Math.min(Number(paySupplier?.current_due || 0), Math.max(0, Number(e.target.value))))}
              required
              autoFocus
            />
            <div className="flex justify-between items-center text-[11px] text-slate-500 pt-1">
              <span>Supplier Balance: <strong>{formatCurrency(paySupplier?.current_due, currency)}</strong></span>
              <button
                type="button"
                onClick={() => setPayAmount(Number(paySupplier?.current_due || 0))}
                className="text-emerald-700 font-bold hover:underline"
              >
                Pay Full Balance
              </button>
            </div>
          </div>
          <Input
            label="Notes (Optional)"
            placeholder="e.g. Cash paid to representative"
            value={payNotes}
            onChange={(e) => setPayNotes(e.target.value)}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setPaySupplier(null)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={paying} disabled={payAmount <= 0 || payAmount > Number(paySupplier?.current_due || 0)}>
              Make Payment
            </Button>
          </div>
        </form>
      </Modal>

      {/* Supplier Ledger Modal */}
      <Modal
        isOpen={Boolean(ledgerSupplier)}
        onClose={() => setLedgerSupplier(null)}
        title={`Supplier Statement: ${ledgerSupplier?.name}`}
        subtitle={`ID: ${ledgerSupplier?.supplier_id} • Outstanding Due: ${formatCurrency(ledgerSupplier?.current_due, currency)}`}
        maxWidth="2xl"
      >
        {loadingLedger ? (
          <div className="py-12 text-center text-slate-400">Loading ledger records...</div>
        ) : ledgerEntries.length === 0 ? (
          <div className="py-8 text-center text-slate-500">No transaction records found.</div>
        ) : (
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-800 font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="py-2.5 px-4">Date</th>
                  <th className="py-2.5 px-4">Type</th>
                  <th className="py-2.5 px-4">Reference</th>
                  <th className="py-2.5 px-4">Description</th>
                  <th className="py-2.5 px-4 text-right">Purchase (+)</th>
                  <th className="py-2.5 px-4 text-right">Paid/Return (-)</th>
                  <th className="py-2.5 px-4 text-right">Payable Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {ledgerEntries.map((entry, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/50">
                    <td className="py-3 px-4 text-slate-500 dark:text-slate-400">
                      {new Date(entry.date).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-800 dark:text-slate-100">{entry.type}</td>
                    <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-400">{entry.reference}</td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300">{entry.description}</td>
                    <td className="py-3 px-4 text-right font-medium text-slate-800 dark:text-slate-100">
                      {Number(entry.credit) > 0 ? formatCurrency(entry.credit, currency) : '—'}
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                      {Number(entry.debit) > 0 ? formatCurrency(entry.debit, currency) : '—'}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-slate-900 dark:text-white">
                      {formatCurrency(entry.balance, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

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
