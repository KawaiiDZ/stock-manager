import React from 'react';

interface BadgeProps {
  status: string;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ status, className = '' }) => {
  const normalized = status.toUpperCase().replace(/\s+/g, '_');

  let colorClasses = 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700';
  let dotColor = '';
  let label = status.replace(/_/g, ' ');

  if (normalized === 'PAID') {
    colorClasses = 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
    label = 'Paid';
  } else if (normalized === 'PARTIALLY_PAID') {
    colorClasses = 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800';
    label = 'Partially Paid';
  } else if (normalized === 'UNPAID' || normalized === 'TO_PAY') {
    colorClasses = 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800';
    label = normalized === 'TO_PAY' ? 'To Pay' : 'Unpaid';
  } else if (normalized === 'RETURNED') {
    colorClasses = 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800';
    label = 'Returned';
  } else if (normalized === 'PARTIALLY_RETURNED') {
    colorClasses = 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800';
    label = 'Partially Returned';
  } else if (normalized === 'PENDING') {
    colorClasses = 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800';
    label = 'Pending';
  } else if (normalized === 'ACTIVE') {
    colorClasses = 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
    label = 'Active';
  } else if (normalized === 'IN_STOCK') {
    colorClasses = 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
    dotColor = 'bg-emerald-500';
    label = 'In Stock';
  } else if (normalized === 'LOW_STOCK') {
    colorClasses = 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800';
    dotColor = 'bg-amber-500';
    label = 'Low Stock';
  } else if (normalized === 'OUT_OF_STOCK') {
    colorClasses = 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800';
    dotColor = 'bg-rose-500';
    label = 'Out of Stock';
  } else if (normalized === 'INACTIVE' || normalized === 'DEACTIVATED') {
    colorClasses = 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700';
    label = 'Deactivated';
  }

  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${colorClasses} ${className}`}
    >
      {dotColor && <span className={`w-1.5 h-1.5 rounded-full ${dotColor} mr-1.5 shrink-0`} />}
      {label}
    </span>
  );
};
