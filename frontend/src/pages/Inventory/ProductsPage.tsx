import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../services/api';
import { Product, Category, CustomField, CustomValueDto, BusinessSettings } from '../../types';
import { Plus, Search, Edit2, Archive, RotateCcw, SlidersHorizontal, ShoppingCart, Tag, AlertCircle, Layers, Trash2 } from 'lucide-react';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Modal } from '../../components/common/Modal';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { Badge } from '../../components/common/Badge';
import { EmptyState } from '../../components/common/EmptyState';
import { BulkAddProductsModal } from './BulkAddProductsModal';
import { StockAdjustmentModal } from './StockAdjustmentModal';
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
  const [activeTab, setActiveTab] = useState<'active' | 'deactivated'>('active');
  const [loading, setLoading] = useState(false);

  // Modals
  const [showProductModal, setShowProductModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [adjustingProduct, setAdjustingProduct] = useState<Product | null>(null);

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

  // Deactivate Confirm Dialog
  const [deactivatingProduct, setDeactivatingProduct] = useState<Product | null>(null);
  const [deactivating, setDeactivating] = useState(false);

  // Permanent Delete Confirm Dialog
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);

  const currency = settings?.currency || 'Rs.';

  const loadData = async () => {
    setLoading(true);
    try {
      const [prods, cats, fields] = await Promise.all([
        api.getProducts({
          search: search.trim() || undefined,
          category_id: selectedCategory,
          is_active: activeTab === 'active',
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

  useEffect(() => {
    loadData();
  }, [search, selectedCategory, activeTab]);

  const handleOpenAdd = () => {
    setEditingProduct(null);
    setFormData({
      name: '',
      sku: '',
      barcode: '',
      category_id: categories.length > 0 ? categories[0].id : 0,
      purchase_price: 0,
      selling_price: 0,
      opening_stock: 0,
    });
    setCustomFieldValues({});
    setModalError(null);
    setShowProductModal(true);
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

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
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
      if (editingProduct) {
        await api.updateProduct(editingProduct.id, {
          name: formData.name.trim(),
          sku: formData.sku.trim() || undefined,
          barcode: formData.barcode.trim() || undefined,
          category_id: formData.category_id > 0 ? formData.category_id : undefined,
          purchase_price: formData.purchase_price,
          selling_price: formData.selling_price,
          custom_fields: customDto,
        });
      } else {
        await api.createProduct({
          name: formData.name.trim(),
          sku: formData.sku.trim() || undefined,
          barcode: formData.barcode.trim() || undefined,
          category_id: formData.category_id > 0 ? formData.category_id : undefined,
          purchase_price: formData.purchase_price,
          selling_price: formData.selling_price,
          opening_stock: formData.opening_stock,
          custom_fields: customDto,
        });
      }
      setShowProductModal(false);
      loadData();
    } catch (err: any) {
      setModalError(err.detail || 'Failed to save product.');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDeactivate = async () => {
    if (!deactivatingProduct) return;
    setDeactivating(true);
    try {
      await api.deactivateProduct(deactivatingProduct.id);
      setDeactivatingProduct(null);
      loadData();
    } catch (err: any) {
      alert(err.detail || 'Failed to deactivate product');
    } finally {
      setDeactivating(false);
    }
  };

  const handleRestore = async (productId: number) => {
    try {
      await api.restoreProduct(productId);
      loadData();
    } catch (err: any) {
      alert(err.detail || 'Failed to restore product');
    }
  };

  const handleConfirmPermanentDelete = async () => {
    if (!deletingProduct) return;
    setDeleting(true);
    try {
      await api.deleteProductPermanent(deletingProduct.id);
      setDeletingProduct(null);
      loadData();
    } catch (err: any) {
      alert(err.detail || 'Failed to permanently delete product');
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

  // Group products into dedicated category tables
  const categoryGroups = useMemo(() => {
    if (selectedCategory) {
      const cat = categories.find((c) => c.id === selectedCategory);
      const catProds = products.filter((p) => p.category_id === selectedCategory);
      return [
        {
          id: selectedCategory,
          name: cat ? cat.name : 'Category',
          products: catProds,
        },
      ];
    }

    const groups: { id: number | null; name: string; products: Product[] }[] = [];

    // Categories in order
    categories.forEach((cat) => {
      const catProds = products.filter((p) => p.category_id === cat.id);
      if (catProds.length > 0) {
        groups.push({
          id: cat.id,
          name: cat.name,
          products: catProds,
        });
      }
    });

    // Uncategorized products
    const uncategorized = products.filter((p) => !p.category_id);
    if (uncategorized.length > 0) {
      groups.push({
        id: null,
        name: 'General / Uncategorized',
        products: uncategorized,
      });
    }

    return groups;
  }, [products, categories, selectedCategory]);

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">Products & Stock</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Manage your product catalog, prices, bulk adding, and live inventory
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Tabs */}
          <div className="flex items-center gap-1 bg-slate-200/70 p-1.5 rounded-2xl text-xs font-bold">
            <button
              onClick={() => setActiveTab('active')}
              className={`px-3.5 py-1.5 rounded-xl transition ${
                activeTab === 'active' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              Active Catalog
            </button>
            <button
              onClick={() => setActiveTab('deactivated')}
              className={`px-3.5 py-1.5 rounded-xl transition ${
                activeTab === 'deactivated' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              Deactivated
            </button>
          </div>

          <Button
            variant="outline"
            size="md"
            icon={<Layers className="h-4 w-4 text-emerald-600" />}
            onClick={() => setShowBulkModal(true)}
            className="font-bold border-emerald-300 text-emerald-800 bg-emerald-50/50 hover:bg-emerald-100/60"
          >
            + Bulk Add Products
          </Button>

          <Button
            variant="primary"
            size="md"
            icon={<Plus className="h-4 w-4" />}
            onClick={handleOpenAdd}
          >
            + Add Product
          </Button>
        </div>
      </div>

      {/* Search & Category Filter Toolbar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
        <div className="flex-1">
          <Input
            placeholder="Search products by Name, Product ID, SKU, or Barcode..."
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
          className="bg-white border border-slate-200 text-sm font-semibold rounded-xl px-4 py-2.5 text-slate-700 focus:outline-none focus:border-emerald-500 shadow-sm cursor-pointer"
        >
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Category Tables */}
      <div className="space-y-8">
        {loading ? (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-16 text-center text-slate-400">
            Loading products...
          </div>
        ) : categoryGroups.length === 0 || products.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <EmptyState
              title={activeTab === 'active' ? 'No products in catalog' : 'No deactivated products'}
              description={
                activeTab === 'active'
                  ? 'Add products individually or use bulk adding to build your inventory.'
                  : 'Deactivated products will appear here and can be restored anytime.'
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
            const totalValuation = group.products.reduce(
              (acc, p) => acc + Number(p.purchase_price || 0) * Number(p.current_stock || 0),
              0
            );

            return (
              <div key={group.id ?? 'uncategorized'} className="space-y-3">
                {/* Category Section Header Card */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-slate-900 text-white shadow-xs">
                      <Tag className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-extrabold text-slate-900">{group.name}</h2>
                        <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200/60">
                          {group.products.length} {group.products.length === 1 ? 'product' : 'products'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5 font-medium">
                        {groupCustomFields.length > 0
                          ? `Attributes: ${groupCustomFields.map((f) => f.name).join(', ')}`
                          : 'Standard Catalog Attributes'}
                      </p>
                    </div>
                  </div>

                  {/* Quick Category Summary Stats */}
                  <div className="flex items-center gap-3 text-xs font-semibold text-slate-600 bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-200/60 self-start sm:self-auto">
                    <span>
                      Total Stock:{' '}
                      <strong className="text-slate-900 font-bold">{totalStock} units</strong>
                    </span>
                    <span className="text-slate-300">•</span>
                    <span>
                      Valuation:{' '}
                      <strong className="text-emerald-700 font-bold">
                        {formatCurrency(totalValuation, currency)}
                      </strong>
                    </span>
                  </div>
                </div>

                {/* Dedicated Category Table */}
                <div className="overflow-x-auto rounded-2xl border border-slate-200/80 shadow-sm bg-white">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      <tr>
                        <th className="py-3.5 px-6 whitespace-nowrap">Product ID</th>
                        <th className="py-3.5 px-6 whitespace-nowrap">Product Name</th>
                        {groupCustomFields.map((cf) => (
                          <th
                            key={cf.id}
                            className="py-3.5 px-4 text-slate-700 whitespace-nowrap text-[11px] font-bold uppercase tracking-wider"
                          >
                            <div className="flex items-center gap-1.5">
                              <span>{cf.name}</span>
                              {!cf.category_id && (
                                <span className="text-[9px] px-1 py-0.2 rounded bg-slate-200/70 text-slate-500 font-semibold normal-case">
                                  Global
                                </span>
                              )}
                            </div>
                          </th>
                        ))}
                        <th className="py-3.5 px-6 whitespace-nowrap">SKU / Barcode</th>
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
                          <tr key={p.id} className="hover:bg-slate-50/60 transition">
                            <td className="py-4 px-6 font-bold text-slate-900 whitespace-nowrap">{p.product_id}</td>
                            <td className="py-4 px-6 font-bold text-slate-800 whitespace-nowrap">
                              {p.name}
                            </td>
                            {groupCustomFields.map((cf) => {
                              const customVal = p.custom_fields?.find((cv) => cv.field_id === cf.id)?.value;
                              return (
                                <td key={cf.id} className="py-4 px-4 text-xs font-semibold text-slate-700 whitespace-nowrap">
                                  {customVal ? (
                                    <span className="inline-block bg-slate-100 text-slate-800 px-2.5 py-1 rounded-lg font-semibold text-xs border border-slate-200/60">
                                      {customVal}
                                    </span>
                                  ) : (
                                    <span className="text-slate-300 font-bold">—</span>
                                  )}
                                </td>
                              );
                            })}
                            <td className="py-4 px-6 text-slate-500 text-xs font-mono whitespace-nowrap">
                              {p.sku || p.barcode ? (
                                <div>
                                  {p.sku && <div>SKU: {p.sku}</div>}
                                  {p.barcode && <div>BC: {p.barcode}</div>}
                                </div>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="py-4 px-6 text-right text-slate-600 whitespace-nowrap">
                              {formatCurrency(p.purchase_price, currency)}
                            </td>
                            <td className="py-4 px-6 text-right font-bold text-slate-900 whitespace-nowrap">
                              {formatCurrency(p.selling_price, currency)}
                            </td>
                            <td className="py-4 px-6 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1.5">
                                <span
                                  className={`font-black text-sm ${
                                    p.current_stock > 5
                                      ? 'text-emerald-700'
                                      : p.current_stock > 0
                                      ? 'text-amber-600'
                                      : 'text-rose-600'
                                  }`}
                                >
                                  {p.current_stock}
                                </span>
                                {p.is_active && (
                                  <button
                                    onClick={() => setAdjustingProduct(p)}
                                    className="p-1 text-slate-300 hover:text-slate-600"
                                    title="Adjust Physical Stock Count"
                                  >
                                    <SlidersHorizontal className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="py-4 px-6 text-center whitespace-nowrap">
                              <Badge status={p.is_active ? 'ACTIVE' : 'INACTIVE'} />
                            </td>
                            <td className="py-4 px-6 text-right whitespace-nowrap">
                              {p.is_active ? (
                                <div className="flex items-center justify-end gap-2">
                                  {/* Direct SELL Button (Section 59 requirement) */}
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
                                    onClick={() => handleOpenEdit(p)}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                                    title="Edit Product"
                                  >
                                    <Edit2 className="h-4 w-4" />
                                  </button>
                                  <button
                                    onClick={() => setDeactivatingProduct(p)}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                                    title="Deactivate Product"
                                  >
                                    <Archive className="h-4 w-4" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-end gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    icon={<RotateCcw className="h-3.5 w-3.5" />}
                                    onClick={() => handleRestore(p.id)}
                                    className="text-xs py-1 px-2.5 font-semibold text-emerald-700 hover:bg-emerald-50"
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
            <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Category
                </label>
                <button
                  type="button"
                  onClick={() => setShowAddCatModal(true)}
                  className="text-xs text-emerald-600 hover:underline font-semibold"
                >
                  + Add Category
                </button>
              </div>
              <select
                value={formData.category_id}
                onChange={(e) =>
                  setFormData({ ...formData, category_id: Number(e.target.value) })
                }
                className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 focus:outline-none focus:border-emerald-500 shadow-sm"
              >
                <option value={0}>No Category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <Input
              label="SKU (Optional)"
              placeholder="e.g. SKU-001"
              value={formData.sku}
              onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
            />
          </div>

          <Input
            label="Barcode (Optional)"
            placeholder="Scan or type barcode..."
            value={formData.barcode}
            onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
          />

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
                    ℹ️ <strong>Category Specifications:</strong> No custom attributes defined yet for{' '}
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

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowProductModal(false)}
            >
              Cancel
            </Button>
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
                            `⚠️ WARNING: Delete category "${c.name}"?\nALL products belonging to this category will be permanently deleted.`
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

      {/* Deactivate Friendly Confirm Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deactivatingProduct)}
        onClose={() => setDeactivatingProduct(null)}
        onConfirm={handleConfirmDeactivate}
        title={`Deactivate ${deactivatingProduct?.name}?`}
        message="You can find it later under Deactivated Products and restore it anytime."
        confirmText="Deactivate"
        variant="danger"
        loading={deactivating}
      />

      {/* Permanent Delete Confirm Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deletingProduct)}
        onClose={() => setDeletingProduct(null)}
        onConfirm={handleConfirmPermanentDelete}
        title={`Permanently Delete ${deletingProduct?.name}?`}
        message={`Are you sure you want to permanently delete "${deletingProduct?.name}" (${deletingProduct?.product_id})? This action cannot be undone and will completely remove the product from your database.`}
        confirmText="Delete Permanently"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
};
