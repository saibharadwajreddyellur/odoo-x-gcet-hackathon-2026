import React from 'react';
import { LucideIcon, ShieldCheck } from 'lucide-react';

export interface InfoBannerProps {
  title?: string;
  description: React.ReactNode;
  icon?: LucideIcon;
  className?: string;
}

export const InfoBanner: React.FC<InfoBannerProps> = ({
  title,
  description,
  icon: Icon = ShieldCheck,
  className = '',
}) => {
  return (
    <div
      className={`flex items-center gap-2.5 py-[10px] px-[14px] bg-slate-50/80 rounded border border-slate-200 text-xs text-slate-600 ${className}`}
    >
      <Icon className="w-3.5 h-3.5 text-brand-600 shrink-0" />
      <p className="leading-snug">
        {title && (
          <strong className="font-semibold text-slate-800 mr-1">
            {title.endsWith(':') ? title : `${title}:`}
          </strong>
        )}
        {description}
      </p>
    </div>
  );
};
