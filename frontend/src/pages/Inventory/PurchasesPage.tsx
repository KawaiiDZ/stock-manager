import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { Purchase, Supplier, Product, BusinessSettings } from '../../types';
import { Truck, Plus, Search, Eye, AlertCircle, Trash2, Calendar } from 'lucide-react';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Modal } from '../../components/common/Modal';
import { Badge } from '../../components/common/Badge';
import { EmptyState } from '../../components/common/EmptyState';
import { formatCurrency, formatMoney } from '../../utils/format';

interface PurchasesPageProps {
  settings: BusinessSettings | null;
}

interface PurchaseItemDraft {
  product_id: number;
  quantity: number;
  unit_cost: number;
}

export const PurchasesPage: React.FC<PurchasesPageProps> = ({ settings }) => {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  // New Purchase Modal
  const [showNewModal, setShowNewModal] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState<number>(0);
  const [itemsDraft, setItemsDraft] = useState<PurchaseItemDraft[]>([]);
  const [discount, setDiscount] = useState<number>(0);
  const [tax, setTax] = useState<number>(0);
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Detail Modal
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null);

  const currency = settings?.currency || 'Rs.';

  const loadData = async () => {
    setLoading(true);
    try {
      const [poData, supps, prods] = await Promise.all([
        api.getPurchases({ search: search.trim() || undefined }),
        api.getSuppliers({ is_active: true }),
        api.getProducts({ is_active: true }),
      ]);
      setPurchases(poData || []);
      setSuppliers(supps || []);
      setProducts(prods || []);
      if (supps && supps.length > 0) setSelectedSupplierId(supps[0].id);
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
    if (suppliers.length === 0) {
      alert('Please add a supplier first before creating a purchase.');
      return;
    }
    if (products.length === 0) {
      alert('Please add products first before creating a purchase.');
      return;
    }
    setSelectedSupplierId(suppliers[0].id);
    setItemsDraft([
      {
        product_id: products[0].id,
        quantity: 10,
        unit_cost: products[0].purchase_price,
      },
    ]);
    setDiscount(0);
    setTax(0);
    setPaidAmount(0);
    setNotes('');
    setModalError(null);
    setShowNewModal(true);
  };

  const handleAddItem = () => {
    if (products.length > 0) {
      setItemsDraft([
        ...itemsDraft,
        {
          product_id: products[0].id,
          quantity: 1,
          unit_cost: products[0].purchase_price,
        },
      ]);
    }
  };

  const handleRemoveItem = (index: number) => {
    setItemsDraft(itemsDraft.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof PurchaseItemDraft, value: number) => {
    setItemsDraft(
      itemsDraft.map((it, i) => {
        if (i === index) {
          const updated = { ...it, [field]: value };
          if (field === 'product_id') {
            const p = products.find((prod) => prod.id === value);
            if (p) updated.unit_cost = p.purchase_price;
          }
          return updated;
        }
        return it;
      })
    );
  };

  // Computations
  const subtotal = itemsDraft.reduce((sum, it) => sum + it.quantity * it.unit_cost, 0);
  const totalAmount = Math.max(0, subtotal - discount + tax);

  const handleSavePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (itemsDraft.length === 0) {
      setModalError('Please add at least one product.');
      return;
    }

    setSaving(true);
    setModalError(null);
    try {
      await api.createPurchase({
        supplier_id: selectedSupplierId,
        items: itemsDraft.map((it) => ({
          product_id: it.product_id,
          quantity: it.quantity,
          unit_cost: it.unit_cost,
        })),
        discount_amount: discount,
        tax_amount: tax,
        paid_amount: paidAmount,
        notes: notes.trim() || undefined,
      });

      setShowNewModal(false);
      loadData();
    } catch (err: any) {
      setModalError(err.detail || 'Failed to save purchase.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">Stock Purchases</h1>
          <p className="text-xs text-slate-400 mt-0.5">
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
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-400">Loading purchase orders...</div>
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
              <thead className="bg-slate-50 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
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
              <tbody className="divide-y divide-slate-100">
                {purchases.map((po) => {
                  const dueNum = Number(po.due_amount || 0);
                  return (
                    <tr key={po.id} className="hover:bg-slate-50/60 transition">
                      <td className="py-4 px-6 font-bold text-slate-900">{po.purchase_number}</td>
                      <td className="py-4 px-6 text-slate-500 text-xs">
                        {new Date(po.created_at).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="py-4 px-6 font-semibold text-slate-800">
                        {po.supplier_name || 'Unknown'}
                      </td>
                      <td className="py-4 px-6 text-right text-slate-500 text-xs">
                        {po.items ? po.items.length : 0} items
                      </td>
                      <td className="py-4 px-6 text-right font-bold text-slate-900">
                        {formatCurrency(po.total_amount, currency)}
                      </td>
                      <td className="py-4 px-6 text-right text-emerald-700 font-semibold">
                        {formatCurrency(po.paid_amount, currency)}
                      </td>
                      <td className="py-4 px-6 text-right font-semibold text-rose-700">
                        {dueNum > 0 ? formatCurrency(dueNum, currency) : '—'}
                      </td>
                      <td className="py-4 px-6 text-center">
                        <Badge status={po.payment_status} />
                      </td>
                      <td className="py-4 px-6 text-right">
                        <button
                          onClick={() => setSelectedPurchase(po)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                          title="View Purchase Details"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
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
      <Modal
        isOpen={showNewModal}
        onClose={() => setShowNewModal(false)}
        title="Record New Stock Purchase"
        subtitle="This will automatically create FIFO inventory batches and update current stock."
        maxWidth="2xl"
      >
        <form onSubmit={handleSavePurchase} className="space-y-5">
          {modalError && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{modalError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">
              Supplier *
            </label>
            <select
              value={selectedSupplierId}
              onChange={(e) => setSelectedSupplierId(Number(e.target.value))}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-800 focus:outline-none focus:border-emerald-500"
              required
            >
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.phone ? `(${s.phone})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Line items */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Products to Receive
              </span>
              <button
                type="button"
                onClick={handleAddItem}
                className="text-xs font-semibold text-emerald-600 hover:underline"
              >
                + Add Another Product
              </button>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {itemsDraft.map((item, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-12 gap-2 items-center p-3 rounded-xl bg-slate-50 border border-slate-100"
                >
                  <div className="col-span-6">
                    <select
                      value={item.product_id}
                      onChange={(e) => updateItem(idx, 'product_id', Number(e.target.value))}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800"
                    >
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} (Stock: {p.current_stock})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number"
                      min="1"
                      placeholder="Qty"
                      value={item.quantity}
                      onChange={(e) => updateItem(idx, 'quantity', Number(e.target.value))}
                      className="w-full text-center bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-800"
                      title="Quantity"
                    />
                  </div>
                  <div className="col-span-3">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Unit Cost"
                      value={item.unit_cost}
                      onChange={(e) => updateItem(idx, 'unit_cost', Number(e.target.value))}
                      className="w-full text-right bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-800"
                      title="Unit Cost"
                    />
                  </div>
                  <div className="col-span-1 text-center">
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(idx)}
                      disabled={itemsDraft.length === 1}
                      className="text-slate-400 hover:text-rose-600 disabled:opacity-30"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Subtotals & Payment */}
          <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-4">
            <div className="space-y-3">
              <Input
                label="Discount"
                type="number"
                prefix={currency}
                value={discount}
                onChange={(e) => setDiscount(Number(e.target.value))}
              />
              <Input
                label="Amount Paid to Supplier"
                type="number"
                prefix={currency}
                value={paidAmount}
                onChange={(e) => setPaidAmount(Number(e.target.value))}
                hint="Leave 0 if unpaid"
              />
            </div>

            <div className="space-y-3">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-1 text-sm">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal:</span>
                  <span className="font-bold text-slate-800">
                    {formatCurrency(subtotal, currency)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-800 font-bold border-t border-slate-200 pt-2 text-base">
                  <span>Total Payable:</span>
                  <span className="text-emerald-800 font-black">
                    {formatCurrency(totalAmount, currency)}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-rose-700 font-semibold pt-1">
                  <span>Supplier Due:</span>
                  <span>{formatCurrency(Math.max(0, totalAmount - paidAmount), currency)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowNewModal(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={saving}>
              Save Purchase & Stock
            </Button>
          </div>
        </form>
      </Modal>

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
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 flex justify-between items-center text-xs">
              <div>
                <span className="text-slate-400">Date: </span>
                <span className="font-semibold text-slate-700">
                  {new Date(selectedPurchase.created_at).toLocaleString()}
                </span>
              </div>
              <Badge status={selectedPurchase.payment_status} />
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Purchased Items
              </h4>
              <div className="divide-y divide-slate-100 border border-slate-100 rounded-2xl overflow-hidden text-sm">
                {selectedPurchase.items?.map((it) => (
                  <div key={it.id} className="p-3 flex justify-between bg-white">
                    <div>
                      <div className="font-bold text-slate-800">{it.product_name}</div>
                      <div className="text-xs text-slate-400">
                        {it.quantity} units @ {formatCurrency(it.unit_cost, currency)}
                      </div>
                    </div>
                    <div className="font-bold text-slate-900">
                      {formatCurrency(it.total_cost, currency)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-emerald-50 text-emerald-950 flex justify-between items-center text-sm font-bold">
              <span>Total Purchase Value:</span>
              <span className="text-lg">{formatCurrency(selectedPurchase.total_amount, currency)}</span>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
