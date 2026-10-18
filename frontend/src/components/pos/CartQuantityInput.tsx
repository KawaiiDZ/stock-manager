import React, { useState, useEffect, useRef } from 'react';

interface CartQuantityInputProps {
  productId: number;
  productName: string;
  quantity: number;
  availableStock: number;
  isService?: boolean;
  isActive: boolean;
  onUpdateQuantity: (productId: number, qty: number) => void;
  onNotifyCapped?: (maxStock: number, productName: string) => void;
  onNavigateUp?: () => void;
  onNavigateDown?: () => void;
  onNavigateLeft?: () => void;
  onNavigateRight?: () => void;
  onFocusItem?: () => void;
  inputRef?: (el: HTMLInputElement | null) => void;
}

export const CartQuantityInput: React.FC<CartQuantityInputProps> = ({
  productId,
  productName,
  quantity,
  availableStock,
  isService = false,
  isActive,
  onUpdateQuantity,
  onNotifyCapped,
  onNavigateUp,
  onNavigateDown,
  onNavigateLeft,
  onNavigateRight,
  onFocusItem,
  inputRef,
}) => {
  const [localVal, setLocalVal] = useState<string>(String(quantity));
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [justCapped, setJustCapped] = useState<boolean>(false);
  const internalRef = useRef<HTMLInputElement | null>(null);

  const maxStock = isService ? 999999 : Math.max(0, Math.floor(availableStock));

  // Sync external quantity changes when not actively editing
  useEffect(() => {
    if (!isEditing) {
      setLocalVal(String(quantity));
    }
  }, [quantity, isEditing]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Sanitize to digits only
    const raw = e.target.value.replace(/\D/g, '');

    if (raw === '') {
      // User cleared the box (e.g. Backspace to type a new number)
      setLocalVal('');
      return;
    }

    const parsed = parseInt(raw, 10);

    if (!isService && parsed > maxStock) {
      // Automatically cap to max available stock
      setLocalVal(String(maxStock));
      onUpdateQuantity(productId, maxStock);
      setJustCapped(true);
      setTimeout(() => setJustCapped(false), 1800);
      onNotifyCapped?.(maxStock, productName);
    } else {
      const sanitized = raw.length > 1 && raw.startsWith('0') ? String(parsed) : raw;
      setLocalVal(sanitized);
      if (parsed > 0) {
        onUpdateQuantity(productId, parsed);
      }
    }
  };

  const handleBlur = () => {
    setIsEditing(false);
    if (localVal === '' || localVal === '0') {
      if (localVal === '0') {
        // Explicit 0 removes the item
        onUpdateQuantity(productId, 0);
      } else {
        // Blank input reverts to previous quantity or 1
        const fallback = Math.min(Math.max(1, quantity), maxStock || 1);
        setLocalVal(String(fallback));
        onUpdateQuantity(productId, fallback);
      }
    } else {
      const parsed = parseInt(localVal, 10);
      if (!isNaN(parsed) && parsed > 0) {
        const finalVal = Math.min(parsed, maxStock);
        setLocalVal(String(finalVal));
        onUpdateQuantity(productId, finalVal);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleBlur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setLocalVal(String(quantity));
      setIsEditing(false);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      onNavigateUp?.();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      onNavigateDown?.();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (quantity < maxStock) {
        const next = quantity + 1;
        setLocalVal(String(next));
        onUpdateQuantity(productId, next);
      } else {
        setJustCapped(true);
        setTimeout(() => setJustCapped(false), 1800);
        onNotifyCapped?.(maxStock, productName);
      }
      onNavigateRight?.();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (quantity > 1) {
        const next = quantity - 1;
        setLocalVal(String(next));
        onUpdateQuantity(productId, next);
      } else {
        onUpdateQuantity(productId, 0);
      }
      onNavigateLeft?.();
    }
  };

  const handleStartEditing = () => {
    setIsEditing(true);
    setTimeout(() => {
      internalRef.current?.focus();
      internalRef.current?.select();
    }, 20);
  };

  return (
    <div className="relative flex items-center">
      {isEditing ? (
        <input
          ref={(el) => {
            internalRef.current = el;
            inputRef?.(el);
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={localVal}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          maxLength={6}
          autoFocus
          className={`w-12 h-7 text-center font-black text-sm text-slate-900 bg-white rounded-lg border transition shadow-2xs focus:outline-none ${
            justCapped
              ? 'border-amber-500 ring-2 ring-amber-400/40 bg-amber-50/70 text-amber-900'
              : 'border-emerald-500 ring-2 ring-emerald-500/30'
          }`}
          title={`Stock available: ${availableStock}. Type quantity or press Enter.`}
        />
      ) : (
        <div
          onClick={(e) => {
            e.stopPropagation();
            onFocusItem?.();
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            handleStartEditing();
          }}
          className={`w-12 h-7 flex items-center justify-center font-black text-sm text-slate-900 bg-white rounded-lg border transition shadow-2xs select-none cursor-pointer ${
            justCapped
              ? 'border-amber-500 ring-2 ring-amber-400/40 bg-amber-50/70 text-amber-900'
              : 'border-slate-200 hover:border-slate-300'
          }`}
          title={`In stock: ${availableStock}. Double-click to type quantity, or use ← → arrows to adjust.`}
        >
          {quantity}
        </div>
      )}

      {justCapped && (
        <span className="absolute -top-6 left-1/2 -translate-y-0.5 -translate-x-1/2 px-1.5 py-0.5 rounded bg-slate-900 text-amber-300 text-[10px] font-bold whitespace-nowrap shadow-md pointer-events-none z-20 animate-bounce">
          Max: {maxStock}
        </span>
      )}
    </div>
  );
};
