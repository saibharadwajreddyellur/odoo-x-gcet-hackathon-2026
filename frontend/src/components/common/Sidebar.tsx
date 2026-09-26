import React from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard, Boxes, Package, Truck, Send, ArrowLeftRight,
  SlidersHorizontal, BookOpen, Warehouse, AlertTriangle, ShieldCheck
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
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, onTabChange, lowStockCount = 0 }) => {
  const { user, isManager } = useAuth();

  const visibleNavItems: { id: NavTab; label: string; icon: any; badge?: number; badgeColor?: string }[] = [
    { id: 'dashboard', label: isManager ? 'Executive Dashboard' : 'Operations Dashboard', icon: LayoutDashboard },
    { id: 'stock', label: 'Stock View', icon: Boxes },
    { id: 'products', label: 'Product Catalog', icon: Package },
    { id: 'receipts', label: 'Receipts (Inbound)', icon: Truck },
    { id: 'deliveries', label: 'Deliveries (Outbound)', icon: Send },
    { id: 'transfers', label: 'Internal Transfers', icon: ArrowLeftRight },
    { id: 'adjustments', label: 'Stock Adjustments', icon: SlidersHorizontal },
    { id: 'ledger', label: 'Stock Movement Ledger', icon: BookOpen },
    { id: 'warehouses', label: 'Warehouses & Zones', icon: Warehouse },
  ];

  return (
    <aside className="w-64 border-r border-slate-800 bg-slate-900 text-slate-300 flex flex-col justify-between shrink-0 h-full">
      <div className="px-3.5 pt-3 pb-4 space-y-4 overflow-y-auto flex-1">
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
                  className={`flex w-full items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${isActive
                      ? 'bg-brand-600 text-white shadow-sm font-semibold'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/30">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>


        {/* Real-time Inventory Guard Box */}
        {lowStockCount > 0 && (
          <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-800/40 text-amber-200">
            <div className="flex items-center gap-2 mb-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="text-xs font-semibold">Inventory Alert</span>
            </div>
            <p className="text-[11px] text-amber-300/80 leading-relaxed">
              {lowStockCount} items require reordering attention.
            </p>
            {isManager ? (
              <button
                onClick={() => onTabChange('products')}
                className="mt-2 text-[11px] font-semibold text-amber-400 hover:underline"
              >
                Review Reorder Rules &rarr;
              </button>
            ) : (
              <button
                onClick={() => onTabChange('stock')}
                className="mt-2 text-[11px] font-semibold text-amber-400 hover:underline"
              >
                View Current Stock &rarr;
              </button>
            )}
          </div>
        )}
      </div>

      {/* Role Indicator Footer */}
      <div className="p-3 m-3 rounded-lg bg-slate-800/60 border border-slate-700/50 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-brand-400" />
          <span className="text-xs font-medium text-slate-300">
            {isManager ? 'Manager Console' : 'Floor Operations'}
          </span>
        </div>
        <span
          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
            isManager
              ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
              : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
          }`}
        >
          {isManager ? 'Manager' : 'Staff'}
        </span>
      </div>
    </aside>
  );
};
