import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  Boxes, Search, User as UserIcon, LogOut
} from 'lucide-react';

interface NavbarProps {
  onSearchChange?: (term: string) => void;
  onNavigateProfile?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onSearchChange, onNavigateProfile }) => {
  const { user, logout, isManager } = useAuth();
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white/95 px-6 backdrop-blur">
      {/* Brand logo & mobile menu */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm shadow-brand-600/30">
          <Boxes className="h-6 w-6" />
        </div>

        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold tracking-tight text-slate-900">
              StockSense
            </span>
          </div>

          <p className="hidden md:block text-[11px] text-slate-500">
            Centralized Inventory & Warehouse Control
          </p>
        </div>
      </div>

      {/* Center Search bar */}
      <div className="hidden lg:flex items-center flex-1 max-w-md mx-8">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />

          <input
            type="text"
            placeholder="Search by SKU, product name, or document #..."
            onChange={(e) => onSearchChange?.(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-3">

        {/* User Profile */}
        <div className="relative">
          <button
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="flex items-center gap-2.5 rounded-lg p-1.5 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <div className="h-8 w-8 rounded-full bg-slate-800 text-white flex items-center justify-center font-medium text-xs">
              {user?.full_name?.charAt(0) || user?.email?.charAt(0).toUpperCase() || 'U'}
            </div>

            <div className="hidden md:block text-left">
              <p className="text-xs font-semibold text-slate-800 leading-none">
                {user?.full_name || 'Inventory User'}
              </p>

              <p className="text-[10px] text-slate-500 mt-0.5 font-medium">
                {isManager ? 'Inventory Manager' : 'Warehouse Staff'}
              </p>
            </div>
          </button>

          {showProfileMenu && (
            <div className="absolute right-0 mt-2 w-56 rounded-xl bg-white p-2 shadow-xl border border-slate-100 ring-1 ring-slate-900/5">
              <div className="px-3 py-2 border-b border-slate-100">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-900">
                    {user?.full_name}
                  </p>
                </div>

                <p className="text-[11px] text-slate-500 truncate mt-0.5">
                  {user?.email}
                </p>
              </div>

              <div className="py-1">
                <button
                  onClick={() => {
                    setShowProfileMenu(false);
                    onNavigateProfile?.();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <UserIcon className="w-4 h-4 text-slate-500" />
                  <span>My Profile</span>
                </button>
              </div>

              <div className="border-t border-slate-100 pt-1">
                <button
                  onClick={() => {
                    setShowProfileMenu(false);
                    logout();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};