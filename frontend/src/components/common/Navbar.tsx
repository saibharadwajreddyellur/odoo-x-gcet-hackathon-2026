import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  Boxes, Search, User as UserIcon, LogOut, ChevronDown
} from 'lucide-react';

interface NavbarProps {
  searchTerm?: string;
  onSearchChange?: (term: string) => void;
  onNavigateProfile?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ searchTerm, onSearchChange, onNavigateProfile }) => {
  const { user, logout, isManager } = useAuth();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowProfileMenu(false);
      }
    };
    if (showProfileMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showProfileMenu]);

  return (
    <header className="sticky top-0 z-30 flex h-14 w-full items-center justify-between border-b border-slate-200 bg-white px-5 shadow-[0_1px_3px_0_rgba(0,0,0,0.03)] shrink-0">
      {/* Brand & Workspace Name */}
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded bg-brand-600 text-white shadow-xs">
          <Boxes className="h-5 w-5" />
        </div>

        <div className="flex items-center">
          <span className="text-base font-semibold tracking-tight text-slate-900">
            StockSense
          </span>
          <span className="hidden md:inline-block text-[11px] text-slate-500 ml-2.5 pl-2.5 border-l border-slate-200 font-normal">
            Enterprise Inventory & Warehouse Operations
          </span>
        </div>
      </div>

      {/* Center Search bar */}
      <div className="hidden md:flex items-center flex-1 max-w-md mx-6">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search by SKU, product name, or document #..."
            value={searchTerm ?? ''}
            onChange={(e) => onSearchChange?.(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-200 focus:border-brand-600 focus:ring-1 focus:ring-brand-600 rounded-md transition-colors placeholder:text-slate-400 text-slate-800 outline-none"
          />
        </div>
      </div>

      {/* Right User & Role Profile Area */}
      <div className="flex items-center gap-2" ref={menuRef}>
        <div className="relative">
          <button
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="flex items-center gap-2 rounded-md p-1.5 hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-colors cursor-pointer"
            aria-expanded={showProfileMenu}
            aria-label="User profile and account settings"
          >
            <div className="h-7 w-7 rounded-full bg-slate-800 text-white flex items-center justify-center font-medium text-xs">
              {user?.full_name?.charAt(0) || user?.email?.charAt(0).toUpperCase() || 'U'}
            </div>

            <div className="hidden sm:block text-left">
              <p className="text-xs font-medium text-slate-800 leading-none">
                {user?.full_name || 'Inventory User'}
              </p>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="text-[10px] text-slate-500 font-normal">
                  {isManager ? 'Manager' : 'Staff'}
                </span>
              </div>
            </div>

            <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
          </button>

          {showProfileMenu && (
            <div className="absolute right-0 mt-1.5 w-56 rounded-lg bg-white p-1.5 shadow-lg border border-slate-200 text-xs">
              <div className="px-3 py-2 border-b border-slate-100">
                <p className="font-semibold text-slate-900 truncate">
                  {user?.full_name || 'Inventory User'}
                </p>
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
                  className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer"
                >
                  <UserIcon className="w-3.5 h-3.5 text-slate-500" />
                  <span>My Profile</span>
                </button>
              </div>

              <div className="border-t border-slate-100 pt-1">
                <button
                  onClick={() => {
                    setShowProfileMenu(false);
                    logout();
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 font-medium text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5 text-rose-500" />
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