import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { Bill, BillCategory, BusinessSettings } from '../../types';
import { Receipt, Plus, Search, DollarSign, AlertTriangle, CheckCircle2, Calendar, Tag } from 'lucide-react';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Modal } from '../../components/common/Modal';
import { Badge } from '../../components/common/Badge';
import { EmptyState } from '../../components/common/EmptyState';
import { formatCurrency, formatMoney } from '../../utils/format';

interface BillsPageProps {
  settings: BusinessSettings | null;
}

export const BillsPage: React.FC<BillsPageProps> = ({ settings }) => {
  const [bills, setBills] = useState<Bill[]>([]);
  const [categories, setCategories] = useState<BillCategory[]>([]);
  const [selectedCat, setSelectedCat] = useState<number | undefined>();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [loading, setLoading] = useState(false);

  // New Bill Modal
  const [showNewModal, setShowNewModal] = useState(false);
  const [name, setName] = useState('');
  const [billNumber, setBillNumber] = useState('');
  const [categoryId, setCategoryId] = useState<number>(0);
  const [amount, setAmount] = useState<number>(0);
  const [dueDate, setDueDate] = useState<string>(
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Quick Add Category Modal
  const [showAddCatModal, setShowAddCatModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');

  // Pay Bill Modal
  const [payingBill, setPayingBill] = useState<Bill | null>(null);
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payNotes, setPayNotes] = useState('');
  const [paying, setPaying] = useState(false);

  const currency = settings?.currency || 'Rs.';

  const loadData = async () => {
    setLoading(true);
    try {
      const [billsData, catsData] = await Promise.all([
        api.getBills({
          category_id: selectedCat,
          status: statusFilter === 'all' ? undefined : statusFilter,
        }),
        api.getBillCategories(true),
      ]);
      setBills(billsData || []);
      setCategories(catsData || []);
      if (catsData && catsData.length > 0 && categoryId === 0) {
        setCategoryId(catsData[0].id);
      }
    } catch (err) {
      console.error('Failed to load bills:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedCat, statusFilter]);

  const handleOpenNewBill = () => {
    setName('');
    setBillNumber('');
    setAmount(0);
    setDueDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    setNotes('');
    setShowNewModal(true);
  };

  const handleSaveBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || amount <= 0) return;

    setSaving(true);
    try {
      await api.createBill({
        name: name.trim(),
        bill_number: billNumber.trim() || undefined,
        category_id: categoryId,
        amount,
        due_date: dueDate,
        notes: notes.trim() || undefined,
      });
      setShowNewModal(false);
      loadData();
    } catch (err: any) {
      alert(err.detail || 'Failed to save bill');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    try {
      const newCat = await api.createBillCategory({ name: newCatName.trim() });
      setCategories((prev) => [...prev, newCat]);
      setCategoryId(newCat.id);
      setShowAddCatModal(false);
      setNewCatName('');
    } catch (err: any) {
      alert(err.detail || 'Failed to add bill category');
    }
  };

  const handleOpenPay = (b: Bill) => {
    setPayingBill(b);
    setPayAmount(Number(b.due_amount || 0));
    setPayNotes('');
  };

  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingBill || payAmount <= 0) return;
    setPaying(true);
    try {
      await api.recordBillPayment(payingBill.id, {
        amount: payAmount,
        notes: payNotes.trim() || undefined,
      });
      setPayingBill(null);
      loadData();
    } catch (err: any) {
      alert(err.detail || 'Failed to record bill payment');
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight">Recurring & Utility Bills</h1>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            Track electricity, rent, internet, government, and other operational bills
          </p>
        </div>

        <Button
          variant="primary"
          size="md"
          icon={<Plus className="h-4 w-4" />}
          onClick={handleOpenNewBill}
        >
          + Add New Bill
        </Button>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <select
          value={selectedCat || ''}
          onChange={(e) => setSelectedCat(e.target.value ? Number(e.target.value) : undefined)}
          className="w-full sm:w-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-semibold rounded-xl px-4 py-2.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-brand-500 shadow-sm cursor-pointer"
        >
          <option value="">All Bill Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-full sm:w-56 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-semibold rounded-xl px-4 py-2.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-brand-500 shadow-sm cursor-pointer"
        >
          <option value="all">All Statuses</option>
          <option value="TO_PAY">To Pay / Unpaid</option>
          <option value="PARTIALLY_PAID">Partially Paid</option>
          <option value="PAID">Paid</option>
        </select>
      </div>

      {/* Bills Table */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-400 dark:text-slate-500">Loading bills...</div>
        ) : bills.length === 0 ? (
          <EmptyState
            title="No bills recorded"
            description="Add electricity, rent, internet, or other utility bills to receive due date reminders."
            actionText="+ Add New Bill"
            onAction={handleOpenNewBill}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-800 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-6">Bill #</th>
                  <th className="py-3.5 px-6">Bill Name</th>
                  <th className="py-3.5 px-6">Category</th>
                  <th className="py-3.5 px-6">Due Date</th>
                  <th className="py-3.5 px-6 text-right">Amount</th>
                  <th className="py-3.5 px-6 text-right">Paid</th>
                  <th className="py-3.5 px-6 text-right">Remaining Due</th>
                  <th className="py-3.5 px-6 text-center">Status</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {bills.map((b) => {
                  const isOverdue = new Date(b.due_date) < new Date() && b.status !== 'PAID';
                  const dueNum = Number(b.due_amount || 0);
                  return (
                    <tr key={b.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/50 transition">
                      <td className="py-4 px-6 font-bold text-slate-900 dark:text-white">{b.bill_number}</td>
                      <td className="py-4 px-6 font-bold text-slate-800 dark:text-slate-100">
                        {b.name}
                        {b.notes && <p className="text-xs text-slate-400 dark:text-slate-500 font-normal">{b.notes}</p>}
                      </td>
                      <td className="py-4 px-6 text-slate-600 dark:text-slate-400 text-xs">
                        <span className="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md font-medium border border-slate-200/60 dark:border-slate-700">
                          <Tag className="h-3 w-3" />
                          {b.category_name}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-xs">
                        <span
                          className={`font-semibold ${
                            isOverdue ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {new Date(b.due_date).toLocaleDateString('en-GB', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-right font-bold text-slate-900 dark:text-white">
                        {formatCurrency(b.amount, currency)}
                      </td>
                      <td className="py-4 px-6 text-right text-emerald-600 dark:text-emerald-400 font-semibold">
                        {formatCurrency(b.paid_amount, currency)}
                      </td>
                      <td className="py-4 px-6 text-right font-semibold text-rose-600 dark:text-rose-400">
                        {dueNum > 0 ? formatCurrency(dueNum, currency) : '—'}
                      </td>
                      <td className="py-4 px-6 text-center">
                        <Badge status={b.status} />
                      </td>
                      <td className="py-4 px-6 text-right">
                        {b.status !== 'PAID' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenPay(b)}
                            className="text-xs py-1 px-3 font-bold text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-950/40 hover:bg-brand-100 dark:hover:bg-brand-900/60 border-brand-200 dark:border-brand-800"
                          >
                            Pay Bill
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add New Bill Modal */}
      <Modal
        isOpen={showNewModal}
        onClose={() => setShowNewModal(false)}
        title="Add New Bill"
        subtitle="Record a utility bill with due date reminder"
        maxWidth="md"
      >
        <form onSubmit={handleSaveBill} className="space-y-4">
          <Input
            label="Bill Name *"
            placeholder="e.g. Monthly Bill / Account"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Bill / Invoice Number (Optional)"
              placeholder="e.g. Reference / Invoice #"
              value={billNumber}
              onChange={(e) => setBillNumber(e.target.value)}
            />

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  Category
                </label>
                <button
                  type="button"
                  onClick={() => setShowAddCatModal(true)}
                  className="text-xs text-brand-600 dark:text-brand-400 hover:underline font-semibold"
                >
                  + Add Category
                </button>
              </div>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(Number(e.target.value))}
                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:border-brand-500 shadow-sm"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Bill Amount *"
              type="number"
              step="0.01"
              min="1"
              prefix={currency}
              value={amount || ''}
              onChange={(e) => setAmount(Number(e.target.value))}
              required
            />

            <Input
              label="Due Date *"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              required
            />
          </div>

          <Input
            label="Notes (Optional)"
            placeholder="e.g. Consumer / Reference details"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setShowNewModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={saving}>
              Save Bill
            </Button>
          </div>
        </form>
      </Modal>

      {/* Quick Add Category Modal */}
      <Modal
        isOpen={showAddCatModal}
        onClose={() => setShowAddCatModal(false)}
        title="Add Bill Category"
        maxWidth="sm"
      >
        <form onSubmit={handleCreateCategory} className="space-y-4">
          <Input
            label="Category Name *"
            placeholder="e.g. Category Name"
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            required
            autoFocus
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setShowAddCatModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Save Category
            </Button>
          </div>
        </form>
      </Modal>

      {/* Pay Bill Modal */}
      <Modal
        isOpen={Boolean(payingBill)}
        onClose={() => setPayingBill(null)}
        title={`Pay Bill: ${payingBill?.name}`}
        subtitle={`Remaining Due: ${formatCurrency(payingBill?.due_amount, currency)}`}
        maxWidth="sm"
      >
        <form onSubmit={handleSavePayment} className="space-y-4">
          <Input
            label="Payment Amount *"
            type="number"
            step="0.01"
            max={payingBill?.due_amount}
            value={payAmount}
            onChange={(e) => setPayAmount(Number(e.target.value))}
            prefix={currency}
            required
            autoFocus
          />
          <Input
            label="Notes (Optional)"
            placeholder="e.g. Paid online / Paid by cash"
            value={payNotes}
            onChange={(e) => setPayNotes(e.target.value)}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setPayingBill(null)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={paying}>
              Confirm Payment
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
