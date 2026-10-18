import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { Expense, ExpenseCategory, BusinessSettings } from '../../types';
import { Wallet, Plus, Trash2, Calendar, Tag, Search } from 'lucide-react';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Modal } from '../../components/common/Modal';
import { DateFilter } from '../../components/common/DateFilter';
import { EmptyState } from '../../components/common/EmptyState';
import { formatCurrency, formatMoney } from '../../utils/format';

interface ExpensesPageProps {
  settings: BusinessSettings | null;
}

export const ExpensesPage: React.FC<ExpensesPageProps> = ({ settings }) => {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [selectedCat, setSelectedCat] = useState<number | undefined>();
  const [startDate, setStartDate] = useState<string | undefined>();
  const [endDate, setEndDate] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  // Add Expense Modal
  const [showModal, setShowModal] = useState(false);
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState<number>(0);
  const [amount, setAmount] = useState<number>(0);
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Quick Add Category Modal
  const [showAddCatModal, setShowAddCatModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');

  const currency = settings?.currency || 'Rs.';

  const loadData = async () => {
    setLoading(true);
    try {
      const [expData, catsData] = await Promise.all([
        api.getExpenses({
          category_id: selectedCat,
          start_date: startDate,
          end_date: endDate,
        }),
        api.getExpenseCategories(true),
      ]);
      setExpenses(expData || []);
      setCategories(catsData || []);
      if (catsData && catsData.length > 0 && categoryId === 0) {
        setCategoryId(catsData[0].id);
      }
    } catch (err) {
      console.error('Failed to load expenses:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedCat, startDate, endDate]);

  const handleOpenAdd = () => {
    setTitle('');
    setAmount(0);
    setExpenseDate(new Date().toISOString().split('T')[0]);
    setNotes('');
    setShowModal(true);
  };

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || amount <= 0) return;

    setSaving(true);
    try {
      await api.createExpense({
        title: title.trim(),
        category_id: categoryId,
        amount,
        expense_date: expenseDate,
        payment_method: 'Cash',
        notes: notes.trim() || undefined,
      });
      setShowModal(false);
      loadData();
    } catch (err: any) {
      alert(err.detail || 'Failed to save expense');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteExpense = async (id: number) => {
    if (!confirm('Are you sure you want to delete this expense?')) return;
    try {
      await api.deleteExpense(id);
      loadData();
    } catch (err: any) {
      alert(err.detail || 'Failed to delete expense');
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    try {
      const newCat = await api.createExpenseCategory({ name: newCatName.trim() });
      setCategories((prev) => [...prev, newCat]);
      setCategoryId(newCat.id);
      setShowAddCatModal(false);
      setNewCatName('');
    } catch (err: any) {
      alert(err.detail || 'Failed to add category');
    }
  };

  const totalExpenseAmount = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight">General Expenses</h1>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            Record daily shop expenses, transport, delivery fuel, and maintenance
          </p>
        </div>

        <Button
          variant="primary"
          size="md"
          icon={<Plus className="h-4 w-4" />}
          onClick={handleOpenAdd}
        >
          + Add Expense
        </Button>
      </div>

      {/* Filter Toolbar & Summary */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedCat || ''}
            onChange={(e) =>
              setSelectedCat(e.target.value ? Number(e.target.value) : undefined)
            }
            className="w-full sm:w-56 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-semibold rounded-xl px-4 py-2.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-brand-500 shadow-sm cursor-pointer"
          >
            <option value="">All Expense Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <DateFilter
            onFilterChange={(start, end) => {
              setStartDate(start);
              setEndDate(end);
            }}
          />
        </div>

        <div className="bg-white dark:bg-slate-900 px-5 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-3">
          <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            Total Filtered:
          </span>
          <span className="text-lg font-black text-slate-900 dark:text-white">
            {formatCurrency(totalExpenseAmount, currency)}
          </span>
        </div>
      </div>

      {/* Expenses Table */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-400 dark:text-slate-500">Loading expenses...</div>
        ) : expenses.length === 0 ? (
          <EmptyState
            title="No expenses recorded"
            description="Record day-to-day shop expenses to keep track of spending."
            actionText="+ Add Expense"
            onAction={handleOpenAdd}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-800 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-6">Expense #</th>
                  <th className="py-3.5 px-6">Date</th>
                  <th className="py-3.5 px-6">Category</th>
                  <th className="py-3.5 px-6">Description / Title</th>
                  <th className="py-3.5 px-6 text-right">Amount</th>
                  <th className="py-3.5 px-6">Payment Method</th>
                  <th className="py-3.5 px-6">Notes</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {expenses.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/50 transition">
                    <td className="py-4 px-6 font-bold text-slate-900 dark:text-white">{e.expense_number}</td>
                    <td className="py-4 px-6 text-slate-500 dark:text-slate-400 text-xs">
                      {new Date(e.expense_date).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="py-4 px-6 text-slate-600 dark:text-slate-400 text-xs">
                      <span className="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md font-medium border border-slate-200/60 dark:border-slate-700">
                        <Tag className="h-3 w-3" />
                        {e.category_name}
                      </span>
                    </td>
                    <td className="py-4 px-6 font-bold text-slate-800 dark:text-slate-100">{e.title}</td>
                    <td className="py-4 px-6 text-right font-black text-slate-900 dark:text-white">
                      {formatCurrency(e.amount, currency)}
                    </td>
                    <td className="py-4 px-6 text-slate-600 dark:text-slate-400 text-xs">{e.payment_method}</td>
                    <td className="py-4 px-6 text-slate-400 dark:text-slate-500 text-xs">{e.notes || '—'}</td>
                    <td className="py-4 px-6 text-right">
                      <button
                        onClick={() => handleDeleteExpense(e.id)}
                        className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
                        title="Delete Expense"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Expense Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Record New Expense"
        maxWidth="sm"
      >
        <form onSubmit={handleSaveExpense} className="space-y-4">
          <Input
            label="Expense Title *"
            placeholder="e.g. Expense description / purpose"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            autoFocus
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

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Amount *"
              type="number"
              step="0.01"
              min="1"
              prefix={currency}
              placeholder="0.00"
              value={amount || ''}
              onChange={(e) => setAmount(Number(e.target.value.replace(/^0+(?=[1-9])/, '')))}
              required
            />

            <Input
              label="Date *"
              type="date"
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
              required
            />
          </div>

          <Input
            label="Notes (Optional)"
            placeholder="e.g. Paid by cash at counter"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={saving}>
              Save Expense
            </Button>
          </div>
        </form>
      </Modal>

      {/* Quick Add Category Modal */}
      <Modal
        isOpen={showAddCatModal}
        onClose={() => setShowAddCatModal(false)}
        title="Add Expense Category"
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
    </div>
  );
};
