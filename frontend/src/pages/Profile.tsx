import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { NavTab } from '../components/common/Sidebar';
import { EditProfileModal } from '../components/common/EditProfileModal';
import {
  User as UserIcon,
  Mail,
  ShieldCheck,
  Calendar,
  ArrowLeft,
  Pencil
} from 'lucide-react';

interface ProfileProps {
  onNavigateTab?: (tab: NavTab) => void;
}

export const Profile: React.FC<ProfileProps> = ({ onNavigateTab }) => {
  const { user, isManager, isStaff } = useAuth();
  const [showEditModal, setShowEditModal] = useState(false);

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

  const initials = (user.full_name || user.email).charAt(0).toUpperCase();

  return (
    <>
      {showEditModal && <EditProfileModal onClose={() => setShowEditModal(false)} />}

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
            {/* Avatar */}
            <div className="w-14 h-14 rounded-full bg-slate-800 text-white flex items-center justify-center text-xl font-semibold shrink-0 overflow-hidden">
              {user.avatar_b64
                ? <img src={user.avatar_b64} alt="Profile" className="w-full h-full object-cover" />
                : initials
              }
            </div>

            <div className="flex-1 space-y-1 min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="text-xl font-semibold text-slate-900 tracking-tight truncate">
                    {user.full_name || 'StockSense User'}
                  </h1>
                  <p className="text-xs text-slate-500 flex items-center justify-center sm:justify-start gap-1.5 mt-0.5">
                    <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{user.email}</span>
                  </p>
                </div>

                <div className="flex items-center justify-center sm:justify-end gap-2 shrink-0">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium border bg-slate-50 text-slate-700 border-slate-200">
                    <ShieldCheck className="w-3.5 h-3.5 text-brand-600" />
                    <span>{roleDisplayName}</span>
                  </span>
                  <button
                    onClick={() => setShowEditModal(true)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
                  >
                    <Pencil className="w-3 h-3" />
                    Edit Profile
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Account Details Card */}
        <div className="bg-white rounded-lg border border-slate-200 shadow-[0_1px_2px_0_rgba(0,0,0,0.02)] p-5 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <UserIcon className="w-4 h-4 text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-900">Account Details &amp; Permissions</h2>
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
    </>
  );
};
