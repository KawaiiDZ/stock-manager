import React, { useState, useEffect, useMemo, useRef } from 'react';
import { api } from '../../services/api';
import { Product, Supplier, BusinessSettings } from '../../types';
import { Modal } from '../../components/common/Modal';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import {
  AlertCircle,
  Trash2,
  Lock,
  Plus,
  ChevronDown,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  Search,
  Building2,
  Zap,
  Check,
  Package,
  DollarSign,
  TrendingUp,
  X
} from 'lucide-react';
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
  selling_price: number;
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
  const [isNoSupplier, setIsNoSupplier] = useState(false);

  const [showConfirm, setShowConfirm] = useState(false);
  const [itemsDraft, setItemsDraft] = useState<PurchaseItemDraft[]>([]);
  const [discount, setDiscount] = useState<number>(0);
  const [tax, setTax] = useState<number>(0);
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);

  // Active searching state for each row
  const [activeSearchIndex, setActiveSearchIndex] = useState<number | null>(null);
  const [rowSearchQuery, setRowSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const currency = settings?.currency || 'Rs.';
  const showSku = settings?.show_sku !== false;
  const showBarcode = settings?.show_barcode !== false;

  useEffect(() => {
    if (isOpen) {
      setShowConfirm(false);
      setIsNoSupplier(false);
      setLoadingSuppliers(true);
      setActiveSearchIndex(null);
      setRowSearchQuery('');

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
            unit_cost: Number(lockedProduct.purchase_price) || 0,
            selling_price: Number(lockedProduct.selling_price) || 0,
          },
        ]);
      } else if (products.length > 0) {
        setItemsDraft([
          {
            product_id: products[0].id,
            quantity: 1,
            unit_cost: Number(products[0].purchase_price) || 0,
            selling_price: Number(products[0].selling_price) || 0,
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

  // Subtotal & Totals
  const subtotal = useMemo(() => {
    return itemsDraft.reduce(
      (sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unit_cost) || 0),
      0
    );
  }, [itemsDraft]);

  const totalAmount = useMemo(() => {
    return Math.max(0, subtotal - (Number(discount) || 0) + (Number(tax) || 0));
  }, [subtotal, discount, tax]);

  // If No Supplier is selected, amount paid MUST equal totalAmount (full payment required)
  useEffect(() => {
    if (isNoSupplier) {
      setPaidAmount(totalAmount);
    }
  }, [isNoSupplier, totalAmount]);

  const handleAddItem = () => {
    if (products.length > 0) {
      const nextProd = products.find((p) => !itemsDraft.some((it) => it.product_id === p.id)) || products[0];
      setItemsDraft([
        ...itemsDraft,
        {
          product_id: nextProd.id,
          quantity: 1,
          unit_cost: Number(nextProd.purchase_price) || 0,
          selling_price: Number(nextProd.selling_price) || 0,
        },
      ]);
    }
  };

  const handleRemoveItem = (index: number) => {
    if (itemsDraft.length <= 1) return;
    setItemsDraft(itemsDraft.filter((_, i) => i !== index));
    if (activeSearchIndex === index) {
      setActiveSearchIndex(null);
    }
  };

  const updateItem = (index: number, field: keyof PurchaseItemDraft, value: number) => {
    setItemsDraft(
      itemsDraft.map((it, i) => {
        if (i === index) {
          const updated = { ...it, [field]: value };
          if (field === 'product_id') {
            const p = products.find((prod) => prod.id === value);
            if (p) {
              updated.unit_cost = Number(p.purchase_price) || 0;
              updated.selling_price = Number(p.selling_price) || 0;
            }
          }
          return updated;
        }
        return it;
      })
    );
  };

  const handleSelectProduct = (index: number, product: Product) => {
    setItemsDraft(
      itemsDraft.map((it, i) => {
        if (i === index) {
          return {
            ...it,
            product_id: product.id,
            unit_cost: Number(product.purchase_price) || 0,
            selling_price: Number(product.selling_price) || 0,
          };
        }
        return it;
      })
    );
    setActiveSearchIndex(null);
    setRowSearchQuery('');
  };

  // Filtered suppliers
  const filteredSuppliers = useMemo(() => {
    if (!supplierInput.trim()) return suppliers;
    const q = supplierInput.toLowerCase();
    return suppliers.filter((s) => s.name.toLowerCase().includes(q) || (s.phone && s.phone.includes(q)));
  }, [suppliers, supplierInput]);

  // Filtered products for row search
  const filteredProducts = useMemo(() => {
    if (!rowSearchQuery.trim()) return products.slice(0, 30);
    const q = rowSearchQuery.toLowerCase();
    return products
      .filter((p) => {
        const nameMatch = p.name.toLowerCase().includes(q);
        const barcodeMatch = showBarcode && p.barcode ? p.barcode.toLowerCase().includes(q) : false;
        const skuMatch = showSku && p.sku ? p.sku.toLowerCase().includes(q) : false;
        const catMatch = p.category_name ? p.category_name.toLowerCase().includes(q) : false;
        return nameMatch || barcodeMatch || skuMatch || catMatch;
      })
      .slice(0, 30);
  }, [products, rowSearchQuery, showBarcode, showSku]);

  const handleProceedToReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isNoSupplier) {
      const trimmedSupplier = supplierInput.trim();
      if (!trimmedSupplier) {
        setModalError('Please enter or select a supplier name, or choose "No Supplier (Direct Cash)".');
        return;
      }
    }

    if (itemsDraft.length === 0) {
      setModalError('Please enter at least one product to receive.');
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

    const hasNegativeSellingPrice = itemsDraft.some((it) => Number(it.selling_price) < 0);
    if (hasNegativeSellingPrice) {
      setModalError('Selling price cannot be negative.');
      return;
    }

    if (isNoSupplier && Number(paidAmount) < totalAmount) {
      setModalError('Direct stock updates without a supplier cannot have unpaid credit. Full payment is required.');
      return;
    }

    setModalError(null);
    setShowConfirm(true);
  };

  const handleConfirmSavePurchase = async () => {
    setSaving(true);
    setModalError(null);
    try {
      let targetSupplierId: number | undefined = undefined;

      if (!isNoSupplier) {
        const trimmedSupplier = supplierInput.trim();
        const matched = suppliers.find(
          (s) => s.name.toLowerCase() === trimmedSupplier.toLowerCase()
        );

        if (matched) {
          targetSupplierId = matched.id;
        } else {
          const newSupplier = await api.createSupplier({ name: trimmedSupplier });
          targetSupplierId = newSupplier.id;
        }
      }

      await api.createPurchase({
        supplier_id: targetSupplierId,
        items: itemsDraft.map((it) => ({
          product_id: it.product_id,
          quantity: Number(it.quantity),
          unit_cost: Number(it.unit_cost) || 0,
          selling_price: Number(it.selling_price) || 0,
        })),
        discount_amount: Number(discount) || 0,
        tax_amount: Number(tax) || 0,
        paid_amount: isNoSupplier ? totalAmount : (Number(paidAmount) || 0),
        notes: notes.trim() || undefined,
      });

      onPurchaseCreated();
      onClose();
    } catch (err: any) {
      setModalError(err.detail || 'Failed to save stock update.');
    } finally {
      setSaving(false);
    }
  };

  // -------------------------------------------------------------
  // CONFIRMATION SCREEN
  // -------------------------------------------------------------
  if (showConfirm) {
    return (
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Review & Confirm Stock Changes"
        subtitle="Verify incoming quantities, cost and retail price updates before committing to inventory."
        maxWidth="2xl"
      >
        <div className="space-y-5">
          {modalError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{modalError}</span>
            </div>
          )}

          {/* Supplier / Channel Info */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Receiving Channel
              </span>
              <span className="font-extrabold text-slate-900 text-sm flex items-center gap-2 mt-0.5">
                {isNoSupplier ? (
                  <span className="inline-flex items-center gap-1.5 text-emerald-800 bg-emerald-100/80 px-2.5 py-1 rounded-lg text-xs font-bold border border-emerald-200">
                    <Zap className="h-3.5 w-3.5 text-emerald-600" />
                    No Supplier (Direct Cash Purchase)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-slate-800">
                    <Building2 className="h-4 w-4 text-slate-500" />
                    {supplierInput.trim()}
                  </span>
                )}
              </span>
            </div>

            <div className="text-right text-xs">
              <span className="text-slate-400 font-medium block">Total Items</span>
              <span className="font-bold text-slate-800">{itemsDraft.length} {itemsDraft.length === 1 ? 'Product' : 'Products'}</span>
            </div>
          </div>

          {/* Stock & Price Changes Breakdown */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
              Stock & Master Price Updates
            </span>

            <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-2xs divide-y divide-slate-100 max-h-72 overflow-y-auto">
              {itemsDraft.map((item, idx) => {
                const prod = products.find((p) => p.id === item.product_id) || lockedProduct;
                const currentStock = prod ? Number(prod.current_stock) : 0;
                const addedStock = Number(item.quantity);
                const projectedStock = currentStock + addedStock;

                const oldCost = prod ? Number(prod.purchase_price) : 0;
                const newCost = Number(item.unit_cost);
                const isCostChanged = oldCost !== newCost;

                const oldSell = prod ? Number(prod.selling_price) : 0;
                const newSell = Number(item.selling_price);
                const isSellChanged = oldSell !== newSell;

                const lineCost = addedStock * newCost;

                return (
                  <div key={idx} className="p-3.5 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-extrabold text-slate-900 text-sm">
                          {prod?.name || `Product #${item.product_id}`}
                        </span>
                        {prod?.category_name && (
                          <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                            {prod.category_name}
                          </span>
                        )}
                      </div>

                      {/* Stock Progression Indicator */}
                      <div className="flex items-center gap-2 bg-slate-50 px-2.5 py-1 rounded-xl border border-slate-200 shrink-0">
                        <div className="text-center">
                          <div className="text-[9px] text-slate-400 uppercase font-semibold">Stock</div>
                          <div className="font-bold text-slate-700">{currentStock}</div>
                        </div>
                        <span className="text-emerald-600 font-extrabold text-xs">+{addedStock}</span>
                        <ArrowRight className="h-3 w-3 text-slate-400" />
                        <div className="text-center pl-0.5">
                          <div className="text-[9px] text-emerald-700 uppercase font-bold">New</div>
                          <div className="font-extrabold text-emerald-700">{projectedStock}</div>
                        </div>
                      </div>
                    </div>

                    {/* Price Comparison Row */}
                    <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-100 text-[11px]">
                      <div>
                        <span className="text-slate-400 block font-medium">Cost per unit:</span>
                        <span className="font-bold text-slate-800">
                          {formatCurrency(newCost, currency)}
                        </span>
                        {isCostChanged && (
                          <span className="ml-1 text-[10px] text-amber-700 font-semibold">
                            (was {formatCurrency(oldCost, currency)})
                          </span>
                        )}
                      </div>

                      <div>
                        <span className="text-slate-400 block font-medium">Selling price:</span>
                        <span className="font-bold text-slate-800">
                          {formatCurrency(newSell, currency)}
                        </span>
                        {isSellChanged && (
                          <span className="ml-1 text-[10px] text-emerald-700 font-semibold">
                            (was {formatCurrency(oldSell, currency)})
                          </span>
                        )}
                      </div>

                      <div className="text-right">
                        <span className="text-slate-400 block font-medium">Line Total:</span>
                        <span className="font-black text-slate-900">
                          {formatCurrency(lineCost, currency)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Financials Breakdown */}
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
              <span>Amount Settled:</span>
              <span className="font-bold">{formatCurrency(paidAmount, currency)}</span>
            </div>
            {!isNoSupplier ? (
              <div className="flex justify-between text-rose-700 font-bold border-t border-slate-200/60 pt-1">
                <span>Remaining Supplier Due:</span>
                <span>{formatCurrency(Math.max(0, totalAmount - paidAmount), currency)}</span>
              </div>
            ) : (
              <div className="flex justify-between text-emerald-700 font-bold border-t border-slate-200/60 pt-1">
                <span>Payment Status:</span>
                <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-extrabold text-[11px]">
                  PAID IN FULL (Direct Cash)
                </span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
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
              Confirm & Save Stock
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  // -------------------------------------------------------------
  // EDIT / INPUT FORM
  // -------------------------------------------------------------
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={lockedProduct ? `Update Stock — ${lockedProduct.name}` : 'Update Stock / New Purchase'}
      subtitle={
        lockedProduct
          ? `Record incoming inventory, update cost and retail selling prices for ${lockedProduct.name}.`
          : 'Receive inventory, adjust purchase cost and retail selling prices, and track FIFO batches.'
      }
      maxWidth="2xl"
    >
      <form onSubmit={handleProceedToReview} className="space-y-5">
        {modalError && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{modalError}</span>
          </div>
        )}

        {/* 1. Supplier Mode Selector: With Supplier vs No Supplier */}
        <div className="bg-slate-50/80 border border-slate-200 rounded-2xl p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-600">
              Supplier / Source *
            </label>

            <div className="inline-flex items-center p-0.5 bg-slate-200/70 rounded-xl">
              <button
                type="button"
                onClick={() => setIsNoSupplier(false)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                  !isNoSupplier
                    ? 'bg-white text-slate-900 shadow-2xs font-extrabold'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <Building2 className="h-3.5 w-3.5 text-slate-600" />
                <span>With Supplier</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsNoSupplier(true);
                  setShowSupplierDropdown(false);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                  isNoSupplier
                    ? 'bg-emerald-600 text-white shadow-2xs font-extrabold'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <Zap className="h-3.5 w-3.5" />
                <span>No Supplier (Direct Cash)</span>
              </button>
            </div>
          </div>

          {!isNoSupplier ? (
            <div className="relative">
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
                  className="w-full bg-white border border-slate-200 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-800 focus:outline-none transition shadow-2xs pr-10"
                  required={!isNoSupplier}
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

              {/* Suggestions Dropdown */}
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

                  {supplierInput.trim() &&
                    !suppliers.some(
                      (s) => s.name.toLowerCase() === supplierInput.trim().toLowerCase()
                    ) && (
                      <button
                        type="button"
                        onMouseDown={() => setShowSupplierDropdown(false)}
                        className="w-full text-left px-4 py-2.5 bg-emerald-50/60 hover:bg-emerald-100/70 text-xs text-emerald-800 font-bold flex items-center gap-1.5 transition"
                      >
                        <Plus className="h-3.5 w-3.5 text-emerald-600" />
                        <span>Use new supplier: "{supplierInput.trim()}"</span>
                      </button>
                    )}
                </div>
              )}
            </div>
          ) : (
            <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-emerald-900 font-bold">
                <Zap className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Direct Stock Entry (No Supplier Account)</span>
              </div>
              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded border border-emerald-200">
                100% Full Payment Required
              </span>
            </div>
          )}
        </div>

        {/* 2. Products to Receive */}
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

          {/* Rows List */}
          <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
            {itemsDraft.map((item, idx) => {
              const selectedProd = products.find((p) => p.id === item.product_id) || lockedProduct;
              const currentStock = selectedProd ? Number(selectedProd.current_stock) : 0;
              const originalCost = selectedProd ? Number(selectedProd.purchase_price) : 0;
              const originalSell = selectedProd ? Number(selectedProd.selling_price) : 0;

              const isSearching = activeSearchIndex === idx;

              const isCostDifferent = Number(item.unit_cost) !== originalCost;
              const isSellDifferent = Number(item.selling_price) !== originalSell;
              const lineTotal = (Number(item.quantity) || 0) * (Number(item.unit_cost) || 0);

              const marginPerUnit = Number(item.selling_price) - Number(item.unit_cost);
              const marginPct = Number(item.unit_cost) > 0
                ? Math.round((marginPerUnit / Number(item.unit_cost)) * 100)
                : 0;

              return (
                <div
                  key={idx}
                  className="p-3.5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-3 relative hover:border-slate-300 transition"
                >
                  {/* Top Row: Product Picker + Current Stock Badge + Delete Action */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 relative">
                      {lockedProduct ? (
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200">
                          <Lock className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                          <span className="font-extrabold text-xs text-slate-800 truncate">
                            {lockedProduct.name}
                          </span>
                        </div>
                      ) : isSearching ? (
                        /* Search Combobox Input */
                        <div className="relative">
                          <div className="relative">
                            <input
                              ref={searchInputRef}
                              type="text"
                              value={rowSearchQuery}
                              onChange={(e) => setRowSearchQuery(e.target.value)}
                              placeholder={`Search 500+ products by name${showSku ? ', SKU' : ''}${showBarcode ? ', barcode' : ''}...`}
                              className="w-full bg-slate-50 focus:bg-white border-2 border-emerald-500 rounded-xl pl-9 pr-8 py-1.5 text-xs font-bold text-slate-800 focus:outline-none shadow-sm"
                              autoFocus
                            />
                            <Search className="h-4 w-4 text-emerald-600 absolute left-3 top-1/2 -translate-y-1/2" />
                            <button
                              type="button"
                              onClick={() => {
                                setActiveSearchIndex(null);
                                setRowSearchQuery('');
                              }}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          {/* Dropdown Results */}
                          <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl max-h-52 overflow-y-auto z-50 divide-y divide-slate-100">
                            {filteredProducts.length > 0 ? (
                              filteredProducts.map((p) => (
                                <button
                                  key={p.id}
                                  type="button"
                                  onClick={() => handleSelectProduct(idx, p)}
                                  className="w-full text-left px-3.5 py-2 hover:bg-emerald-50/70 flex items-center justify-between text-xs transition gap-2"
                                >
                                  <div className="truncate">
                                    <div className="font-bold text-slate-900 truncate">{p.name}</div>
                                    <div className="text-[10px] text-slate-400 flex items-center gap-2">
                                      {p.category_name && <span>{p.category_name}</span>}
                                      {showBarcode && p.barcode && <span>• Barcode: {p.barcode}</span>}
                                      {showSku && p.sku && <span>• SKU: {p.sku}</span>}
                                    </div>
                                  </div>

                                  <div className="text-right shrink-0">
                                    <div className="text-[11px] font-extrabold text-emerald-700">
                                      Stock: {p.current_stock}
                                    </div>
                                    <div className="text-[10px] text-slate-500">
                                      Cost: {formatCurrency(p.purchase_price, currency)} | Sell: {formatCurrency(p.selling_price, currency)}
                                    </div>
                                  </div>
                                </button>
                              ))
                            ) : (
                              <div className="p-3 text-center text-xs text-slate-400">
                                No products found matching "{rowSearchQuery}"
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        /* Selected Product Display with Search/Change Trigger */
                        <button
                          type="button"
                          onClick={() => {
                            setActiveSearchIndex(idx);
                            setRowSearchQuery('');
                          }}
                          className="w-full text-left px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200/90 flex items-center justify-between gap-2 group transition"
                          title="Click to search and change product"
                        >
                          <div className="truncate">
                            <span className="font-extrabold text-xs text-slate-900 truncate block">
                              {selectedProd?.name || `Select Product`}
                            </span>
                            {selectedProd?.category_name && (
                              <span className="text-[10px] text-slate-500 font-medium">
                                Category: {selectedProd.category_name}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 text-xs text-slate-400 group-hover:text-emerald-700 font-bold shrink-0">
                            <Search className="h-3.5 w-3.5" />
                            <span className="text-[11px]">Change</span>
                          </div>
                        </button>
                      )}
                    </div>

                    {/* Current Stock Tag */}
                    <div className="shrink-0 bg-slate-100/90 border border-slate-200 px-2.5 py-1 rounded-xl text-center">
                      <div className="text-[9px] text-slate-400 uppercase font-semibold">Current Stock</div>
                      <div className="font-extrabold text-xs text-slate-800">{currentStock}</div>
                    </div>

                    {/* Delete Item (when > 1 item and not locked) */}
                    {!lockedProduct && (
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(idx)}
                        disabled={itemsDraft.length === 1}
                        className="text-slate-400 hover:text-rose-600 disabled:opacity-20 p-1.5 rounded-lg hover:bg-rose-50 transition shrink-0"
                        title="Remove product row"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  {/* Bottom Row: Qty, Cost, Selling Price, Line Total */}
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
                    {/* 1. Qty */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                        Qty Incoming *
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => updateItem(idx, 'quantity', Number(e.target.value))}
                        className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-900 focus:outline-none transition text-center"
                        required
                      />
                    </div>

                    {/* 2. Purchase Cost */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          Cost ({currency}) *
                        </label>
                        {isCostDifferent && (
                          <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1 rounded">
                            Old: {originalCost}
                          </span>
                        )}
                      </div>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={item.unit_cost}
                        onChange={(e) => updateItem(idx, 'unit_cost', Number(e.target.value))}
                        className={`w-full bg-slate-50 focus:bg-white border rounded-xl px-3 py-1.5 text-xs font-bold text-slate-900 focus:outline-none transition text-right ${
                          isCostDifferent ? 'border-amber-400 bg-amber-50/30' : 'border-slate-200 focus:border-emerald-500'
                        }`}
                        required
                      />
                    </div>

                    {/* 3. Selling Price */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          Selling ({currency}) *
                        </label>
                        {isSellDifferent && (
                          <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1 rounded">
                            Old: {originalSell}
                          </span>
                        )}
                      </div>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={item.selling_price}
                        onChange={(e) => updateItem(idx, 'selling_price', Number(e.target.value))}
                        className={`w-full bg-slate-50 focus:bg-white border rounded-xl px-3 py-1.5 text-xs font-bold text-slate-900 focus:outline-none transition text-right ${
                          isSellDifferent ? 'border-emerald-400 bg-emerald-50/30' : 'border-slate-200 focus:border-emerald-500'
                        }`}
                        required
                      />
                    </div>

                    {/* 4. Line Total & Margin Preview */}
                    <div className="flex flex-col justify-center text-right pl-2 bg-slate-50/60 rounded-xl px-3 py-1 border border-slate-100">
                      <span className="text-[10px] text-slate-400 uppercase font-semibold">Line Total</span>
                      <span className="font-extrabold text-xs text-slate-900">
                        {formatCurrency(lineTotal, currency)}
                      </span>
                      <span className="text-[10px] text-emerald-700 font-bold">
                        Markup: +{formatCurrency(marginPerUnit, currency)} ({marginPct}%)
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Catalog Price Synchronization Notice */}
          <div className="p-2.5 bg-blue-50/70 border border-blue-200/80 rounded-xl text-[11px] text-blue-800 flex items-start gap-2">
            <span className="shrink-0 font-bold text-blue-900">💡 Tip:</span>
            <span>
              Cost and Selling price are prefilled with existing catalog rates. Updating them here changes this product's master catalog prices for both existing stock and incoming batches.
            </span>
          </div>
        </div>

        {/* 3. Subtotals & Payment Settlement */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-slate-100 pt-4">
          <div className="space-y-3">
            <Input
              label="Discount"
              type="number"
              prefix={currency}
              value={discount}
              onChange={(e) => setDiscount(Number(e.target.value))}
            />

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  {isNoSupplier ? 'Payment Amount (Full Settlement)' : 'Amount Paid to Supplier'}
                </label>
                {isNoSupplier && (
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/80 px-1.5 py-0.5 rounded border border-emerald-200">
                    Full Payment Required
                  </span>
                )}
              </div>
              <Input
                type="number"
                prefix={currency}
                value={paidAmount}
                onChange={(e) => !isNoSupplier && setPaidAmount(Number(e.target.value))}
                disabled={isNoSupplier}
                hint={
                  isNoSupplier
                    ? 'No-supplier purchases must be paid in full (no partial payments or credit allowed).'
                    : 'Leave 0 if unpaid on credit'
                }
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-1.5 text-sm">
              <div className="flex justify-between text-slate-600 text-xs">
                <span>Subtotal:</span>
                <span className="font-bold text-slate-800">
                  {formatCurrency(subtotal, currency)}
                </span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-amber-700 text-xs">
                  <span>Discount:</span>
                  <span className="font-bold">-{formatCurrency(discount, currency)}</span>
                </div>
              )}
              {tax > 0 && (
                <div className="flex justify-between text-slate-600 text-xs">
                  <span>Tax:</span>
                  <span className="font-bold">+{formatCurrency(tax, currency)}</span>
                </div>
              )}
              <div className="flex justify-between text-slate-800 font-bold border-t border-slate-200 pt-2 text-sm">
                <span>Total Payable:</span>
                <span className="text-emerald-800 font-black">
                  {formatCurrency(totalAmount, currency)}
                </span>
              </div>
              {!isNoSupplier ? (
                <div className="flex justify-between text-xs text-rose-700 font-semibold pt-0.5">
                  <span>Supplier Due:</span>
                  <span>{formatCurrency(Math.max(0, totalAmount - paidAmount), currency)}</span>
                </div>
              ) : (
                <div className="flex justify-between text-xs text-emerald-700 font-bold pt-0.5">
                  <span>Supplier Due:</span>
                  <span>Rs. 0.00 (Settled in Full)</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 4. Footer Actions */}
        <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={(!isNoSupplier && !supplierInput.trim()) || itemsDraft.length === 0}
            className="font-bold px-5"
          >
            Review & Save Stock
          </Button>
        </div>
      </form>
    </Modal>
  );
};
