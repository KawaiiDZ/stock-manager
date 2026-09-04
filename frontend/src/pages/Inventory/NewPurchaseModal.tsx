import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { Product, Supplier, BusinessSettings } from '../../types';
import { Modal } from '../../components/common/Modal';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { AlertCircle, Trash2, Lock, Plus, ChevronDown, ShieldCheck, ArrowRight, ArrowLeft } from 'lucide-react';
import { formatCurrency } from '../../utils/format';

export interface NewPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  settings: BusinessSettings | null;
  onPurchaseCreated: () => void;
  lockedProduct?: Product | null;
}

interface PurchaseItemDraft {
  product_id: number;
  quantity: number;
  unit_cost: number;
}

export const NewPurchaseModal: React.FC<NewPurchaseModalProps> = ({
  isOpen,
  onClose,
  products,
  settings,
  onPurchaseCreated,
  lockedProduct,
}) => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierInput, setSupplierInput] = useState('');
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [itemsDraft, setItemsDraft] = useState<PurchaseItemDraft[]>([]);
  const [discount, setDiscount] = useState<number>(0);
  const [tax, setTax] = useState<number>(0);
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);

  const currency = settings?.currency || 'Rs.';

  useEffect(() => {
    if (isOpen) {
      setShowConfirm(false);
      setLoadingSuppliers(true);
      api.getSuppliers({ is_active: true })
        .then((supps) => {
          const list = supps || [];
          setSuppliers(list);
          if (list.length > 0) {
            setSupplierInput(list[0].name);
          } else {
            setSupplierInput('');
          }
        })
        .catch((err) => {
          console.error('Failed to load suppliers:', err);
        })
        .finally(() => {
          setLoadingSuppliers(false);
        });

      setShowSupplierDropdown(false);

      if (lockedProduct) {
        setItemsDraft([
          {
            product_id: lockedProduct.id,
            quantity: 1,
            unit_cost: lockedProduct.purchase_price || 0,
          },
        ]);
      } else if (products.length > 0) {
        setItemsDraft([
          {
            product_id: products[0].id,
            quantity: 10,
            unit_cost: products[0].purchase_price || 0,
          },
        ]);
      } else {
        setItemsDraft([]);
      }

      setDiscount(0);
      setTax(0);
      setPaidAmount(0);
      setNotes('');
      setModalError(null);
    }
  }, [isOpen, lockedProduct, products]);

  const handleAddItem = () => {
    if (products.length > 0) {
      setItemsDraft([
        ...itemsDraft,
        {
          product_id: products[0].id,
          quantity: 1,
          unit_cost: products[0].purchase_price || 0,
        },
      ]);
    }
  };

  const handleRemoveItem = (index: number) => {
    if (itemsDraft.length <= 1) return;
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

  const subtotal = itemsDraft.reduce(
    (sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unit_cost) || 0),
    0
  );
  const totalAmount = Math.max(0, subtotal - (Number(discount) || 0) + (Number(tax) || 0));

  const filteredSuppliers = suppliers.filter((s) => {
    if (!supplierInput.trim()) return true;
    const q = supplierInput.toLowerCase();
    return s.name.toLowerCase().includes(q) || (s.phone && s.phone.includes(q));
  });

  const handleProceedToReview = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedSupplier = supplierInput.trim();
    if (!trimmedSupplier) {
      setModalError('Please enter or select a supplier name.');
      return;
    }
    if (itemsDraft.length === 0) {
      setModalError('Please enter at least one product item.');
      return;
    }
    const hasInvalidQty = itemsDraft.some((it) => !it.quantity || Number(it.quantity) <= 0);
    if (hasInvalidQty) {
      setModalError('All items must have a quantity greater than 0.');
      return;
    }
    const hasNegativeCost = itemsDraft.some((it) => Number(it.unit_cost) < 0);
    if (hasNegativeCost) {
      setModalError('Unit cost cannot be negative.');
      return;
    }

    setModalError(null);
    setShowConfirm(true);
  };

  const handleConfirmSavePurchase = async () => {
    const trimmedSupplier = supplierInput.trim();
    setSaving(true);
    setModalError(null);
    try {
      // Find existing supplier or create new one on the fly
      let targetSupplierId: number;
      const matched = suppliers.find(
        (s) => s.name.toLowerCase() === trimmedSupplier.toLowerCase()
      );

      if (matched) {
        targetSupplierId = matched.id;
      } else {
        const newSupplier = await api.createSupplier({ name: trimmedSupplier });
        targetSupplierId = newSupplier.id;
      }

      await api.createPurchase({
        supplier_id: targetSupplierId,
        items: itemsDraft.map((it) => ({
          product_id: it.product_id,
          quantity: Number(it.quantity),
          unit_cost: Number(it.unit_cost) || 0,
        })),
        discount_amount: Number(discount) || 0,
        tax_amount: Number(tax) || 0,
        paid_amount: Number(paidAmount) || 0,
        notes: notes.trim() || undefined,
      });

      onPurchaseCreated();
      onClose();
    } catch (err: any) {
      setModalError(err.detail || 'Failed to save purchase and update stock.');
    } finally {
      setSaving(false);
    }
  };

  if (showConfirm) {
    return (
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Review & Confirm Stock Changes"
        subtitle="Please verify incoming stock quantities, unit costs, and supplier details before updating inventory."
        maxWidth="lg"
      >
        <div className="space-y-5">
          {modalError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{modalError}</span>
            </div>
          )}

          {/* Review Notice Card */}
          <div className="p-4 bg-emerald-50/60 border border-emerald-200/80 rounded-2xl flex items-start gap-3">
            <div className="p-2 bg-emerald-100 text-emerald-800 rounded-xl shrink-0 mt-0.5">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="text-xs">
              <h4 className="font-bold text-emerald-950">Review Before Confirmation</h4>
              <p className="text-emerald-800/90 mt-0.5 leading-relaxed">
                Confirming will add inventory stock, create FIFO cost tracking batches, and record supplier ledger balances.
              </p>
            </div>
          </div>

          {/* Supplier & Details Info */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-semibold">Target Supplier:</span>
              <span className="font-black text-slate-900 text-sm">{supplierInput.trim()}</span>
            </div>
            {notes.trim() && (
              <div className="flex items-center justify-between border-t border-slate-200/60 pt-2">
                <span className="text-slate-500 font-semibold">Notes:</span>
                <span className="font-medium text-slate-700">{notes.trim()}</span>
              </div>
            )}
          </div>

          {/* Stock Changes Breakdown */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Inventory Stock Changes ({itemsDraft.length} {itemsDraft.length === 1 ? 'Product' : 'Products'})
              </span>
            </div>

            <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-2xs divide-y divide-slate-100 max-h-60 overflow-y-auto">
              {itemsDraft.map((item, idx) => {
                const prod = products.find((p) => p.id === item.product_id) || lockedProduct;
                const currentStock = prod ? Number(prod.current_stock) : 0;
                const addedStock = Number(item.quantity);
                const projectedStock = currentStock + addedStock;
                const lineCost = addedStock * Number(item.unit_cost);

                return (
                  <div key={idx} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="space-y-0.5">
                      <div className="font-bold text-slate-900 text-sm">{prod?.name || `Product #${item.product_id}`}</div>
                      <div className="text-slate-500 font-medium">
                        Unit Cost: <strong className="text-slate-700">{formatCurrency(item.unit_cost, currency)}</strong> • Line Total: <strong className="text-slate-800">{formatCurrency(lineCost, currency)}</strong>
                      </div>
                    </div>

                    {/* Stock Progression Indicator */}
                    <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 shrink-0">
                      <div className="text-center">
                        <div className="text-[10px] text-slate-400 uppercase font-semibold">Current</div>
                        <div className="font-bold text-slate-700">{currentStock}</div>
                      </div>

                      <div className="flex items-center text-emerald-600 font-black text-xs px-1">
                        +{addedStock}
                      </div>

                      <ArrowRight className="h-3.5 w-3.5 text-slate-400" />

                      <div className="text-center pl-1">
                        <div className="text-[10px] text-emerald-700 uppercase font-bold">New Stock</div>
                        <div className="font-black text-emerald-700">{projectedStock}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Financials Summary */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal:</span>
              <span className="font-bold text-slate-800">{formatCurrency(subtotal, currency)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-amber-700">
                <span>Discount:</span>
                <span className="font-bold">-{formatCurrency(discount, currency)}</span>
              </div>
            )}
            {tax > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>Tax:</span>
                <span className="font-bold">+{formatCurrency(tax, currency)}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-900 font-black border-t border-slate-200 pt-2 text-sm">
              <span>Total Payable:</span>
              <span className="text-emerald-800">{formatCurrency(totalAmount, currency)}</span>
            </div>
            <div className="flex justify-between text-slate-700 font-semibold">
              <span>Amount Paid Now:</span>
              <span className="font-bold">{formatCurrency(paidAmount, currency)}</span>
            </div>
            <div className="flex justify-between text-rose-700 font-bold border-t border-slate-200/60 pt-1">
              <span>Remaining Supplier Due:</span>
              <span>{formatCurrency(Math.max(0, totalAmount - paidAmount), currency)}</span>
            </div>
          </div>

          {/* Confirmation Action Buttons */}
          <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-100">
            <Button
              type="button"
              variant="secondary"
              icon={<ArrowLeft className="h-4 w-4" />}
              onClick={() => setShowConfirm(false)}
              disabled={saving}
            >
              Back to Edit
            </Button>
            <Button
              type="button"
              variant="primary"
              loading={saving}
              onClick={handleConfirmSavePurchase}
              className="font-bold px-6 shadow-md shadow-emerald-600/20"
            >
              Confirm & Update Stock
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={lockedProduct ? `Update Stock — ${lockedProduct.name}` : 'Update Stock / New Purchase'}
      subtitle={
        lockedProduct
          ? `Record incoming inventory for ${lockedProduct.name}. Automatically updates stock and creates FIFO cost batches.`
          : 'Receiving products adds inventory stock and creates accurate FIFO cost batches.'
      }
      maxWidth="lg"
    >
      <form onSubmit={handleProceedToReview} className="space-y-5">
        {modalError && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{modalError}</span>
          </div>
        )}

        {/* Supplier Combobox (Type any name or select from list) */}
        <div className="relative">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
            Supplier *
          </label>
          <div className="relative">
            <input
              type="text"
              value={supplierInput}
              onChange={(e) => {
                setSupplierInput(e.target.value);
                setShowSupplierDropdown(true);
              }}
              onFocus={() => setShowSupplierDropdown(true)}
              onBlur={() => {
                setTimeout(() => setShowSupplierDropdown(false), 250);
              }}
              placeholder="Type any supplier name or select from list..."
              className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-800 focus:outline-none transition shadow-2xs pr-10"
              required
            />
            <button
              type="button"
              onClick={() => setShowSupplierDropdown((prev) => !prev)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1 rounded-md transition"
              tabIndex={-1}
            >
              <ChevronDown
                className={`h-4 w-4 transition-transform ${
                  showSupplierDropdown ? 'rotate-180' : ''
                }`}
              />
            </button>
          </div>

          {/* Dropdown Suggestions List */}
          {showSupplierDropdown && (
            <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl max-h-56 overflow-y-auto z-50 py-1.5 divide-y divide-slate-100">
              {filteredSuppliers.length > 0 ? (
                filteredSuppliers.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onMouseDown={() => {
                      setSupplierInput(s.name);
                      setShowSupplierDropdown(false);
                    }}
                    className="w-full text-left px-4 py-2.5 hover:bg-emerald-50/70 flex items-center justify-between text-xs transition"
                  >
                    <span className="font-bold text-slate-800">{s.name}</span>
                    {s.phone && (
                      <span className="text-slate-400 font-mono text-[11px]">{s.phone}</span>
                    )}
                  </button>
                ))
              ) : (
                <div className="px-4 py-2.5 text-xs text-slate-400 italic">
                  No matching existing suppliers
                </div>
              )}

              {/* Quick option to add as new supplier if not an exact match */}
              {supplierInput.trim() &&
                !suppliers.some(
                  (s) => s.name.toLowerCase() === supplierInput.trim().toLowerCase()
                ) && (
                  <button
                    type="button"
                    onMouseDown={() => {
                      setShowSupplierDropdown(false);
                    }}
                    className="w-full text-left px-4 py-2.5 bg-emerald-50/60 hover:bg-emerald-100/70 text-xs text-emerald-800 font-bold flex items-center gap-1.5 transition"
                  >
                    <Plus className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Use new supplier: "{supplierInput.trim()}"</span>
                  </button>
                )}
            </div>
          )}
        </div>

        {/* Line items */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              {lockedProduct ? 'Product to Receive' : 'Products to Receive'}
            </span>
            {!lockedProduct && (
              <button
                type="button"
                onClick={handleAddItem}
                className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:text-emerald-800 hover:underline"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Another Product</span>
              </button>
            )}
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {itemsDraft.map((item, idx) => (
              <div
                key={idx}
                className="grid grid-cols-12 gap-2 items-center p-3 rounded-xl bg-slate-50 border border-slate-200/80 shadow-2xs"
              >
                {/* Product Column */}
                {lockedProduct ? (
                  <div className="col-span-6 flex items-center justify-between bg-slate-100/90 border border-slate-200 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2 truncate">
                      <Lock className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                      <span className="text-xs font-bold text-slate-900 truncate">
                        {lockedProduct.name}
                      </span>
                    </div>
                    <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-emerald-100/80 text-emerald-800 shrink-0 border border-emerald-200/60">
                      Stock: {lockedProduct.current_stock}
                    </span>
                  </div>
                ) : (
                  <div className="col-span-6">
                    <select
                      value={item.product_id}
                      onChange={(e) => updateItem(idx, 'product_id', Number(e.target.value))}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-emerald-500"
                    >
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} (Stock: {p.current_stock})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Qty Column */}
                <div className={lockedProduct ? 'col-span-3' : 'col-span-2'}>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-0.5">
                    Qty *
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder="Qty"
                    value={item.quantity}
                    onChange={(e) => updateItem(idx, 'quantity', Number(e.target.value))}
                    className="w-full text-center bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-500"
                    title="Quantity"
                    required
                  />
                </div>

                {/* Unit Cost Column */}
                <div className={lockedProduct ? 'col-span-3' : 'col-span-3'}>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-0.5 text-right">
                    Cost ({currency}) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Unit Cost"
                    value={item.unit_cost}
                    onChange={(e) => updateItem(idx, 'unit_cost', Number(e.target.value))}
                    className="w-full text-right bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-500"
                    title="Unit Cost"
                    required
                  />
                </div>

                {/* Remove item button (only when unlocked and > 1 item) */}
                {!lockedProduct && (
                  <div className="col-span-1 text-center pt-3">
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(idx)}
                      disabled={itemsDraft.length === 1}
                      className="text-slate-400 hover:text-rose-600 disabled:opacity-20 p-1 transition"
                      title="Remove product"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
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
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-1.5 text-sm">
              <div className="flex justify-between text-slate-600 text-xs">
                <span>Subtotal:</span>
                <span className="font-bold text-slate-800">
                  {formatCurrency(subtotal, currency)}
                </span>
              </div>
              <div className="flex justify-between text-slate-800 font-bold border-t border-slate-200 pt-2 text-sm">
                <span>Total Payable:</span>
                <span className="text-emerald-800 font-black">
                  {formatCurrency(totalAmount, currency)}
                </span>
              </div>
              <div className="flex justify-between text-xs text-rose-700 font-semibold pt-0.5">
                <span>Supplier Due:</span>
                <span>{formatCurrency(Math.max(0, totalAmount - paidAmount), currency)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={!supplierInput.trim() || itemsDraft.length === 0}
            className="font-bold px-5"
          >
            Review & Save Stock
          </Button>
        </div>
      </form>
    </Modal>
  );
};
