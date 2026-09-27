import React from 'react';
import { useAuth } from '../context/AuthContext';
import { NavTab } from '../components/common/Sidebar';
import {
  User as UserIcon,
  Mail,
  ShieldCheck,
  Calendar,
  ArrowLeft
} from 'lucide-react';

interface ProfileProps {
  onNavigateTab?: (tab: NavTab) => void;
}

export const Profile: React.FC<ProfileProps> = ({ onNavigateTab }) => {
  const { user, isManager, isStaff } = useAuth();

  if (!user) {
    return (
      <div className="p-8 text-center text-slate-500 text-xs">
        No active user session detected.
      </div>
    );
  }

  const roleDisplayName = isManager
    ? 'Inventory Manager'
    : isStaff
    ? 'Warehouse Staff'
    : user.role === 'admin'
    ? 'Administrator'
    : 'Warehouse Staff';

  const memberSince = user.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    : 'Recent Member';

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      {/* Top Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => onNavigateTab?.('dashboard')}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Dashboard</span>
        </button>
      </div>

      {/* Header Profile Card */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-[0_1px_2px_0_rgba(0,0,0,0.02)] p-6">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 text-center sm:text-left">
          <div className="w-14 h-14 rounded-full bg-slate-800 text-white flex items-center justify-center text-xl font-semibold shrink-0">
            {user.full_name?.charAt(0) || user.email.charAt(0).toUpperCase()}
          </div>

          <div className="flex-1 space-y-1">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h1 className="text-xl font-semibold text-slate-900 tracking-tight">
                  {user.full_name || 'StockSense User'}
                </h1>
                <p className="text-xs text-slate-500 flex items-center justify-center sm:justify-start gap-1.5 mt-0.5">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  <span>{user.email}</span>
                </p>
              </div>

              <div className="flex items-center justify-center sm:justify-end">
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium border ${
                    isManager
                      ? 'bg-slate-50 text-slate-700 border-slate-200'
                      : 'bg-slate-50 text-slate-700 border-slate-200'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-brand-600" />
                  <span>{roleDisplayName}</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Account Details Card */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-[0_1px_2px_0_rgba(0,0,0,0.02)] p-5 space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
          <UserIcon className="w-4 h-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-900">Account Details & Permissions</h2>
        </div>

        <div className="space-y-3 text-xs">
          <div className="flex justify-between py-2 border-b border-slate-50">
            <span className="text-slate-500">User Identification #</span>
            <span className="font-mono text-slate-800 font-medium">USR-{user.id.toString().padStart(4, '0')}</span>
          </div>

          <div className="flex justify-between py-2 border-b border-slate-50">
            <span className="text-slate-500">Security Clearance Level</span>
            <span className="font-medium text-slate-800">
              {isManager ? 'Full Executive & Operations Control' : 'Warehouse Floor Data Entry & Auditing'}
            </span>
          </div>

          <div className="flex justify-between py-2 border-b border-slate-50">
            <span className="text-slate-500">Registered Access Date</span>
            <span className="text-slate-800 flex items-center gap-1.5 font-medium">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>{memberSince}</span>
            </span>
          </div>

          <div className="flex justify-between py-2">
            <span className="text-slate-500">System Permissions</span>
            <span className="text-slate-800 text-right font-medium">
              {isManager
                ? 'Create & Edit SKUs, Locations, Warehouses, Deliveries, Receipts, Reorder Policies'
                : 'Process Receipts, Dispatch Deliveries, Execute Transfers & Cycle Counts'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
