import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  label?: string;
  error?: string;
  hint?: string;
  prefix?: string | React.ReactNode;
  suffix?: string | React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({
  label,
  error,
  hint,
  prefix,
  suffix,
  className,
  id,
  ...props
}, ref) => {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
          {label}
        </label>
      )}
      <div className="relative rounded-xl shadow-sm">
        {prefix && (
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500 text-sm">
            {prefix}
          </div>
        )}
        <input
          id={inputId}
          ref={ref}
          className={twMerge(
            clsx(
              'block w-full rounded-xl border-slate-200 bg-white py-2.5 text-sm text-slate-800 transition duration-150',
              'placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20',
              'border',
              prefix ? 'pl-9' : 'pl-3.5',
              suffix ? 'pr-9' : 'pr-3.5',
              error && 'border-rose-300 focus:border-rose-500 focus:ring-rose-500/20 bg-rose-50/20',
              className
            )
          )}
          {...props}
        />
        {suffix && (
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500 text-sm">
            {suffix}
          </div>
        )}
      </div>
      {error && <p className="mt-1.5 text-xs text-rose-600 font-medium">{error}</p>}
      {hint && !error && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
});

Input.displayName = 'Input';
