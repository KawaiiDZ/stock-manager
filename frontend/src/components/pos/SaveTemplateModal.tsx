import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { Product, Category, BillTemplate, BillTemplateCreate } from '../../types';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { BookmarkPlus, Plus, Trash2, Layers, AlertCircle, CheckCircle2 } from 'lucide-react';

interface CartItemForTemplate {
  product: Product;
  quantity: number;
  unit_price?: number;
}

interface SaveTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  cartItems: CartItemForTemplate[];
  onTemplateSaved: (template: BillTemplate) => void;
}

interface EditableTemplateSlot {
  slot_name: string;
  category_id?: number | null;
  category_name?: string | null;
  default_product_id?: number | null;
  default_product_name?: string | null;
  default_quantity: number;
  is_optional: boolean;
}

export const SaveTemplateModal: React.FC<SaveTemplateModalProps> = ({
  isOpen,
  onClose,
  cartItems,
  onTemplateSaved,
}) => {
  const [templateName, setTemplateName] = useState('');
  const [slots, setSlots] = useState<EditableTemplateSlot[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Fetch all categories once
  useEffect(() => {
    if (isOpen) {
      api.getCategories().then(setCategories).catch(() => {});
    }
  }, [isOpen]);

  // Pre-fill slots from active cart items
  useEffect(() => {
    if (isOpen) {
      setTemplateName('');
      setErrorMsg(null);

      const initialSlots: EditableTemplateSlot[] = cartItems.map((item, idx) => {
        const catName = (item.product as any).category?.name || categories.find(c => c.id === item.product.category_id)?.name || 'General';
        return {
          slot_name: catName || item.product.name,
          category_id: item.product.category_id || null,
          category_name: catName,
          default_product_id: item.product.id,
          default_product_name: item.product.name,
          default_quantity: item.quantity || 1,
          is_optional: true,
        };
      });

      setSlots(initialSlots);
    }
  }, [isOpen, cartItems, categories]);

  const handleAddSlot = () => {
    setSlots((prev) => [
      ...prev,
      {
        slot_name: `Slot ${prev.length + 1}`,
        category_id: categories[0]?.id || null,
        category_name: categories[0]?.name || '',
        default_product_id: null,
        default_quantity: 1,
        is_optional: true,
      },
    ]);
  };

  const handleRemoveSlot = (index: number) => {
    setSlots((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSlotChange = (index: number, field: keyof EditableTemplateSlot, value: any) => {
    setSlots((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      if (field === 'category_id') {
        const cat = categories.find((c) => c.id === Number(value));
        copy[index].category_name = cat ? cat.name : '';
      }
      return copy;
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!templateName.trim()) {
      setErrorMsg('Template name is required.');
      return;
    }
    if (slots.length === 0) {
      setErrorMsg('At least one slot/row is required in the template.');
      return;
    }

    for (let i = 0; i < slots.length; i++) {
      if (!slots[i].default_quantity || Number(slots[i].default_quantity) < 1) {
        setErrorMsg(`Slot #${i + 1} ("${slots[i].slot_name}") quantity must be at least 1.`);
        return;
      }
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const payload: BillTemplateCreate = {
        name: templateName.trim(),
        items: slots.map((s, idx) => ({
          display_order: idx + 1,
          slot_name: s.slot_name.trim() || `Item ${idx + 1}`,
          category_id: s.category_id || null,
          category_name: s.category_name || null,
          default_product_id: s.default_product_id || null,
          default_quantity: Math.max(1, Number(s.default_quantity) || 1),
          is_optional: s.is_optional,
        })),
      };

      const res = await api.createBillTemplate(payload);
      onTemplateSaved(res);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.detail || 'Failed to save bill template.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Save Current Bill as Template" maxWidth="2xl">
      <form onSubmit={handleSave} className="space-y-4">
        {errorMsg && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl flex items-center gap-2 text-rose-600 dark:text-rose-400 text-xs">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
            Template Name *
          </label>
          <Input
            placeholder="e.g. 4kW Hybrid Solar System, 1.5 Ton AC Install"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            required
            autoFocus
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-brand-500" />
              Template Slots ({slots.length})
            </span>
            <button
              type="button"
              onClick={handleAddSlot}
              className="flex items-center gap-1 text-xs font-bold text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 px-2.5 py-1 rounded-lg bg-brand-50 dark:bg-brand-950/40 border border-brand-200 dark:border-brand-800/60 transition"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Slot
            </button>
          </div>

          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800 max-h-80 overflow-y-auto">
            {slots.map((slot, idx) => (
              <div key={idx} className="p-3 bg-white dark:bg-slate-900/50 flex flex-col md:flex-row items-start md:items-center gap-3">
                <span className="text-xs font-bold text-slate-400 w-6 text-center shrink-0">
                  #{idx + 1}
                </span>

                <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-3 gap-2 w-full">
                  {/* Slot Label */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-0.5">
                      Slot Label
                    </label>
                    <input
                      type="text"
                      className="w-full text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                      value={slot.slot_name}
                      placeholder="e.g. Solar Panels"
                      onChange={(e) => handleSlotChange(idx, 'slot_name', e.target.value)}
                      required
                    />
                  </div>

                  {/* Category constraint */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-0.5">
                      Locked Category
                    </label>
                    <select
                      className="w-full text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                      value={slot.category_id || ''}
                      onChange={(e) => handleSlotChange(idx, 'category_id', e.target.value ? Number(e.target.value) : null)}
                    >
                      <option value="">(No Category Lock)</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Default Quantity */}
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-0.5">
                        Default Qty
                      </label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        className="w-full text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                        value={slot.default_quantity || ''}
                        placeholder="1"
                        onFocus={(e) => requestAnimationFrame(() => e.target.select())}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/^0+(?=[1-9])/, '');
                          const val = parseInt(raw, 10);
                          handleSlotChange(idx, 'default_quantity', isNaN(val) ? 1 : Math.max(1, val));
                        }}
                        onBlur={(e) => {
                          const val = parseInt(e.target.value, 10);
                          if (isNaN(val) || val < 1) {
                            handleSlotChange(idx, 'default_quantity', 1);
                          }
                        }}
                      />
                    </div>
                    {slot.default_product_name && (
                      <div className="flex-1 truncate" title={slot.default_product_name}>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-0.5">
                          Pre-filled Item
                        </label>
                        <span className="block text-[11px] text-emerald-600 dark:text-emerald-400 font-bold truncate py-1.5">
                          {slot.default_product_name}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleRemoveSlot(idx)}
                  className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition shrink-0"
                  title="Remove slot"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl text-xs text-slate-500 dark:text-slate-400 flex items-start gap-2">
          <BookmarkPlus className="h-4 w-4 text-brand-500 shrink-0 mt-0.5" />
          <span>
            <strong>Category Persistence:</strong> When this template is selected in POS, each row will only allow picking products from its locked category. Any slots left blank at checkout will automatically be omitted from the receipt.
          </span>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={loading} icon={<BookmarkPlus className="h-4 w-4" />}>
            Save Template
          </Button>
        </div>
      </form>
    </Modal>
  );
};
