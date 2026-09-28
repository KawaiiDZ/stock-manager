import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { InventoryMovement, Product, BusinessSettings } from '../../types';
import { ArrowLeftRight, ArrowDownLeft, ArrowUpRight, Filter, Search } from 'lucide-react';
import { Input } from '../../components/common/Input';
import { EmptyState } from '../../components/common/EmptyState';
import { formatCurrency, formatQty } from '../../utils/format';

interface StockMovementsPageProps {
  settings: BusinessSettings | null;
}

export const StockMovementsPage: React.FC<StockMovementsPageProps> = ({ settings }) => {
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<number | undefined>();
  const [selectedType, setSelectedType] = useState<string>('all');
  const [loading, setLoading] = useState(false);

  const currency = settings?.currency || 'Rs.';

  useEffect(() => {
    const loadProducts = async () => {
      try {
        const prods = await api.getProducts({ is_active: true });
        setProducts(prods || []);
      } catch (err) {
        console.error('Failed to load products:', err);
      }
    };
    loadProducts();
  }, []);

  const loadMovements = async () => {
    setLoading(true);
    try {
      const movData = await api.getMovements({
        product_id: selectedProductId,
        movement_type: selectedType === 'all' ? undefined : selectedType,
      });
      setMovements(movData || []);
    } catch (err) {
      console.error('Failed to load stock movements:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMovements();
  }, [selectedProductId, selectedType]);

  const getMovementBadge = (type: string, qty: number | string) => {
    const numericQty = Number(qty || 0);
    if (numericQty > 0) {
      return (
        <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full text-xs font-bold">
          <ArrowDownLeft className="h-3.5 w-3.5" />
          +{numericQty} (In)
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center gap-1 text-rose-700 bg-rose-50 px-2.5 py-1 rounded-full text-xs font-bold">
          <ArrowUpRight className="h-3.5 w-3.5" />
          {numericQty} (Out)
        </span>
      );
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">Stock Movements</h1>
        <p className="text-xs text-slate-400 dark:text-slate-400 mt-0.5">
          Complete audit trail of all inventory additions, sales, and returns
        </p>
      </div>

      {/* Filters Toolbar */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <select
          value={selectedProductId || ''}
          onChange={(e) =>
            setSelectedProductId(e.target.value ? Number(e.target.value) : undefined)
          }
          className="w-full sm:w-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-semibold rounded-xl px-4 py-2.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-brand-500 shadow-sm cursor-pointer"
        >
          <option value="">All Products</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.product_id})
            </option>
          ))}
        </select>

        <select
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
          className="w-full sm:w-56 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-semibold rounded-xl px-4 py-2.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-brand-500 shadow-sm cursor-pointer"
        >
          <option value="all">All Movement Types</option>
          <option value="SALE">Sales (Out)</option>
          <option value="PURCHASE">Purchases (In)</option>
          <option value="CUSTOMER_RETURN">Customer Returns (In)</option>
          <option value="SUPPLIER_RETURN">Supplier Returns (Out)</option>
          <option value="OPENING_STOCK">Opening Stock (In)</option>
          <option value="ADJUSTMENT">Stock Adjustments</option>
        </select>
      </div>

      {/* Movements Table */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-400 dark:text-slate-500">Loading stock movements...</div>
        ) : movements.length === 0 ? (
          <EmptyState
            title="No movements found"
            description="Stock movements will appear here as you buy, sell, or adjust inventory."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-6">Date & Time</th>
                  <th className="py-3.5 px-6">Product</th>
                  <th className="py-3.5 px-6">Reason / Type</th>
                  <th className="py-3.5 px-6">Reference</th>
                  <th className="py-3.5 px-6 text-center">Movement</th>
                  <th className="py-3.5 px-6 text-right">Unit Cost</th>
                  <th className="py-3.5 px-6">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {movements.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition">
                    <td className="py-4 px-6 text-slate-500 dark:text-slate-400 text-xs">
                      {new Date(m.created_at).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}{' '}
                      {new Date(m.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="py-4 px-6 font-bold text-slate-900 dark:text-white">{m.product_name}</td>
                    <td className="py-4 px-6">
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        {m.movement_type ? m.movement_type.replace(/_/g, ' ') : '—'}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-slate-700 dark:text-slate-300 font-mono text-xs">
                      {m.reference_id}
                    </td>
                    <td className="py-4 px-6 text-center">
                      {getMovementBadge(m.movement_type, m.quantity)}
                    </td>
                    <td className="py-4 px-6 text-right text-slate-600 dark:text-slate-300 text-xs">
                      {formatCurrency(m.unit_cost, currency)}
                    </td>
                    <td className="py-4 px-6 text-slate-400 dark:text-slate-500 text-xs">{m.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
