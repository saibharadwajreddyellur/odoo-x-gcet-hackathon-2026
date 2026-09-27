import React from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard, Boxes, Package, Truck, Send, ArrowLeftRight,
  SlidersHorizontal, BookOpen, Warehouse, AlertTriangle
} from 'lucide-react';

export type NavTab =
  | 'dashboard'
  | 'stock'
  | 'products'
  | 'receipts'
  | 'deliveries'
  | 'transfers'
  | 'adjustments'
  | 'ledger'
  | 'warehouses'
  | 'profile';

interface SidebarProps {
  currentTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  lowStockCount?: number;
  outOfStockCount?: number;
  totalAlertCount?: number;
  onOpenStockAlerts?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onTabChange,
  lowStockCount = 0,
  outOfStockCount = 0,
  totalAlertCount,
  onOpenStockAlerts
}) => {
  const { isManager } = useAuth();
  const effectiveTotalAlerts = totalAlertCount !== undefined ? totalAlertCount : (lowStockCount + outOfStockCount);

  const breakdownParts: string[] = [];
  if (lowStockCount > 0) {
    breakdownParts.push(`${lowStockCount} below buffer`);
  }
  if (outOfStockCount > 0) {
    breakdownParts.push(`${outOfStockCount} depleted`);
  }

  const visibleNavItems: { id: NavTab; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number }[] = [
    { id: 'dashboard', label: isManager ? 'Executive Dashboard' : 'Operations Dashboard', icon: LayoutDashboard },
    { id: 'stock', label: 'Stock View', icon: Boxes, badge: effectiveTotalAlerts > 0 ? effectiveTotalAlerts : undefined },
    { id: 'products', label: 'Product Catalog', icon: Package },
    { id: 'receipts', label: 'Receipts (Inbound)', icon: Truck },
    { id: 'deliveries', label: 'Deliveries (Outbound)', icon: Send },
    { id: 'transfers', label: 'Internal Transfers', icon: ArrowLeftRight },
    { id: 'adjustments', label: 'Stock Adjustments', icon: SlidersHorizontal },
    { id: 'ledger', label: 'Stock Movement Ledger', icon: BookOpen },
    { id: 'warehouses', label: 'Warehouses & Zones', icon: Warehouse },
  ];

  return (
    <aside className="w-60 border-r border-slate-800 bg-slate-900 text-slate-300 flex flex-col justify-between shrink-0 h-full select-none font-sans">
      <div className="p-3 space-y-4 overflow-y-auto flex-1">
        {/* Navigation Section */}
        <div>
          <p className="px-3 text-[11px] font-semibold tracking-wider text-slate-400 uppercase mb-2">
            {isManager ? 'Operations & Inventory' : 'Warehouse Operations'}
          </p>
          <nav className="space-y-1">
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  className={`flex w-full items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-slate-800 text-white border-l-2 border-brand-500 pl-2.5 font-semibold'
                      : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-brand-400' : 'text-slate-400'}`} />
                    <span className="truncate">{item.label}</span>
                  </div>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded shrink-0 ${
                      isActive
                        ? 'bg-slate-700 text-slate-200 border border-slate-600'
                        : 'bg-slate-800 text-slate-400 border border-slate-700/70'
                    }`}>
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Compact Integrated Stock Alerts Navigation Item */}
        {effectiveTotalAlerts > 0 && (
          <div className="pt-2.5 border-t border-slate-800/80 px-1">
            <button
              onClick={() => {
                if (onOpenStockAlerts) {
                  onOpenStockAlerts();
                } else {
                  onTabChange('stock');
                }
              }}
              className="w-full text-left px-2.5 py-2 rounded-md bg-slate-800/40 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors group border border-slate-800 hover:border-slate-700/80"
              title="Open Stock View filtered by attention alerts"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-slate-400 group-hover:text-slate-300 transition-colors" />
                  <span className="text-xs font-medium text-slate-300 group-hover:text-white">Stock alerts</span>
                </div>
                <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-slate-800 text-slate-300 border border-slate-700/70 shrink-0">
                  {effectiveTotalAlerts}
                </span>
              </div>
              {breakdownParts.length > 0 && (
                <div className="text-[11px] text-slate-400 mt-1 pl-5.5 leading-tight">
                  {breakdownParts.join(' · ')}
                </div>
              )}
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};
