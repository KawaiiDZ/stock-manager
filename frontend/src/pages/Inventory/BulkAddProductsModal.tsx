import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../services/api';
import { Category, BusinessSettings, CustomField, Product } from '../../types';
import { Plus, Trash2, Layers, AlertCircle, Sparkles, Barcode } from 'lucide-react';
import { Modal } from '../../components/common/Modal';
import { Button } from '../../components/common/Button';
import { BarcodePrintModal } from '../../components/barcode/BarcodePrintModal';
import { formatCurrency } from '../../utils/format';

interface BulkAddProductsModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  customFields?: CustomField[];
  settings: BusinessSettings | null;
  initialCategoryId?: number;
  onProductsAdded: () => void;
}

interface ProductRow {
  name: string;
  sku: string;
  barcode: string;
  purchase_price: number;
  selling_price: number;
  opening_stock: number;
  custom_values: Record<number, string>;
}

const emptyRow = (): ProductRow => ({
  name: '',
  sku: '',
  barcode: '',
  purchase_price: 0,
  selling_price: 0,
  opening_stock: 0,
  custom_values: {},
});

const DEFAULT_COL_WIDTHS: Record<string, number> = {
  index: 45,
  name: 220,
  sku: 130,
  barcode: 140,
  purchase_price: 130,
  selling_price: 130,
  opening_stock: 110,
  action: 45,
};

