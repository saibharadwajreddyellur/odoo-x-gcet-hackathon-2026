import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isManager: boolean;
  isStaff: boolean;
  login: (email: string, pass: string) => Promise<boolean>;
  signup: (email: string, pass: string, name: string, role?: string) => Promise<boolean>;
  logout: () => void;
  demoLogin: () => void;
  demoLoginStaff: () => void;
  updateUser: (partial: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('stocksense_user');
    const token = localStorage.getItem('stocksense_token');
    if (saved && token && token !== 'demo-jwt-token-stocksense') {
      try {
        return JSON.parse(saved);
      } catch {
        return null;
      }
    }
    return null;
  });

  const isManager = user?.role === 'admin' || user?.role === 'inventory_manager';
  const isStaff = user?.role === 'warehouse_staff';

  const login = async (email: string, pass: string = 'admin123'): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pass })
      });

      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        localStorage.setItem('stocksense_user', JSON.stringify(data.user));
        localStorage.setItem('stocksense_token', data.access_token);
        return true;
      }
      return false;
    } catch {
      // Backend unavailable; fallback only for local demo development
      if (email === 'admin@stocksense.io' || email === 'staff@stocksense.io') {
        const defaultRole = email.includes('staff') ? 'warehouse_staff' : 'admin';
        const loggedUser: User = {
          id: email.includes('staff') ? 2 : 1,
          email,
          full_name: email.includes('staff') ? 'Sam Taylor' : 'Alex Morgan',
          role: defaultRole,
          is_active: true,
          created_at: new Date().toISOString()
        };
        setUser(loggedUser);
        localStorage.setItem('stocksense_user', JSON.stringify(loggedUser));
        localStorage.setItem('stocksense_token', 'demo-jwt-token-stocksense');
        return true;
      }
      return false;
    }
  };

  const signup = async (email: string, pass: string, name: string, role: string = 'inventory_manager'): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password: pass,
          full_name: name,
          role
        })
      });

      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        localStorage.setItem('stocksense_user', JSON.stringify(data.user));
        localStorage.setItem('stocksense_token', data.access_token);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('stocksense_user');
    localStorage.removeItem('stocksense_token');
    try {
      fetch(`${API_BASE_URL}/auth/logout`, { method: 'POST' }).catch(() => {});
    } catch {}
  };

  const demoLogin = () => {
    login('admin@stocksense.io', 'admin123');
  };

  const demoLoginStaff = () => {
    login('staff@stocksense.io', 'staff123');
  };

  const updateUser = (partial: Partial<User>) => {
    setUser(prev => {
      if (!prev) return prev;
      const updated = { ...prev, ...partial };
      localStorage.setItem('stocksense_user', JSON.stringify(updated));
      return updated;
    });
  };

  // Validate existing stored token on mount, if present
  useEffect(() => {
    const existingToken = localStorage.getItem('stocksense_token');
    if (existingToken && existingToken !== 'demo-jwt-token-stocksense') {
      fetch(`${API_BASE_URL}/auth/me`, {
        headers: {
          'Authorization': `Bearer ${existingToken}`
        }
      })
      .then(res => {
        if (res.ok) {
          return res.json();
        } else if (res.status === 401) {
          logout();
        }
      })
      .then(userData => {
        if (userData) {
          setUser(userData);
          localStorage.setItem('stocksense_user', JSON.stringify(userData));
        }
      })
      .catch(() => {
        // Backend temporarily unreachable, retain stored user session
      });
    }
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: !!user,
      isManager,
      isStaff,
      login,
      signup,
      logout,
      demoLogin,
      demoLoginStaff,
      updateUser
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
