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
      <div className="p-8 text-center text-slate-500">
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
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Top Breadcrumb / Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => onNavigateTab?.('dashboard')}
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Dashboard</span>
        </button>
      </div>

      {/* Header Profile Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 text-center sm:text-left">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-slate-800 to-slate-700 text-white flex items-center justify-center text-3xl font-bold shadow-md shadow-slate-900/10 border-2 border-white ring-4 ring-slate-100 shrink-0">
            {user.full_name?.charAt(0) || user.email.charAt(0).toUpperCase()}
          </div>

          <div className="flex-1 space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                  {user.full_name || 'StockSense User'}
                </h1>
                <p className="text-xs text-slate-500 flex items-center justify-center sm:justify-start gap-1.5 mt-0.5">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  <span>{user.email}</span>
                </p>
              </div>

              <div className="flex items-center justify-center sm:justify-end">
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
                    isManager
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                      : 'bg-cyan-50 text-cyan-700 border-cyan-200'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>{roleDisplayName}</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Account Details Card */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-6 space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
          <UserIcon className="w-4 h-4 text-brand-600" />
          <h2 className="text-sm font-bold text-slate-900">Account Details</h2>
        </div>

        <div className="space-y-3 text-xs">
          <div className="flex justify-between py-2 border-b border-slate-50">
            <span className="text-slate-500 font-medium">Full Name</span>
            <span className="font-semibold text-slate-900">{user.full_name || 'Not provided'}</span>
          </div>

          <div className="flex justify-between py-2 border-b border-slate-50">
            <span className="text-slate-500 font-medium">Email Address</span>
            <span className="font-mono text-slate-800">{user.email}</span>
          </div>

          <div className="flex justify-between py-2 border-b border-slate-50">
            <span className="text-slate-500 font-medium">Assigned Role</span>
            <span className="font-semibold text-slate-900">{roleDisplayName}</span>
          </div>

          <div className="flex justify-between py-2">
            <span className="text-slate-500 font-medium">Member Since</span>
            <span className="text-slate-700 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>{memberSince}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
