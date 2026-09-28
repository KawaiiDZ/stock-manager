import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { CustomField, Category, IndustryPreset } from '../../types';
import {
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  Sliders,
  Eye,
  Search,
  Printer,
  Sparkles,
  AlertCircle,
  Smartphone,
  Shirt,
  Pill,
  ShoppingCart,
  Wrench,
  Store,
  Tag,
  Zap,
  GripVertical,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Modal } from '../../components/common/Modal';

interface SchemaBuilderProps {
  onSchemaUpdated?: () => void;
  onOpenWizard?: () => void;
}

export const SchemaBuilder: React.FC<SchemaBuilderProps> = ({
  onSchemaUpdated,
  onOpenWizard,
}) => {
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [presets, setPresets] = useState<IndustryPreset[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Active Category Tab for viewing schema
  const [activeCategoryTab, setActiveCategoryTab] = useState<number | 'all' | 'global'>('all');

  // Quick Add Category Modal
  const [showAddCatModal, setShowAddCatModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [inlineCatName, setInlineCatName] = useState('');
  const [inlineCatSaving, setInlineCatSaving] = useState(false);

  // Edit / Rename Category Modal
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editCatName, setEditCatName] = useState('');

  // New field addition
  const [name, setName] = useState('');
  const [targetCategoryId, setTargetCategoryId] = useState<number | ''>('');
  const [fieldType, setFieldType] = useState('text');
  const [options, setOptions] = useState('');
  const [showInTable, setShowInTable] = useState(true);
  const [showInPos, setShowInPos] = useState(true);
  const [showInReceipt, setShowInReceipt] = useState(false);
  const [isRequired, setIsRequired] = useState(false);

  // Edit field modal
  const [editingField, setEditingField] = useState<CustomField | null>(null);

  // Drag-and-drop reordering state
  const [draggedFieldId, setDraggedFieldId] = useState<number | null>(null);
  const [dragOverFieldId, setDragOverFieldId] = useState<number | null>(null);
  const [reordering, setReordering] = useState(false);

  const handleReorderSubset = async (newOrderedSubset: CustomField[]) => {
    const subsetIds = new Set(newOrderedSubset.map((f) => f.id));
    const otherFields = customFields.filter((f) => !subsetIds.has(f.id));
    const updatedSubset = newOrderedSubset.map((f, idx) => ({ ...f, display_order: idx }));
    const combined = [...updatedSubset, ...otherFields];

    setCustomFields(combined);

    try {
      setReordering(true);
      const allOrderedIds = combined.map((f) => f.id);
      const res = await api.reorderCustomFields(allOrderedIds);
      if (res) {
        setCustomFields(res);
        onSchemaUpdated?.();
      }
    } catch (err: any) {
      console.error('Failed to save attribute order:', err);
      setErrorMsg(err.detail || 'Failed to save attribute order');
    } finally {
      setReordering(false);
    }
  };

  const handleDragStart = (e: React.DragEvent, id: number) => {
    setDraggedFieldId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(id));
  };

  const handleDragOver = (e: React.DragEvent, id: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverFieldId !== id) {
      setDragOverFieldId(id);
    }
  };

  const handleDrop = (e: React.DragEvent, targetId: number, visibleList: CustomField[]) => {
    e.preventDefault();
    setDragOverFieldId(null);
    if (!draggedFieldId || draggedFieldId === targetId) {
      setDraggedFieldId(null);
      return;
    }

    const currentIndex = visibleList.findIndex((f) => f.id === draggedFieldId);
    const targetIndex = visibleList.findIndex((f) => f.id === targetId);
    if (currentIndex === -1 || targetIndex === -1) {
      setDraggedFieldId(null);
      return;
    }

    const items = [...visibleList];
    const [draggedItem] = items.splice(currentIndex, 1);
    items.splice(targetIndex, 0, draggedItem);

    setDraggedFieldId(null);
    handleReorderSubset(items);
  };

  const handleMove = (id: number, direction: 'up' | 'down', visibleList: CustomField[]) => {
    const currentIndex = visibleList.findIndex((f) => f.id === id);
    if (currentIndex === -1) return;
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= visibleList.length) return;

    const items = [...visibleList];
    const [movedItem] = items.splice(currentIndex, 1);
    items.splice(targetIndex, 0, movedItem);

    handleReorderSubset(items);
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [cfs, cats, prs] = await Promise.all([
        api.getCustomFields(true),
        api.getCategories(true),
        api.getPresets(),
      ]);
      setCustomFields(cfs || []);
      setCategories(cats || []);
      setPresets(prs || []);
    } catch (err) {
      console.error('Failed to load schema builder data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    try {
      const newCat = await api.createCategory({ name: newCatName.trim() });
      setCategories((prev) => [...prev, newCat]);
      setActiveCategoryTab(newCat.id);
      setTargetCategoryId(newCat.id);
      setShowAddCatModal(false);
      setNewCatName('');
      setSuccessMsg(`Category "${newCat.name}" created! You can now add its custom schema below.`);
    } catch (err: any) {
      setErrorMsg(err.detail || 'Failed to create category.');
    }
  };

  const handleInlineCreateCategory = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const catName = inlineCatName.trim();
    if (!catName || inlineCatSaving) return;
    try {
      setInlineCatSaving(true);
      const newCat = await api.createCategory({ name: catName });
      setCategories((prev) => [...prev, newCat]);
      setActiveCategoryTab(newCat.id);
      setTargetCategoryId(newCat.id);
      setInlineCatName('');
      setSuccessMsg(`Category "${newCat.name}" created! You can now add its custom schema below.`);
      if (onSchemaUpdated) onSchemaUpdated();
    } catch (err: any) {
      setErrorMsg(err.detail || 'Failed to create category.');
    } finally {
      setInlineCatSaving(false);
    }
  };

  const handleRenameCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory || !editCatName.trim()) return;
    try {
      await api.updateCategory(editingCategory.id, { name: editCatName.trim() });
      setSuccessMsg(`Category renamed to "${editCatName.trim()}" successfully.`);
      setEditingCategory(null);
      setEditCatName('');
      loadData();
      if (onSchemaUpdated) onSchemaUpdated();
    } catch (err: any) {
      setErrorMsg(err.detail || 'Failed to rename category.');
    }
  };

  const handleDeleteCategory = async (cat: Category) => {
    const confirmed = window.confirm(
      `WARNING: Are you sure you want to permanently delete the category "${cat.name}"?\n\n` +
      `• ALL products belonging to "${cat.name}" will be deleted immediately.\n` +
      `• All custom schema attributes tied specifically to "${cat.name}" will be deleted.\n\n` +
      `This action cannot be undone. Proceed?`
    );
    if (!confirmed) return;

    try {
      await api.deleteCategory(cat.id);
      setSuccessMsg(`Category "${cat.name}" and all its products were successfully deleted.`);
      if (activeCategoryTab === cat.id) {
        setActiveCategoryTab('all');
        setTargetCategoryId('');
      }
      loadData();
      if (onSchemaUpdated) onSchemaUpdated();
    } catch (err: any) {
      setErrorMsg(err.detail || 'Failed to delete category.');
    }
  };

  const handleSelectTab = (tab: number | 'all' | 'global') => {
    setActiveCategoryTab(tab);
    if (typeof tab === 'number') {
      setTargetCategoryId(tab);
    } else if (tab === 'global') {
      setTargetCategoryId('');
    }
  };

  const handleCreateField = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setErrorMsg(null);
    try {
      await api.createCustomField({
        category_id: targetCategoryId ? Number(targetCategoryId) : undefined,
        name: name.trim(),
        field_type: fieldType,
        options: fieldType === 'select' ? options.trim() || undefined : undefined,
        show_in_table: showInTable,
        show_in_pos: showInPos,
        show_in_receipt: showInReceipt,
        is_required: isRequired,
        display_order: customFields.length + 1,
        is_active: true,
      });

      setName('');
      setOptions('');
      setFieldType('text');
      setSuccessMsg(`Attribute "${name}" created successfully!`);
      loadData();
      if (onSchemaUpdated) onSchemaUpdated();
    } catch (err: any) {
      setErrorMsg(err.detail || 'Failed to create custom attribute.');
    }
  };

  const handleSaveEdit = async () => {
    if (!editingField) return;
    try {
      await api.updateCustomField(editingField.id, {
        category_id: editingField.category_id ? Number(editingField.category_id) : undefined,
        name: editingField.name,
        field_type: editingField.field_type,
        options: editingField.field_type === 'select' ? editingField.options : undefined,
        show_in_table: editingField.show_in_table,
        show_in_pos: editingField.show_in_pos,
        show_in_receipt: editingField.show_in_receipt,
        is_required: editingField.is_required,
      });

      setEditingField(null);
      setSuccessMsg('Attribute updated successfully!');
      loadData();
      if (onSchemaUpdated) onSchemaUpdated();
    } catch (err: any) {
      setErrorMsg(err.detail || 'Failed to update custom attribute.');
    }
  };

  const handleDeleteField = async (id: number, fieldName: string) => {
    if (!window.confirm(`Are you sure you want to remove the attribute "${fieldName}"? Existing product values will be safely preserved.`)) {
      return;
    }
    try {
      await api.deleteCustomField(id);
      setSuccessMsg(`Attribute "${fieldName}" deleted successfully.`);
      loadData();
      if (onSchemaUpdated) onSchemaUpdated();
    } catch (err: any) {
      setErrorMsg(err.detail || 'Failed to delete attribute.');
    }
  };

  const handleApplyPreset = async (presetKey: string) => {
    if (presetKey === 'custom_general') {
      if (
        !window.confirm(
          'Start fresh with a clean slate? This will clear all custom attributes so you can define your own from scratch.'
        )
      ) {
        return;
      }
    } else {
      if (
        !window.confirm(
          'Applying this industry preset will configure standard columns for this category. Existing product data will remain safe. Proceed?'
        )
      ) {
        return;
      }
    }

    try {
      await api.applyPreset({ preset_key: presetKey });
      setSuccessMsg(presetKey === 'custom_general' ? 'Reset to clean slate (0 attributes)!' : 'Industry preset applied successfully!');
      loadData();
      if (onSchemaUpdated) onSchemaUpdated();
    } catch (err: any) {
      setErrorMsg(err.detail || 'Failed to apply preset.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="p-6 bg-gradient-to-r from-slate-900 to-slate-800 rounded-3xl text-white flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-500/20 rounded-2xl border border-emerald-400/30">
            <Sliders className="h-6 w-6 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-xl font-black tracking-tight">Category Schemas & Custom Attributes</h2>
            <p className="text-xs text-slate-300">
              Define custom specification fields per category or globally. Form schemas adapt dynamically.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => setShowAddCatModal(true)}
            className="font-bold border-white/20 text-white bg-white/10 hover:bg-white/20"
          >
            + New Category
          </Button>

          {onOpenWizard && (
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={onOpenWizard}
              className="font-bold flex items-center gap-1.5 shadow-lg shadow-emerald-600/30"
            >
              <Sparkles className="h-4 w-4 text-emerald-200" />
              Setup Wizard
            </Button>
          )}
        </div>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center justify-between">
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-600 font-bold">
            Dismiss
          </button>
        </div>
      )}
      {errorMsg && (
        <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center justify-between">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="text-rose-600 font-bold">
            Dismiss
          </button>
        </div>
      )}

      {/* 1-Click Industry Presets Bar */}
      {presets.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-800 dark:text-white text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-brand-600 dark:text-brand-400" />
              Quick Switch Industry Presets
            </h3>
            <span className="text-xs text-slate-400 dark:text-slate-500">Click any template to apply its columns</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {presets.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => handleApplyPreset(p.key)}
                className="p-3 rounded-2xl border border-slate-200 dark:border-slate-700 hover:border-brand-500 hover:bg-brand-50/40 dark:hover:bg-slate-800 text-left transition group"
              >
                <div className="font-bold text-slate-800 dark:text-slate-200 text-xs group-hover:text-brand-600 dark:group-hover:text-brand-400 truncate">
                  {p.title}
                </div>
                <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{p.fields.length} columns</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Grid: Active Attributes Table + Add Form */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Active Attributes Table */}
        <div className="lg:col-span-8 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <Sliders className="h-4 w-4 text-brand-600 dark:text-brand-400" />
                Configured Attributes ({customFields.length})
              </span>
              <span className="text-[11px] text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
                {reordering && <span className="text-brand-600 dark:text-brand-400 font-semibold animate-pulse">Saving order...</span>}
                <span>Drag handle or use arrows to rearrange</span>
              </span>
            </div>

            {/* Category Schema Filter Tabs - Spacious & Wrap-friendly */}
            <div className="flex flex-wrap items-center gap-2 pt-1 pb-1">
              <button
                type="button"
                onClick={() => handleSelectTab('all')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                  activeCategoryTab === 'all'
                    ? 'bg-slate-900 dark:bg-white dark:text-slate-900 text-white shadow-sm'
                    : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                All ({customFields.length})
              </button>
              <button
                type="button"
                onClick={() => handleSelectTab('global')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                  activeCategoryTab === 'global'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                Global ({customFields.filter((f) => !f.category_id).length})
              </button>
              {categories.map((cat) => {
                const count = customFields.filter((f) => f.category_id === cat.id).length;
                const isActive = activeCategoryTab === cat.id;
                return (
                  <div
                    key={cat.id}
                    className={`inline-flex items-center rounded-xl overflow-hidden border transition text-xs font-bold whitespace-nowrap shadow-sm ${
                      isActive
                        ? 'bg-brand-600 border-brand-600 text-white'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleSelectTab(cat.id)}
                      className="px-3.5 py-1.5 focus:outline-none"
                    >
                      {cat.name} <span className={isActive ? 'text-brand-100 text-[11px]' : 'text-slate-400 text-[11px]'}>({count})</span>
                    </button>
                    <button
                      type="button"
                      title={`Delete "${cat.name}" category & all its products`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteCategory(cat);
                      }}
                      className={`px-2 py-1.5 border-l transition ${
                        isActive
                          ? 'border-brand-500/60 hover:bg-rose-600 text-white'
                          : 'border-slate-200 dark:border-slate-700 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                      }`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}

              {/* Quick On-the-Fly Category Add Form */}
              <form
                onSubmit={handleInlineCreateCategory}
                className="inline-flex items-center gap-1.5 bg-white dark:bg-slate-800 border border-brand-300 dark:border-brand-700 rounded-xl px-2.5 py-1 shadow-sm focus-within:ring-2 focus-within:ring-brand-500/30"
              >
                <Plus className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400 shrink-0" />
                <input
                  type="text"
                  placeholder="New category..."
                  value={inlineCatName}
                  onChange={(e) => setInlineCatName(e.target.value)}
                  className="text-xs bg-transparent border-none focus:outline-none w-28 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 font-medium"
                />
                <button
                  type="submit"
                  disabled={!inlineCatName.trim() || inlineCatSaving}
                  className="px-2 py-0.5 rounded-lg bg-brand-600 text-white text-[11px] font-bold hover:bg-brand-700 disabled:opacity-40 transition"
                >
                  {inlineCatSaving ? '...' : '+ Add'}
                </button>
              </form>

              <button
                type="button"
                onClick={() => setShowAddCatModal(true)}
                className="px-2.5 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 flex items-center gap-1"
                title="Open Add Category Dialog"
              >
                <Plus className="h-3.5 w-3.5" /> More
              </button>
            </div>
          </div>

          {/* Category Management Bar when a category tab is selected */}
          {typeof activeCategoryTab === 'number' && (() => {
            const currentCat = categories.find((c) => c.id === activeCategoryTab);
            if (!currentCat) return null;
            const count = customFields.filter((f) => f.category_id === currentCat.id).length;
            return (
              <div className="px-4 py-2.5 bg-brand-50/70 dark:bg-brand-950/40 border-b border-brand-100 dark:border-brand-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4 text-brand-700 dark:text-brand-400 shrink-0" />
                  <span className="font-bold text-slate-800 dark:text-white">
                    Category: <span className="text-brand-900 dark:text-brand-300 font-extrabold">{currentCat.name}</span>
                  </span>
                  <span className="text-brand-600 dark:text-brand-400 text-[11px] bg-brand-100/80 dark:bg-brand-950/60 px-2 py-0.5 rounded-full font-semibold">
                    {count} {count === 1 ? 'custom attribute' : 'custom attributes'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCategory(currentCat);
                      setEditCatName(currentCat.name);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 font-bold flex items-center gap-1 transition text-[11px] shadow-sm"
                  >
                    <Edit2 className="h-3 w-3 text-slate-500" /> Rename Category
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteCategory(currentCat)}
                    className="px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-400 hover:bg-rose-600 hover:text-white font-bold flex items-center gap-1 transition text-[11px] shadow-sm"
                  >
                    <Trash2 className="h-3 w-3" /> Delete Category & All Products
                  </button>
                </div>
              </div>
            );
          })()}

          <div className="divide-y divide-slate-100 dark:divide-slate-800 overflow-y-auto flex-1">
            {(() => {
              const filteredFields = customFields.filter((cf) => {
                if (activeCategoryTab === 'all') return true;
                if (activeCategoryTab === 'global') return !cf.category_id;
                return cf.category_id === activeCategoryTab;
              });

              if (filteredFields.length === 0) {
                return (
                  <div className="p-12 text-center text-slate-400 dark:text-slate-500 text-xs">
                    No custom attributes configured for this category yet. Add one using the form on the right.
                  </div>
                );
              }

              return filteredFields.map((cf, idx) => {
                const isGlobal = !cf.category_id;
                const isDragging = draggedFieldId === cf.id;
                const isOver = dragOverFieldId === cf.id;

                return (
                  <div
                    key={cf.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, cf.id)}
                    onDragOver={(e) => handleDragOver(e, cf.id)}
                    onDragEnd={() => {
                      setDraggedFieldId(null);
                      setDragOverFieldId(null);
                    }}
                    onDrop={(e) => handleDrop(e, cf.id, filteredFields)}
                    className={`p-3.5 sm:p-4 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition flex items-center justify-between gap-3 text-xs border-b border-slate-100 dark:border-slate-800 last:border-b-0 select-none ${
                      isDragging ? 'opacity-40 bg-slate-100 dark:bg-slate-800 scale-[0.99] border-dashed border-2 border-brand-400' : ''
                    } ${isOver && !isDragging ? 'border-t-2 border-brand-500 bg-brand-50/60 dark:bg-brand-950/40' : ''}`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {/* Drag handle & arrow controls */}
                      <div className="flex items-center gap-1 shrink-0">
                        <div
                          className="p-1 rounded-md text-slate-300 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-grab active:cursor-grabbing transition"
                          title="Drag up or down to reorder attribute"
                        >
                          <GripVertical className="h-4 w-4" />
                        </div>
                        <div className="flex flex-col -space-y-1">
                          <button
                            type="button"
                            onClick={() => handleMove(cf.id, 'up', filteredFields)}
                            disabled={idx === 0 || reordering}
                            className="p-0.5 rounded text-slate-300 dark:text-slate-600 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-20 disabled:hover:bg-transparent transition"
                            title="Move up"
                          >
                            <ChevronUp className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMove(cf.id, 'down', filteredFields)}
                            disabled={idx === filteredFields.length - 1 || reordering}
                            className="p-0.5 rounded text-slate-300 dark:text-slate-600 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-20 disabled:hover:bg-transparent transition"
                            title="Move down"
                          >
                            <ChevronDown className="h-3 w-3" />
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-slate-900 dark:text-white text-sm truncate">{cf.name}</span>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              isGlobal
                                ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900/50'
                                : 'bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-800/50'
                            }`}
                          >
                            {isGlobal ? 'Global' : (cf.category_name || 'Category')}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-mono uppercase font-semibold">
                            {cf.field_type}
                          </span>
                          {cf.is_required && (
                            <span className="px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 text-[10px] font-bold">
                              Required
                            </span>
                          )}
                        </div>
                        {cf.options && (
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate max-w-md">
                            Options: {cf.options}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* Badges */}
                      <div className="hidden sm:flex items-center gap-1">
                        <span
                          className={`p-1 px-2 rounded-lg text-[10px] font-bold flex items-center gap-1 ${
                            cf.show_in_table
                              ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900/50'
                              : 'bg-slate-50 dark:bg-slate-800 text-slate-300 dark:text-slate-600'
                          }`}
                          title="Main Table Column"
                        >
                          <Eye className="h-3 w-3" /> Table
                        </span>
                        <span
                          className={`p-1 px-2 rounded-lg text-[10px] font-bold flex items-center gap-1 ${
                            cf.show_in_pos
                              ? 'bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-800/50'
                              : 'bg-slate-50 dark:bg-slate-800 text-slate-300 dark:text-slate-600'
                          }`}
                          title="POS Searchable"
                        >
                          <Search className="h-3 w-3" /> POS
                        </span>
                        <span
                          className={`p-1 px-2 rounded-lg text-[10px] font-bold flex items-center gap-1 ${
                            cf.show_in_receipt
                              ? 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/50'
                              : 'bg-slate-50 dark:bg-slate-800 text-slate-300 dark:text-slate-600'
                          }`}
                          title="Thermal Receipt Item"
                        >
                          <Printer className="h-3 w-3" /> Receipt
                        </span>
                      </div>

                      {/* Actions */}
                      <button
                        type="button"
                        onClick={() => setEditingField(cf)}
                        className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
                        title="Edit Attribute"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteField(cf.id, cf.name)}
                        className="p-1.5 text-slate-300 dark:text-slate-600 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition"
                        title="Delete Attribute"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>

        {/* Add New Attribute Form */}
        <div className="lg:col-span-4 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
          <h3 className="font-bold text-slate-900 dark:text-white text-sm border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center gap-2">
            <Plus className="h-4 w-4 text-brand-600 dark:text-brand-400" />
            Add New Attribute Column
          </h3>

          <form onSubmit={handleCreateField} className="space-y-3.5">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                Target Category Schema *
              </label>
              <select
                value={targetCategoryId}
                onChange={(e) => setTargetCategoryId(e.target.value ? Number(e.target.value) : '')}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-brand-500"
              >
                <option value="">All Categories (Global Attribute)</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                Assign to a category (e.g. specific department) or make it global across all items.
              </p>
            </div>

            <Input
              label="Attribute Name *"
              placeholder="e.g. Model, Size, Color, Specifications"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                Field Type
              </label>
              <select
                value={fieldType}
                onChange={(e) => setFieldType(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200"
              >
                <option value="text">Text (Free typing)</option>
                <option value="select">Dropdown (Select list)</option>
                <option value="date">Date (e.g. Expiry)</option>
                <option value="number">Numeric value</option>
              </select>
            </div>

            {fieldType === 'select' && (
              <Input
                label="Dropdown Options (Comma-separated) *"
                placeholder="e.g. Option A, Option B, Option C"
                value={options}
                onChange={(e) => setOptions(e.target.value)}
                required
              />
            )}

            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-2 text-xs">
              <span className="font-bold text-slate-700 dark:text-slate-300 block uppercase text-[10px] tracking-wider">
                Display & Behavior Rules
              </span>
              <label className="flex items-center gap-2 cursor-pointer text-slate-600 dark:text-slate-400">
                <input
                  type="checkbox"
                  checked={showInTable}
                  onChange={(e) => setShowInTable(e.target.checked)}
                  className="rounded text-brand-600"
                />
                <span>Show as Main Table Column</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-slate-600 dark:text-slate-400">
                <input
                  type="checkbox"
                  checked={showInPos}
                  onChange={(e) => setShowInPos(e.target.checked)}
                  className="rounded text-brand-600"
                />
                <span>Include in POS Live Search</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-slate-600 dark:text-slate-400">
                <input
                  type="checkbox"
                  checked={showInReceipt}
                  onChange={(e) => setShowInReceipt(e.target.checked)}
                  className="rounded text-brand-600"
                />
                <span>Print on Thermal Receipt</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-slate-600 dark:text-slate-400">
                <input
                  type="checkbox"
                  checked={isRequired}
                  onChange={(e) => setIsRequired(e.target.checked)}
                  className="rounded text-brand-600"
                />
                <span>Mandatory (Required Field)</span>
              </label>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="md"
              className="w-full font-bold shadow-md shadow-brand-600/20"
              disabled={!name.trim()}
            >
              + Create Attribute
            </Button>
          </form>
        </div>
      </div>

      {/* Edit Attribute Modal */}
      {editingField && (
        <Modal
          isOpen={true}
          onClose={() => setEditingField(null)}
          title={`Edit Attribute: ${editingField.name}`}
          maxWidth="md"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                Target Category Schema
              </label>
              <select
                value={editingField.category_id || ''}
                onChange={(e) =>
                  setEditingField({
                    ...editingField,
                    category_id: e.target.value ? Number(e.target.value) : null,
                  })
                }
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-brand-500"
              >
                <option value="">All Categories (Global Attribute)</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <Input
              label="Attribute Name *"
              value={editingField.name}
              onChange={(e) => setEditingField({ ...editingField, name: e.target.value })}
              required
            />

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                Field Type
              </label>
              <select
                value={editingField.field_type}
                onChange={(e) => setEditingField({ ...editingField, field_type: e.target.value })}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200"
              >
                <option value="text">Text (Free typing)</option>
                <option value="select">Dropdown (Select list)</option>
                <option value="date">Date (e.g. Expiry)</option>
                <option value="number">Numeric value</option>
              </select>
            </div>

            {editingField.field_type === 'select' && (
              <Input
                label="Dropdown Options (Comma-separated)"
                value={editingField.options || ''}
                onChange={(e) => setEditingField({ ...editingField, options: e.target.value })}
              />
            )}

            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-2 text-xs">
              <label className="flex items-center gap-2 cursor-pointer text-slate-600 dark:text-slate-400">
                <input
                  type="checkbox"
                  checked={editingField.show_in_table ?? true}
                  onChange={(e) =>
                    setEditingField({ ...editingField, show_in_table: e.target.checked })
                  }
                  className="rounded text-brand-600"
                />
                <span>Show as Main Table Column</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-slate-600 dark:text-slate-400">
                <input
                  type="checkbox"
                  checked={editingField.show_in_pos ?? true}
                  onChange={(e) =>
                    setEditingField({ ...editingField, show_in_pos: e.target.checked })
                  }
                  className="rounded text-brand-600"
                />
                <span>Include in POS Live Search</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-slate-600 dark:text-slate-400">
                <input
                  type="checkbox"
                  checked={editingField.show_in_receipt ?? false}
                  onChange={(e) =>
                    setEditingField({ ...editingField, show_in_receipt: e.target.checked })
                  }
                  className="rounded text-brand-600"
                />
                <span>Print on Thermal Receipt</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-slate-600 dark:text-slate-400">
                <input
                  type="checkbox"
                  checked={editingField.is_required ?? false}
                  onChange={(e) =>
                    setEditingField({ ...editingField, is_required: e.target.checked })
                  }
                  className="rounded text-brand-600"
                />
                <span>Mandatory (Required)</span>
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <Button type="button" variant="secondary" onClick={() => setEditingField(null)}>
                Cancel
              </Button>
              <Button type="button" variant="primary" onClick={handleSaveEdit}>
                Save Changes
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Quick Add Category Modal */}
      <Modal
        isOpen={showAddCatModal}
        onClose={() => {
          setShowAddCatModal(false);
          setNewCatName('');
        }}
        title="Create New Category"
        subtitle="Add a category (e.g. Category A, Hardware, Apparel) to define its custom schema."
        maxWidth="sm"
      >
        <form onSubmit={handleCreateCategory} className="space-y-4">
          <Input
            label="Category Name *"
            placeholder="e.g. Category Name"
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            required
            autoFocus
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setShowAddCatModal(false);
                setNewCatName('');
              }}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={!newCatName.trim()}>
              Create Category
            </Button>
          </div>
        </form>
      </Modal>

      {/* Rename Category Modal */}
      {editingCategory && (
        <Modal
          isOpen={Boolean(editingCategory)}
          onClose={() => {
            setEditingCategory(null);
            setEditCatName('');
          }}
          title="Rename Category"
          subtitle={`Update the name of "${editingCategory.name}" category.`}
          maxWidth="sm"
        >
          <form onSubmit={handleRenameCategory} className="space-y-4">
            <Input
              label="Category Name *"
              value={editCatName}
              onChange={(e) => setEditCatName(e.target.value)}
              required
              autoFocus
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setEditingCategory(null);
                  setEditCatName('');
                }}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={!editCatName.trim()}>
                Save Name
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
