import React, { useState, useEffect, useRef, useMemo } from 'react';
import { api } from '../../services/api';
import { Product, CustomField, BusinessSettings } from '../../types';
import { Edit2, Sparkles, Barcode, AlertCircle, RotateCcw, Search, Check, X, Layers, Zap } from 'lucide-react';
import { Modal } from '../../components/common/Modal';
import { Button } from '../../components/common/Button';
import { formatCurrency } from '../../utils/format';

interface BulkEditProductsModalProps {
  isOpen: boolean;
  onClose: () => void;
  categoryId: number | null;
  categoryName: string;
  products: Product[];
  customFields?: CustomField[];
  settings: BusinessSettings | null;
  onProductsUpdated: (updatedProductIds: number[]) => void;
}

interface BulkEditRow {
  id: number;
  product_id: string;
  name: string;
  sku: string;
  barcode: string;
  purchase_price: number;
  selling_price: number;
  current_stock: number;
  is_service: boolean;
  custom_values: Record<number, string>;
  original: {
    name: string;
    sku: string;
    barcode: string;
    purchase_price: number;
    selling_price: number;
    current_stock: number;
    is_service: boolean;
    custom_values: Record<number, string>;
  };
}

const DEFAULT_COL_WIDTHS: Record<string, number> = {
  index: 65,
  product_id: 110,
  name: 240,
  sku: 130,
  barcode: 150,
  purchase_price: 130,
  selling_price: 130,
  current_stock: 120,
  action: 70,
};

