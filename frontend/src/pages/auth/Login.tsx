import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Boxes, ArrowRight, AlertCircle } from 'lucide-react';

interface LoginProps {
  onNavigateSignUp: () => void;
  onNavigateForgotPassword: () => void;
}

export const Login: React.FC<LoginProps> = ({ onNavigateSignUp, onNavigateForgotPassword }) => {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const success = await login(email, password);
    if (!success) {
      setError('Invalid credentials. Please check your email and password.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-lg p-7 border border-slate-200 shadow-sm">
        <div className="text-center mb-6">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600 text-white mb-2.5 shadow-xs">
            <Boxes className="h-5 w-5" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Welcome to StockSense</h1>
          <p className="text-xs text-slate-500 mt-0.5">Enterprise Inventory & Warehouse Management</p>
        </div>

        {error && (
          <div className="mb-4 p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500"
              placeholder="name@company.com"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-slate-700">Password</label>
              <button
                type="button"
                onClick={onNavigateForgotPassword}
                className="text-[11px] text-brand-600 hover:underline font-medium"
              >
                Forgot Password?
              </button>
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold rounded-md shadow-xs transition-colors"
          >
            <span>{loading ? 'Authenticating...' : 'Sign in to Dashboard'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="mt-5 text-center text-xs text-slate-500">
          Don't have an account?{' '}
          <button onClick={onNavigateSignUp} className="font-semibold text-brand-600 hover:underline">
            Create an Account
          </button>
        </div>
      </div>
    </div>
  );
};
