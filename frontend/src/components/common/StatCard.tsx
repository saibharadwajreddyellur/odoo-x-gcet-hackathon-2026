import React from 'react';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  color?: 'emerald' | 'amber' | 'rose' | 'blue' | 'indigo' | 'slate' | 'purple';
  badgeText?: string;
  badgeType?: 'neutral' | 'alert' | 'warning' | 'success';
  onClick?: () => void;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon: Icon,
  color = 'slate',
  badgeText,
  badgeType = 'neutral',
  onClick
}) => {
  const iconColors = {
    emerald: 'text-brand-700 bg-brand-50 border-brand-200/60',
    amber: 'text-amber-700 bg-amber-50 border-amber-200/60',
    rose: 'text-rose-700 bg-rose-50 border-rose-200/60',
    blue: 'text-blue-700 bg-blue-50 border-blue-200/60',
    indigo: 'text-indigo-700 bg-indigo-50 border-indigo-200/60',
    purple: 'text-purple-700 bg-purple-50 border-purple-200/60',
    slate: 'text-slate-600 bg-slate-100 border-slate-200'
  }[color];

  const badgeStyles = {
    neutral: 'bg-slate-100 text-slate-600 border-slate-200',
    alert: 'bg-rose-50 text-rose-700 border-rose-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
    success: 'bg-brand-50 text-brand-700 border-brand-200'
  }[badgeType];

  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-lg border border-slate-200 p-4 shadow-[0_1px_2px_0_rgba(0,0,0,0.02)] transition-all ${
        onClick ? 'cursor-pointer hover:border-slate-300 hover:shadow-xs' : ''
      }`}
    >
      <div className="flex items-center justify-between mb-2.5">
        <div className={`p-1.5 rounded border ${iconColors}`}>
          <Icon className="w-4 h-4" />
        </div>
        {badgeText && (
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${badgeStyles}`}>
            {badgeText}
          </span>
        )}
      </div>
      <div>
        <p className="text-xs font-medium text-slate-500">{title}</p>
        <p className="text-2xl font-semibold text-slate-900 tracking-tight mt-0.5">{value}</p>
        {subtitle && <p className="text-[11px] text-slate-500 mt-1 truncate">{subtitle}</p>}
      </div>
    </div>
  );
};
