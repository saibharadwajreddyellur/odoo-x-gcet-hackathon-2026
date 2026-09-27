import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Boxes, ArrowRight, AlertCircle } from 'lucide-react';

interface SignUpProps {
  onNavigateLogin: () => void;
}

export const SignUp: React.FC<SignUpProps> = ({ onNavigateLogin }) => {
  const { signup } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('inventory_manager');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const success = await signup(email, password, name, role);
    if (!success) {
      setError('Registration failed. The email address might already be registered.');
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
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Create StockSense Account</h1>
          <p className="text-xs text-slate-500 mt-0.5">Join your organization's inventory portal</p>
        </div>

        {error && (
          <div className="mb-4 p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500"
              placeholder="e.g. Jordan Lee"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500"
              placeholder="jordan@company.com"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500"
              placeholder="••••••••"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Account Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500 bg-white text-slate-800"
            >
              <option value="inventory_manager">Inventory Manager (Full Access)</option>
              <option value="warehouse_staff">Warehouse Staff (Operational Access)</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold rounded-md shadow-xs transition-colors"
          >
            <span>{loading ? 'Creating Account...' : 'Register & Enter Dashboard'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="mt-5 text-center text-xs text-slate-500">
          Already have an account?{' '}
          <button onClick={onNavigateLogin} className="font-semibold text-brand-600 hover:underline">
            Sign In
          </button>
        </div>
      </div>
    </div>
  );
};
