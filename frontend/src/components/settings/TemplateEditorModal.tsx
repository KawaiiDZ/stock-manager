import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { Category, Product, BillTemplate, BillTemplateCreate } from '../../types';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import {
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Layers,
  AlertCircle,
  Package,
  Sparkles,
  Tag,
} from 'lucide-react';

interface TemplateEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  templateToEdit?: BillTemplate | null;
  onSaved: () => void;
}

interface SlotState {
  id?: number;
  slot_name: string;
  category_id: number | null;
  category_name: string;
  default_product_id: number | null;
  default_quantity: number;
}

export const TemplateEditorModal: React.FC<TemplateEditorModalProps> = ({
  isOpen,
  onClose,
  templateToEdit,
  onSaved,
}) => {
  const [name, setName] = useState('');
  const [slots, setSlots] = useState<SlotState[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Load categories and products when modal opens
  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      setErrorMsg(null);
      Promise.all([
        api.getCategories(true).catch(() => []),
        api.getProducts({ is_active: true }).catch(() => []),
      ])
        .then(([cats, prods]) => {
          setCategories(cats || []);
          setProducts(prods || []);
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen]);

  // Initialize form state when editing or creating
  useEffect(() => {
    if (isOpen) {
      if (templateToEdit) {
        setName(templateToEdit.name);
        const mappedSlots: SlotState[] = (templateToEdit.items || []).map((item) => ({
          id: item.id,
          slot_name: item.slot_name,
          category_id: item.category_id || null,
          category_name: item.category_name || '',
          default_product_id: item.default_product_id || null,
          default_quantity: item.default_quantity || 1,
        }));
        setSlots(
          mappedSlots.length > 0
            ? mappedSlots
            : [
                {
                  slot_name: 'Main Item',
                  category_id: null,
                  category_name: '',
                  default_product_id: null,
                  default_quantity: 1,
                },
              ]
        );
      } else {
        setName('');
        setSlots([
          {
            slot_name: 'Solar Panels / Component 1',
            category_id: null,
            category_name: '',
            default_product_id: null,
            default_quantity: 1,
          },
        ]);
      }
    }
  }, [isOpen, templateToEdit]);

  const handleAddSlot = () => {
    const firstCat = categories[0];
    setSlots((prev) => [
      ...prev,
      {
        slot_name: `Component ${prev.length + 1}`,
        category_id: firstCat ? firstCat.id : null,
        category_name: firstCat ? firstCat.name : '',
        default_product_id: null,
        default_quantity: 1,
      },
    ]);
  };

  const handleRemoveSlot = (idx: number) => {
    if (slots.length <= 1) {
      setErrorMsg('Templates must have at least one component slot.');
      return;
    }
    setSlots((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleMoveSlot = (idx: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= slots.length) return;
    setSlots((prev) => {
      const copy = [...prev];
      const temp = copy[idx];
      copy[idx] = copy[targetIdx];
      copy[targetIdx] = temp;
      return copy;
    });
  };

  const handleCategoryChange = (idx: number, catIdStr: string) => {
    const catId = catIdStr ? Number(catIdStr) : null;
    const cat = categories.find((c) => c.id === catId);
    setSlots((prev) => {
      const copy = [...prev];
      copy[idx] = {
        ...copy[idx],
        category_id: catId,
        category_name: cat ? cat.name : '',
        // If current default product doesn't match new category, reset it
        default_product_id: null,
      };
      return copy;
    });
  };

  const handleProductChange = (idx: number, prodIdStr: string) => {
    const prodId = prodIdStr ? Number(prodIdStr) : null;
    setSlots((prev) => {
      const copy = [...prev];
      copy[idx] = {
        ...copy[idx],
        default_product_id: prodId,
      };
      return copy;
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMsg('Template name is required.');
      return;
    }

    if (slots.length === 0) {
      setErrorMsg('At least one component slot is required.');
      return;
    }

    for (let i = 0; i < slots.length; i++) {
      if (!slots[i].slot_name.trim()) {
        setErrorMsg(`Slot #${i + 1} must have a component name.`);
        return;
      }
      if (!slots[i].default_quantity || Number(slots[i].default_quantity) < 1) {
        setErrorMsg(`Slot #${i + 1} ("${slots[i].slot_name}") quantity must be at least 1.`);
        return;
      }
    }

    const payload: BillTemplateCreate = {
      name: trimmedName,
      items: slots.map((s, idx) => ({
        display_order: idx + 1,
        slot_name: s.slot_name.trim(),
        category_id: s.category_id,
        category_name: s.category_name || undefined,
        default_product_id: s.default_product_id,
        default_quantity: Math.max(1, Number(s.default_quantity) || 1),
        is_optional: true,
      })),
    };

    setSaving(true);
    try {
      if (templateToEdit) {
        await api.updateBillTemplate(templateToEdit.id, payload);
      } else {
        await api.createBillTemplate(payload);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.detail || err.message || 'Failed to save bill template.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={templateToEdit ? 'Edit Bill Template' : 'Create Bill Template'}
      subtitle="Define category-constrained package templates for solar, AC, or recurring installation bills."
      maxWidth="5xl"
    >
      <form onSubmit={handleSave} className="space-y-6">
        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Basic Information */}
        <div className="bg-slate-50 dark:bg-slate-900/40 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
              Template Name *
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. 4kW Hybrid Solar System, 1.5 Ton Inverter AC Setup"
              required
              autoFocus
            />
          </div>
        </div>

        {/* Component Slots Section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">
                Template Component Rows & Categories
              </h4>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-medium">
                {slots.length} {slots.length === 1 ? 'row' : 'rows'}
              </span>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleAddSlot}
              className="flex items-center gap-1.5 text-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Row</span>
            </Button>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            Each row restricts POS item selection to its assigned category. In POS, unneeded rows left blank will automatically be omitted from the receipt.
          </p>

          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100/80 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 uppercase font-black tracking-wider text-[11px]">
                    <th className="py-2.5 px-3 w-12 text-center">S.N</th>
                    <th className="py-2.5 px-3 min-w-[180px]">Component Slot</th>
                    <th className="py-2.5 px-3 min-w-[180px]">Constrained Category</th>
                    <th className="py-2.5 px-3 min-w-[220px]">Default Product (Optional)</th>
                    <th className="py-2.5 px-2 w-28 text-right">Default Qty</th>
                    <th className="py-2.5 px-3 w-24 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                  {slots.map((slot, idx) => {
                    // Filter products matching this slot's category
                    const categoryProducts = slot.category_id
                      ? products.filter((p) => p.category_id === slot.category_id)
                      : products;

                    return (
                      <tr
                        key={idx}
                        className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        {/* S.N */}
                        <td className="py-2.5 px-3 text-center font-bold text-slate-400 dark:text-slate-500">
                          {idx + 1}
                        </td>

                        {/* Slot Name */}
                        <td className="py-2 px-3">
                          <input
                            type="text"
                            value={slot.slot_name}
                            onChange={(e) => {
                              const val = e.target.value;
                              setSlots((prev) => {
                                const copy = [...prev];
                                copy[idx] = { ...copy[idx], slot_name: val };
                                return copy;
                              });
                            }}
                            placeholder="e.g. Solar Panels, Battery"
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:ring-1 focus:ring-emerald-500 outline-none text-xs"
                            required
                          />
                        </td>

                        {/* Constrained Category */}
                        <td className="py-2 px-3">
                          <select
                            value={slot.category_id !== null ? String(slot.category_id) : ''}
                            onChange={(e) => handleCategoryChange(idx, e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-semibold focus:ring-1 focus:ring-emerald-500 outline-none"
                          >
                            <option value="">Any Category (Unrestricted)</option>
                            {categories.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* Default Product */}
                        <td className="py-2 px-3">
                          <select
                            value={slot.default_product_id !== null ? String(slot.default_product_id) : ''}
                            onChange={(e) => handleProductChange(idx, e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-1 focus:ring-emerald-500 outline-none"
                          >
                            <option value="">-- Choose in POS --</option>
                            {categoryProducts.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} {p.sku ? `(${p.sku})` : ''} - Rs. {p.selling_price}
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* Default Quantity */}
                        <td className="py-2 px-2 text-right">
                          <input
                            type="number"
                            min="1"
                            step="1"
                            placeholder="1"
                            value={slot.default_quantity || ''}
                            onFocus={(e) => requestAnimationFrame(() => e.target.select())}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/^0+(?=[1-9])/, '');
                              const val = parseInt(raw, 10);
                              setSlots((prev) => {
                                const copy = [...prev];
                                copy[idx] = {
                                  ...copy[idx],
                                  default_quantity: isNaN(val) ? 1 : Math.max(1, val),
                                };
                                return copy;
                              });
                            }}
                            onBlur={(e) => {
                              const val = parseInt(e.target.value, 10);
                              if (isNaN(val) || val < 1) {
                                setSlots((prev) => {
                                  const copy = [...prev];
                                  copy[idx] = { ...copy[idx], default_quantity: 1 };
                                  return copy;
                                });
                              }
                            }}
                            className="w-16 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-right font-bold focus:ring-1 focus:ring-emerald-500 outline-none text-xs"
                          />
                        </td>

                        {/* Actions: Up, Down, Delete */}
                        <td className="py-2 px-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleMoveSlot(idx, 'up')}
                              disabled={idx === 0}
                              className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-20 transition"
                              title="Move up"
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveSlot(idx, 'down')}
                              disabled={idx === slots.length - 1}
                              className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-20 transition"
                              title="Move down"
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveSlot(idx)}
                              className="p-1 rounded text-rose-400 hover:text-rose-600 dark:hover:text-rose-300 transition"
                              title="Delete row"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={saving} className="min-w-[120px]">
            {templateToEdit ? 'Save Changes' : 'Create Template'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
