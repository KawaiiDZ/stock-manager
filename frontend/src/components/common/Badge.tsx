import React from 'react';

interface BadgeProps {
  status: string;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ status, className = '' }) => {
  const normalized = status.toUpperCase().replace(/\s+/g, '_');

  let colorClasses = 'bg-slate-100 text-slate-700 border-slate-200';
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
  } else if (normalized === 'PENDING') {
    colorClasses = 'bg-blue-50 text-blue-700 border-blue-200';
    label = 'Pending';
  } else if (normalized === 'ACTIVE') {
    colorClasses = 'bg-emerald-50 text-emerald-700 border-emerald-200';
    label = 'Active';
  } else if (normalized === 'INACTIVE' || normalized === 'DEACTIVATED') {
    colorClasses = 'bg-slate-100 text-slate-500 border-slate-200';
    label = 'Deactivated';
  }

  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${colorClasses} ${className}`}
    >
      {label}
    </span>
  );
};
