import React from 'react';
import { LucideIcon, ShieldCheck } from 'lucide-react';

export interface InfoBannerProps {
  title?: string;
  description: React.ReactNode;
  badgeText?: string;
  icon?: LucideIcon;
  className?: string;
}

export const InfoBanner: React.FC<InfoBannerProps> = ({
  title,
  description,
  badgeText,
  icon: Icon = ShieldCheck,
  className = '',
}) => {
  return (
    <div
      className={`p-3 bg-slate-50/80 rounded-lg border border-slate-200 shadow-[0_1px_2px_0_rgba(0,0,0,0.02)] text-xs text-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${className}`}
    >
      <div className="flex items-start sm:items-center gap-2.5 min-w-0">
        <Icon className="w-4 h-4 text-brand-600 shrink-0 mt-0.5 sm:mt-0" />
        <div className="leading-relaxed">
          {title && (
            <strong className="font-semibold text-slate-900 mr-1.5">
              {title.endsWith(':') ? title : `${title}:`}
            </strong>
          )}
          <span className="text-slate-600">{description}</span>
        </div>
      </div>
      {badgeText && (
        <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-white border border-slate-200 font-semibold text-slate-700 shrink-0 self-start sm:self-auto tracking-wide">
          {badgeText}
        </span>
      )}
    </div>
  );
};