export const BulkEditProductsModal: React.FC<BulkEditProductsModalProps> = ({
  isOpen,
  onClose,
  categoryId,
  categoryName,
  products,
  customFields = [],
  settings,
  onProductsUpdated,
}) => {
  const [rows, setRows] = useState<BulkEditRow[]>([]);
  const [searchFilter, setSearchFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  // Sync initial products into rows when modal opens or products change
  useEffect(() => {
    if (isOpen) {
      setErrorMsg(null);
      setSearchFilter('');

      const initialRows: BulkEditRow[] = products.map((p) => {
        const cVals: Record<number, string> = {};
        if (p.custom_fields && Array.isArray(p.custom_fields)) {
          p.custom_fields.forEach((cf) => {
            cVals[cf.field_id] = cf.value || '';
          });
        }

        const snapshot = {
          name: p.name || '',
          sku: p.sku || '',
          barcode: p.barcode || '',
          purchase_price: Number(p.purchase_price || 0),
          selling_price: Number(p.selling_price || 0),
          current_stock: Number(p.current_stock || 0),
          is_service: Boolean(p.is_service),
          custom_values: { ...cVals },
        };

        return {
          id: p.id,
          product_id: p.product_id,
          name: snapshot.name,
          sku: snapshot.sku,
          barcode: snapshot.barcode,
          purchase_price: snapshot.purchase_price,
          selling_price: snapshot.selling_price,
          current_stock: snapshot.current_stock,
          is_service: snapshot.is_service,
          custom_values: { ...cVals },
          original: snapshot,
        };
      });

      setRows(initialRows);
    }
  }, [isOpen, products]);

  // Custom attributes relevant to this category (or global)
  const relevantCustomFields = useMemo(() => {
    return customFields
      .filter((cf) => !cf.category_id || (categoryId !== null && cf.category_id === categoryId))
      .sort((a, b) => a.display_order - b.display_order);
  }, [customFields, categoryId]);

  // Draggable Column Widths
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    const initial = { ...DEFAULT_COL_WIDTHS };
    customFields.forEach((cf) => {
      initial[`custom_${cf.id}`] = 160;
    });
    return initial;
  });

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
      const minW = resizingCol === 'index' || resizingCol === 'action' ? 45 : 80;
      const maxW = 500;
      const newW = Math.max(minW, Math.min(maxW, startWidthRef.current + delta));
      setColWidths((prev) => ({ ...prev, [resizingCol]: newW }));
    };
    const handleMouseUp = () => setResizingCol(null);
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

  // Diff detection
  const isCellEdited = (row: BulkEditRow, colKey: string): boolean => {
    if (colKey === 'name') return row.name.trim() !== row.original.name.trim();
    if (colKey === 'sku') return row.sku.trim() !== row.original.sku.trim();
    if (colKey === 'barcode') return row.barcode.trim() !== row.original.barcode.trim();
    if (colKey === 'purchase_price') return !row.is_service && Number(row.purchase_price) !== Number(row.original.purchase_price);
    if (colKey === 'selling_price') return Number(row.selling_price) !== Number(row.original.selling_price);
    if (colKey === 'current_stock') return !row.is_service && Number(row.current_stock) !== Number(row.original.current_stock);
    if (colKey.startsWith('custom_')) {
      const cfId = Number(colKey.replace('custom_', ''));
      const currentVal = (row.custom_values[cfId] || '').trim();
      const origVal = (row.original.custom_values[cfId] || '').trim();
      return currentVal !== origVal;
    }
    return false;
  };

  const isRowEdited = (row: BulkEditRow): boolean => {
    if (row.name.trim() !== row.original.name.trim()) return true;
    if (row.sku.trim() !== row.original.sku.trim()) return true;
    if (row.barcode.trim() !== row.original.barcode.trim()) return true;
    if (!row.is_service && Number(row.purchase_price) !== Number(row.original.purchase_price)) return true;
    if (Number(row.selling_price) !== Number(row.original.selling_price)) return true;
    if (!row.is_service && Number(row.current_stock) !== Number(row.original.current_stock)) return true;

    const allCfKeys = new Set([
      ...Object.keys(row.custom_values),
      ...Object.keys(row.original.custom_values),
    ]);
    for (const key of allCfKeys) {
      const cfId = Number(key);
      const curr = (row.custom_values[cfId] || '').trim();
      const orig = (row.original.custom_values[cfId] || '').trim();
      if (curr !== orig) return true;
    }
    return false;
  };

  const editedRows = useMemo(() => rows.filter(isRowEdited), [rows]);
  const hasUnsavedData = editedRows.length > 0;

  const handleRequestClose = () => {
    if (hasUnsavedData) {
      setShowDiscardConfirm(true);
    } else {
      onClose();
    }
  };

  const handleConfirmDiscard = () => {
    setShowDiscardConfirm(false);
    setErrorMsg(null);
    onClose();
  };

  const handleRevertRow = (rowId: number) => {
    setRows((prev) =>
      prev.map((r) =>
        r.id === rowId
          ? {
              ...r,
              name: r.original.name,
              sku: r.original.sku,
              barcode: r.original.barcode,
              purchase_price: r.original.purchase_price,
              selling_price: r.original.selling_price,
              current_stock: r.original.current_stock,
              custom_values: { ...r.original.custom_values },
            }
          : r
      )
    );
  };

  const handleRevertAll = () => {
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        name: r.original.name,
        sku: r.original.sku,
        barcode: r.original.barcode,
        purchase_price: r.original.purchase_price,
        selling_price: r.original.selling_price,
        current_stock: r.original.current_stock,
        custom_values: { ...r.original.custom_values },
      }))
    );
  };

  const handleUpdateCell = (rowId: number, field: keyof BulkEditRow, val: any) => {
    setRows((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, [field]: val } : r))
    );
  };

  const handleUpdateCustomValue = (rowId: number, fieldId: number, val: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id === rowId) {
          return {
            ...r,
            custom_values: {
              ...r.custom_values,
              [fieldId]: val,
            },
          };
        }
        return r;
      })
    );
  };

  const handleGenerateBarcode = async (rowId: number) => {
    try {
      const res = await api.generateBarcode();
      if (res && res.barcode) {
        handleUpdateCell(rowId, 'barcode', res.barcode);
      }
    } catch (err: any) {
      setErrorMsg(err.detail || 'Failed to generate barcode.');
    }
  };

  // Filtered rows for display
  const displayedRows = useMemo(() => {
    if (!searchFilter.trim()) return rows;
    const q = searchFilter.toLowerCase().trim();
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.product_id.toLowerCase().includes(q) ||
        (showSku && r.sku.toLowerCase().includes(q)) ||
        (showBarcode && r.barcode.toLowerCase().includes(q))
    );
  }, [rows, searchFilter, showSku, showBarcode]);

  // Keyboard navigation across cells
  const visibleColumns = useMemo(() => {
    const cols: string[] = ['name'];
    if (showSku) cols.push('sku');
    relevantCustomFields.forEach((cf) => cols.push(`custom_${cf.id}`));
    if (showBarcode) cols.push('barcode');
    cols.push('purchase_price', 'selling_price', 'current_stock');
    return cols;
  }, [showSku, relevantCustomFields, showBarcode]);

  const focusCell = (rIdx: number, cIdx: number) => {
    if (rIdx < 0 || rIdx >= displayedRows.length || cIdx < 0 || cIdx >= visibleColumns.length) return;
    const colKey = visibleColumns[cIdx];
    const rowId = displayedRows[rIdx].id;
    const el = document.querySelector<HTMLInputElement | HTMLSelectElement>(
      `[data-bulk-edit-cell="${rowId}-${colKey}"]`
    );
    if (el) {
      el.focus();
      if ('select' in el && typeof el.select === 'function') {
        el.select();
      }
    }
  };

  const handleCellKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>,
    rIdx: number,
    colKey: string
  ) => {
    const cIdx = visibleColumns.indexOf(colKey);
    const isInput = e.currentTarget instanceof HTMLInputElement;
    const isSelect = e.currentTarget instanceof HTMLSelectElement;

    if (e.key === 'ArrowUp') {
      if (isInput) {
        e.preventDefault();
        if (rIdx > 0) focusCell(rIdx - 1, cIdx);
      }
    } else if (e.key === 'ArrowDown') {
      if (isInput) {
        e.preventDefault();
        if (rIdx < displayedRows.length - 1) focusCell(rIdx + 1, cIdx);
      }
    } else if (e.key === 'ArrowLeft') {
      if (isSelect) {
        e.preventDefault();
        if (cIdx > 0) focusCell(rIdx, cIdx - 1);
        else if (rIdx > 0) focusCell(rIdx - 1, visibleColumns.length - 1);
      } else if (isInput) {
        const input = e.currentTarget as HTMLInputElement;
        const atStart = input.selectionStart === 0 && input.selectionEnd === 0;
        const allSelected = input.selectionStart === 0 && input.selectionEnd === input.value.length;
        if (atStart || allSelected) {
          e.preventDefault();
          if (cIdx > 0) focusCell(rIdx, cIdx - 1);
          else if (rIdx > 0) focusCell(rIdx - 1, visibleColumns.length - 1);
        }
      }
    } else if (e.key === 'ArrowRight') {
      if (isSelect) {
        e.preventDefault();
        if (cIdx < visibleColumns.length - 1) focusCell(rIdx, cIdx + 1);
        else if (rIdx < displayedRows.length - 1) focusCell(rIdx + 1, 0);
      } else if (isInput) {
        const input = e.currentTarget as HTMLInputElement;
        const atEnd = input.selectionStart === input.value.length && input.selectionEnd === input.value.length;
        const allSelected = input.selectionStart === 0 && input.selectionEnd === input.value.length;
        if (atEnd || allSelected) {
          e.preventDefault();
          if (cIdx < visibleColumns.length - 1) focusCell(rIdx, cIdx + 1);
          else if (rIdx < displayedRows.length - 1) focusCell(rIdx + 1, 0);
        }
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (rIdx < displayedRows.length - 1) {
        focusCell(rIdx + 1, cIdx);
      }
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (editedRows.length === 0) {
      setErrorMsg('No changes were made.');
      return;
    }

    // Validation
    const seenBarcodes = new Map<string, string>();
    for (let i = 0; i < editedRows.length; i++) {
      const r = editedRows[i];
      if (!r.name.trim()) {
        setErrorMsg(`Product "${r.product_id}" name cannot be empty.`);
        return;
      }
      if (Number(r.purchase_price) < 0) {
        setErrorMsg(`Product "${r.name}": Cost price cannot be negative.`);
        return;
      }
      if (Number(r.selling_price) < 0) {
        setErrorMsg(`Product "${r.name}": Selling price cannot be negative.`);
        return;
      }
      if (Number(r.current_stock) < 0) {
        setErrorMsg(`Product "${r.name}": Stock cannot be negative.`);
        return;
      }
      if (showBarcode && r.barcode.trim()) {
        const bc = r.barcode.trim();
        if (seenBarcodes.has(bc)) {
          setErrorMsg(
            `Duplicate barcode "${bc}" found between ${seenBarcodes.get(bc)} and ${r.name}. Barcodes must be unique.`
          );
          return;
        }
        seenBarcodes.set(bc, r.name);
      }
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const payload = editedRows.map((r) => {
        const customFieldList = Object.entries(r.custom_values)
          .filter(([_, val]) => val && val.trim().length > 0)
          .map(([fieldIdStr, val]) => ({
            field_id: Number(fieldIdStr),
            value: val.trim(),
          }));

        return {
          id: r.id,
          name: r.name.trim(),
          sku: showSku ? (r.sku.trim() || undefined) : undefined,
          barcode: showBarcode ? (r.barcode.trim() || undefined) : undefined,
          category_id: categoryId && categoryId > 0 ? categoryId : undefined,
          purchase_price: r.is_service ? 0 : Number(r.purchase_price || 0),
          selling_price: Number(r.selling_price || 0),
          current_stock: r.is_service ? 0 : Number(r.current_stock || 0),
          is_service: r.is_service,
          custom_fields: customFieldList,
        };
      });

      const res = await api.bulkUpdateProducts(payload);
      const updatedIds = editedRows.map((r) => r.id);
      onProductsUpdated(updatedIds);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.detail || 'Failed to update products.');
    } finally {
      setLoading(false);
    }
  };

  const totalTableWidth =
    (colWidths.index || 65) +
    (colWidths.product_id || 110) +
    (colWidths.name || 240) +
    (showSku ? (colWidths.sku || 130) : 0) +
    (showBarcode ? (colWidths.barcode || 150) : 0) +
    (colWidths.purchase_price || 130) +
    (colWidths.selling_price || 130) +
    (colWidths.current_stock || 120) +
    relevantCustomFields.reduce((sum, cf) => sum + (colWidths[`custom_${cf.id}`] || 160), 0) +
    (colWidths.action || 70);

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleRequestClose}
        title={`Bulk Edit: ${categoryName}`}
        subtitle={`Edit contents of "${categoryName}". Edited rows and cells are highlighted in amber.`}
        maxWidth="full"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {errorMsg && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-medium">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Top Control Bar: Category info, search filter, and modified counter */}
          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-brand-500/10 rounded-xl border border-brand-500/20 text-brand-600 dark:text-brand-400 shrink-0">
                <Layers className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-extrabold text-slate-900 dark:text-white">
                    {categoryName}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-slate-200/70 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                    {products.length} products
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-2">
                  <span>{relevantCustomFields.length} custom attributes</span>
                  <span>•</span>
                  <span>Changes are highlighted live before saving</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {/* Inline Search Filter */}
              <div className="relative w-56 sm:w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Filter category products..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="w-full pl-8 pr-7 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:ring-1 focus:ring-brand-500 font-medium"
                />
                {searchFilter && (
                  <button
                    type="button"
                    onClick={() => setSearchFilter('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>

              {/* Status Pill & Revert All */}
              {hasUnsavedData ? (
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-xl bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 font-black text-xs flex items-center gap-1.5 shadow-2xs">
                    <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                    <span>{editedRows.length} modified</span>
                  </span>
                  <button
                    type="button"
                    onClick={handleRevertAll}
                    className="px-2.5 py-1 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700 transition flex items-center gap-1"
                    title="Discard all changes back to original"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>Revert All</span>
                  </button>
                </div>
              ) : (
                <span className="text-xs text-slate-400 dark:text-slate-500 font-semibold px-2">
                  No changes yet
                </span>
              )}
            </div>
          </div>

          {/* Spreadsheet Table with Horizontal & Vertical Scroll */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-x-auto overflow-y-auto max-h-[56vh] shadow-sm bg-slate-50/30 dark:bg-slate-900/40">
            <table
              className="text-left text-xs border-collapse table-fixed select-none"
              style={{ width: `${totalTableWidth}px`, minWidth: '100%' }}
            >
              <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0 z-20 border-b border-slate-200 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider text-[11px]">
                <tr>
                  {/* Index / Status */}
                  <th
                    style={{ width: `${colWidths.index || 65}px` }}
                    className="py-3 px-2 text-center bg-slate-100 dark:bg-slate-800 sticky left-0 z-30 shadow-[1px_0_0_0_#e2e8f0] dark:shadow-[1px_0_0_0_#334155] relative group"
                  >
                    #
                    <div
                      onMouseDown={(e) => handleStartResize('index', e)}
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-brand-500 active:bg-brand-600 transition"
                    />
                  </th>

                  {/* Product ID (Readonly Badge) */}
                  <th
                    style={{ width: `${colWidths.product_id || 110}px` }}
                    className="py-3 px-3 bg-slate-100 dark:bg-slate-800 sticky left-[65px] z-30 shadow-[1px_0_0_0_#e2e8f0] dark:shadow-[1px_0_0_0_#334155] relative group"
                  >
                    <span className="truncate">Product ID</span>
                    <div
                      onMouseDown={(e) => handleStartResize('product_id', e)}
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-brand-500 active:bg-brand-600 transition"
                    />
                  </th>

                  {/* Product Name * */}
                  <th
                    style={{ width: `${colWidths.name || 240}px` }}
                    className="py-3 px-3 bg-slate-100 dark:bg-slate-800 relative group"
                  >
                    <span className="truncate">Product Name *</span>
                    <div
                      onMouseDown={(e) => handleStartResize('name', e)}
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-brand-500 active:bg-brand-600 transition"
                    />
                  </th>

                  {/* SKU */}
                  {showSku && (
                    <th
                      style={{ width: `${colWidths.sku || 130}px` }}
                      className="py-3 px-3 relative group"
                    >
                      <span className="truncate">SKU</span>
                      <div
                        onMouseDown={(e) => handleStartResize('sku', e)}
                        className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-brand-500 active:bg-brand-600 transition"
                      />
                    </th>
                  )}

                  {/* Custom Fields */}
                  {relevantCustomFields.map((cf) => (
                    <th
                      key={cf.id}
                      style={{ width: `${colWidths[`custom_${cf.id}`] || 160}px` }}
                      className="py-3 px-3 text-brand-900 dark:text-brand-300 relative group"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="truncate">{cf.name}</span>
                        {!cf.category_id && (
                          <span className="text-[9px] px-1 rounded bg-slate-200 dark:bg-slate-700 text-slate-500 font-normal">
                            Global
                          </span>
                        )}
                      </div>
                      <div
                        onMouseDown={(e) => handleStartResize(`custom_${cf.id}`, e)}
                        className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-brand-500 active:bg-brand-600 transition"
                      />
                    </th>
                  ))}

                  {/* Barcode */}
                  {showBarcode && (
                    <th
                      style={{ width: `${colWidths.barcode || 150}px` }}
                      className="py-3 px-3 relative group"
                    >
                      <span className="truncate">Barcode</span>
                      <div
                        onMouseDown={(e) => handleStartResize('barcode', e)}
                        className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-brand-500 active:bg-brand-600 transition"
                      />
                    </th>
                  )}

                  {/* Cost Price */}
                  <th
                    style={{ width: `${colWidths.purchase_price || 130}px` }}
                    className="py-3 px-3 text-right relative group"
                  >
                    <span className="truncate">Cost ({currency})</span>
                    <div
                      onMouseDown={(e) => handleStartResize('purchase_price', e)}
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-brand-500 active:bg-brand-600 transition"
                    />
                  </th>

                  {/* Selling Price */}
                  <th
                    style={{ width: `${colWidths.selling_price || 130}px` }}
                    className="py-3 px-3 text-right relative group"
                  >
                    <span className="truncate">Sale ({currency}) *</span>
                    <div
                      onMouseDown={(e) => handleStartResize('selling_price', e)}
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-brand-500 active:bg-brand-600 transition"
                    />
                  </th>

                  {/* Current Stock */}
                  <th
                    style={{ width: `${colWidths.current_stock || 120}px` }}
                    className="py-3 px-3 text-center relative group"
                  >
                    <span className="truncate">Stock Qty</span>
                    <div
                      onMouseDown={(e) => handleStartResize('current_stock', e)}
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-brand-500 active:bg-brand-600 transition"
                    />
                  </th>

                  {/* Action (Revert) */}
                  <th
                    style={{ width: `${colWidths.action || 70}px` }}
                    className="py-3 px-2 text-center"
                  >
                    Revert
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900 font-medium">
                {displayedRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={visibleColumns.length + 3}
                      className="p-8 text-center text-slate-400 dark:text-slate-500 text-xs"
                    >
                      {searchFilter
                        ? `No products in ${categoryName} match "${searchFilter}".`
                        : `No products found in category "${categoryName}".`}
                    </td>
                  </tr>
                ) : (
                  displayedRows.map((r, rIdx) => {
                    const rowEdited = isRowEdited(r);

                    return (
                      <tr
                        key={r.id}
                        className={`transition-colors ${
                          rowEdited
                            ? 'bg-amber-50/80 dark:bg-amber-950/40 border-l-4 border-l-amber-500 ring-1 ring-inset ring-amber-500/25'
                            : 'hover:bg-slate-50/60 dark:hover:bg-slate-800/40 border-l-4 border-l-transparent'
                        }`}
                      >
                        {/* Index / Status Pill */}
                        <td
                          style={{ width: `${colWidths.index || 65}px` }}
                          className={`py-2 px-1 text-center font-bold text-xs sticky left-0 z-10 shadow-[1px_0_0_0_#e2e8f0] dark:shadow-[1px_0_0_0_#334155] ${
                            rowEdited ? 'bg-amber-100/90 dark:bg-amber-950/80' : 'bg-white dark:bg-slate-900'
                          }`}
                        >
                          {rowEdited ? (
                            <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-100 border border-amber-300 dark:border-amber-700 shadow-2xs">
                              Edited
                            </span>
                          ) : (
                            <span className="text-slate-400 font-medium text-xs">{rIdx + 1}</span>
                          )}
                        </td>

                        {/* Product ID (Readonly Badge) */}
                        <td
                          style={{ width: `${colWidths.product_id || 110}px` }}
                          className={`py-2 px-2 text-xs sticky left-[65px] z-10 shadow-[1px_0_0_0_#e2e8f0] dark:shadow-[1px_0_0_0_#334155] ${
                            rowEdited ? 'bg-amber-100/90 dark:bg-amber-950/80' : 'bg-white dark:bg-slate-900'
                          }`}
                        >
                          <div className="flex items-center gap-1">
                            <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                              {r.product_id}
                            </span>
                            {r.is_service && (
                              <span className="inline-flex items-center text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800" title="No-Stock item">
                                No-Stock
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Product Name * */}
                        <td
                          style={{ width: `${colWidths.name || 240}px` }}
                          className="py-1 px-1.5"
                        >
                          <input
                            type="text"
                            data-bulk-edit-cell={`${r.id}-name`}
                            value={r.name}
                            onChange={(e) => handleUpdateCell(r.id, 'name', e.target.value)}
                            onKeyDown={(e) => handleCellKeyDown(e, rIdx, 'name')}
                            placeholder="Product Name"
                            className={`w-full px-2.5 py-1.5 text-xs rounded-lg outline-none transition ${
                              isCellEdited(r, 'name')
                                ? 'bg-amber-50 dark:bg-amber-900/30 border-2 border-amber-400 dark:border-amber-500 font-bold text-slate-900 dark:text-white ring-1 ring-amber-400/30'
                                : 'bg-transparent border border-transparent hover:border-slate-300 dark:hover:border-slate-600 focus:bg-white dark:focus:bg-slate-800 focus:border-brand-500'
                            }`}
                            required
                          />
                        </td>

                        {/* SKU */}
                        {showSku && (
                          <td
                            style={{ width: `${colWidths.sku || 130}px` }}
                            className="py-1 px-1.5"
                          >
                            <input
                              type="text"
                              data-bulk-edit-cell={`${r.id}-sku`}
                              value={r.sku}
                              onChange={(e) => handleUpdateCell(r.id, 'sku', e.target.value)}
                              onKeyDown={(e) => handleCellKeyDown(e, rIdx, 'sku')}
                              placeholder="SKU"
                              className={`w-full px-2.5 py-1.5 text-xs rounded-lg outline-none font-mono transition ${
                                isCellEdited(r, 'sku')
                                  ? 'bg-amber-50 dark:bg-amber-900/30 border-2 border-amber-400 dark:border-amber-500 font-bold text-slate-900 dark:text-white ring-1 ring-amber-400/30'
                                  : 'bg-transparent border border-transparent hover:border-slate-300 dark:hover:border-slate-600 focus:bg-white dark:focus:bg-slate-800 focus:border-brand-500'
                              }`}
                            />
                          </td>
                        )}

                        {/* Custom Fields */}
                        {relevantCustomFields.map((cf) => {
                          const val = r.custom_values[cf.id] || '';
                          const cellKey = `custom_${cf.id}`;
                          const cellEdited = isCellEdited(r, cellKey);

                          return (
                            <td
                              key={cf.id}
                              style={{ width: `${colWidths[cellKey] || 160}px` }}
                              className="py-1 px-1.5"
                            >
                              {cf.field_type === 'select' && cf.options ? (
                                <select
                                  data-bulk-edit-cell={`${r.id}-${cellKey}`}
                                  value={val}
                                  onChange={(e) => handleUpdateCustomValue(r.id, cf.id, e.target.value)}
                                  onKeyDown={(e) => handleCellKeyDown(e, rIdx, cellKey)}
                                  className={`w-full px-2 py-1.5 text-xs rounded-lg outline-none transition ${
                                    cellEdited
                                      ? 'bg-amber-50 dark:bg-amber-900/30 border-2 border-amber-400 dark:border-amber-500 font-bold text-slate-900 dark:text-white'
                                      : 'bg-transparent border border-transparent hover:border-slate-300 dark:hover:border-slate-600 focus:bg-white dark:focus:bg-slate-800 focus:border-brand-500'
                                  }`}
                                >
                                  <option value="">-- None --</option>
                                  {cf.options.split(',').map((opt) => {
                                    const trimmed = opt.trim();
                                    return (
                                      <option key={trimmed} value={trimmed}>
                                        {trimmed}
                                      </option>
                                    );
                                  })}
                                </select>
                              ) : (
                                <input
                                  type={cf.field_type === 'number' ? 'number' : 'text'}
                                  data-bulk-edit-cell={`${r.id}-${cellKey}`}
                                  value={val}
                                  onChange={(e) => handleUpdateCustomValue(r.id, cf.id, e.target.value)}
                                  onKeyDown={(e) => handleCellKeyDown(e, rIdx, cellKey)}
                                  placeholder={cf.name}
                                  className={`w-full px-2.5 py-1.5 text-xs rounded-lg outline-none transition ${
                                    cellEdited
                                      ? 'bg-amber-50 dark:bg-amber-900/30 border-2 border-amber-400 dark:border-amber-500 font-bold text-slate-900 dark:text-white ring-1 ring-amber-400/30'
                                      : 'bg-transparent border border-transparent hover:border-slate-300 dark:hover:border-slate-600 focus:bg-white dark:focus:bg-slate-800 focus:border-brand-500'
                                  }`}
                                />
                              )}
                            </td>
                          );
                        })}

                        {/* Barcode */}
                        {showBarcode && (
                          <td
                            style={{ width: `${colWidths.barcode || 150}px` }}
                            className="py-1 px-1.5"
                          >
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                data-bulk-edit-cell={`${r.id}-barcode`}
                                value={r.barcode}
                                onChange={(e) => handleUpdateCell(r.id, 'barcode', e.target.value)}
                                onKeyDown={(e) => handleCellKeyDown(e, rIdx, 'barcode')}
                                placeholder="Barcode"
                                className={`w-full px-2 py-1.5 text-xs rounded-lg outline-none font-mono transition ${
                                  isCellEdited(r, 'barcode')
                                    ? 'bg-amber-50 dark:bg-amber-900/30 border-2 border-amber-400 dark:border-amber-500 font-bold text-slate-900 dark:text-white ring-1 ring-amber-400/30'
                                    : 'bg-transparent border border-transparent hover:border-slate-300 dark:hover:border-slate-600 focus:bg-white dark:focus:bg-slate-800 focus:border-brand-500'
                                }`}
                              />
                              <button
                                type="button"
                                onClick={() => handleGenerateBarcode(r.id)}
                                className="p-1 rounded text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
                                title="Generate unique barcode"
                              >
                                <Barcode className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        )}

                        {/* Cost Price */}
                        <td
                          style={{ width: `${colWidths.purchase_price || 130}px` }}
                          className="py-1 px-1.5"
                        >
                          {r.is_service ? (
                            <span className="text-slate-400 font-bold block text-right pr-2.5 py-1.5 text-xs">—</span>
                          ) : (
                            <input
                              type="number"
                              min="0"
                              step="any"
                              data-bulk-edit-cell={`${r.id}-purchase_price`}
                              value={r.purchase_price === 0 ? '' : r.purchase_price}
                              onFocus={(e) => requestAnimationFrame(() => e.target.select())}
                              onChange={(e) => {
                                const raw = e.target.value.replace(/^0+(?=[1-9])/, '');
                                handleUpdateCell(r.id, 'purchase_price', parseFloat(raw) || 0);
                              }}
                              onKeyDown={(e) => handleCellKeyDown(e, rIdx, 'purchase_price')}
                              placeholder="0.00"
                              className={`w-full px-2.5 py-1.5 text-xs text-right rounded-lg outline-none transition ${
                                isCellEdited(r, 'purchase_price')
                                  ? 'bg-amber-50 dark:bg-amber-900/30 border-2 border-amber-400 dark:border-amber-500 font-bold text-slate-900 dark:text-white ring-1 ring-amber-400/30'
                                  : 'bg-transparent border border-transparent hover:border-slate-300 dark:hover:border-slate-600 focus:bg-white dark:focus:bg-slate-800 focus:border-brand-500'
                              }`}
                            />
                          )}
                        </td>

                        {/* Selling Price */}
                        <td
                          style={{ width: `${colWidths.selling_price || 130}px` }}
                          className="py-1 px-1.5"
                        >
                          <input
                            type="number"
                            min="0"
                            step="any"
                            data-bulk-edit-cell={`${r.id}-selling_price`}
                            value={r.selling_price === 0 ? '' : r.selling_price}
                            onFocus={(e) => requestAnimationFrame(() => e.target.select())}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/^0+(?=[1-9])/, '');
                              handleUpdateCell(r.id, 'selling_price', parseFloat(raw) || 0);
                            }}
                            onKeyDown={(e) => handleCellKeyDown(e, rIdx, 'selling_price')}
                            placeholder="0.00"
                            className={`w-full px-2.5 py-1.5 text-xs text-right rounded-lg outline-none font-bold transition ${
                              isCellEdited(r, 'selling_price')
                                  ? 'bg-amber-50 dark:bg-amber-900/30 border-2 border-amber-400 dark:border-amber-500 text-slate-900 dark:text-white ring-1 ring-amber-400/30'
                                : 'bg-transparent border border-transparent hover:border-slate-300 dark:hover:border-slate-600 focus:bg-white dark:focus:bg-slate-800 focus:border-brand-500'
                            }`}
                            required
                          />
                        </td>

                        {/* Current Stock */}
                        <td
                          style={{ width: `${colWidths.current_stock || 120}px` }}
                          className="py-1 px-1.5 text-center"
                        >
                          {r.is_service ? (
                            <span className="text-slate-400 font-semibold block text-center py-1.5 text-xs">No Stock</span>
                          ) : (
                            <input
                              type="number"
                              min="0"
                              step="any"
                              data-bulk-edit-cell={`${r.id}-current_stock`}
                              value={r.current_stock === 0 ? '' : r.current_stock}
                              placeholder="0"
                              onFocus={(e) => requestAnimationFrame(() => e.target.select())}
                              onChange={(e) => {
                                const raw = e.target.value.replace(/^0+(?=[1-9])/, '');
                                handleUpdateCell(r.id, 'current_stock', parseFloat(raw) || 0);
                              }}
                              onKeyDown={(e) => handleCellKeyDown(e, rIdx, 'current_stock')}
                              className={`w-full px-2 py-1.5 text-xs text-center rounded-lg outline-none font-bold transition ${
                                isCellEdited(r, 'current_stock')
                                  ? 'bg-amber-50 dark:bg-amber-900/30 border-2 border-amber-400 dark:border-amber-500 text-amber-950 dark:text-amber-100 ring-1 ring-amber-400/30'
                                  : 'bg-transparent border border-transparent hover:border-slate-300 dark:hover:border-slate-600 focus:bg-white dark:focus:bg-slate-800 focus:border-brand-500'
                              }`}
                            />
                          )}
                        </td>

                        {/* Revert Row Button */}
                        <td
                          style={{ width: `${colWidths.action || 70}px` }}
                          className="py-2 px-1 text-center"
                        >
                          {rowEdited ? (
                            <button
                              type="button"
                              onClick={() => handleRevertRow(r.id)}
                              className="px-2 py-0.5 rounded text-[10px] font-bold text-amber-700 dark:text-amber-300 hover:bg-amber-200/60 dark:hover:bg-amber-900/60 transition inline-flex items-center gap-0.5"
                              title="Revert this row to original"
                            >
                              <RotateCcw className="h-3 w-3" />
                              <span>Reset</span>
                            </button>
                          ) : (
                            <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Modal Footer */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {hasUnsavedData ? (
                <span>
                  <strong>{editedRows.length}</strong> of {rows.length} products modified in this category.
                </span>
              ) : (
                <span>Edit any cell above. Changes will be highlighted in amber.</span>
              )}
            </div>

            <div className="flex items-center justify-end gap-2.5">
              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={handleRequestClose}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={loading || !hasUnsavedData}
                icon={<Check className="h-4 w-4" />}
                className="font-bold shadow-sm"
              >
                {loading ? 'Saving Changes...' : `Save Changes (${editedRows.length})`}
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Discard Confirmation Dialog */}
      {showDiscardConfirm && (
        <Modal
          isOpen={showDiscardConfirm}
          onClose={() => setShowDiscardConfirm(false)}
          title="Discard Unsaved Changes?"
          subtitle="You have modified products that haven't been saved yet."
          maxWidth="md"
        >
          <div className="space-y-4">
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Are you sure you want to exit bulk edit? All unsaved modifications across {editedRows.length} product(s) will be lost.
            </p>
            <div className="flex justify-end gap-2.5 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowDiscardConfirm(false)}
              >
                Continue Editing
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={handleConfirmDiscard}
              >
                Discard Changes
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
};
