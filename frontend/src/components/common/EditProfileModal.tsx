import React, { useState, useRef, useCallback } from 'react';
import { X, Camera, Trash2, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { AvatarEditorModal } from './AvatarEditorModal';

interface EditProfileModalProps {
  onClose: () => void;
}

function cooldownDaysRemaining(nameChangedAt: string | null | undefined): number {
  if (!nameChangedAt) return 0;
  const changed = new Date(nameChangedAt).getTime();
  const now = Date.now();
  const elapsed = (now - changed) / 1000;
  const remaining = 30 * 86400 - elapsed;
  if (remaining <= 0) return 0;
  return Math.ceil(remaining / 86400);
}

export const EditProfileModal: React.FC<EditProfileModalProps> = ({ onClose }) => {
  const { user, updateUser } = useAuth();

  const [nameInput, setNameInput] = useState(user?.full_name || '');
  const [editingFile, setEditingFile] = useState<File | null>(null);

  const [nameSaving, setNameSaving] = useState(false);
  const [avatarDeleting, setAvatarDeleting] = useState(false);

  const [nameMsg, setNameMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [avatarMsg, setAvatarMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);

  const daysLeft = cooldownDaysRemaining(user?.name_changed_at);
  const nameIsUnchanged = nameInput.trim() === (user?.full_name || '').trim();
  const nameLocked = daysLeft > 0;

  // ── Avatar selection ────────────────────────────────────────────────────────
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
    if (!validTypes.includes(file.type.toLowerCase()) && !file.name.match(/\.(jpe?g|png|webp|gif)$/i)) {
      setAvatarMsg({ type: 'error', text: 'Invalid file type. Please upload a JPG, PNG, WebP, or GIF.' });
      return;
    }

    setEditingFile(file);
    setAvatarMsg(null);
  }, []);

  // ── Save avatar from editor ─────────────────────────────────────────────────
  const handleSaveAvatarFromEditor = async (processedBase64: string) => {
    try {
      const updated = await api.updateAvatar(processedBase64);
      updateUser({ avatar_b64: updated.avatar_b64 });
      setEditingFile(null);
      setAvatarMsg({ type: 'success', text: 'Profile photo updated.' });
    } catch (err: any) {
      const detail = err.detail || err.message || 'Failed to save avatar.';
      setAvatarMsg({ type: 'error', text: detail });
      throw err;
    }
  };

  // ── Remove avatar ───────────────────────────────────────────────────────────
  const handleDeleteAvatar = async () => {
    setAvatarDeleting(true);
    setAvatarMsg(null);
    try {
      const updated = await api.deleteAvatar();
      updateUser({ avatar_b64: updated.avatar_b64 });
      setAvatarMsg({ type: 'success', text: 'Profile photo removed.' });
    } catch (err: any) {
      setAvatarMsg({ type: 'error', text: err.detail || err.message || 'Failed to remove avatar.' });
    } finally {
      setAvatarDeleting(false);
    }
  };

  // ── Save name ───────────────────────────────────────────────────────────────
  const handleSaveName = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed) {
      setNameMsg({ type: 'error', text: 'Display name cannot be empty.' });
      return;
    }
    if (trimmed.length > 100) {
      setNameMsg({ type: 'error', text: 'Display name must be 100 characters or fewer.' });
      return;
    }
    setNameSaving(true);
    setNameMsg(null);
    try {
      const updated = await api.updateProfileName(trimmed);
      updateUser({ full_name: updated.full_name, name_changed_at: updated.name_changed_at });
      setNameMsg({ type: 'success', text: 'Display name saved.' });
    } catch (err: any) {
      const detail: string = err.detail || err.message || 'Failed to update name.';
      setNameMsg({ type: 'error', text: detail });
    } finally {
      setNameSaving(false);
    }
  };

  const displayAvatar = user?.avatar_b64 ?? null;
  const initials = (user?.full_name || user?.email || 'U').charAt(0).toUpperCase();

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[2px] p-4"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div className="relative bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900">Edit Profile</h2>
            <button
              onClick={onClose}
              className="rounded-md p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-5 py-5 space-y-6">

            {/* ── Avatar section ─────────────────────────────────────────── */}
            <div>
              <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-3">Profile Photo</p>
              <div className="flex items-center gap-4">
                {/* Avatar display */}
                <div className="relative shrink-0">
                  <div className="w-16 h-16 rounded-full overflow-hidden bg-slate-800 text-white flex items-center justify-center text-xl font-semibold shadow-sm">
                    {displayAvatar
                      ? <img src={displayAvatar} alt="Avatar" className="w-full h-full object-cover" />
                      : initials
                    }
                  </div>
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="absolute -bottom-1 -right-1 w-6 h-6 bg-brand-600 rounded-full text-white flex items-center justify-center shadow border-2 border-white hover:bg-brand-700 transition-colors"
                    title="Change photo"
                  >
                    <Camera className="w-3 h-3" />
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </div>

                <div className="flex flex-col gap-1 min-w-0">
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors text-left"
                  >
                    {displayAvatar ? 'Change photo' : 'Upload photo'}
                  </button>
                  <p className="text-[11px] text-slate-400 leading-tight">
                    JPG, PNG, WebP or GIF
                  </p>
                </div>
              </div>

              {/* Remove current saved avatar */}
              {user?.avatar_b64 && (
                <button
                  onClick={handleDeleteAvatar}
                  disabled={avatarDeleting}
                  className="mt-2.5 flex items-center gap-1.5 text-[11px] text-rose-500 hover:text-rose-700 transition-colors"
                >
                  {avatarDeleting
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : <Trash2 className="w-3 h-3" />
                  }
                  Remove photo
                </button>
              )}

              {avatarMsg && (
                <div className={`mt-2 flex items-start gap-1.5 text-[11px] ${avatarMsg.type === 'error' ? 'text-rose-600' : 'text-emerald-700'}`}>
                  {avatarMsg.type === 'error'
                    ? <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                    : <CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0" />
                  }
                  {avatarMsg.text}
                </div>
              )}
            </div>

            {/* ── Name section ───────────────────────────────────────────── */}
            <div>
              <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-3">Display Name</p>

              {nameLocked && (
                <div className="mb-2 flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2.5 py-2">
                  <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                  <span>You can change your name again in <strong>{daysLeft} day{daysLeft !== 1 ? 's' : ''}</strong>.</span>
                </div>
              )}

              <div className="flex gap-2">
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => { setNameInput(e.target.value); setNameMsg(null); }}
                  disabled={nameLocked}
                  maxLength={100}
                  placeholder="Your display name"
                  className="flex-1 text-xs bg-slate-50 border border-slate-200 rounded px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-brand-600 focus:border-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                />
                <button
                  onClick={handleSaveName}
                  disabled={nameSaving || nameLocked || nameIsUnchanged}
                  className="flex items-center gap-1.5 text-xs font-medium bg-brand-600 text-white px-3 py-2 rounded hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
                >
                  {nameSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                  Save
                </button>
              </div>

              {nameMsg && (
                <div className={`mt-2 flex items-start gap-1.5 text-[11px] ${nameMsg.type === 'error' ? 'text-rose-600' : 'text-emerald-700'}`}>
                  {nameMsg.type === 'error'
                    ? <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                    : <CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0" />
                  }
                  {nameMsg.text}
                </div>
              )}
            </div>

            {/* ── Read-only fields ────────────────────────────────────────── */}
            <div className="border-t border-slate-100 pt-5 space-y-3">
              <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Account Info</p>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Email</span>
                  <span className="font-medium text-slate-700 truncate ml-4">{user?.email}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Role</span>
                  <span className="font-medium text-slate-700">
                    {user?.role === 'admin' || user?.role === 'inventory_manager' ? 'Inventory Manager' : 'Warehouse Staff'}
                  </span>
                </div>
              </div>
              <p className="text-[10px] text-slate-400">Email and role are managed by your system administrator.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Profile Picture Editor Modal */}
      {editingFile && (
        <AvatarEditorModal
          file={editingFile}
          onSave={handleSaveAvatarFromEditor}
          onCancel={() => setEditingFile(null)}
        />
      )}
    </>
  );
};
