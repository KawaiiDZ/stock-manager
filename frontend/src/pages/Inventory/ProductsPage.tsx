import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../services/api';
import { Product, Category, CustomField, CustomValueDto, BusinessSettings } from '../../types';
import {
  Plus,
  Search,
  Edit2,
  ShoppingCart,
  AlertCircle,
  Trash2,
  Truck,
  RotateCcw,
  Barcode,
  AlertTriangle,
  Sparkles,
  Sliders,
  Check,
  ArrowUp,
} from 'lucide-react';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Modal } from '../../components/common/Modal';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { Badge } from '../../components/common/Badge';
import { EmptyState } from '../../components/common/EmptyState';
import { BulkAddProductsModal } from './BulkAddProductsModal';
import { StockAdjustmentModal } from './StockAdjustmentModal';
import { NewPurchaseModal } from './NewPurchaseModal';
import { BarcodePrintModal } from '../../components/barcode/BarcodePrintModal';
import { UnregisteredBarcodeModal } from '../../components/barcode/UnregisteredBarcodeModal';
import { useBarcodeScanner } from '../../hooks/useBarcodeScanner';
import { formatCurrency, formatMoney } from '../../utils/format';

interface ProductsPageProps {
  settings: BusinessSettings | null;
  onSellProduct?: (product: Product) => void;
}

