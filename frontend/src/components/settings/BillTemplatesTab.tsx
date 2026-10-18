import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { BillTemplate } from '../../types';
import { Button } from '../common/Button';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { TemplateEditorModal } from './TemplateEditorModal';
import {
  Layers,
  Plus,
  Edit2,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Package,
  Sparkles,
  Sun,
  ShieldCheck,
  RefreshCw,
  FolderOpen,
} from 'lucide-react';

interface BillTemplatesTabProps {
  onSettingsUpdated?: () => void;
  enabled?: boolean;
  onToggleEnabled?: (nextVal: boolean) => void;
  isDirty?: boolean;
  onApply?: () => void;
  saving?: boolean;
}

export const BillTemplatesTab: React.FC<BillTemplatesTabProps> = ({
  onSettingsUpdated,
  enabled: propsEnabled,
  onToggleEnabled,
  isDirty,
  onApply,
  saving,
}) => {
  const [templates, setTemplates] = useState<BillTemplate[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Editor modal state
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [templateToEdit, setTemplateToEdit] = useState<BillTemplate | null>(null);

  // Delete dialog state
  const [templateToDelete, setTemplateToDelete] = useState<BillTemplate | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [localEnabled, setLocalEnabled] = useState<boolean>(true);
  const [toggling, setToggling] = useState<boolean>(false);

  const effectiveEnabled = propsEnabled !== undefined ? propsEnabled : localEnabled;

  const loadTemplates = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await api.getBillTemplates();
      setTemplates(data || []);
    } catch (err: any) {
      setErrorMsg(err.detail || err.message || 'Failed to load bill templates.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
    if (propsEnabled === undefined) {
      api.getSettings().then((s) => {
        if (s && s.enable_bill_templates !== undefined) {
          setLocalEnabled(Boolean(s.enable_bill_templates));
        }
      }).catch(() => {});
    }
  }, [propsEnabled]);

  const handleToggleEnabled = async () => {
    const nextVal = !effectiveEnabled;
    if (onToggleEnabled) {
      onToggleEnabled(nextVal);
      return;
    }

    setLocalEnabled(nextVal);
    setToggling(true);
    try {
      await api.updateSettings({ enable_bill_templates: nextVal });
      setSuccessMsg(
        nextVal
          ? 'Bill Templates enabled in Point of Sale!'
          : 'Bill Templates turned off in Point of Sale.'
      );
      onSettingsUpdated?.();
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err: any) {
      setLocalEnabled(!nextVal);
      setErrorMsg('Failed to update template setting.');
    } finally {
      setToggling(false);
    }
  };

  const handleOpenCreate = () => {
    setTemplateToEdit(null);
    setIsEditorOpen(true);
  };

  const handleOpenEdit = (template: BillTemplate) => {
    setTemplateToEdit(template);
    setIsEditorOpen(true);
  };

  const handleDelete = async () => {
    if (!templateToDelete) return;
    setDeleting(true);
    setErrorMsg(null);
    try {
      await api.deleteBillTemplate(templateToDelete.id);
      setSuccessMsg(`Template "${templateToDelete.name}" deleted successfully.`);
      setTemplateToDelete(null);
      await loadTemplates();
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err: any) {
      setErrorMsg(err.detail || err.message || 'Failed to delete template.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Master Feature Toggle Card */}
      <div className="p-4 sm:p-5 rounded-2xl bg-teal-50/70 dark:bg-teal-950/30 border border-teal-200/70 dark:border-teal-800/40 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-xl bg-teal-100 dark:bg-teal-900/60 text-teal-700 dark:text-teal-300 shadow-2xs">
            <Layers className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
                Enable Templates in Point of Sale
              </h2>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  effectiveEnabled
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300'
                    : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
                }`}
              >
                {effectiveEnabled ? 'Active in POS' : 'Turned Off'}
              </span>
              {isDirty && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 animate-pulse">
                  Unsaved
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Show the Templates fast-fill dropdown and "Save as Template" option on the POS screen.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isDirty && onApply && (
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={onApply}
              loading={saving}
              className="px-3.5 py-1.5 text-xs font-bold shadow-md shadow-emerald-700/20"
            >
              Apply
            </Button>
          )}

          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={effectiveEnabled}
              onChange={handleToggleEnabled}
              disabled={toggling || saving}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-600"></div>
          </label>
        </div>
      </div>

      {!effectiveEnabled && (
        <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2.5">
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
          <span>
            Templates are currently <strong>turned off</strong>. They won't appear on the POS screen, but you can manage, edit, and create your templates below.
          </span>
        </div>
      )}

      {/* Header and Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
        <div>
          <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100">
            Saved Product Templates
          </h3>
          <p className="text-xs text-slate-400">
            Define package setups (Solar systems, AC installs) with category-locked rows.
          </p>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={loadTemplates}
            loading={loading}
            className="flex items-center gap-1.5 text-xs"
            title="Refresh templates"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>

          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleOpenCreate}
            className="flex items-center gap-1.5 text-xs bg-teal-600 hover:bg-teal-700 text-white"
          >
            <Plus className="h-4 w-4" />
            <span>New Template</span>
          </Button>
        </div>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-medium flex items-center gap-2 shadow-2xs">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-xs font-medium flex items-center gap-2 shadow-2xs">
          <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Templates List */}
      {loading && templates.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800">
          <RefreshCw className="h-8 w-8 text-teal-500 animate-spin mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Loading bill templates...
          </p>
        </div>
      ) : templates.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-300 dark:border-slate-800 space-y-4">
          <div className="p-4 rounded-2xl bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 w-16 h-16 mx-auto flex items-center justify-center">
            <Layers className="h-8 w-8" />
          </div>
          <div>
            <h3 className="font-bold text-base text-slate-800 dark:text-white">
              No Bill Templates Defined Yet
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
              Templates save repetitive invoice setups like 4kW Solar Systems, Inverter AC installs, or maintenance bundles with category-locked rows.
            </p>
          </div>
          <Button
            type="button"
            variant="primary"
            onClick={handleOpenCreate}
            className="flex items-center gap-2 text-xs mx-auto bg-teal-600 hover:bg-teal-700 text-white"
          >
            <Plus className="h-4 w-4" />
            <span>Create Your First Template</span>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {templates.map((template) => (
            <div
              key={template.id}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-2xs hover:border-teal-300 dark:hover:border-teal-700 transition flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="p-2 rounded-xl bg-teal-50 dark:bg-teal-950/50 text-teal-600 dark:text-teal-400 shrink-0">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <h3 className="font-black text-sm text-slate-900 dark:text-white truncate">
                      {template.name}
                    </h3>
                  </div>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0">
                    {template.items?.length || 0} slots
                  </span>
                </div>

                {template.description && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 line-clamp-2">
                    {template.description}
                  </p>
                )}

                {/* Slots Overview */}
                <div className="space-y-1.5 mb-4">
                  {(template.items || []).slice(0, 5).map((item, idx) => (
                    <div
                      key={item.id || idx}
                      className="flex items-center justify-between text-xs py-1 px-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="font-bold text-slate-400 text-[10px]">#{idx + 1}</span>
                        <span className="font-medium text-slate-700 dark:text-slate-200 truncate">
                          {item.slot_name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        {item.category_name && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-teal-100 dark:bg-teal-900/50 text-teal-800 dark:text-teal-300">
                            {item.category_name}
                          </span>
                        )}
                        <span className="text-[10px] font-bold text-slate-500">
                          Qty: {item.default_quantity}
                        </span>
                      </div>
                    </div>
                  ))}
                  {(template.items?.length || 0) > 5 && (
                    <p className="text-[11px] text-slate-400 italic text-center pt-0.5">
                      +{(template.items?.length || 0) - 5} more component slots
                    </p>
                  )}
                </div>
              </div>

              {/* Card Footer / Actions */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800/80 mt-auto">
                <span className="text-[10px] text-slate-400">
                  {template.updated_at ? `Updated: ${new Date(template.updated_at).toLocaleDateString()}` : ''}
                </span>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(template)}
                    className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-teal-600 transition"
                    title="Edit template"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setTemplateToDelete(template)}
                    className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-700 transition"
                    title="Delete template"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      <TemplateEditorModal
        isOpen={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
        templateToEdit={templateToEdit}
        onSaved={() => {
          loadTemplates();
          setSuccessMsg(
            templateToEdit
              ? `Template "${templateToEdit.name}" updated successfully.`
              : 'New bill template created successfully!'
          );
          setTimeout(() => setSuccessMsg(null), 3500);
        }}
      />

      <ConfirmDialog
        isOpen={Boolean(templateToDelete)}
        onClose={() => setTemplateToDelete(null)}
        onConfirm={handleDelete}
        title="Delete Bill Template"
        message={`Are you sure you want to permanently delete the template "${templateToDelete?.name}"? POS items generated from this template will not be affected.`}
        confirmText="Delete Template"
        loading={deleting}
      />
    </div>
  );
};
