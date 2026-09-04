import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { Purchase, Product, BusinessSettings } from '../../types';
import { Truck, Plus, Search, Eye, Calendar } from 'lucide-react';
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
