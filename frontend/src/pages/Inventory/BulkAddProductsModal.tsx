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

const DEFAULT_COL_WIDTHS: Record<string, number> = {
  index: 50,
  name: 240,
  category: 160,
  purchase_price: 140,
  selling_price: 140,
  opening_stock: 110,
  barcode: 160,
  action: 50,
};

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
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  // Excel-like Column Width State
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    const initial = { ...DEFAULT_COL_WIDTHS };
    customFields.forEach((cf) => {
      initial[`custom_${cf.id}`] = 160;
    });
    return initial;
  });

  // Sync custom field column widths when customFields change
  useEffect(() => {
    setColWidths((prev) => {
      const next = { ...prev };
      customFields.forEach((cf) => {
        if (!next[`custom_${cf.id}`]) {
          next[`custom_${cf.id}`] = 160;
        }
      });
      return next;
    });
  }, [customFields]);

  // Draggable Column Resizing
  const [resizingCol, setResizingCol] = useState<string | null>(null);
  const startXRef = React.useRef(0);
  const startWidthRef = React.useRef(0);

  const handleStartResize = (colKey: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingCol(colKey);
    startXRef.current = e.clientX;
    startWidthRef.current = colWidths[colKey] || 150;
  };

  useEffect(() => {
    if (!resizingCol) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startXRef.current;
      const minW = resizingCol === 'index' || resizingCol === 'action' ? 40 : 90;
      const maxW = 500;
      const newW = Math.max(minW, Math.min(maxW, startWidthRef.current + delta));
      setColWidths((prev) => ({ ...prev, [resizingCol]: newW }));
    };

    const handleMouseUp = () => {
      setResizingCol(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingCol]);

  const currency = settings?.currency || 'Rs.';

  const hasUnsavedData = rows.some(
    (r) =>
      r.name.trim().length > 0 ||
      r.purchase_price > 0 ||
      r.selling_price > 0 ||
      r.opening_stock > 0 ||
      r.barcode.trim().length > 0 ||
      Object.values(r.custom_values).some((v) => v && v.trim().length > 0)
  );

  const handleRequestClose = () => {
    if (hasUnsavedData) {
      setShowDiscardConfirm(true);
    } else {
      onClose();
    }
  };

  const handleConfirmDiscard = () => {
    setShowDiscardConfirm(false);
    setRows([
      emptyRow(defaultCatId),
      emptyRow(defaultCatId),
      emptyRow(defaultCatId),
      emptyRow(defaultCatId),
      emptyRow(defaultCatId),
    ]);
    setErrorMsg(null);
    onClose();
  };

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

  // Calculate total table width for smooth horizontal scrolling
  const totalTableWidth =
    (colWidths.index || 50) +
    (colWidths.name || 240) +
    (colWidths.category || 160) +
    (colWidths.purchase_price || 140) +
    (colWidths.selling_price || 140) +
    (colWidths.opening_stock || 110) +
    (colWidths.barcode || 160) +
    customFields.reduce((sum, cf) => sum + (colWidths[`custom_${cf.id}`] || 160), 0) +
    (colWidths.action || 50);

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleRequestClose}
        title="Bulk Add Products (Fast Spreadsheet Grid)"
        subtitle="Quickly enter multiple products. Drag column dividers to adjust column widths as in Excel."
        maxWidth="full"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {errorMsg && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Spreadsheet Table with Horizontal & Vertical Scroll */}
          <div className="border border-slate-200 rounded-2xl overflow-x-auto overflow-y-auto max-h-[58vh] shadow-sm bg-slate-50/30">
            <table
              className="text-left text-xs border-collapse table-fixed select-none"
              style={{ width: `${totalTableWidth}px`, minWidth: '100%' }}
            >
              <thead className="bg-slate-100 sticky top-0 z-20 border-b border-slate-200 font-bold text-slate-700 uppercase tracking-wider text-[11px]">
                <tr>
                  {/* # */}
                  <th
                    style={{ width: `${colWidths.index || 50}px` }}
                    className="py-3 px-2 text-center bg-slate-100 sticky left-0 z-30 shadow-[1px_0_0_0_#e2e8f0] relative group"
                  >
                    #
                    <div
                      onMouseDown={(e) => handleStartResize('index', e)}
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-emerald-500 active:bg-emerald-600 transition"
                    />
                  </th>

                  {/* Product Name * */}
                  <th
                    style={{ width: `${colWidths.name || 240}px` }}
                    className="py-3 px-3 bg-slate-100 sticky left-[50px] z-30 shadow-[1px_0_0_0_#e2e8f0] relative group"
                  >
                    <span className="truncate">Product Name *</span>
                    <div
                      onMouseDown={(e) => handleStartResize('name', e)}
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-emerald-500 active:bg-emerald-600 transition"
                    />
                  </th>

                  {/* Category */}
                  <th
                    style={{ width: `${colWidths.category || 160}px` }}
                    className="py-3 px-2.5 relative group"
                  >
                    <span className="truncate">Category</span>
                    <div
                      onMouseDown={(e) => handleStartResize('category', e)}
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-emerald-500 active:bg-emerald-600 transition"
                    />
                  </th>

                  {/* Cost Price */}
                  <th
                    style={{ width: `${colWidths.purchase_price || 140}px` }}
                    className="py-3 px-2.5 text-right relative group"
                  >
                    <span className="truncate">Cost ({currency}) *</span>
                    <div
                      onMouseDown={(e) => handleStartResize('purchase_price', e)}
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-emerald-500 active:bg-emerald-600 transition"
                    />
                  </th>

                  {/* Sale Price */}
                  <th
                    style={{ width: `${colWidths.selling_price || 140}px` }}
                    className="py-3 px-2.5 text-right relative group"
                  >
                    <span className="truncate">Sale ({currency}) *</span>
                    <div
                      onMouseDown={(e) => handleStartResize('selling_price', e)}
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-emerald-500 active:bg-emerald-600 transition"
                    />
                  </th>

                  {/* Stock Qty */}
                  <th
                    style={{ width: `${colWidths.opening_stock || 110}px` }}
                    className="py-3 px-2.5 text-right relative group"
                  >
                    <span className="truncate">Stock Qty</span>
                    <div
                      onMouseDown={(e) => handleStartResize('opening_stock', e)}
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-emerald-500 active:bg-emerald-600 transition"
                    />
                  </th>

                  {/* Barcode */}
                  <th
                    style={{ width: `${colWidths.barcode || 160}px` }}
                    className="py-3 px-2.5 relative group"
                  >
                    <span className="truncate">Barcode</span>
                    <div
                      onMouseDown={(e) => handleStartResize('barcode', e)}
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-emerald-500 active:bg-emerald-600 transition"
                    />
                  </th>

                  {/* Dynamic Custom Attribute Columns */}
                  {customFields.map((cf) => {
                    const colKey = `custom_${cf.id}`;
                    return (
                      <th
                        key={cf.id}
                        style={{ width: `${colWidths[colKey] || 160}px` }}
                        className="py-3 px-2.5 text-emerald-800 font-bold relative group"
                      >
                        <span className="truncate">{cf.name}</span>
                        <div
                          onMouseDown={(e) => handleStartResize(colKey, e)}
                          className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-emerald-500 active:bg-emerald-600 transition"
                        />
                      </th>
                    );
                  })}

                  {/* Action */}
                  <th
                    style={{ width: `${colWidths.action || 50}px` }}
                    className="py-3 px-2 text-center"
                  ></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80 bg-white">
                {rows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-emerald-50/30 transition">
                    {/* Index */}
                    <td
                      style={{ width: `${colWidths.index || 50}px` }}
                      className="py-2 px-2 text-center font-bold text-slate-400 bg-white sticky left-0 z-10 shadow-[1px_0_0_0_#e2e8f0]"
                    >
                      {idx + 1}
                    </td>

                    {/* Product Name */}
                    <td
                      style={{ width: `${colWidths.name || 240}px` }}
                      className="py-1 px-1.5 bg-white sticky left-[50px] z-10 shadow-[1px_0_0_0_#e2e8f0]"
                    >
                      <input
                        type="text"
                        placeholder="e.g. iPhone 16 Pro, Cotton Shirt"
                        value={row.name}
                        onChange={(e) => handleUpdateCell(idx, 'name', e.target.value)}
                        className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-lg px-2.5 py-1.5 font-bold text-slate-900 text-xs focus:outline-none shadow-sm"
                      />
                    </td>

                    {/* Category */}
                    <td style={{ width: `${colWidths.category || 160}px` }} className="py-1 px-1">
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

                    {/* Cost Price */}
                    <td
                      style={{ width: `${colWidths.purchase_price || 140}px` }}
                      className="py-1 px-1"
                    >
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={row.purchase_price || ''}
                        placeholder="0.00"
                        onChange={(e) => handleUpdateCell(idx, 'purchase_price', Number(e.target.value))}
                        className="w-full text-right bg-slate-50 focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-lg px-2 py-1.5 font-semibold text-slate-800 text-xs focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </td>

                    {/* Sale Price */}
                    <td
                      style={{ width: `${colWidths.selling_price || 140}px` }}
                      className="py-1 px-1"
                    >
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={row.selling_price || ''}
                        placeholder="0.00"
                        onChange={(e) => handleUpdateCell(idx, 'selling_price', Number(e.target.value))}
                        className="w-full text-right bg-slate-50 focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-lg px-2 py-1.5 font-black text-slate-900 text-xs focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </td>

                    {/* Stock Qty */}
                    <td
                      style={{ width: `${colWidths.opening_stock || 110}px` }}
                      className="py-1 px-1"
                    >
                      <input
                        type="number"
                        min="0"
                        value={row.opening_stock || ''}
                        placeholder="0"
                        onChange={(e) => handleUpdateCell(idx, 'opening_stock', Number(e.target.value))}
                        className="w-full text-right bg-slate-50 focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-lg px-2 py-1.5 font-bold text-emerald-700 text-xs focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </td>

                    {/* Barcode */}
                    <td style={{ width: `${colWidths.barcode || 160}px` }} className="py-1 px-1">
                      <input
                        type="text"
                        placeholder="Scan / Barcode"
                        value={row.barcode}
                        onChange={(e) => handleUpdateCell(idx, 'barcode', e.target.value)}
                        className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-lg px-2 py-1.5 font-mono text-slate-700 text-xs focus:outline-none"
                      />
                    </td>

                    {/* Dynamic Custom Field Cells */}
                    {customFields.map((cf) => {
                      const colKey = `custom_${cf.id}`;
                      if (cf.field_type === 'select' && cf.options) {
                        const opts = cf.options.split(',').map((o) => o.trim()).filter(Boolean);
                        return (
                          <td
                            key={cf.id}
                            style={{ width: `${colWidths[colKey] || 160}px` }}
                            className="py-1 px-1"
                          >
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
                        <td
                          key={cf.id}
                          style={{ width: `${colWidths[colKey] || 160}px` }}
                          className="py-1 px-1"
                        >
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

                    {/* Delete */}
                    <td
                      style={{ width: `${colWidths.action || 50}px` }}
                      className="py-1 px-1 text-center"
                    >
                      <button
                        type="button"
                        onClick={() => handleRemoveRow(idx)}
                        disabled={rows.length <= 1}
                        className="text-slate-300 hover:text-rose-500 disabled:opacity-20 p-1.5 transition rounded-lg hover:bg-rose-50"
                        title="Remove Row"
                      >
                        <Trash2 className="h-4 w-4" />
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
                className="text-xs font-semibold"
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
            <Button type="button" variant="secondary" onClick={handleRequestClose}>
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

      {/* Discard Confirmation Modal */}
      <Modal
        isOpen={showDiscardConfirm}
        onClose={() => setShowDiscardConfirm(false)}
        title="Discard Unsaved Products?"
        subtitle="You have entered product details in the spreadsheet grid."
        maxWidth="sm"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            Closing now will discard all rows you have entered. Are you sure you want to exit without saving?
          </p>
          <div className="flex justify-end gap-2.5 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowDiscardConfirm(false)}
              className="font-semibold text-xs"
            >
              Keep Editing
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={handleConfirmDiscard}
              className="font-bold text-xs"
            >
              Discard & Close
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
};
