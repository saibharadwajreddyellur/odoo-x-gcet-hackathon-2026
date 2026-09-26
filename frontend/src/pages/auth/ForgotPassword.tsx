import React, { useState, useEffect } from 'react';
import { ArrowLeft, KeyRound, CheckCircle, AlertCircle, RefreshCw, Mail } from 'lucide-react';

interface ForgotPasswordProps {
  onNavigateLogin: () => void;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

export const ForgotPassword: React.FC<ForgotPasswordProps> = ({ onNavigateLogin }) => {
  const [email, setEmail] = useState('');
  const [step, setStep] = useState<'REQUEST' | 'VERIFY' | 'SUCCESS'>('REQUEST');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // Active cooldown countdown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => {
      setCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldown]);

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfoMessage(null);

    try {
      const res = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() })
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setStep('VERIFY');
        setOtp('');
        setCooldown(data.cooldown_seconds || 60);
        setInfoMessage(data.message || 'A 6-digit verification code has been dispatched.');
      } else {
        setError(data.detail || 'Failed to request password reset code.');
      }
    } catch {
      setError('Unable to reach authentication server. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (cooldown > 0 || resending) return;
    setResending(true);
    setError(null);
    setInfoMessage(null);

    try {
      const res = await fetch(`${API_BASE_URL}/auth/resend-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() })
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setCooldown(data.cooldown_seconds || 60);
        setInfoMessage('A new verification code has been sent to your email.');
      } else {
        setError(data.detail || 'Failed to resend code. Please try again later.');
      }
    } catch {
      setError('Connection failure while requesting new code.');
    } finally {
      setResending(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanOtp = otp.trim();
    if (cleanOtp.length !== 6 || !/^\d+$/.test(cleanOtp)) {
      setError('Please enter the complete 6-digit verification code.');
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    setLoading(true);

    try {
      // 1. Verify OTP in FastAPI to ensure valid code, expiry, and attempt limits
      const verifyRes = await fetch(`${API_BASE_URL}/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          otp: cleanOtp
        })
      });

      const verifyData = await verifyRes.json().catch(() => ({}));

      if (!verifyRes.ok) {
        setError(verifyData.detail || 'Invalid or expired verification code.');
        setLoading(false);
        return;
      }

      // 2. Complete password change using the verified reset token
      const resetRes = await fetch(`${API_BASE_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          reset_token: verifyData.reset_token,
          new_password: newPassword
        })
      });

      const resetData = await resetRes.json().catch(() => ({}));

      if (resetRes.ok) {
        setStep('SUCCESS');
      } else {
        setError(resetData.detail || 'Failed to reset password. Please start over.');
      }
    } catch {
      setError('Connection error occurred while updating your password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl p-8 shadow-2xl border border-slate-100">
        <div className="text-center mb-6">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-lg shadow-amber-500/30 mb-3">
            <KeyRound className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">OTP Password Reset</h1>
          <p className="text-xs text-slate-500 mt-1">
            {step === 'REQUEST' && 'Enter your verified account email to receive a 6-digit reset code.'}
            {step === 'VERIFY' && 'Enter the 6-digit code received via email and your new password.'}
            {step === 'SUCCESS' && 'Your credentials have been securely updated.'}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
            <span>{error}</span>
          </div>
        )}

        {infoMessage && step === 'VERIFY' && !error && (
          <div className="mb-4 p-3 bg-amber-50/80 border border-amber-200 text-amber-800 rounded-lg text-xs flex items-center gap-2">
            <Mail className="w-4 h-4 shrink-0 text-amber-600" />
            <span>{infoMessage}</span>
          </div>
        )}

        {step === 'REQUEST' && (
          <form onSubmit={handleRequestOtp} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Registered Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="name@company.com"
                className="w-full px-3.5 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-all disabled:opacity-60"
            >
              {loading ? 'Sending Code...' : 'Send Reset OTP Code'}
            </button>
          </form>
        )}

        {step === 'VERIFY' && (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 flex items-center justify-between">
              <span className="truncate">
                Sent to: <strong className="font-semibold text-slate-900">{email}</strong>
              </span>
              <button
                type="button"
                onClick={() => { setStep('REQUEST'); setError(null); setInfoMessage(null); }}
                className="text-amber-600 hover:text-amber-800 underline text-[11px] shrink-0 ml-2"
              >
                Change
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">6-Digit Verification Code</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="••••••"
                required
                autoFocus
                className="w-full text-center font-mono tracking-widest text-xl py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
                placeholder="Enter at least 6 characters"
                className="w-full px-3.5 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
            </div>

            <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
              <span>Didn't receive code?</span>
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={cooldown > 0 || resending}
                className={`inline-flex items-center gap-1 font-semibold transition-colors ${
                  cooldown > 0 || resending
                    ? 'text-slate-400 cursor-not-allowed'
                    : 'text-amber-600 hover:text-amber-700 underline'
                }`}
              >
                {resending && <RefreshCw className="w-3 h-3 animate-spin" />}
                <span>
                  {resending
                    ? 'Sending...'
                    : cooldown > 0
                    ? `Resend in ${cooldown}s`
                    : 'Resend Code'}
                </span>
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-all disabled:opacity-60"
            >
              {loading ? 'Verifying & Updating...' : 'Verify OTP & Reset Password'}
            </button>
          </form>
        )}

        {step === 'SUCCESS' && (
          <div className="text-center py-4 space-y-4">
            <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto" />
            <p className="text-xs text-slate-600">Password has been updated. You can now log into your account.</p>
            <button
              onClick={onNavigateLogin}
              className="w-full py-2.5 px-4 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-all"
            >
              Back to Login
            </button>
          </div>
        )}

        {step !== 'SUCCESS' && (
          <div className="mt-6 text-center">
            <button
              onClick={onNavigateLogin}
              className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 font-medium"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Cancel and return to login</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