export const ProductsPage: React.FC<ProductsPageProps> = ({
  settings,
  onSellProduct,
}) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<number | undefined>();
  const [activeTab, setActiveTab] = useState<'active' | 'restock' | 'deactivated'>('active');
  const [loading, setLoading] = useState(false);

  // Modals
  const [showProductModal, setShowProductModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showStockUpdateModal, setShowStockUpdateModal] = useState(false);
  const [stockUpdateProduct, setStockUpdateProduct] = useState<Product | null>(null);
  const [adjustingProduct, setAdjustingProduct] = useState<Product | null>(null);

  // Barcode Label Print Modal
  const [showBarcodeModal, setShowBarcodeModal] = useState(false);
  const [barcodePrintProducts, setBarcodePrintProducts] = useState<Product[]>([]);
  const [barcodePrintCopies, setBarcodePrintCopies] = useState<number>(1);

  // Unregistered Barcode & Scanner Visual Feedback
  const [unregisteredBarcode, setUnregisteredBarcode] = useState<string | null>(null);
  const [highlightedProductId, setHighlightedProductId] = useState<number | null>(null);
  const [scanToast, setScanToast] = useState<string | null>(null);
  const [generatingBarcode, setGeneratingBarcode] = useState(false);

  // Edit / Add Product Form State
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    barcode: '',
    category_id: 0,
    purchase_price: 0,
    selling_price: 0,
    opening_stock: 0,
  });
  const [customFieldValues, setCustomFieldValues] = useState<Record<number, string>>({});
  const [modalError, setModalError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Quick Add Category Modal
  const [showAddCatModal, setShowAddCatModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');

  // Delete Confirm Dialog
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);

  const currency = settings?.currency || 'Rs.';
  const showSku = settings?.show_sku !== false;
  const showBarcode = settings?.show_barcode !== false;
  const enableBarcodePrinter = settings?.enable_barcode_printer !== false;
  const enableBarcodeScanner = settings?.enable_barcode_scanner !== false;

  const loadData = async () => {
    setLoading(true);
    try {
      const [prods, cats, fields] = await Promise.all([
        api.getProducts({
          search: search.trim() || undefined,
          category_id: selectedCategory,
          is_active: activeTab !== 'deactivated',
        }),
        api.getCategories(true),
        api.getCustomFields(true),
      ]);
      setProducts(prods);
      setCategories(cats);
      setCustomFields(fields);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Floating Back to Top Button
  const [showBackToTop, setShowBackToTop] = useState(false);

  useEffect(() => {
    const mainEl = document.querySelector('main');
    if (!mainEl) return;
    const handleScroll = () => {
      setShowBackToTop(mainEl.scrollTop > 250);
    };
    mainEl.addEventListener('scroll', handleScroll, { passive: true });
    return () => mainEl.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    const mainEl = document.querySelector('main');
    if (mainEl) {
      mainEl.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    loadData();
  }, [search, selectedCategory, activeTab]);

  // Hardware Barcode Scanner in Inventory - pulls product or prompts if unregistered
  useBarcodeScanner({
    enabled: enableBarcodeScanner && !showProductModal && !showBulkModal && !showBarcodeModal && !Boolean(unregisteredBarcode),
    onScan: async (scannedCode) => {
      const code = scannedCode.trim();
      if (!code) return;

      // 1. Check in memory
      let match = products.find(
        (p) =>
          (p.barcode && p.barcode.toLowerCase() === code.toLowerCase()) ||
          (p.sku && p.sku.toLowerCase() === code.toLowerCase()) ||
          (p.product_id && p.product_id.toLowerCase() === code.toLowerCase())
      );

      // 2. Query remote database if not loaded in memory
      if (!match) {
        try {
          const remote = await api.getProductByBarcode(code);
          if (remote) {
            match = remote;
            setProducts((prev) => (prev.some((p) => p.id === remote.id) ? prev : [remote, ...prev]));
          }
        } catch {
          match = undefined;
        }
      }

      if (match) {
        // Product successfully pulled! Focus tab and row
        if (!match.is_active && activeTab !== 'deactivated') {
          setActiveTab('deactivated');
        } else if (match.is_active && activeTab === 'deactivated') {
          setActiveTab('active');
        }

        // If in restock tab but product is in stock, switch to active
        if (Number(match.current_stock || 0) > 0 && activeTab === 'restock') {
          setActiveTab('active');
        }

        // Clear restrictive search and category filters so product is visible
        setSearch('');
        setSelectedCategory(undefined);

        setHighlightedProductId(match.id);
        setScanToast(`Found Product: ${match.name} (${match.product_id})`);

        setTimeout(() => {
          const el = document.getElementById(`product-row-${match!.id}`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 150);

        setTimeout(() => {
          setHighlightedProductId((prev) => (prev === match!.id ? null : prev));
        }, 3500);

        setTimeout(() => {
          setScanToast(null);
        }, 4000);
      } else {
        // Unregistered barcode detected! Prompt user to enter product
        setUnregisteredBarcode(code);
      }
    },
    playBeep: true,
  });

  const handleGenerateBarcode = async () => {
    setGeneratingBarcode(true);
    try {
      const res = await api.generateBarcode();
      if (res && res.barcode) {
        setFormData((prev) => ({ ...prev, barcode: res.barcode }));
      }
    } catch {
      setFormData((prev) => ({ ...prev, barcode: `20${Math.floor(Date.now() / 1000)}` }));
    } finally {
      setGeneratingBarcode(false);
    }
  };

  const handleOpenAdd = (prefillBarcode?: string) => {
    setEditingProduct(null);
    setFormData({
      name: '',
      sku: '',
      barcode: typeof prefillBarcode === 'string' ? prefillBarcode : '',
      category_id: selectedCategory || 0,
      purchase_price: 0,
      selling_price: 0,
      opening_stock: 0,
    });
    setCustomFieldValues({});
    setModalError(null);
    setShowProductModal(true);
  };

  const handleRestore = async (productId: number) => {
    try {
      await api.restoreProduct(productId);
      loadData();
    } catch (err: any) {
      alert(err.detail || 'Failed to restore product');
    }
  };

  const handleOpenEdit = (p: Product) => {
    setEditingProduct(p);
    setFormData({
      name: p.name,
      sku: p.sku || '',
      barcode: p.barcode || '',
      category_id: p.category_id || 0,
      purchase_price: p.purchase_price,
      selling_price: p.selling_price,
      opening_stock: 0,
    });
    const cfMap: Record<number, string> = {};
    p.custom_fields?.forEach((cf) => {
      cfMap[cf.field_id] = cf.value;
    });
    setCustomFieldValues(cfMap);
    setModalError(null);
    setShowProductModal(true);
  };

  const handleSaveProduct = async (e?: React.FormEvent, printAfter: boolean = false) => {
    if (e) e.preventDefault();
    if (!formData.name.trim()) return;

    setSaving(true);
    setModalError(null);

    const customDto: CustomValueDto[] = Object.entries(customFieldValues).map(
      ([fieldId, val]) => ({
        field_id: Number(fieldId),
        value: val,
      })
    );

    try {
      let savedProduct: Product;
      if (editingProduct) {
        savedProduct = await api.updateProduct(editingProduct.id, {
          name: formData.name.trim(),
          sku: showSku ? (formData.sku.trim() || undefined) : editingProduct.sku,
          barcode: showBarcode ? (formData.barcode.trim() || undefined) : editingProduct.barcode,
          category_id: formData.category_id > 0 ? formData.category_id : undefined,
          purchase_price: formData.purchase_price,
          selling_price: formData.selling_price,
          custom_fields: customDto,
        });
      } else {
        savedProduct = await api.createProduct({
          name: formData.name.trim(),
          sku: showSku ? (formData.sku.trim() || undefined) : undefined,
          barcode: showBarcode ? (formData.barcode.trim() || undefined) : undefined,
          category_id: formData.category_id > 0 ? formData.category_id : undefined,
          purchase_price: formData.purchase_price,
          selling_price: formData.selling_price,
          opening_stock: formData.opening_stock,
          custom_fields: customDto,
        });
      }
      setShowProductModal(false);
      loadData();

      if (printAfter) {
        setBarcodePrintProducts([savedProduct]);
        setBarcodePrintCopies(Math.max(1, savedProduct.current_stock || 1));
        setShowBarcodeModal(true);
      }
    } catch (err: any) {
      setModalError(err.detail || 'Failed to save product.');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingProduct) return;
    setDeleting(true);
    try {
      try {
        await api.deleteProductPermanent(deletingProduct.id);
      } catch (err: any) {
        // If permanent deletion is restricted by accounting history, deactivate so it disappears from the active catalog
        await api.deactivateProduct(deletingProduct.id);
      }
      setDeletingProduct(null);
      loadData();
    } catch (err: any) {
      alert(err.detail || 'Failed to delete product');
    } finally {
      setDeleting(false);
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    try {
      const newCat = await api.createCategory({ name: newCatName.trim() });
      setCategories((prev) => [...prev, newCat]);
      setFormData((prev) => ({ ...prev, category_id: newCat.id }));
      setShowAddCatModal(false);
      setNewCatName('');
    } catch (err: any) {
      alert(err.detail || 'Failed to add category');
    }
  };

  // Out of stock calculations for Restock Queue
  const totalOutOfStockCount = useMemo(() => {
    return products.filter((p) => p.is_active && Number(p.current_stock || 0) <= 0).length;
  }, [products]);

  const restockFilteredProducts = useMemo(() => {
    const filtered = products.filter((p) => {
      if (!p.is_active || Number(p.current_stock || 0) > 0) return false;
      if (selectedCategory && p.category_id !== selectedCategory) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          p.product_id.toLowerCase().includes(q) ||
          (p.sku && p.sku.toLowerCase().includes(q)) ||
          (p.barcode && p.barcode.toLowerCase().includes(q))
        );
      }
      return true;
    });
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }, [products, selectedCategory, search]);

  // Group products into dedicated category tables (arranged alphabetically A-Z inside each category)
  const categoryGroups = useMemo(() => {
    const sortAlphabetically = (items: Product[]) =>
      [...items].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    if (selectedCategory) {
      const cat = categories.find((c) => c.id === selectedCategory);
      const catProds = products.filter((p) => p.category_id === selectedCategory);
      return [
        {
          id: selectedCategory,
          name: cat ? cat.name : 'Category',
          products: sortAlphabetically(catProds),
        },
      ];
    }

    const groups: { id: number | null; name: string; products: Product[] }[] = [];

    const categoryIds = new Set(categories.map((c) => c.id));

    // Categories in order
    categories.forEach((cat) => {
      const catProds = products.filter((p) => p.category_id === cat.id);
      if (catProds.length > 0) {
        groups.push({
          id: cat.id,
          name: cat.name,
          products: sortAlphabetically(catProds),
        });
      }
    });

    // Uncategorized products (no category or orphaned category)
    const uncategorized = products.filter((p) => !p.category_id || !categoryIds.has(p.category_id));
    if (uncategorized.length > 0) {
      groups.push({
        id: null,
        name: 'General / Uncategorized',
        products: sortAlphabetically(uncategorized),
      });
    }

    return groups;
  }, [products, categories, selectedCategory]);

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight">Products & Stock</h1>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            Manage your product catalog, prices, bulk adding, and live inventory
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Active / Needs Restock / Deactivated Tabs */}
          <div className="flex items-center gap-1 bg-slate-200/70 dark:bg-slate-800 p-1 rounded-2xl text-xs font-bold">
            <button
              type="button"
              onClick={() => setActiveTab('active')}
              className={`px-3.5 py-1.5 rounded-xl transition ${
                activeTab === 'active' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Active Catalog
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('restock')}
              className={`px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 ${
                activeTab === 'restock' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <span>Needs Restock</span>
              {totalOutOfStockCount > 0 && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                    activeTab === 'restock'
                      ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                      : 'bg-rose-500 text-white shadow-2xs'
                  }`}
                >
                  {totalOutOfStockCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('deactivated')}
              className={`px-3.5 py-1.5 rounded-xl transition ${
                activeTab === 'deactivated' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Deactivated
            </button>
          </div>

          <Button
            variant="outline"
            size="md"
            icon={<Truck className="h-4 w-4 text-brand-600 dark:text-brand-400" />}
            onClick={() => {
              setStockUpdateProduct(null);
              setShowStockUpdateModal(true);
            }}
            className="font-bold border-brand-300 dark:border-brand-800 text-brand-800 dark:text-brand-300 bg-brand-50/50 dark:bg-brand-950/30 hover:bg-brand-100/60 dark:hover:bg-brand-900/40"
          >
            + Update Stock
          </Button>

          <Button
            variant="outline"
            size="md"
            icon={<Plus className="h-4 w-4 text-slate-700 dark:text-slate-300" />}
            onClick={() => setShowBulkModal(true)}
            className="font-bold"
          >
            + Bulk Add
          </Button>

          <Button
            variant="primary"
            size="md"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => handleOpenAdd()}
          >
            + Add Product
          </Button>
        </div>
      </div>

      {/* Out of Stock Notice Banner on Active Catalog */}
      {activeTab === 'active' && totalOutOfStockCount > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/90 dark:border-amber-900/60 text-amber-900 dark:text-amber-200 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-amber-100 dark:bg-amber-900/50 border border-amber-200/60 dark:border-amber-800 flex items-center justify-center text-amber-700 dark:text-amber-300 shrink-0">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-amber-900 dark:text-amber-100">
                {totalOutOfStockCount} Product{totalOutOfStockCount > 1 ? 's' : ''} Out of Stock
              </h4>
              <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">
                These products have 0 inventory and cannot be sold at checkout until replenished.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('restock')}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition shadow-xs whitespace-nowrap self-start sm:self-auto cursor-pointer"
          >
            <Truck className="h-3.5 w-3.5" />
            <span>Review & Restock ({totalOutOfStockCount})</span>
          </button>
        </div>
      )}

      {/* Search & Category Filter Toolbar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
        <div className="flex-1">
          <Input
            placeholder={`Search products by Name, Product ID${showSku ? ', SKU' : ''}${showBarcode ? ', Barcode' : ''}...`}
            prefix={<Search className="h-4 w-4" />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <select
          value={selectedCategory || ''}
          onChange={(e) =>
            setSelectedCategory(e.target.value ? Number(e.target.value) : undefined)
          }
          className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-semibold rounded-xl px-4 py-2.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-brand-500 shadow-sm cursor-pointer"
        >
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Category Tables or Restock Queue */}
      <div className="space-y-8">
        {loading ? (
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-16 text-center text-slate-400 dark:text-slate-500">
            Loading products...
          </div>
        ) : activeTab === 'restock' ? (
          <div className="space-y-6">
            {/* Restock Section Header Card */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="h-11 w-11 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0 shadow-2xs">
                  <Truck className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <span>Restock Queue</span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-black bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                      {totalOutOfStockCount} Out of Stock
                    </span>
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Products with 0 inventory. Replenish stock through incoming supplier purchase orders or physical count adjustments.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  size="md"
                  icon={<Truck className="h-4 w-4" />}
                  onClick={() => {
                    setStockUpdateProduct(null);
                    setShowStockUpdateModal(true);
                  }}
                  className="font-bold shadow-sm whitespace-nowrap"
                >
                  + New Stock Purchase
                </Button>
              </div>
            </div>

            {/* Restock Products Table or Empty State */}
            {restockFilteredProducts.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <EmptyState
                  title={search.trim() ? "No out-of-stock products matching search" : "All Products In Stock!"}
                  description={
                    search.trim()
                      ? "No out of stock products matched your search or category filter."
                      : "Great job! None of your active products are currently out of stock. Your catalog inventory is fully replenished."
                  }
                  actionText={search.trim() ? "Clear Filter" : undefined}
                  onAction={search.trim() ? () => { setSearch(''); setSelectedCategory(undefined); } : undefined}
                />
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Depleted Stock Items Requiring Restock ({restockFilteredProducts.length})
                  </div>
                  <span className="text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-2.5 py-1 rounded-lg border border-rose-200/60 dark:border-rose-900/60 inline-flex items-center gap-1.5 self-start sm:self-auto">
                    <AlertCircle className="h-3.5 w-3.5" />
                    <span>Out of stock at checkout</span>
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead className="bg-slate-50/80 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      <tr>
                        <th className="py-3.5 px-6 whitespace-nowrap">Product ID</th>
                        <th className="py-3.5 px-6 whitespace-nowrap">Product Name</th>
                        <th className="py-3.5 px-6 whitespace-nowrap">Category</th>
                        {(showSku || showBarcode) && (
                          <th className="py-3.5 px-6 whitespace-nowrap">SKU / Barcode</th>
                        )}
                        <th className="py-3.5 px-6 text-right whitespace-nowrap">Cost Price</th>
                        <th className="py-3.5 px-6 text-right whitespace-nowrap">Selling Price</th>
                        <th className="py-3.5 px-6 text-center whitespace-nowrap">Current Stock</th>
                        <th className="py-3.5 px-6 text-right whitespace-nowrap">Restock Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {restockFilteredProducts.map((p) => (
                        <tr
                          key={p.id}
                          id={`product-row-${p.id}`}
                          className={`transition-all duration-300 ${
                            highlightedProductId === p.id
                              ? 'bg-brand-100/70 dark:bg-brand-950/60 ring-2 ring-brand-500 shadow-sm'
                              : 'hover:bg-slate-50/60 dark:hover:bg-slate-800/50'
                          }`}
                        >
                          <td className="py-4 px-6 font-bold text-slate-900 dark:text-white whitespace-nowrap">{p.product_id}</td>
                          <td className="py-4 px-6 font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                            <div>{p.name}</div>
                          </td>
                          <td className="py-4 px-6 text-xs font-semibold text-slate-600 dark:text-slate-400 whitespace-nowrap">
                            <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700">
                              {p.category_name || 'General'}
                            </span>
                          </td>
                          {(showSku || showBarcode) && (
                            <td className="py-4 px-6 text-slate-500 dark:text-slate-400 text-xs font-mono whitespace-nowrap">
                              {showSku && p.sku && <div>SKU: {p.sku}</div>}
                              {showBarcode && p.barcode && <div>BC: {p.barcode}</div>}
                              {!p.sku && !p.barcode && '—'}
                            </td>
                          )}
                          <td className="py-4 px-6 text-right text-slate-600 dark:text-slate-400 whitespace-nowrap">
                            {formatCurrency(p.purchase_price, currency)}
                          </td>
                          <td className="py-4 px-6 text-right font-bold text-slate-900 dark:text-white whitespace-nowrap">
                            {formatCurrency(p.selling_price, currency)}
                          </td>
                          <td className="py-4 px-6 text-center whitespace-nowrap">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 shadow-2xs">
                              0 units (Out of Stock)
                            </span>
                          </td>
                          <td className="py-4 px-6 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                icon={<Sliders className="h-3.5 w-3.5 text-slate-600 dark:text-slate-400" />}
                                onClick={() => setAdjustingProduct(p)}
                                className="text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                                title="Quick physical stock count adjustment"
                              >
                                Quick Count
                              </Button>
                              <Button
                                variant="primary"
                                size="sm"
                                icon={<Truck className="h-3.5 w-3.5" />}
                                onClick={() => {
                                  setStockUpdateProduct(p);
                                  setShowStockUpdateModal(true);
                                }}
                                className="text-xs font-bold shadow-2xs"
                              >
                                Restock Now
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : categoryGroups.length === 0 || products.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <EmptyState
              title={
                activeTab === 'deactivated'
                  ? 'No deactivated products'
                  : search.trim()
                  ? `No products matching "${search.trim()}"`
                  : selectedCategory
                  ? 'No products in this category'
                  : 'No products in catalog'
              }
              description={
                activeTab === 'deactivated'
                  ? 'Products you deactivate will appear here and can be restored or deleted permanently anytime.'
                  : search.trim()
                  ? 'Try searching with a different product name, ID, or barcode.'
                  : selectedCategory
                  ? 'Add products to this category individually or use bulk adding.'
                  : 'Add products individually or use bulk adding to build your inventory.'
              }
              actionText={activeTab === 'active' ? '+ Add Product' : undefined}
              onAction={activeTab === 'active' ? handleOpenAdd : undefined}
            />
          </div>
        ) : (
          categoryGroups.map((group) => {
            const groupCustomFields = customFields
              .filter((cf) => !cf.category_id || (group.id !== null && cf.category_id === group.id))
              .sort((a, b) => a.display_order - b.display_order);

            const totalStock = group.products.reduce((acc, p) => acc + Number(p.current_stock || 0), 0);

            return (
              <div
                key={group.id ?? 'uncategorized'}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden"
              >
                {/* Unified Category Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-4 border-b border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900">
                  <h2 className="text-base font-extrabold text-slate-900 dark:text-white">{group.name}</h2>

                  {/* Quick Category Summary Stats */}
                  <div className="flex items-center gap-3 text-xs font-semibold text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 px-3.5 py-1.5 rounded-xl border border-slate-200/60 dark:border-slate-700 self-start sm:self-auto">
                    <span>
                      Products:{' '}
                      <strong className="text-slate-900 dark:text-white font-bold">{group.products.length}</strong>
                    </span>
                    <span className="text-slate-300 dark:text-slate-600">•</span>
                    <span>
                      Total Stock:{' '}
                      <strong className="text-slate-900 dark:text-white font-bold">{totalStock} units</strong>
                    </span>
                  </div>
                </div>

                {/* Dedicated Category Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      <tr>
                        <th className="py-3.5 px-6 whitespace-nowrap">Product ID</th>
                        <th className="py-3.5 px-6 whitespace-nowrap">Product Name</th>
                        {groupCustomFields.map((cf) => (
                          <th
                            key={cf.id}
                            className="py-3.5 px-4 text-slate-700 dark:text-slate-300 whitespace-nowrap text-[11px] font-bold uppercase tracking-wider"
                          >
                            <div className="flex items-center gap-1.5">
                              <span>{cf.name}</span>
                              {!cf.category_id && (
                                <span className="text-[9px] px-1 py-0.2 rounded bg-slate-200/70 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-semibold normal-case">
                                  Global
                                </span>
                              )}
                            </div>
                          </th>
                        ))}
                        {(showSku || showBarcode) && (
                          <th className="py-3.5 px-6 whitespace-nowrap">
                            {showSku && showBarcode ? 'SKU / Barcode' : showSku ? 'SKU' : 'Barcode'}
                          </th>
                        )}
                        <th className="py-3.5 px-6 text-right whitespace-nowrap">Cost Price</th>
                        <th className="py-3.5 px-6 text-right whitespace-nowrap">Selling Price</th>
                        <th className="py-3.5 px-6 text-right whitespace-nowrap">Current Stock</th>
                        <th className="py-3.5 px-6 text-center whitespace-nowrap">Status</th>
                        <th className="py-3.5 px-6 text-right whitespace-nowrap">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {group.products.map((p) => {
                        return (
                          <tr
                            key={p.id}
                            id={`product-row-${p.id}`}
                            className={`transition-all duration-300 ${
                              highlightedProductId === p.id
                                ? 'bg-brand-100/70 dark:bg-brand-950/60 ring-2 ring-brand-500 shadow-sm'
                                : 'hover:bg-slate-50/60 dark:hover:bg-slate-800/50'
                            }`}
                          >
                            <td className="py-4 px-6 font-bold text-slate-900 dark:text-white whitespace-nowrap">{p.product_id}</td>
                            <td className="py-4 px-6 font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                              {p.name}
                            </td>
                            {groupCustomFields.map((cf) => {
                              const customVal = p.custom_fields?.find((cv) => cv.field_id === cf.id)?.value;
                              return (
                                <td key={cf.id} className="py-4 px-4 text-xs font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                                  {customVal ? (
                                    <span className="inline-block bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-2.5 py-1 rounded-lg font-semibold text-xs border border-slate-200/60 dark:border-slate-700">
                                      {customVal}
                                    </span>
                                  ) : (
                                    <span className="text-slate-300 dark:text-slate-600 font-bold">—</span>
                                  )}
                                </td>
                              );
                            })}
                            {(showSku || showBarcode) && (
                              <td className="py-4 px-6 text-slate-500 dark:text-slate-400 text-xs font-mono whitespace-nowrap">
                                {(showSku && p.sku) || (showBarcode && p.barcode) ? (
                                  <div>
                                    {showSku && p.sku && <div>SKU: {p.sku}</div>}
                                    {showBarcode && p.barcode && <div>BC: {p.barcode}</div>}
                                  </div>
                                ) : (
                                  '—'
                                )}
                              </td>
                            )}
                            <td className="py-4 px-6 text-right text-slate-600 dark:text-slate-400 whitespace-nowrap">
                              {formatCurrency(p.purchase_price, currency)}
                            </td>
                            <td className="py-4 px-6 text-right font-bold text-slate-900 dark:text-white whitespace-nowrap">
                              {formatCurrency(p.selling_price, currency)}
                            </td>
                            <td className="py-4 px-6 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-2">
                                <span
                                  className={`font-black text-sm ${
                                    p.current_stock > 5
                                      ? 'text-emerald-600 dark:text-emerald-400'
                                      : p.current_stock > 0
                                      ? 'text-amber-600 dark:text-amber-400'
                                      : 'text-rose-600 dark:text-rose-400'
                                  }`}
                                >
                                  {p.current_stock}
                                </span>
                                {p.is_active && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setStockUpdateProduct(p);
                                      setShowStockUpdateModal(true);
                                    }}
                                    className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-brand-50 dark:bg-brand-950/40 hover:bg-brand-600 text-brand-700 dark:text-brand-300 hover:text-white border border-brand-300/80 dark:border-brand-800 shadow-2xs transition group"
                                    title={`Add / Update stock for ${p.name}`}
                                  >
                                    <Plus className="h-3.5 w-3.5 transition group-hover:scale-110" />
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="py-4 px-6 text-center whitespace-nowrap">
                              <Badge
                                status={
                                  p.current_stock > 5
                                    ? 'IN_STOCK'
                                    : p.current_stock > 0
                                    ? 'LOW_STOCK'
                                    : 'OUT_OF_STOCK'
                                }
                              />
                            </td>
                            <td className="py-4 px-6 text-right whitespace-nowrap">
                              {p.is_active ? (
                                <div className="flex items-center justify-end gap-2">
                                  {/* Direct SELL Button */}
                                  {onSellProduct && p.current_stock > 0 && (
                                    <Button
                                      variant="primary"
                                      size="sm"
                                      icon={<ShoppingCart className="h-3 w-3" />}
                                      onClick={() => onSellProduct(p)}
                                      className="text-xs py-1 px-2.5 font-bold shadow-sm"
                                    >
                                      Sell
                                    </Button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEdit(p)}
                                    className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                                    title="Edit Product"
                                  >
                                    <Edit2 className="h-4 w-4" />
                                  </button>
                                  {enableBarcodePrinter && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setBarcodePrintProducts([p]);
                                        setBarcodePrintCopies(Math.max(1, p.current_stock || 1));
                                        setShowBarcodeModal(true);
                                      }}
                                      className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-brand-700 dark:hover:text-brand-300 hover:bg-brand-50 dark:hover:bg-brand-950/40 transition"
                                      title={`Print Barcode Label for ${p.name}`}
                                    >
                                      <Barcode className="h-4 w-4" />
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => setDeletingProduct(p)}
                                    className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
                                    title="Deactivate Product"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-end gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    icon={<RotateCcw className="h-3.5 w-3.5" />}
                                    onClick={() => handleRestore(p.id)}
                                    className="text-xs py-1 px-2.5 font-semibold text-brand-700 dark:text-brand-300 hover:bg-brand-50 dark:hover:bg-brand-950/40"
                                  >
                                    Restore
                                  </Button>
                                  <Button
                                    variant="danger"
                                    size="sm"
                                    icon={<Trash2 className="h-3.5 w-3.5" />}
                                    onClick={() => setDeletingProduct(p)}
                                    className="text-xs py-1 px-2.5 font-bold shadow-sm"
                                    title="Delete Permanently"
                                  >
                                    Delete
                                  </Button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add / Edit Product Modal */}
      <Modal
        isOpen={showProductModal}
        onClose={() => setShowProductModal(false)}
        title={editingProduct ? `Edit ${editingProduct.name}` : 'Add New Product'}
        subtitle={editingProduct ? editingProduct.product_id : 'Enter product details below'}
        maxWidth="lg"
      >
        <form onSubmit={handleSaveProduct} className="space-y-4">
          {modalError && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs font-medium">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{modalError}</span>
            </div>
          )}

          <Input
            label="Product Name *"
            placeholder="e.g. Standard Product Name / Model"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
            autoFocus
          />

          <div className={showSku ? "grid grid-cols-1 sm:grid-cols-2 gap-3" : "space-y-3"}>
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
                value={formData.category_id}
                onChange={(e) =>
                  setFormData({ ...formData, category_id: Number(e.target.value) })
                }
                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:border-brand-500 shadow-sm"
              >
                <option value={0}>No Category</option>
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
                placeholder="e.g. SKU-001"
                value={formData.sku}
                onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
              />
            )}
          </div>

          {showBarcode && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Barcode (Optional)
                </label>
                <button
                  type="button"
                  onClick={handleGenerateBarcode}
                  disabled={generatingBarcode}
                  className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded-lg transition"
                >
                  <Sparkles className="h-3 w-3" />
                  <span>{generatingBarcode ? 'Generating...' : '⚡ Generate'}</span>
                </button>
              </div>
              <Input
                placeholder="Scan or type barcode..."
                value={formData.barcode}
                onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
              />
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Input
              label="Cost Price *"
              type="number"
              step="0.01"
              min="0"
              prefix={currency}
              value={formData.purchase_price}
              onChange={(e) =>
                setFormData({ ...formData, purchase_price: Number(e.target.value) })
              }
              required
            />

            <Input
              label="Selling Price *"
              type="number"
              step="0.01"
              min="0"
              prefix={currency}
              value={formData.selling_price}
              onChange={(e) =>
                setFormData({ ...formData, selling_price: Number(e.target.value) })
              }
              required
            />

            {!editingProduct && (
              <Input
                label="Opening Stock"
                type="number"
                min="0"
                value={formData.opening_stock}
                onChange={(e) =>
                  setFormData({ ...formData, opening_stock: Number(e.target.value) })
                }
                hint="Initial units in shop"
              />
            )}
          </div>

          {/* Dynamic Category-Specific & Global Custom Fields */}
          {(() => {
            const activeCategory = categories.find((c) => c.id === Number(formData.category_id));
            const relevantFields = customFields.filter(
              (cf) => !cf.category_id || cf.category_id === Number(formData.category_id)
            );

            if (relevantFields.length === 0) {
              return (
                <div className="border-t border-slate-100 pt-3">
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 text-xs text-slate-500">
                    <strong>Category Specifications:</strong> No custom attributes defined yet for{' '}
                    <span className="font-bold text-slate-700">{activeCategory?.name || 'this category'}</span>.
                    You can add category-specific fields in <strong className="text-slate-700">Settings → Custom Attributes</strong>.
                  </div>
                </div>
              );
            }

            return (
              <div className="border-t border-slate-100 pt-3 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <span>Specifications & Attributes</span>
                    {activeCategory && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {activeCategory.name}
                      </span>
                    )}
                  </h4>
                  <span className="text-[11px] text-slate-400 font-medium">
                    {relevantFields.length} field{relevantFields.length !== 1 ? 's' : ''} available
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {relevantFields.map((cf) => {
                    const isGlobal = !cf.category_id;
                    if (cf.field_type === 'select' && cf.options) {
                      const opts = cf.options.split(',').map((o) => o.trim()).filter(Boolean);
                      return (
                        <div key={cf.id}>
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                              {cf.name} {cf.is_required && '*'}
                            </label>
                            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-500">
                              {isGlobal ? 'Global' : activeCategory?.name || 'Category'}
                            </span>
                          </div>
                          <select
                            value={customFieldValues[cf.id] || ''}
                            onChange={(e) =>
                              setCustomFieldValues({
                                ...customFieldValues,
                                [cf.id]: e.target.value,
                              })
                            }
                            className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 focus:outline-none focus:border-emerald-500 shadow-sm"
                            required={cf.is_required}
                          >
                            <option value="">Select {cf.name}...</option>
                            {opts.map((opt, i) => (
                              <option key={i} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    }
                    return (
                      <div key={cf.id}>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                            {cf.name} {cf.is_required && '*'}
                          </label>
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-500">
                            {isGlobal ? 'Global' : activeCategory?.name || 'Category'}
                          </span>
                        </div>
                        <input
                          type={cf.field_type === 'number' ? 'number' : cf.field_type === 'date' ? 'date' : 'text'}
                          placeholder={`Enter ${cf.name}`}
                          value={customFieldValues[cf.id] || ''}
                          onChange={(e) =>
                            setCustomFieldValues({
                              ...customFieldValues,
                              [cf.id]: e.target.value,
                            })
                          }
                          required={cf.is_required}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-800 focus:outline-none focus:border-emerald-500 shadow-sm"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          <div className="flex flex-wrap items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowProductModal(false)}
            >
              Cancel
            </Button>
            {enableBarcodePrinter && (
              <Button
                type="button"
                variant="secondary"
                icon={<Barcode className="h-4 w-4 text-emerald-600" />}
                onClick={() => handleSaveProduct(undefined, true)}
                loading={saving}
                className="font-bold border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              >
                Save & Print Barcode
              </Button>
            )}
            <Button type="submit" variant="primary" loading={saving}>
              {editingProduct ? 'Save Changes' : 'Create Product'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Bulk Add Products Modal */}
      <BulkAddProductsModal
        isOpen={showBulkModal}
        onClose={() => setShowBulkModal(false)}
        categories={categories}
        customFields={customFields}
        settings={settings}
        initialCategoryId={selectedCategory}
        onProductsAdded={loadData}
      />

      {/* Quick Stock Adjustment Modal */}
      <StockAdjustmentModal
        isOpen={Boolean(adjustingProduct)}
        onClose={() => setAdjustingProduct(null)}
        product={adjustingProduct}
        settings={settings}
        onStockAdjusted={loadData}
      />

      {/* Stock Update / Purchase Modal */}
      <NewPurchaseModal
        isOpen={showStockUpdateModal}
        onClose={() => {
          setShowStockUpdateModal(false);
          setStockUpdateProduct(null);
        }}
        products={products}
        settings={settings}
        lockedProduct={stockUpdateProduct}
        onPurchaseCreated={loadData}
      />

      {/* Quick Add / Manage Category Modal */}
      <Modal
        isOpen={showAddCatModal}
        onClose={() => setShowAddCatModal(false)}
        title="Manage Product Categories"
        subtitle="Add new categories or delete existing categories (and their products)"
        maxWidth="md"
      >
        <div className="space-y-4">
          <form onSubmit={handleCreateCategory} className="space-y-3">
            <Input
              label="New Category Name *"
              placeholder="e.g. Category Name"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              required
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setShowAddCatModal(false)}
              >
                Close
              </Button>
              <Button type="submit" variant="primary" size="sm" disabled={!newCatName.trim()}>
                + Add Category
              </Button>
            </div>
          </form>

          {categories.length > 0 && (
            <div className="border-t border-slate-100 pt-3 space-y-2">
              <span className="text-xs font-bold uppercase text-slate-500 block">
                Existing Categories ({categories.length})
              </span>
              <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-200">
                {categories.map((c) => (
                  <div key={c.id} className="p-2.5 flex items-center justify-between hover:bg-slate-50 text-xs">
                    <span className="font-bold text-slate-800">{c.name}</span>
                    <button
                      type="button"
                      onClick={async () => {
                        if (
                          window.confirm(
                            `WARNING: Delete category "${c.name}"?\nALL products belonging to this category will be permanently deleted.`
                          )
                        ) {
                          try {
                            await api.deleteCategory(c.id);
                            loadData();
                          } catch (err: any) {
                            alert(err.detail || 'Failed to delete category');
                          }
                        }
                      }}
                      className="text-rose-600 hover:text-rose-800 p-1 rounded hover:bg-rose-50 flex items-center gap-1 font-semibold"
                      title="Delete Category & Products"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Delete Product Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deletingProduct)}
        onClose={() => setDeletingProduct(null)}
        onConfirm={handleConfirmDelete}
        title={`Delete ${deletingProduct?.name}?`}
        message={`Are you sure you want to delete "${deletingProduct?.name}"? This action will remove the product from your catalog.`}
        confirmText="Delete Product"
        variant="danger"
        loading={deleting}
      />

      {/* Barcode Print Modal */}
      <BarcodePrintModal
        isOpen={showBarcodeModal}
        onClose={() => setShowBarcodeModal(false)}
        settings={settings}
        products={barcodePrintProducts}
        initialCopies={barcodePrintCopies}
      />

      {/* Unregistered Barcode Prompt Modal */}
      <UnregisteredBarcodeModal
        isOpen={Boolean(unregisteredBarcode)}
        onClose={() => setUnregisteredBarcode(null)}
        barcode={unregisteredBarcode || ''}
        contextText="Enter this product's name and price to add it to your active inventory catalog."
        onRegister={(code) => {
          setUnregisteredBarcode(null);
          handleOpenAdd(code);
        }}
      />

      {/* Floating Scanner Feedback Toast */}
      {scanToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-slate-900 text-white shadow-2xl text-xs font-bold border border-slate-700 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="h-6 w-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <Check className="h-3.5 w-3.5" />
          </div>
          <span>{scanToast}</span>
        </div>
      )}

      {/* Floating Back to Top Button */}
      {showBackToTop && (
        <button
          type="button"
          onClick={scrollToTop}
          className="fixed bottom-8 right-8 z-40 p-3.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-200 flex items-center justify-center group focus:outline-none focus:ring-4 focus:ring-emerald-200 border border-emerald-500/30 animate-in fade-in zoom-in-90"
          title="Back to Top"
          aria-label="Back to Top"
        >
          <ArrowUp className="h-5 w-5 group-hover:-translate-y-0.5 transition-transform" />
        </button>
      )}
    </div>
  );
};
