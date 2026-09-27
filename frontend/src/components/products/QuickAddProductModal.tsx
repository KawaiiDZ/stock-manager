import React, { useState, useEffect } from 'react';
import { Product, Category, BusinessSettings } from '../../types';
import { Modal } from '../common/Modal';
import { Input } from '../common/Input';
import { Button } from '../common/Button';
import { api } from '../../services/api';
import { Plus, Barcode, Sparkles, AlertCircle } from 'lucide-react';

export interface QuickAddProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialBarcode?: string;
  categories: Category[];
  settings: BusinessSettings | null;
  onProductCreated: (product: Product) => void;
  submitButtonText?: string;
}

export const QuickAddProductModal: React.FC<QuickAddProductModalProps> = ({
  isOpen,
  onClose,
  initialBarcode = '',
  categories,
  settings,
  onProductCreated,
  submitButtonText = 'Save Product',
}) => {
  const currency = settings?.currency || 'Rs.';
  const showSku = settings?.show_sku !== false;
  const showBarcode = settings?.show_barcode !== false;

  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [categoryId, setCategoryId] = useState<number>(0);
  const [purchasePrice, setPurchasePrice] = useState<number>(0);
  const [sellingPrice, setSellingPrice] = useState<number>(0);
  const [openingStock, setOpeningStock] = useState<number>(1);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [generatingBarcode, setGeneratingBarcode] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setSku('');
      setBarcode(initialBarcode || '');
      setCategoryId(categories.length > 0 ? categories[0].id : 0);
      setPurchasePrice(0);
      setSellingPrice(0);
      setOpeningStock(1);
      setErrorMsg(null);
      setLoading(false);
    }
  }, [isOpen, initialBarcode, categories]);

  const handleGenerateBarcode = async () => {
    setGeneratingBarcode(true);
    try {
      const res = await api.generateBarcode();
      if (res && res.barcode) {
        setBarcode(res.barcode);
      }
    } catch {
      // Fallback local timestamp barcode
      setBarcode(`20${Math.floor(Date.now() / 1000)}`);
    } finally {
      setGeneratingBarcode(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg('Product name is required.');
      return;
    }
    if (sellingPrice < 0 || purchasePrice < 0 || openingStock < 0) {
      setErrorMsg('Prices and opening stock quantity cannot be negative.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const newProd = await api.createProduct({
        name: name.trim(),
        sku: sku.trim() || undefined,
        barcode: barcode.trim() || undefined,
        category_id: categoryId > 0 ? categoryId : undefined,
        purchase_price: Number(purchasePrice) || 0,
        selling_price: Number(sellingPrice) || 0,
        opening_stock: Number(openingStock) || 0,
      });

      onProductCreated(newProd);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.detail || err.message || 'Failed to create product.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add New Product"
      subtitle={initialBarcode ? `Registering product with barcode ${initialBarcode}` : 'Enter new product details'}
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {errorMsg && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <Input
          label="Product Name *"
          placeholder="e.g. Wireless Mouse, Cotton T-Shirt"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoFocus
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
              Category
            </label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(Number(e.target.value))}
              className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-800 focus:outline-none focus:border-emerald-500 shadow-sm"
            >
              <option value={0}>General / No Category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {showSku && (
            <Input
              label="SKU (Optional)"
              placeholder="e.g. SKU-101"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
            />
          )}
        </div>

        {showBarcode && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                Barcode
              </label>
              <button
                type="button"
                onClick={handleGenerateBarcode}
                disabled={generatingBarcode}
                className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg transition"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>{generatingBarcode ? 'Generating...' : '⚡ Generate'}</span>
              </button>
            </div>
            <Input
              placeholder="Scan or enter barcode..."
              prefix={<Barcode className="h-4 w-4 text-slate-400" />}
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
            />
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <Input
            label="Cost Price *"
            type="number"
            step="0.01"
            min="0"
            prefix={currency}
            value={purchasePrice}
            onChange={(e) => setPurchasePrice(Number(e.target.value))}
            required
          />

          <Input
            label="Selling Price *"
            type="number"
            step="0.01"
            min="0"
            prefix={currency}
            value={sellingPrice}
            onChange={(e) => setSellingPrice(Number(e.target.value))}
            required
          />

          <Input
            label="Initial Stock"
            type="number"
            min="0"
            value={openingStock}
            onChange={(e) => setOpeningStock(Number(e.target.value))}
            hint="Units available"
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading} className="font-semibold">
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={loading}
            icon={<Plus className="h-4 w-4" />}
            className="font-bold bg-emerald-600 hover:bg-emerald-700 shadow-sm"
          >
            {submitButtonText}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