export const BulkAddProductsModal: React.FC<BulkAddProductsModalProps> = ({
  isOpen,
  onClose,
  categories,
  customFields = [],
  settings,
  initialCategoryId,
  onProductsAdded,
}) => {
  // Category selection at the top for the entire batch
  const [selectedCategoryId, setSelectedCategoryId] = useState<number>(() => {
    if (initialCategoryId && initialCategoryId > 0) return initialCategoryId;
    return categories.length > 0 ? categories[0].id : 0;
  });

  const [rows, setRows] = useState<ProductRow[]>([emptyRow()]);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [createdBatchProducts, setCreatedBatchProducts] = useState<Product[]>([]);
  const [showBatchBarcodeModal, setShowBatchBarcodeModal] = useState(false);

  // Sync initial category when opening modal
  useEffect(() => {
    if (isOpen) {
      if (initialCategoryId && initialCategoryId > 0) {
        setSelectedCategoryId(initialCategoryId);
      } else if (categories.length > 0 && !categories.some((c) => c.id === selectedCategoryId)) {
        setSelectedCategoryId(categories[0].id);
      }
    }
  }, [isOpen, initialCategoryId, categories]);

  // Active category object
  const activeCategory = categories.find((c) => c.id === selectedCategoryId);

  // Dynamic custom fields matching the single Add/Edit Product modal exactly
  const relevantCustomFields = customFields
    .filter((cf) => !cf.category_id || cf.category_id === selectedCategoryId)
    .sort((a, b) => a.display_order - b.display_order);

  // Column widths state
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    const initial = { ...DEFAULT_COL_WIDTHS };
    customFields.forEach((cf) => {
      initial[`custom_${cf.id}`] = 160;
    });
    return initial;
  });

  // Sync custom field column widths
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
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

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
      const minW = resizingCol === 'index' || resizingCol === 'action' ? 35 : 80;
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
  const showSku = settings?.show_sku !== false;
  const showBarcode = settings?.show_barcode !== false;

  const hasUnsavedData = rows.some(
    (r) =>
      r.name.trim().length > 0 ||
      (showSku && r.sku.trim().length > 0) ||
      (showBarcode && r.barcode.trim().length > 0) ||
      r.purchase_price > 0 ||
      r.selling_price > 0 ||
      r.opening_stock > 0 ||
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
    setRows([emptyRow()]);
    setErrorMsg(null);
    onClose();
  };

  const handleAddRows = (count = 1) => {
    const newRows = Array.from({ length: count }, () => emptyRow());
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

  const handleSubmit = async (e?: React.FormEvent, printBarcodes: boolean = false) => {
    if (e) e.preventDefault();
    if (validRows.length === 0) {
      setErrorMsg('Please enter at least 1 product name.');
      return;
    }

    // Row-by-row validation for edge cases
    const seenBarcodes = new Map<string, number>();
    for (let i = 0; i < validRows.length; i++) {
      const r = validRows[i];
      const rowNum = i + 1;

      if (Number(r.purchase_price) < 0) {
        setErrorMsg(`Row ${rowNum} ("${r.name}"): Cost price cannot be negative.`);
        return;
      }
      if (Number(r.selling_price) < 0) {
        setErrorMsg(`Row ${rowNum} ("${r.name}"): Selling price cannot be negative.`);
        return;
      }
      if (Number(r.opening_stock) < 0) {
        setErrorMsg(`Row ${rowNum} ("${r.name}"): Opening stock cannot be negative.`);
        return;
      }

      if (showBarcode) {
        const bc = r.barcode.trim();
        if (bc) {
          if (seenBarcodes.has(bc)) {
            setErrorMsg(
              `Duplicate barcode "${bc}" found in Row ${seenBarcodes.get(bc)} and Row ${rowNum}. Barcodes must be unique.`
            );
            return;
          }
          seenBarcodes.set(bc, rowNum);
        }
      }
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
          category_id: selectedCategoryId > 0 ? selectedCategoryId : undefined,
          purchase_price: Number(r.purchase_price || 0),
          selling_price: Number(r.selling_price || 0),
          opening_stock: Number(r.opening_stock || 0),
          barcode: showBarcode ? (r.barcode.trim() || undefined) : undefined,
          sku: showSku ? (r.sku.trim() || undefined) : undefined,
          custom_fields: customFieldList.length > 0 ? customFieldList : undefined,
        };
      });

      const res = await api.bulkCreateProducts(payload);
      onProductsAdded();

      if (printBarcodes && res.products && res.products.length > 0) {
        setCreatedBatchProducts(res.products);
        setShowBatchBarcodeModal(true);
      } else {
        onClose();
      }
      // Reset rows
      setRows([emptyRow()]);
    } catch (err: any) {
      setErrorMsg(err.detail || 'Failed to add products.');
    } finally {
      setLoading(false);
    }
  };

  // Calculate total table width for horizontal scrolling
  const totalTableWidth =
    (colWidths.index || 45) +
    (colWidths.name || 220) +
    (showSku ? (colWidths.sku || 130) : 0) +
    (showBarcode ? (colWidths.barcode || 140) : 0) +
    (colWidths.purchase_price || 130) +
    (colWidths.selling_price || 130) +
    (colWidths.opening_stock || 110) +
    relevantCustomFields.reduce((sum, cf) => sum + (colWidths[`custom_${cf.id}`] || 160), 0) +
    (colWidths.action || 45);

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleRequestClose}
        title="Add Products"
        subtitle="Select category to adapt custom attributes. Enter product details below."
        maxWidth="full"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {errorMsg && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Step 1: Category Selector at the Top */}
          <div className="p-4 bg-gradient-to-r from-slate-50 to-emerald-50/40 rounded-2xl border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-500/10 rounded-xl border border-emerald-500/20 text-emerald-700 shrink-0">
                <Layers className="h-5 w-5" />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Select Category *
                </label>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedCategoryId}
                    onChange={(e) => setSelectedCategoryId(Number(e.target.value))}
                    className="bg-white border border-slate-300 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-sm font-bold text-slate-800 shadow-sm focus:outline-none min-w-[220px]"
                  >
                    <option value={0}>General / Uncategorized</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>

                  {activeCategory && (
                    <span className="text-xs font-extrabold px-2.5 py-1 rounded-lg bg-emerald-100/70 text-emerald-800 border border-emerald-200">
                      {activeCategory.name}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <div className="bg-white px-3.5 py-2 rounded-xl border border-slate-200 shadow-sm flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                <span className="font-bold text-slate-700">
                  {relevantCustomFields.length} {relevantCustomFields.length === 1 ? 'attribute column' : 'attribute columns'}
                </span>
                <span className="text-slate-400">loaded for {activeCategory?.name || 'General'}</span>
              </div>
            </div>
          </div>

          {/* Spreadsheet Table with Horizontal & Vertical Scroll */}
          <div className="border border-slate-200 rounded-2xl overflow-x-auto overflow-y-auto max-h-[56vh] shadow-sm bg-slate-50/30">
            <table
              className="text-left text-xs border-collapse table-fixed select-none"
              style={{ width: `${totalTableWidth}px`, minWidth: '100%' }}
            >
              <thead className="bg-slate-100 sticky top-0 z-20 border-b border-slate-200 font-bold text-slate-700 uppercase tracking-wider text-[11px]">
                <tr>
                  {/* Index */}
                  <th
                    style={{ width: `${colWidths.index || 45}px` }}
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
                    style={{ width: `${colWidths.name || 220}px` }}
                    className="py-3 px-3 bg-slate-100 sticky left-[45px] z-30 shadow-[1px_0_0_0_#e2e8f0] relative group"
                  >
                    <span className="truncate">Product Name *</span>
                    <div
                      onMouseDown={(e) => handleStartResize('name', e)}
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-emerald-500 active:bg-emerald-600 transition"
                    />
                  </th>

                  {/* SKU (Optional) */}
                  {showSku && (
                    <th
                      style={{ width: `${colWidths.sku || 130}px` }}
                      className="py-3 px-2.5 relative group"
                    >
                      <span className="truncate">SKU (Opt)</span>
                      <div
                        onMouseDown={(e) => handleStartResize('sku', e)}
                        className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-emerald-500 active:bg-emerald-600 transition"
                      />
                    </th>
                  )}

                  {/* Barcode (Optional) */}
                  {showBarcode && (
                    <th
                      style={{ width: `${colWidths.barcode || 140}px` }}
                      className="py-3 px-2.5 relative group"
                    >
                      <span className="truncate">Barcode (Opt)</span>
                      <div
                        onMouseDown={(e) => handleStartResize('barcode', e)}
                        className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-emerald-500 active:bg-emerald-600 transition"
                      />
                    </th>
                  )}

                  {/* Cost Price */}
                  <th
                    style={{ width: `${colWidths.purchase_price || 130}px` }}
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
                    style={{ width: `${colWidths.selling_price || 130}px` }}
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

                  {/* Dynamic Category & Global Custom Attribute Columns */}
                  {relevantCustomFields.map((cf) => {
                    const colKey = `custom_${cf.id}`;
                    const isGlobal = !cf.category_id;
                    return (
                      <th
                        key={cf.id}
                        style={{ width: `${colWidths[colKey] || 160}px` }}
                        className="py-3 px-2.5 relative group"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="truncate text-emerald-900 font-extrabold">
                            {cf.name}
                            {cf.is_required && <span className="text-rose-500 font-black"> *</span>}
                          </span>
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.2 rounded shrink-0 ${
                              isGlobal
                                ? 'bg-slate-200/80 text-slate-600'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {isGlobal ? 'Global' : activeCategory?.name || 'Cat'}
                          </span>
                        </div>
                        <div
                          onMouseDown={(e) => handleStartResize(colKey, e)}
                          className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-emerald-500 active:bg-emerald-600 transition"
                        />
                      </th>
                    );
                  })}

                  {/* Action */}
                  <th
                    style={{ width: `${colWidths.action || 45}px` }}
                    className="py-3 px-2 text-center"
                  ></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80 bg-white">
                {rows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-emerald-50/30 transition">
                    {/* Index */}
                    <td
                      style={{ width: `${colWidths.index || 45}px` }}
                      className="py-2 px-2 text-center font-bold text-slate-400 bg-white sticky left-0 z-10 shadow-[1px_0_0_0_#e2e8f0]"
                    >
                      {idx + 1}
                    </td>

                    {/* Product Name */}
                    <td
                      style={{ width: `${colWidths.name || 220}px` }}
                      className="py-1 px-1.5 bg-white sticky left-[45px] z-10 shadow-[1px_0_0_0_#e2e8f0]"
                    >
                      <input
                        type="text"
                        placeholder="e.g. Product Item Name"
                        value={row.name}
                        onChange={(e) => handleUpdateCell(idx, 'name', e.target.value)}
                        className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-lg px-2.5 py-1.5 font-bold text-slate-900 text-xs focus:outline-none shadow-sm"
                      />
                    </td>

                    {/* SKU */}
                    {showSku && (
                      <td style={{ width: `${colWidths.sku || 130}px` }} className="py-1 px-1">
                        <input
                          type="text"
                          placeholder="SKU-001"
                          value={row.sku}
                          onChange={(e) => handleUpdateCell(idx, 'sku', e.target.value)}
                          className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-lg px-2 py-1.5 text-xs text-slate-700 focus:outline-none"
                        />
                      </td>
                    )}

                    {/* Barcode */}
                    {showBarcode && (
                      <td style={{ width: `${colWidths.barcode || 140}px` }} className="py-1 px-1">
                        <input
                          type="text"
                          placeholder="Scan / Barcode"
                          value={row.barcode}
                          onChange={(e) => handleUpdateCell(idx, 'barcode', e.target.value)}
                          className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-lg px-2 py-1.5 font-mono text-slate-700 text-xs focus:outline-none"
                        />
                      </td>
                    )}

                    {/* Cost Price */}
                    <td
                      style={{ width: `${colWidths.purchase_price || 130}px` }}
                      className="py-1 px-1"
                    >
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={row.purchase_price || ''}
                        placeholder="0.00"
                        onChange={(e) =>
                          handleUpdateCell(idx, 'purchase_price', Number(e.target.value))
                        }
                        className="w-full text-right bg-slate-50 focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-lg px-2 py-1.5 font-semibold text-slate-800 text-xs focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </td>

                    {/* Sale Price */}
                    <td
                      style={{ width: `${colWidths.selling_price || 130}px` }}
                      className="py-1 px-1"
                    >
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={row.selling_price || ''}
                        placeholder="0.00"
                        onChange={(e) =>
                          handleUpdateCell(idx, 'selling_price', Number(e.target.value))
                        }
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
                        onChange={(e) =>
                          handleUpdateCell(idx, 'opening_stock', Number(e.target.value))
                        }
                        className="w-full text-right bg-slate-50 focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-lg px-2 py-1.5 font-bold text-emerald-700 text-xs focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </td>

                    {/* Dynamic Custom Field Cells */}
                    {relevantCustomFields.map((cf) => {
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
                              <option value="">— Select {cf.name} —</option>
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
                            type={
                              cf.field_type === 'number'
                                ? 'number'
                                : cf.field_type === 'date'
                                ? 'date'
                                : 'text'
                            }
                            placeholder={cf.name}
                            value={row.custom_values[cf.id] || ''}
                            onChange={(e) =>
                              handleUpdateCustomValue(idx, cf.id, e.target.value)
                            }
                            className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-lg px-2 py-1.5 text-xs text-slate-700 focus:outline-none font-medium"
                          />
                        </td>
                      );
                    })}

                    {/* Delete Row */}
                    <td
                      style={{ width: `${colWidths.action || 45}px` }}
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

                {/* Single small plus icon row directly below the product row */}
                <tr className="border-t border-slate-200/70 bg-slate-50/50 hover:bg-slate-100/60 transition">
                  <td
                    style={{ width: `${colWidths.index || 45}px` }}
                    className="py-1.5 px-1 text-center sticky left-0 z-20 bg-slate-50 shadow-[1px_0_0_0_#e2e8f0]"
                  >
                    <button
                      type="button"
                      onClick={() => handleAddRows(1)}
                      className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-white hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 border border-slate-300 hover:border-emerald-400 shadow-2xs transition"
                      title="Add a row"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </td>
                  <td
                    colSpan={100}
                    className="py-1.5 px-3 text-xs select-none"
                  >
                    <button
                      type="button"
                      onClick={() => handleAddRows(1)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800 transition"
                    >
                      <Plus className="h-3 w-3" />
                      <span>Add another product row</span>
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Live Summary */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-1">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-semibold">
                {validRows.length} {validRows.length === 1 ? 'product' : 'products'} ready to save
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
          <div className="flex flex-wrap items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <Button type="button" variant="secondary" onClick={handleRequestClose}>
              Cancel
            </Button>
            {settings?.enable_barcode_printer !== false && (
              <Button
                type="button"
                variant="secondary"
                icon={<Barcode className="h-4 w-4 text-emerald-600" />}
                onClick={() => handleSubmit(undefined, true)}
                loading={loading}
                disabled={validRows.length === 0}
                className="font-bold border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              >
                Save & Print Barcodes
              </Button>
            )}
            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={loading}
              disabled={validRows.length === 0}
              className="font-bold px-6 shadow-md shadow-emerald-600/20"
            >
              {validRows.length <= 1
                ? 'Save Product to Inventory'
                : `Save ${validRows.length} Products to Inventory`}
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

      {/* Batch Barcode Print Modal */}
      <BarcodePrintModal
        isOpen={showBatchBarcodeModal}
        onClose={() => {
          setShowBatchBarcodeModal(false);
          onClose();
        }}
        settings={settings}
        products={createdBatchProducts}
        initialCopies={1}
      />
    </>
  );
};
