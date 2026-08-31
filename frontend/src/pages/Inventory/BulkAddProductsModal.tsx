import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { Category, BusinessSettings, CustomField } from '../../types';
import { Plus, Trash2, Layers, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Modal } from '../../components/common/Modal';
import { Button } from '../../components/common/Button';
import { formatCurrency, formatMoney } from '../../utils/format';

interface BulkAddProductsModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  customFields?: CustomField[];
  settings: BusinessSettings | null;
  onProductsAdded: () => void;
}

interface ProductRow {
  name: string;
  category_id: number;
  purchase_price: number;
  selling_price: number;
  opening_stock: number;
  barcode: string;
  sku: string;
  custom_values: Record<number, string>;
}

const emptyRow = (categoryId: number): ProductRow => ({
  name: '',
  category_id: categoryId,
  purchase_price: 0,
  selling_price: 0,
  opening_stock: 0,
  barcode: '',
  sku: '',
  custom_values: {},
});

export const BulkAddProductsModal: React.FC<BulkAddProductsModalProps> = ({
  isOpen,
  onClose,
  categories,
  customFields = [],
  settings,
  onProductsAdded,
}) => {
  const defaultCatId = categories.length > 0 ? categories[0].id : 0;
  const [rows, setRows] = useState<ProductRow[]>([
    emptyRow(defaultCatId),
    emptyRow(defaultCatId),
    emptyRow(defaultCatId),
    emptyRow(defaultCatId),
    emptyRow(defaultCatId),
  ]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const currency = settings?.currency || 'Rs.';

  const handleAddRows = (count = 5) => {
    const newRows = Array.from({ length: count }, () => emptyRow(defaultCatId));
    setRows([...rows, ...newRows]);
  };

  const handleRemoveRow = (idx: number) => {
    if (rows.length <= 1) return;
    setRows(rows.filter((_, i) => i !== idx));
  };

  const handleUpdateCell = (idx: number, field: keyof ProductRow, val: any) => {
    setRows(
      rows.map((row, i) => {
        if (i === idx) {
          return { ...row, [field]: val };
        }
        return row;
      })
    );
  };

  const handleUpdateCustomValue = (idx: number, fieldId: number, val: string) => {
    setRows(
      rows.map((row, i) => {
        if (i === idx) {
          return {
            ...row,
            custom_values: {
              ...row.custom_values,
              [fieldId]: val,
            },
          };
        }
        return row;
      })
    );
  };

  const validRows = rows.filter((r) => r.name.trim().length > 0);
  const totalStockQty = validRows.reduce((sum, r) => sum + Number(r.opening_stock || 0), 0);
  const totalCostValue = validRows.reduce(
    (sum, r) => sum + Number(r.opening_stock || 0) * Number(r.purchase_price || 0),
    0
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (validRows.length === 0) {
      setErrorMsg('Please enter at least 1 product name.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      const payload = validRows.map((r) => {
        const customFieldList = Object.entries(r.custom_values)
          .filter(([_, val]) => val && val.trim().length > 0)
          .map(([fieldIdStr, val]) => ({
            field_id: Number(fieldIdStr),
            value: val.trim(),
          }));

        return {
          name: r.name.trim(),
          category_id: r.category_id > 0 ? r.category_id : undefined,
          purchase_price: Number(r.purchase_price || 0),
          selling_price: Number(r.selling_price || 0),
          opening_stock: Number(r.opening_stock || 0),
          barcode: r.barcode.trim() || undefined,
          sku: r.sku.trim() || undefined,
          custom_fields: customFieldList.length > 0 ? customFieldList : undefined,
        };
      });

      await api.bulkCreateProducts(payload);
      onProductsAdded();
      onClose();
      // Reset rows
      setRows([
        emptyRow(defaultCatId),
        emptyRow(defaultCatId),
        emptyRow(defaultCatId),
        emptyRow(defaultCatId),
        emptyRow(defaultCatId),
      ]);
    } catch (err: any) {
      setErrorMsg(err.detail || 'Failed to bulk add products.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Bulk Add Products (Fast Spreadsheet Grid)"
      subtitle="Quickly enter multiple products. Columns adapt automatically to your business attributes."
      maxWidth="4xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {errorMsg && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Spreadsheet-like Table */}
        <div className="border border-slate-200 rounded-2xl overflow-hidden max-h-[55vh] overflow-y-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100/90 sticky top-0 z-10 border-b border-slate-200 font-bold text-slate-600 uppercase tracking-wider">
              <tr>
                <th className="py-2.5 px-2.5 w-8 text-center">#</th>
                <th className="py-2.5 px-3 min-w-[170px]">Product Name *</th>
                {customFields.map((cf) => (
                  <th key={cf.id} className="py-2.5 px-2.5 min-w-[120px] text-slate-700">
                    {cf.name}
                  </th>
                ))}
                <th className="py-2.5 px-2.5 w-32">Category</th>
                <th className="py-2.5 px-2.5 w-24 text-right">Cost ({currency})</th>
                <th className="py-2.5 px-2.5 w-24 text-right">Sale ({currency})</th>
                <th className="py-2.5 px-2.5 w-20 text-right">Stock</th>
                <th className="py-2.5 px-2.5 w-28">Barcode</th>
                <th className="py-2.5 px-2 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {rows.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50/80 transition">
                  <td className="py-2 px-2 text-center font-bold text-slate-400">{idx + 1}</td>
                  <td className="py-1 px-1.5">
                    <input
                      type="text"
                      placeholder="e.g. iPhone 15, Cotton Shirt"
                      value={row.name}
                      onChange={(e) => handleUpdateCell(idx, 'name', e.target.value)}
                      className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-lg px-2.5 py-1.5 font-medium text-slate-800 text-xs focus:outline-none"
                    />
                  </td>

                  {/* Dynamic Custom Field Cells */}
                  {customFields.map((cf) => {
                    if (cf.field_type === 'select' && cf.options) {
                      const opts = cf.options.split(',').map((o) => o.trim()).filter(Boolean);
                      return (
                        <td key={cf.id} className="py-1 px-1">
                          <select
                            value={row.custom_values[cf.id] || ''}
                            onChange={(e) =>
                              handleUpdateCustomValue(idx, cf.id, e.target.value)
                            }
                            className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-lg px-2 py-1.5 text-xs text-slate-700 focus:outline-none"
                          >
                            <option value="">—</option>
                            {opts.map((opt, i) => (
                              <option key={i} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        </td>
                      );
                    }
                    return (
                      <td key={cf.id} className="py-1 px-1">
                        <input
                          type={cf.field_type === 'number' ? 'number' : cf.field_type === 'date' ? 'date' : 'text'}
                          placeholder={cf.name}
                          value={row.custom_values[cf.id] || ''}
                          onChange={(e) =>
                            handleUpdateCustomValue(idx, cf.id, e.target.value)
                          }
                          className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-lg px-2 py-1.5 text-xs text-slate-700 focus:outline-none"
                        />
                      </td>
                    );
                  })}

                  <td className="py-1 px-1">
                    <select
                      value={row.category_id}
                      onChange={(e) => handleUpdateCell(idx, 'category_id', Number(e.target.value))}
                      className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-lg px-2 py-1.5 text-xs text-slate-700 focus:outline-none"
                    >
                      <option value={0}>General</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1 px-1">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={row.purchase_price || ''}
                      placeholder="0.00"
                      onChange={(e) => handleUpdateCell(idx, 'purchase_price', Number(e.target.value))}
                      className="w-full text-right bg-slate-50 focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-lg px-2 py-1.5 font-medium text-slate-800 text-xs focus:outline-none"
                    />
                  </td>
                  <td className="py-1 px-1">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={row.selling_price || ''}
                      placeholder="0.00"
                      onChange={(e) => handleUpdateCell(idx, 'selling_price', Number(e.target.value))}
                      className="w-full text-right bg-slate-50 focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-lg px-2 py-1.5 font-bold text-slate-900 text-xs focus:outline-none"
                    />
                  </td>
                  <td className="py-1 px-1">
                    <input
                      type="number"
                      min="0"
                      value={row.opening_stock || ''}
                      placeholder="0"
                      onChange={(e) => handleUpdateCell(idx, 'opening_stock', Number(e.target.value))}
                      className="w-full text-right bg-slate-50 focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-lg px-2 py-1.5 font-semibold text-emerald-700 text-xs focus:outline-none"
                    />
                  </td>
                  <td className="py-1 px-1">
                    <input
                      type="text"
                      placeholder="Barcode"
                      value={row.barcode}
                      onChange={(e) => handleUpdateCell(idx, 'barcode', e.target.value)}
                      className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-lg px-2 py-1.5 font-mono text-slate-700 text-xs focus:outline-none"
                    />
                  </td>
                  <td className="py-1 px-1 text-center">
                    <button
                      type="button"
                      onClick={() => handleRemoveRow(idx)}
                      disabled={rows.length <= 1}
                      className="text-slate-300 hover:text-rose-500 disabled:opacity-20 p-1"
                      title="Remove Row"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Toolbar & Live Summary */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-1">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              icon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => handleAddRows(5)}
              className="text-xs"
            >
              + Add 5 Rows
            </Button>
            <span className="text-xs text-slate-400 font-semibold">
              {validRows.length} valid product(s) ready
            </span>
          </div>

          <div className="flex items-center gap-4 bg-slate-50 px-4 py-2 rounded-xl border border-slate-100 text-xs">
            <div>
              <span className="text-slate-400">Total Units: </span>
              <span className="font-bold text-slate-800">{totalStockQty}</span>
            </div>
            <div>
              <span className="text-slate-400">Stock Valuation: </span>
              <span className="font-black text-emerald-700">
                {formatCurrency(totalCostValue, currency)}
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={loading}
            disabled={validRows.length === 0}
            className="font-bold px-6 shadow-md shadow-emerald-600/20"
          >
            Save {validRows.length} Products to Inventory
          </Button>
        </div>
      </form>
    </Modal>
  );
};
