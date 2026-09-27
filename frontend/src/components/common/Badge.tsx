import React from 'react';

interface BadgeProps {
  status: string;
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({ status, size = 'sm' }) => {
  const normalized = status.toUpperCase();

  let colorClasses = 'bg-slate-50 text-slate-700 border-slate-200';

  // Operation & stock statuses
  if (normalized === 'DONE' || normalized === 'COMPLETED' || normalized === 'IN_STOCK') {
    colorClasses = 'bg-emerald-50 text-emerald-700 border-emerald-200';
  } else if (normalized === 'READY') {
    colorClasses = 'bg-blue-50 text-blue-700 border-blue-200';
  } else if (normalized === 'WAITING' || normalized === 'SCHEDULED' || normalized === 'LOW_STOCK') {
    colorClasses = 'bg-amber-50 text-amber-700 border-amber-200';
  } else if (normalized === 'DRAFT') {
    colorClasses = 'bg-slate-50 text-slate-600 border-slate-200';
  } else if (normalized === 'CANCELLED' || normalized === 'OUT_OF_STOCK') {
    colorClasses = 'bg-rose-50 text-rose-700 border-rose-200';
  } else if (normalized === 'RECEIPT' || normalized === 'TRANSFER_IN') {
    colorClasses = 'bg-emerald-50 text-emerald-700 border-emerald-200';
  } else if (normalized === 'DELIVERY' || normalized === 'TRANSFER_OUT') {
    colorClasses = 'bg-indigo-50 text-indigo-700 border-indigo-200';
  } else if (normalized === 'ADJUSTMENT') {
    colorClasses = 'bg-amber-50 text-amber-700 border-amber-200';
  }

  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-0.5 text-xs';

  return (
    <span className={`inline-flex items-center font-medium rounded border ${colorClasses} ${sizeClasses}`}>
      <span className="w-1.5 h-1.5 rounded-full mr-1.5 bg-current opacity-70"></span>
      {status.replace(/_/g, ' ')}
    </span>
  );
};
