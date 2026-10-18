import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  label?: string;
  error?: string;
  hint?: string;
  prefix?: string | React.ReactNode;
  suffix?: string | React.ReactNode;
  emptyOnZero?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({
  label,
  error,
  hint,
  prefix,
  suffix,
  className,
  id,
  emptyOnZero,
  value,
  placeholder,
  ...props
}, ref) => {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  const isNumeric = props.type === 'number' || props.inputMode === 'numeric' || props.inputMode === 'decimal';
  const shouldEmptyOnZero = emptyOnZero !== undefined ? emptyOnZero : isNumeric;
  const displayValue = shouldEmptyOnZero && (value === 0 || value === '0') ? '' : value;
  const effectivePlaceholder = placeholder !== undefined ? placeholder : (isNumeric ? (props.step === '1' ? '0' : '0.00') : undefined);

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    if (isNumeric) {
      requestAnimationFrame(() => {
        e.target.select();
      });
    }
    props.onFocus?.(e);
  };

  const handleClick = (e: React.MouseEvent<HTMLInputElement>) => {
    if (isNumeric) {
      const val = e.currentTarget.value;
      if (val === '0' || val === '0.00' || val === '0.0') {
        requestAnimationFrame(() => {
          e.currentTarget.select();
        });
      }
    }
    props.onClick?.(e);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isNumeric) {
      const val = e.target.value;
      // Strip leading zeros like 01 -> 1, 005 -> 5, preserving 0.5, 0.05
      if (/^0+[1-9]/.test(val)) {
        e.target.value = val.replace(/^0+/, '');
      }
    }
    props.onChange?.(e);
  };

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
          {label}
        </label>
      )}
      <div className="relative rounded-xl shadow-sm">
        {prefix && (
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500 dark:text-slate-400 text-sm">
            {prefix}
          </div>
        )}
        <input
          id={inputId}
          ref={ref}
          value={displayValue}
          placeholder={effectivePlaceholder}
          className={twMerge(
            clsx(
              'block w-full rounded-xl border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-2.5 text-sm text-slate-800 dark:text-slate-100 transition duration-150',
              'placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20',
              'border',
              prefix ? 'pl-9' : 'pl-3.5',
              suffix ? 'pr-9' : 'pr-3.5',
              error && 'border-rose-300 dark:border-rose-700 focus:border-rose-500 focus:ring-rose-500/20 bg-rose-50/20 dark:bg-rose-950/20',
              className
            )
          )}
          {...props}
          onFocus={handleFocus}
          onClick={handleClick}
          onChange={handleChange}
        />
        {suffix && (
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500 dark:text-slate-400 text-sm">
            {suffix}
          </div>
        )}
      </div>
      {error && <p className="mt-1.5 text-xs text-rose-600 dark:text-rose-400 font-medium">{error}</p>}
      {hint && !error && <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{hint}</p>}
    </div>
  );
});

Input.displayName = 'Input';
