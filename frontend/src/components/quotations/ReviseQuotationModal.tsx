import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { api } from '../../services/api';
import { Quotation, BusinessSettings, Product, QuotationCreate, QuotationItemCreate } from '../../types';
import { formatCurrency, formatMoney } from '../../utils/format';
import {
  FileText,
  AlertTriangle,
  Plus,
  Trash2,
  Search,
  CheckCircle2,
  Calendar,
  Layers,
  ArrowRight
} from 'lucide-react';

interface ReviseItemState {
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  notes?: string;
}

interface ReviseQuotationModalProps {
  isOpen: boolean;
  onClose: () => void;
  quotation: Quotation | null;
  settings: BusinessSettings | null;
  onRevised: (newQuotation: Quotation) => void;
}

export const ReviseQuotationModal: React.FC<ReviseQuotationModalProps> = ({
  isOpen,
  onClose,
  quotation,
  settings,
  onRevised,
}) => {
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [items, setItems] = useState<ReviseItemState[]>([]);
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [taxRate, setTaxRate] = useState<number>(0);
  const [validUntil, setValidUntil] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Catalog search for adding new products
  const [productSearch, setProductSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const currency = settings?.currency || 'Rs.';

  // Pre-fill fields whenever modal opens with a quotation
  useEffect(() => {
    if (isOpen && quotation) {
      setCustomerName(quotation.customer_name || '');
      setCustomerPhone(quotation.customer_phone || '');
      setCustomerAddress(quotation.customer_address || '');
      setDiscountAmount(Number(quotation.discount_amount || 0));
      setTaxRate(Number(quotation.tax_rate || 0));
      setNotes(quotation.notes || '');

      if (quotation.valid_until) {
        try {
          const d = new Date(quotation.valid_until);
          setValidUntil(d.toISOString().split('T')[0]);
        } catch {
          setValidUntil('');
        }
      } else {
        setValidUntil('');
      }

      setItems(
        (quotation.items || []).map((it) => ({
          product_id: it.product_id,
          product_name: it.product_name,
          quantity: Number(it.quantity || 1),
          unit_price: Number(it.unit_price || 0),
          discount_amount: Number(it.discount_amount || 0),
          notes: it.notes || '',
        }))
      );
      setErrorMsg(null);
    }
  }, [isOpen, quotation]);

  // Search products for adding to quotation
  useEffect(() => {
    if (!productSearch.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        setSearching(true);
        const res = await api.getProducts({ search: productSearch.trim(), is_active: true });
        setSearchResults(res || []);
      } catch (err) {
        console.error('Failed to search products:', err);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [productSearch]);

  const handleAddProduct = (prod: Product) => {
    // Check if already in items
    const existingIndex = items.findIndex((it) => it.product_id === prod.id);
    if (existingIndex >= 0) {
      const updated = [...items];
      updated[existingIndex].quantity += 1;
      setItems(updated);
    } else {
      setItems([
        ...items,
        {
          product_id: prod.id,
          product_name: prod.name,
          quantity: 1,
          unit_price: Number(prod.selling_price || 0),
          discount_amount: 0,
        },
      ]);
    }
    setProductSearch('');
    setSearchResults([]);
  };

  const handleUpdateItem = (index: number, field: keyof ReviseItemState, value: any) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  // Live Summary Calculation
  const subtotal = items.reduce((acc, it) => {
    const lineTotal = Math.max(0, it.quantity * it.unit_price - it.discount_amount);
    return acc + lineTotal;
  }, 0);

  const effectiveDiscount = Math.min(Number(discountAmount || 0), subtotal);
  const taxableAmount = Math.max(0, subtotal - effectiveDiscount);
  const calculatedTax = (taxableAmount * Number(taxRate || 0)) / 100;
  const grandTotal = Math.round((taxableAmount + calculatedTax) * 100) / 100;

  const handleSubmitRevision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quotation) return;

    if (!customerName.trim()) {
      setErrorMsg('Customer name is required.');
      return;
    }
    if (!customerPhone.trim()) {
      setErrorMsg('Customer phone number is required.');
      return;
    }
    if (items.length === 0) {
      setErrorMsg('A quotation must have at least one line item.');
      return;
    }

    // Validate item numbers
    for (const it of items) {
      if (it.quantity <= 0) {
        setErrorMsg(`Quantity for "${it.product_name}" must be greater than zero.`);
        return;
      }
      if (it.unit_price < 0) {
        setErrorMsg(`Unit price for "${it.product_name}" cannot be negative.`);
        return;
      }
      if (it.discount_amount < 0) {
        setErrorMsg(`Discount for "${it.product_name}" cannot be negative.`);
        return;
      }
    }

    try {
      setSaving(true);
      setErrorMsg(null);

      const payload: QuotationCreate = {
        customer_id: quotation.customer_id,
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        customer_address: customerAddress.trim() || undefined,
        items: items.map((it) => ({
          product_id: it.product_id,
          quantity: it.quantity,
          unit_price: it.unit_price,
          discount_amount: it.discount_amount,
          notes: it.notes || undefined,
        })),
        discount_amount: Number(discountAmount || 0),
        tax_rate: Number(taxRate || 0),
        valid_until: validUntil ? new Date(validUntil).toISOString() : undefined,
        notes: notes.trim() || undefined,
      };

      const newQuotation = await api.reviseQuotation(quotation.id, payload);
      onRevised(newQuotation);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.detail || 'Failed to revise quotation.');
    } finally {
      setSaving(false);
    }
  };

  if (!quotation) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Revise Commercial Quotation"
      subtitle={`Agreement Revision for Quote #${quotation.quotation_number}`}
      maxWidth="5xl"
    >
      <form onSubmit={handleSubmitRevision} className="space-y-5">
        {/* Agreement Legal Notice Banner */}
        <div className="p-4 rounded-2xl bg-amber-50/90 border border-amber-200/80 text-amber-900 flex items-start gap-3 shadow-sm">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <p className="font-bold text-amber-950">
              Commercial Agreement Notice (Superseding Rule):
            </p>
            <p className="leading-relaxed text-amber-800">
              Per official commercial quoting procedure, submitting this revision will automatically{' '}
              <span className="font-bold text-rose-700 underline">cancel and supersede</span> original quotation{' '}
              <span className="font-bold">{quotation.quotation_number}</span>, and issue a brand-new quotation with your proposed changes and linked audit history.
            </p>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold rounded-xl">
            {errorMsg}
          </div>
        )}

        {/* 1. Customer Details */}
        <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 space-y-3">
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Customer Information
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              label="Customer Name *"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="e.g. John Doe"
              required
            />
            <Input
              label="Customer Phone *"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="e.g. 03001234567"
              required
            />
            <Input
              label="Delivery / Billing Address"
              value={customerAddress}
              onChange={(e) => setCustomerAddress(e.target.value)}
              placeholder="e.g. Shop 4, Market St"
            />
          </div>
        </div>

        {/* 2. Line Items Table */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="h-4 w-4 text-indigo-600" />
              Itemized Quotation Lines ({items.length})
            </h4>

            {/* Product Quick-Add Search */}
            <div className="relative w-full sm:w-72">
              <Input
                placeholder="Search catalog to add item..."
                prefix={<Search className="h-4 w-4" />}
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
              />
              {searchResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto divide-y divide-slate-100">
                  {searchResults.map((prod) => (
                    <button
                      key={prod.id}
                      type="button"
                      onClick={() => handleAddProduct(prod)}
                      className="w-full text-left px-3.5 py-2 hover:bg-indigo-50 flex items-center justify-between text-xs transition"
                    >
                      <div>
                        <span className="font-bold text-slate-800">{prod.name}</span>
                        <span className="text-[10px] text-slate-400 ml-2">Stock: {prod.current_stock}</span>
                      </div>
                      <span className="font-semibold text-indigo-600">
                        {formatCurrency(prod.selling_price, currency)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Line Items Table */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm bg-white">
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100/80 text-slate-700 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200 sticky top-0 bg-slate-100">
                    <th className="py-2.5 px-3 w-8">#</th>
                    <th className="py-2.5 px-3">Item Description</th>
                    <th className="py-2.5 px-3 w-28">Qty</th>
                    <th className="py-2.5 px-3 w-32">Unit Price ({currency})</th>
                    <th className="py-2.5 px-3 w-28">Discount</th>
                    <th className="py-2.5 px-3 text-right w-28">Line Total</th>
                    <th className="py-2.5 px-3 w-10 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                  {items.map((it, idx) => {
                    const lineTot = Math.max(0, it.quantity * it.unit_price - it.discount_amount);
                    return (
                      <tr key={idx} className="hover:bg-slate-50/70 transition">
                        <td className="py-2.5 px-3 text-slate-400">{idx + 1}</td>
                        <td className="py-2.5 px-3 font-semibold text-slate-900">
                          {it.product_name}
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="number"
                            step="any"
                            min="0.01"
                            placeholder="1"
                            value={it.quantity || ''}
                            onFocus={(e) => requestAnimationFrame(() => e.target.select())}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/^0+(?=[1-9])/, '');
                              handleUpdateItem(idx, 'quantity', parseFloat(raw) || 0);
                            }}
                            className="w-full px-2 py-1 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            value={it.unit_price === 0 ? '' : it.unit_price}
                            onFocus={(e) => requestAnimationFrame(() => e.target.select())}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/^0+(?=[1-9])/, '');
                              handleUpdateItem(idx, 'unit_price', parseFloat(raw) || 0);
                            }}
                            className="w-full px-2 py-1 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            value={it.discount_amount === 0 ? '' : it.discount_amount}
                            onFocus={(e) => requestAnimationFrame(() => e.target.select())}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/^0+(?=[1-9])/, '');
                              handleUpdateItem(idx, 'discount_amount', parseFloat(raw) || 0);
                            }}
                            className="w-full px-2 py-1 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-900 whitespace-nowrap">
                          {formatCurrency(lineTot, currency)}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                            title="Remove line"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">
                        No items in quotation. Use the search bar above to add products.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* 3. Financial Summary & Notes */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          {/* Notes & Validity */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                Quotation Validity Date (Optional)
              </label>
              <input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                Revision Notes & Terms
              </label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Revised prices per client agreement on call..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Totals Box */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5">
            <div className="flex justify-between text-xs text-slate-600">
              <span>Subtotal:</span>
              <span className="font-bold text-slate-900">{formatCurrency(subtotal, currency)}</span>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-600">
              <span>Overall Discount ({currency}):</span>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={discountAmount === 0 ? '' : discountAmount}
                onFocus={(e) => requestAnimationFrame(() => e.target.select())}
                onChange={(e) => {
                  const raw = e.target.value.replace(/^0+(?=[1-9])/, '');
                  setDiscountAmount(parseFloat(raw) || 0);
                }}
                className="w-28 text-right px-2 py-1 border border-slate-200 rounded-lg text-xs font-bold text-slate-800"
              />
            </div>

            <div className="flex items-center justify-between text-xs text-slate-600">
              <span>Tax Rate (%):</span>
              <input
                type="number"
                step="0.1"
                min="0"
                placeholder="0.0"
                value={taxRate === 0 ? '' : taxRate}
                onFocus={(e) => requestAnimationFrame(() => e.target.select())}
                onChange={(e) => {
                  const raw = e.target.value.replace(/^0+(?=[1-9])/, '');
                  setTaxRate(parseFloat(raw) || 0);
                }}
                className="w-28 text-right px-2 py-1 border border-slate-200 rounded-lg text-xs font-bold text-slate-800"
              />
            </div>

            <div className="flex justify-between text-base font-black text-slate-900 pt-2 border-t border-slate-200">
              <span>New Quotation Total:</span>
              <span className="text-indigo-600">{formatCurrency(grandTotal, currency)}</span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex justify-between items-center pt-3 border-t border-slate-100">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>

          <Button
            type="submit"
            variant="primary"
            loading={saving}
            icon={<ArrowRight className="h-4 w-4" />}
            className="font-bold bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-600/20"
          >
            Save & Supersede Agreement
          </Button>
        </div>
      </form>
    </Modal>
  );
};
