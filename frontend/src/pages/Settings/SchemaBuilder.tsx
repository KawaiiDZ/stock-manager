import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { CustomField, IndustryPreset } from '../../types';
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
  const [presets, setPresets] = useState<IndustryPreset[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // New field addition
  const [name, setName] = useState('');
  const [fieldType, setFieldType] = useState('text');
  const [options, setOptions] = useState('');
  const [showInTable, setShowInTable] = useState(true);
  const [showInPos, setShowInPos] = useState(true);
  const [showInReceipt, setShowInReceipt] = useState(false);
  const [isRequired, setIsRequired] = useState(false);

  // Edit field modal
  const [editingField, setEditingField] = useState<CustomField | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [cfs, prs] = await Promise.all([
        api.getCustomFields(true),
        api.getPresets(),
      ]);
      setCustomFields(cfs || []);
      setPresets(prs || []);
    } catch (err) {
      console.error('Failed to load schema builder data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateField = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setErrorMsg(null);
    try {
      await api.createCustomField({
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
    if (
      !window.confirm(
        'Applying a preset will configure your table columns and attributes for this industry. Existing product data will remain safe. Proceed?'
      )
    ) {
      return;
    }

    try {
      await api.applyPreset({ preset_key: presetKey });
      setSuccessMsg('Industry preset applied successfully!');
      loadData();
      if (onSchemaUpdated) onSchemaUpdated();
    } catch (err: any) {
      setErrorMsg(err.detail || 'Failed to apply industry preset.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner with Quick Actions */}
      <div className="p-6 bg-gradient-to-r from-slate-900 to-slate-800 rounded-3xl text-white flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-500/20 rounded-2xl border border-emerald-400/30">
            <Sliders className="h-6 w-6 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-xl font-black tracking-tight">Product Schema & Table Customizer</h2>
            <p className="text-xs text-slate-300">
              Customize product columns, dropdown options, POS search indexing, and receipt items.
            </p>
          </div>
        </div>

        {onOpenWizard && (
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={onOpenWizard}
            className="font-bold flex items-center gap-1.5 shadow-lg shadow-emerald-600/30"
          >
            <Sparkles className="h-4 w-4 text-emerald-200" />
            Launch Setup Wizard
          </Button>
        )}
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
      <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-600" />
            Quick Switch Industry Presets
          </h3>
          <span className="text-xs text-slate-400">Click any preset to apply its columns</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {presets.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => handleApplyPreset(p.key)}
              className="p-3 rounded-2xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/40 text-left transition group"
            >
              <div className="font-bold text-slate-800 text-xs group-hover:text-emerald-900 truncate">
                {p.title}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">{p.fields.length} columns</div>
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid: Active Attributes Table + Add Form */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Active Attributes Table */}
        <div className="lg:col-span-8 bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
              Active Table Attributes ({customFields.length})
            </span>
          </div>

          <div className="divide-y divide-slate-100 overflow-y-auto flex-1">
            {customFields.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-xs">
                No custom attributes configured yet. Pick an industry preset above or add one on the right.
              </div>
            ) : (
              customFields.map((cf) => (
                <div
                  key={cf.id}
                  className="p-4 hover:bg-slate-50/60 transition flex items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-sm">{cf.name}</span>
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-mono uppercase font-semibold">
                        {cf.field_type}
                      </span>
                      {cf.is_required && (
                        <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 text-[10px] font-bold">
                          Required
                        </span>
                      )}
                    </div>
                    {cf.options && (
                      <div className="text-[11px] text-slate-500 font-mono truncate max-w-md">
                        Options: {cf.options}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Badges */}
                    <div className="flex items-center gap-1">
                      <span
                        className={`p-1 px-2 rounded-lg text-[10px] font-bold flex items-center gap-1 ${
                          cf.show_in_table
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-slate-50 text-slate-300'
                        }`}
                        title="Main Table Column"
                      >
                        <Eye className="h-3 w-3" /> Table
                      </span>
                      <span
                        className={`p-1 px-2 rounded-lg text-[10px] font-bold flex items-center gap-1 ${
                          cf.show_in_pos
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-50 text-slate-300'
                        }`}
                        title="POS Searchable"
                      >
                        <Search className="h-3 w-3" /> POS
                      </span>
                      <span
                        className={`p-1 px-2 rounded-lg text-[10px] font-bold flex items-center gap-1 ${
                          cf.show_in_receipt
                            ? 'bg-purple-50 text-purple-700 border border-purple-200'
                            : 'bg-slate-50 text-slate-300'
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
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
                      title="Edit Attribute"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteField(cf.id, cf.name)}
                      className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                      title="Delete Attribute"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Add New Attribute Form */}
        <div className="lg:col-span-4 bg-white rounded-3xl border border-slate-200 p-5 shadow-sm space-y-4">
          <h3 className="font-bold text-slate-900 text-sm border-b border-slate-100 pb-3 flex items-center gap-2">
            <Plus className="h-4 w-4 text-emerald-600" />
            Add New Attribute Column
          </h3>

          <form onSubmit={handleCreateField} className="space-y-3.5">
            <Input
              label="Attribute Name *"
              placeholder="e.g. Size, Warranty, IMEI, Fabric"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                Field Type
              </label>
              <select
                value={fieldType}
                onChange={(e) => setFieldType(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800"
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
                placeholder="e.g. S, M, L, XL, XXL or PTA Approved, Non-PTA"
                value={options}
                onChange={(e) => setOptions(e.target.value)}
                required
              />
            )}

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 space-y-2 text-xs">
              <span className="font-bold text-slate-700 block uppercase text-[10px] tracking-wider">
                Display & Behavior Rules
              </span>
              <label className="flex items-center gap-2 cursor-pointer text-slate-600">
                <input
                  type="checkbox"
                  checked={showInTable}
                  onChange={(e) => setShowInTable(e.target.checked)}
                  className="rounded text-emerald-600"
                />
                <span>Show as Main Table Column</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-slate-600">
                <input
                  type="checkbox"
                  checked={showInPos}
                  onChange={(e) => setShowInPos(e.target.checked)}
                  className="rounded text-emerald-600"
                />
                <span>Include in POS Live Search</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-slate-600">
                <input
                  type="checkbox"
                  checked={showInReceipt}
                  onChange={(e) => setShowInReceipt(e.target.checked)}
                  className="rounded text-emerald-600"
                />
                <span>Print on Thermal Receipt</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-slate-600">
                <input
                  type="checkbox"
                  checked={isRequired}
                  onChange={(e) => setIsRequired(e.target.checked)}
                  className="rounded text-emerald-600"
                />
                <span>Mandatory (Required Field)</span>
              </label>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="md"
              className="w-full font-bold shadow-md shadow-emerald-600/20"
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
            <Input
              label="Attribute Name *"
              value={editingField.name}
              onChange={(e) => setEditingField({ ...editingField, name: e.target.value })}
              required
            />

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                Field Type
              </label>
              <select
                value={editingField.field_type}
                onChange={(e) => setEditingField({ ...editingField, field_type: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800"
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

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 space-y-2 text-xs">
              <label className="flex items-center gap-2 cursor-pointer text-slate-600">
                <input
                  type="checkbox"
                  checked={editingField.show_in_table ?? true}
                  onChange={(e) =>
                    setEditingField({ ...editingField, show_in_table: e.target.checked })
                  }
                  className="rounded text-emerald-600"
                />
                <span>Show as Main Table Column</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-slate-600">
                <input
                  type="checkbox"
                  checked={editingField.show_in_pos ?? true}
                  onChange={(e) =>
                    setEditingField({ ...editingField, show_in_pos: e.target.checked })
                  }
                  className="rounded text-emerald-600"
                />
                <span>Include in POS Live Search</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-slate-600">
                <input
                  type="checkbox"
                  checked={editingField.show_in_receipt ?? false}
                  onChange={(e) =>
                    setEditingField({ ...editingField, show_in_receipt: e.target.checked })
                  }
                  className="rounded text-emerald-600"
                />
                <span>Print on Thermal Receipt</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-slate-600">
                <input
                  type="checkbox"
                  checked={editingField.is_required ?? false}
                  onChange={(e) =>
                    setEditingField({ ...editingField, is_required: e.target.checked })
                  }
                  className="rounded text-emerald-600"
                />
                <span>Mandatory (Required)</span>
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
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
    </div>
  );
};
