import React, { useState, useEffect, useMemo } from 'react';
import { Product, BusinessSettings, Supplier } from '../../types';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { api } from '../../services/api';
import { enqueueRestockDelta } from '../../services/offlineQueue';
import { formatCurrency } from '../../utils/format';
import {
  AlertCircle,
  Truck,
  Sliders,
  Building2,
  Zap,
  Package,
  Plus,
  Check
} from 'lucide-react';

export interface OutOfStockRestockModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  settings: BusinessSettings | null;
  onRestocked: (updatedProduct: Product, addToCartQuantity: number) => void;
}

export const OutOfStockRestockModal: React.FC<OutOfStockRestockModalProps> = ({
  isOpen,
  onClose,
  product,
  settings,
  onRestocked,
}) => {
  const [mode, setMode] = useState<'restock' | 'count'>('restock');

  // Mode A: Add New Stock (Vendor intake)
  const [quantityToAdd, setQuantityToAdd] = useState<number>(5);
  const [unitCost, setUnitCost] = useState<number>(0);
  const [sellingPrice, setSellingPrice] = useState<number>(0);
  const [isNoSupplier, setIsNoSupplier] = useState<boolean>(true);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierInput, setSupplierInput] = useState<string>('');
  const [showSupplierDropdown, setShowSupplierDropdown] = useState<boolean>(false);

  // Mode B: Update Shelf Count (Physical audit)
  const [physicalCount, setPhysicalCount] = useState<number>(1);
  const [countReason, setCountReason] = useState<string>('Physical count correction at checkout');

  // POS integration toggle
  const [autoAddToCart, setAutoAddToCart] = useState<boolean>(true);

  // Status
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const currency = settings?.currency || 'Rs.';

  // Initialize form state when a new product is selected
  useEffect(() => {
    if (product) {
      setMode('restock');
      setQuantityToAdd(5);
      setUnitCost(Number(product.purchase_price) || 0);
      setSellingPrice(Number(product.selling_price) || 0);
      setIsNoSupplier(true);
      setSupplierInput('');
      setShowSupplierDropdown(false);

      setPhysicalCount(1);
      setCountReason('Physical count correction at checkout');
      setAutoAddToCart(true);
      setErrorMsg(null);
    }
  }, [product, isOpen]);

  // Load suppliers list silently
  useEffect(() => {
    if (isOpen) {
      api.getSuppliers({ is_active: true })
        .then((list) => {
          setSuppliers(list || []);
        })
        .catch(() => {
          setSuppliers([]);
        });
    }
  }, [isOpen]);

  const filteredSuppliers = useMemo(() => {
    if (!supplierInput.trim()) return suppliers;
    return suppliers.filter((s) =>
      s.name.toLowerCase().includes(supplierInput.toLowerCase().trim())
    );
  }, [suppliers, supplierInput]);

  const currentStock = Number(product?.current_stock || 0);
  const projectedRestockTotal = currentStock + Number(quantityToAdd || 0);
  const netCountAdjustment = Number(physicalCount || 0) - currentStock;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (mode === 'restock') {
      const addQty = Number(quantityToAdd);
      if (addQty <= 0) {
        setErrorMsg('Please enter a quantity greater than 0 to restock.');
        return;
      }

      setLoading(true);
      try {
        let updatedProd: Product = { ...product };

        // Attempt online purchase record first
        try {
          let targetSupplierId: number | undefined = undefined;
          if (!isNoSupplier && supplierInput.trim()) {
            const matched = suppliers.find(
              (s) => s.name.toLowerCase() === supplierInput.trim().toLowerCase()
            );
            if (matched) {
              targetSupplierId = matched.id;
            } else {
              const newSupp = await api.createSupplier({ name: supplierInput.trim() });
              targetSupplierId = newSupp.id;
            }
          }

          const totalLineCost = addQty * Number(unitCost || 0);
          await api.createPurchase({
            supplier_id: targetSupplierId,
            items: [
              {
                product_id: product.id,
                quantity: addQty,
                unit_cost: Number(unitCost) || 0,
                selling_price: Number(sellingPrice) || Number(product.selling_price),
              },
            ],
            discount_amount: 0,
            tax_amount: 0,
            paid_amount: totalLineCost,
            notes: 'Restocked directly from sales counter',
          });

          updatedProd = {
            ...product,
            current_stock: currentStock + addQty,
            purchase_price: Number(unitCost) || product.purchase_price,
            selling_price: Number(sellingPrice) || product.selling_price,
          };
        } catch (apiErr: any) {
          // If offline or network unavailable, fall back to offline queue
          const isOfflineErr =
            !navigator.onLine ||
            apiErr.message?.includes('Failed to fetch') ||
            apiErr.message?.includes('NetworkError') ||
            apiErr.message?.includes('Host unreachable') ||
            apiErr.message?.includes('Could not reach');

          if (isOfflineErr) {
            enqueueRestockDelta(
              product.id,
              addQty,
              Number(unitCost) || product.purchase_price,
              product.barcode,
              product.name
            );

            updatedProd = {
              ...product,
              current_stock: currentStock + addQty,
              purchase_price: Number(unitCost) || product.purchase_price,
              selling_price: Number(sellingPrice) || product.selling_price,
            };
          } else {
            throw apiErr;
          }
        }

        const autoAddQty = autoAddToCart ? 1 : 0;
        onRestocked(updatedProd, autoAddQty);
        onClose();
      } catch (err: any) {
        setErrorMsg(err.detail || err.message || 'Failed to restock item.');
      } finally {
        setLoading(false);
      }
    } else {
      // Mode B: Update Shelf Count
      const newStockVal = Number(physicalCount);
      if (newStockVal < 0) {
        setErrorMsg('Stock count cannot be negative.');
        return;
      }

      setLoading(true);
      try {
        let updatedProd: Product = { ...product };

        try {
          const res = await api.adjustProductStock(product.id, {
            new_stock: newStockVal,
            reason: countReason.trim() || 'Physical inventory audit at sales counter',
          });
          updatedProd = res;
        } catch (apiErr: any) {
          const isOfflineErr =
            !navigator.onLine ||
            apiErr.message?.includes('Failed to fetch') ||
            apiErr.message?.includes('NetworkError') ||
            apiErr.message?.includes('Host unreachable') ||
            apiErr.message?.includes('Could not reach');

          if (isOfflineErr) {
            enqueueRestockDelta(
              product.id,
              netCountAdjustment,
              product.purchase_price,
              product.barcode,
              product.name
            );

            updatedProd = {
              ...product,
              current_stock: newStockVal,
            };
          } else {
            throw apiErr;
          }
        }

        const autoAddQty = autoAddToCart && newStockVal > 0 ? 1 : 0;
        onRestocked(updatedProd, autoAddQty);
        onClose();
      } catch (err: any) {
        setErrorMsg(err.detail || err.message || 'Failed to update stock count.');
      } finally {
        setLoading(false);
      }
    }
  };

  if (!isOpen || !product) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Out of Stock Notice"
      subtitle="Replenish stock or update the physical shelf count right now."
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {errorMsg && (
          <div className="flex items-center gap-2 p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-400 text-xs font-semibold">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Depleted Stock Banner */}
        <div className="p-4 rounded-2xl bg-rose-50/80 dark:bg-rose-950/30 border border-rose-200/80 dark:border-rose-900/50 flex items-start gap-3.5">
          <div className="h-10 w-10 rounded-xl bg-rose-100 dark:bg-rose-900/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 shadow-2xs">
            <Package className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-extrabold text-sm text-slate-900 dark:text-white truncate">
                {product.name}
              </h4>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 shrink-0">
                0 in stock
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-2">
              <span>ID: {product.product_id}</span>
              {product.barcode && <span>• Barcode: {product.barcode}</span>}
              <span>• Price: {formatCurrency(product.selling_price, currency)}</span>
            </p>
          </div>
        </div>

        {/* Mode Selector Tabs */}
        <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-2xl border border-slate-200/60 dark:border-slate-700/60">
          <button
            type="button"
            onClick={() => setMode('restock')}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
              mode === 'restock'
                ? 'bg-white dark:bg-slate-900 text-brand-700 dark:text-brand-300 shadow-2xs font-extrabold ring-1 ring-black/5 dark:ring-white/10'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Truck className="h-3.5 w-3.5" />
            <span>Add New Stock</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('count')}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
              mode === 'count'
                ? 'bg-white dark:bg-slate-900 text-brand-700 dark:text-brand-300 shadow-2xs font-extrabold ring-1 ring-black/5 dark:ring-white/10'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Sliders className="h-3.5 w-3.5" />
            <span>Update Shelf Count</span>
          </button>
        </div>

        {/* MODE A: ADD NEW STOCK */}
        {mode === 'restock' && (
          <div className="space-y-3.5">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Quantity to Add *
                </label>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  New Total: <strong className="text-brand-700 dark:text-brand-400">{projectedRestockTotal} units</strong>
                </span>
              </div>
              <Input
                type="number"
                min="1"
                step="1"
                value={quantityToAdd}
                onChange={(e) => setQuantityToAdd(Math.max(1, Number(e.target.value)))}
                required
                autoFocus
                placeholder="e.g. 5"
              />
              {/* Quick Quantity Chips */}
              <div className="flex items-center gap-1.5 mt-2">
                <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 mr-1">Quick:</span>
                {[1, 5, 10, 20, 50].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setQuantityToAdd(num)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition border ${
                      quantityToAdd === num
                        ? 'bg-brand-50 dark:bg-brand-950 border-brand-300 dark:border-brand-700 text-brand-700 dark:text-brand-300'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    +{num}
                  </button>
                ))}
              </div>
            </div>

            {/* Price Fields */}
            <div className="grid grid-cols-2 gap-3">
              <Input
                label={`Cost Price (${currency})`}
                type="number"
                min="0"
                step="any"
                value={unitCost}
                onChange={(e) => setUnitCost(Number(e.target.value))}
                placeholder="0.00"
              />
              <Input
                label={`Selling Price (${currency})`}
                type="number"
                min="0"
                step="any"
                value={sellingPrice}
                onChange={(e) => setSellingPrice(Number(e.target.value))}
                placeholder="0.00"
              />
            </div>

            {/* Supplier / Receiving Channel */}
            <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-200/70 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700 dark:text-slate-300">Supplier / Source:</span>
                <div className="inline-flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setIsNoSupplier(true)}
                    className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                      isNoSupplier
                        ? 'bg-brand-100 dark:bg-brand-950 text-brand-800 dark:text-brand-300 border border-brand-200 dark:border-brand-800'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    Direct Cash
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsNoSupplier(false)}
                    className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                      !isNoSupplier
                        ? 'bg-brand-100 dark:bg-brand-950 text-brand-800 dark:text-brand-300 border border-brand-200 dark:border-brand-800'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    With Supplier
                  </button>
                </div>
              </div>

              {!isNoSupplier && (
                <div className="relative pt-1">
                  <Input
                    placeholder="Type or select supplier name..."
                    value={supplierInput}
                    onChange={(e) => {
                      setSupplierInput(e.target.value);
                      setShowSupplierDropdown(true);
                    }}
                    onFocus={() => setShowSupplierDropdown(true)}
                  />
                  {showSupplierDropdown && filteredSuppliers.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 max-h-36 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg z-20 divide-y divide-slate-100 dark:divide-slate-700">
                      {filteredSuppliers.map((supp) => (
                        <button
                          key={supp.id}
                          type="button"
                          onClick={() => {
                            setSupplierInput(supp.name);
                            setShowSupplierDropdown(false);
                          }}
                          className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/60"
                        >
                          {supp.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* MODE B: UPDATE SHELF COUNT */}
        {mode === 'count' && (
          <div className="space-y-3.5">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Actual Physical Count Found *
                </label>
                <span className="text-xs font-semibold">
                  Adjustment:{' '}
                  <strong
                    className={
                      netCountAdjustment > 0
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : netCountAdjustment < 0
                        ? 'text-rose-700 dark:text-rose-400'
                        : 'text-slate-500'
                    }
                  >
                    {netCountAdjustment > 0
                      ? `+${netCountAdjustment} (Add)`
                      : `${netCountAdjustment} (Deduct)`}
                  </strong>
                </span>
              </div>
              <Input
                type="number"
                min="0"
                step="1"
                value={physicalCount}
                onChange={(e) => setPhysicalCount(Math.max(0, Number(e.target.value)))}
                required
                autoFocus
                placeholder="e.g. 5"
              />
              {/* Quick Count Chips */}
              <div className="flex items-center gap-1.5 mt-2">
                <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 mr-1">Set to:</span>
                {[1, 5, 10, 20, 50].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setPhysicalCount(num)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition border ${
                      physicalCount === num
                        ? 'bg-brand-50 dark:bg-brand-950 border-brand-300 dark:border-brand-700 text-brand-700 dark:text-brand-300'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>

            <Input
              label="Reason for Count Update"
              value={countReason}
              onChange={(e) => setCountReason(e.target.value)}
              placeholder="e.g. Physical count correction at checkout"
            />
          </div>
        )}

        {/* Seamless POS Add-to-Cart Option */}
        <div className="p-3 bg-brand-50/60 dark:bg-brand-950/30 rounded-2xl border border-brand-200/60 dark:border-brand-900/40 flex items-center justify-between">
          <label className="flex items-center gap-2.5 cursor-pointer text-xs font-bold text-slate-800 dark:text-slate-200 select-none">
            <input
              type="checkbox"
              checked={autoAddToCart}
              onChange={(e) => setAutoAddToCart(e.target.checked)}
              className="h-4 w-4 rounded text-brand-600 focus:ring-brand-500 dark:bg-slate-800 dark:border-slate-700 cursor-pointer"
            />
            <span>Put 1 item in the current sale right now</span>
          </label>
          <span className="text-[11px] font-semibold text-brand-700 dark:text-brand-300">
            {autoAddToCart ? 'Ready for checkout' : 'Restock only'}
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={loading}
            className="font-bold px-5"
          >
            {autoAddToCart ? 'Restock & Add to Sale' : 'Save New Stock'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
