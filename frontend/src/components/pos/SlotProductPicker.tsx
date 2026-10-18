import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Product } from '../../types';
import { Search, X, Check, Package, AlertCircle } from 'lucide-react';
import { formatCurrency } from '../../utils/format';

export interface PosTemplateSlot {
  slot_id: string | number;
  display_order: number;
  slot_name: string;
  category_id: number | null;
  category_name: string;
  selected_product: Product | null;
  quantity: number;
  unit_price: number;
}

interface SlotProductPickerProps {
  slot: PosTemplateSlot;
  allProducts: Product[];
  currency: string;
  onSelectProduct: (product: Product) => void;
  onClearProduct: () => void;
  isPickerOpen?: boolean;
  onTogglePicker?: (open: boolean) => void;
}

export const SlotProductPicker: React.FC<SlotProductPickerProps> = ({
  slot,
  allProducts,
  currency,
  onSelectProduct,
  onClearProduct,
  isPickerOpen,
  onTogglePicker,
}) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = isPickerOpen !== undefined ? isPickerOpen : internalOpen;
  const setIsOpen = (val: boolean) => {
    setInternalOpen(val);
    if (onTogglePicker) onTogglePicker(val);
  };

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setActiveIndex(0);
      const timer = setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // STRICT category filtering:
  // If slot has category_id, only show products in that category
  // If slot has category_name, match by name if category_id not provided
  const categoryConstrainedProducts = useMemo(() => {
    return allProducts.filter((p) => {
      if (slot.category_id !== null && slot.category_id !== undefined) {
        return p.category_id === slot.category_id;
      }
      if (slot.category_name && slot.category_name.trim()) {
        const catName = (p as any).category?.name || '';
        return catName.toLowerCase() === slot.category_name.toLowerCase();
      }
      return true; // No category lock on this slot
    });
  }, [allProducts, slot.category_id, slot.category_name]);

  // Query filter applied over category-constrained products
  const filteredProducts = useMemo(() => {
    if (!query.trim()) return categoryConstrainedProducts;
    const q = query.toLowerCase().trim();
    return categoryConstrainedProducts.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku && p.sku.toLowerCase().includes(q)) ||
        (p.barcode && p.barcode.toLowerCase().includes(q))
    );
  }, [categoryConstrainedProducts, query]);

  // Reset activeIndex when query or list changes
  useEffect(() => {
    setActiveIndex(0);
  }, [filteredProducts.length, query]);

  // Scroll active dropdown item into view
  useEffect(() => {
    if (isOpen && activeIndex >= 0) {
      const el = document.getElementById(`slot-picker-prod-${slot.slot_id}-${activeIndex}`);
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [isOpen, activeIndex, slot.slot_id]);

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      setActiveIndex((prev) => (filteredProducts.length > 0 ? (prev + 1) % filteredProducts.length : 0));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      setActiveIndex((prev) =>
        filteredProducts.length > 0 ? (prev - 1 + filteredProducts.length) % filteredProducts.length : 0
      );
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (filteredProducts.length > 0) {
        const target = filteredProducts[activeIndex] || filteredProducts[0];
        onSelectProduct(target);
        setIsOpen(false);
        setQuery('');
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setIsOpen(false);
      return;
    }
  };

  if (slot.selected_product) {
    const isOutOfStock = !slot.selected_product.is_service && Number(slot.selected_product.current_stock || 0) <= 0;
    return (
      <div ref={containerRef} className="relative w-full">
        <div className="flex items-center justify-between gap-1.5 py-0.5">
          <div className="min-w-0 flex-1">
            <div
              className="font-semibold text-xs text-slate-800 dark:text-slate-100 truncate"
              title={slot.selected_product.name}
            >
              {slot.selected_product.name}
            </div>
            <div className="text-[10px] text-slate-400 flex items-center gap-1.5">
              {slot.selected_product.sku && (
                <span className="font-mono text-[9px] px-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                  {slot.selected_product.sku}
                </span>
              )}
              {slot.selected_product.is_service ? (
                <span className="text-blue-600 dark:text-blue-400 font-bold">
                  No-Stock Item
                </span>
              ) : (
                <span
                  className={
                    isOutOfStock ? 'text-rose-500 font-bold' : 'text-emerald-600 dark:text-emerald-400 font-medium'
                  }
                >
                  Stock: {slot.selected_product.current_stock ?? 0}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setIsOpen(true)}
              className="px-1.5 py-0.5 text-[10.5px] font-semibold text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 hover:underline"
            >
              Change
            </button>
            <button
              type="button"
              onClick={onClearProduct}
              className="p-0.5 text-slate-300 hover:text-rose-500 transition"
              title="Clear"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Change Product Popover Dropdown */}
        {isOpen && (
          <div className="absolute left-0 top-9 z-50 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800 w-[280px]">
            <div className="p-2 bg-slate-50 dark:bg-slate-800 flex items-center gap-2">
              <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder={`Search ${slot.category_name || 'products'}...`}
                className="w-full bg-transparent text-xs text-slate-900 dark:text-white outline-none font-medium placeholder-slate-400"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {filteredProducts.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400 dark:text-slate-500">
                  No products found.
                </div>
              ) : (
                filteredProducts.map((prod, pIdx) => {
                  const isCurrent = prod.id === slot.selected_product?.id;
                  const isHighlighted = activeIndex === pIdx;
                  return (
                    <button
                      key={prod.id}
                      id={`slot-picker-prod-${slot.slot_id}-${pIdx}`}
                      type="button"
                      onClick={() => {
                        onSelectProduct(prod);
                        setIsOpen(false);
                        setQuery('');
                      }}
                      onMouseEnter={() => setActiveIndex(pIdx)}
                      className={`w-full text-left p-2.5 flex items-center justify-between text-xs transition ${
                        isHighlighted
                          ? 'bg-teal-50 dark:bg-teal-950/60 ring-1 ring-teal-500/30 text-teal-950 dark:text-teal-200 font-semibold'
                          : isCurrent
                          ? 'bg-teal-50/50 dark:bg-teal-950/30 text-teal-900 dark:text-teal-200'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      <div className="min-w-0 mr-2">
                        <div className="truncate font-semibold">{prod.name}</div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-2">
                          {prod.sku && <span>SKU: {prod.sku}</span>}
                          {prod.is_service ? (
                            <span className="text-blue-600 dark:text-blue-400 font-medium">No-Stock Item</span>
                          ) : (
                            <span>Stock: {prod.current_stock}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-bold text-slate-900 dark:text-white">
                          {formatCurrency(prod.selling_price, currency)}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // When no product is selected (blank slot)
  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative flex items-center">
        <Search className="absolute left-2 h-3 w-3 text-slate-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleInputKeyDown}
          placeholder={slot.category_name ? `Select ${slot.category_name}...` : 'Select product...'}
          className="w-full pl-6 pr-6 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 font-normal focus:outline-none focus:ring-1 focus:ring-teal-500"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="absolute right-1.5 text-slate-400 hover:text-slate-600"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Dropdown list of category-restricted products */}
      {isOpen && (
        <div className="absolute left-0 top-9 z-50 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800 w-[280px]">
          <div className="p-2 bg-slate-50 dark:bg-slate-800 text-[11px] font-bold text-slate-600 dark:text-slate-300 flex items-center justify-between">
            <span>Select {slot.category_name || 'Product'}</span>
            <span className="text-[10px] font-normal text-slate-400">
              {filteredProducts.length} items
            </span>
          </div>

          <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {filteredProducts.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400 dark:text-slate-500">
                No products found in this category.
              </div>
            ) : (
              filteredProducts.map((prod, pIdx) => {
                const isHighlighted = activeIndex === pIdx;
                return (
                  <button
                    key={prod.id}
                    id={`slot-picker-prod-${slot.slot_id}-${pIdx}`}
                    type="button"
                    onClick={() => {
                      onSelectProduct(prod);
                      setIsOpen(false);
                      setQuery('');
                    }}
                    onMouseEnter={() => setActiveIndex(pIdx)}
                    className={`w-full text-left p-2.5 flex items-center justify-between text-xs transition ${
                      isHighlighted
                        ? 'bg-teal-50 dark:bg-teal-950/60 ring-1 ring-teal-500/30 text-teal-950 dark:text-teal-200 font-semibold'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    <div className="min-w-0 mr-2">
                      <div className="font-semibold text-slate-800 dark:text-slate-100 truncate">
                        {prod.name}
                      </div>
                      <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                        {prod.sku && <span>SKU: {prod.sku}</span>}
                        {prod.is_service ? (
                          <span className="text-blue-600 dark:text-blue-400 font-medium">No-Stock Item</span>
                        ) : (
                          <span className={prod.current_stock > 0 ? 'text-emerald-600' : 'text-rose-500'}>
                            Stock: {prod.current_stock}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-bold text-slate-900 dark:text-white">
                        {formatCurrency(prod.selling_price, currency)}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
