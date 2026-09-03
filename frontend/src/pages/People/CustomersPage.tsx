import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { Customer, CustomerLedgerEntry, BusinessSettings } from '../../types';
import { Users, Plus, Search, DollarSign, BookOpen, Edit2, Archive, RotateCcw, AlertCircle } from 'lucide-react';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Modal } from '../../components/common/Modal';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { Badge } from '../../components/common/Badge';
import { EmptyState } from '../../components/common/EmptyState';
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
  const [payNotes, setPayNotes] = useState('');
  const [paying, setPaying] = useState(false);

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

  const handleOpenPayment = (c: Customer) => {
    setPaymentCustomer(c);
    setPayAmount(Number(c.current_due || 0));
    setPayNotes('');
  };

  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentCustomer || payAmount <= 0) return;
    setPaying(true);
    try {
      await api.recordCustomerPayment(paymentCustomer.id, {
        amount: payAmount,
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
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">Customers & Dues</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Track customer accounts, credit balances, and payment histories
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-slate-200/70 p-1.5 rounded-2xl text-xs font-bold">
            <button
              onClick={() => setActiveTab('active')}
              className={`px-3.5 py-1.5 rounded-xl transition ${
                activeTab === 'active' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              Active Customers
            </button>
            <button
              onClick={() => setActiveTab('deactivated')}
              className={`px-3.5 py-1.5 rounded-xl transition ${
                activeTab === 'deactivated' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
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
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-400">Loading customers...</div>
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
              <thead className="bg-slate-50 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
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
              <tbody className="divide-y divide-slate-100">
                {customers.map((c) => {
                  const currentDueNum = Number(c.current_due || 0);
                  return (
                    <tr key={c.id} className="hover:bg-slate-50/60 transition">
                      <td className="py-4 px-6 font-bold text-slate-900">{c.customer_id}</td>
                      <td className="py-4 px-6 font-bold text-slate-800">
                        {c.name}
                        {c.customer_id === 'C-000001' && (
                          <span className="ml-2 text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-semibold">
                            Default Walk-in
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-slate-600">{c.phone || '—'}</td>
                      <td className="py-4 px-6 text-slate-400 text-xs">{c.address || '—'}</td>
                      <td className="py-4 px-6 text-right text-slate-700 font-medium">
                        {formatCurrency(c.total_sales, currency)}
                      </td>
                      <td className="py-4 px-6 text-right text-emerald-700 font-semibold">
                        {formatCurrency(c.total_paid, currency)}
                      </td>
                      <td className="py-4 px-6 text-right">
                        {currentDueNum > 0 ? (
                          <span className="font-black text-rose-700">
                            {formatCurrency(currentDueNum, currency)}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-semibold">Rs. 0.00</span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {currentDueNum > 0 && c.is_active && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenPayment(c)}
                              className="text-xs py-1 px-2.5 font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-200"
                            >
                              Receive Payment
                            </Button>
                          )}
                          <button
                            onClick={() => handleOpenLedger(c)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition"
                            title="View Ledger Statement"
                          >
                            <BookOpen className="h-4 w-4" />
                          </button>
                          {c.is_active && c.customer_id !== 'C-000001' && (
                            <>
                              <button
                                onClick={() => handleOpenEdit(c)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                                title="Edit Customer"
                              >
                                <Edit2 className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => setDeactivatingCust(c)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
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
                              className="text-xs py-1 px-2.5 font-semibold text-emerald-700"
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
        subtitle={`Current Balance Due: ${formatCurrency(paymentCustomer?.current_due, currency)}`}
        maxWidth="sm"
      >
        <form onSubmit={handleSavePayment} className="space-y-4">
          <div className="space-y-1">
            <Input
              label={`Payment Amount (Max: ${formatCurrency(paymentCustomer?.current_due, currency)}) *`}
              type="number"
              step="0.01"
              min="0.01"
              max={Number(paymentCustomer?.current_due || 0)}
              prefix={currency}
              value={payAmount}
              onChange={(e) => setPayAmount(Math.min(Number(paymentCustomer?.current_due || 0), Math.max(0, Number(e.target.value))))}
              required
              autoFocus
            />
            <div className="flex justify-between items-center text-[11px] text-slate-500 pt-1">
              <span>Customer Balance: <strong>{formatCurrency(paymentCustomer?.current_due, currency)}</strong></span>
              <button
                type="button"
                onClick={() => setPayAmount(Number(paymentCustomer?.current_due || 0))}
                className="text-emerald-700 font-bold hover:underline"
              >
                Pay Full Balance
              </button>
            </div>
          </div>
          <Input
            label="Notes (Optional)"
            placeholder="e.g. Cash paid at counter"
            value={payNotes}
            onChange={(e) => setPayNotes(e.target.value)}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setPaymentCustomer(null)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={paying} disabled={payAmount <= 0 || payAmount > Number(paymentCustomer?.current_due || 0)}>
              Receive Payment
            </Button>
          </div>
        </form>
      </Modal>

      {/* Customer Ledger Modal */}
      <Modal
        isOpen={Boolean(ledgerCustomer)}
        onClose={() => setLedgerCustomer(null)}
        title={`Ledger Statement: ${ledgerCustomer?.name}`}
        subtitle={`ID: ${ledgerCustomer?.customer_id} • Current Due: ${formatCurrency(ledgerCustomer?.current_due, currency)}`}
        maxWidth="2xl"
      >
        {loadingLedger ? (
          <div className="py-12 text-center text-slate-400">Loading ledger records...</div>
        ) : ledgerEntries.length === 0 ? (
          <div className="py-8 text-center text-slate-500">No transaction records found.</div>
        ) : (
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-100 font-bold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="py-2.5 px-4">Date</th>
                  <th className="py-2.5 px-4">Type</th>
                  <th className="py-2.5 px-4">Reference</th>
                  <th className="py-2.5 px-4">Description</th>
                  <th className="py-2.5 px-4 text-right">Sale (+)</th>
                  <th className="py-2.5 px-4 text-right">Paid (-)</th>
                  <th className="py-2.5 px-4 text-right">Balance Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ledgerEntries.map((entry, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/60">
                    <td className="py-3 px-4 text-slate-500">
                      {new Date(entry.date).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 font-bold">{entry.type}</td>
                    <td className="py-3 px-4 font-mono text-slate-600">{entry.reference}</td>
                    <td className="py-3 px-4 text-slate-600">{entry.description}</td>
                    <td className="py-3 px-4 text-right font-medium text-slate-800">
                      {Number(entry.debit) > 0 ? formatCurrency(entry.debit, currency) : '—'}
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-emerald-700">
                      {Number(entry.credit) > 0 ? formatCurrency(entry.credit, currency) : '—'}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-slate-900">
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
