import React from 'react';

interface BadgeProps {
  status: string;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ status, className = '' }) => {
  const normalized = status.toUpperCase().replace(/\s+/g, '_');

  let colorClasses = 'bg-slate-100 text-slate-700 border-slate-200';
  let dotColor = '';
  let label = status.replace(/_/g, ' ');

  if (normalized === 'PAID') {
    colorClasses = 'bg-emerald-50 text-emerald-700 border-emerald-200';
    label = 'Paid';
  } else if (normalized === 'PARTIALLY_PAID') {
    colorClasses = 'bg-amber-50 text-amber-700 border-amber-200';
    label = 'Partially Paid';
  } else if (normalized === 'UNPAID' || normalized === 'TO_PAY') {
    colorClasses = 'bg-rose-50 text-rose-700 border-rose-200';
    label = normalized === 'TO_PAY' ? 'To Pay' : 'Unpaid';
  } else if (normalized === 'RETURNED') {
    colorClasses = 'bg-purple-50 text-purple-700 border-purple-200';
    label = 'Returned';
  } else if (normalized === 'PARTIALLY_RETURNED') {
    colorClasses = 'bg-indigo-50 text-indigo-700 border-indigo-200';
    label = 'Partially Returned';
  } else if (normalized === 'PENDING') {
    colorClasses = 'bg-blue-50 text-blue-700 border-blue-200';
    label = 'Pending';
  } else if (normalized === 'ACTIVE') {
    colorClasses = 'bg-emerald-50 text-emerald-700 border-emerald-200';
    label = 'Active';
  } else if (normalized === 'IN_STOCK') {
    colorClasses = 'bg-emerald-50 text-emerald-700 border-emerald-200';
    dotColor = 'bg-emerald-500';
    label = 'In Stock';
  } else if (normalized === 'LOW_STOCK') {
    colorClasses = 'bg-amber-50 text-amber-700 border-amber-200';
    dotColor = 'bg-amber-500';
    label = 'Low Stock';
  } else if (normalized === 'OUT_OF_STOCK') {
    colorClasses = 'bg-rose-50 text-rose-700 border-rose-200';
    dotColor = 'bg-rose-500';
    label = 'Out of Stock';
  } else if (normalized === 'INACTIVE' || normalized === 'DEACTIVATED') {
    colorClasses = 'bg-slate-100 text-slate-500 border-slate-200';
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
