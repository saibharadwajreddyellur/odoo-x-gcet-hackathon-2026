import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/common/Navbar';
import { Sidebar, NavTab } from './components/common/Sidebar';
import { Login } from './pages/auth/Login';
import { SignUp } from './pages/auth/SignUp';
import { ForgotPassword } from './pages/auth/ForgotPassword';
import { Dashboard } from './pages/Dashboard';
import { ProductList } from './pages/products/ProductList';
import { Receipts } from './pages/operations/Receipts';
import { Deliveries } from './pages/operations/Deliveries';
import { Transfers } from './pages/operations/Transfers';
import { Adjustments } from './pages/operations/Adjustments';
import { StockLedger } from './pages/StockLedger';
import { Warehouses } from './pages/Warehouses';
import { StockView } from './pages/inventory/StockView';
import { Profile } from './pages/Profile';
import { Product } from './types';

const MainApp: React.FC = () => {
  const { isAuthenticated, isManager } = useAuth();
  const [authView, setAuthView] = useState<'LOGIN' | 'SIGNUP' | 'FORGOT'>('LOGIN');
  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard');
  const [quickReceiptProduct, setQuickReceiptProduct] = useState<Product | null>(null);


  // If not logged in, show auth screens
  if (!isAuthenticated) {
    if (authView === 'SIGNUP') {
      return <SignUp onNavigateLogin={() => setAuthView('LOGIN')} />;
    }
    if (authView === 'FORGOT') {
      return <ForgotPassword onNavigateLogin={() => setAuthView('LOGIN')} />;
    }
    return (
      <Login
        onNavigateSignUp={() => setAuthView('SIGNUP')}
        onNavigateForgotPassword={() => setAuthView('FORGOT')}
      />
    );
  }

  return (
    <div className="h-screen bg-slate-50 flex flex-col font-sans text-slate-900 antialiased overflow-hidden">
      <Navbar onNavigateProfile={() => setCurrentTab('profile')} />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          currentTab={currentTab}
          onTabChange={setCurrentTab}
          lowStockCount={2}
        />

        <main className="flex-1 overflow-y-auto">
          <div className="p-6 lg:p-8 max-w-7xl mx-auto w-full">
            {currentTab === 'dashboard' && (
              <Dashboard
                onNavigateTab={setCurrentTab}
                onQuickReceipt={(prod) => {
                  setQuickReceiptProduct(prod);
                  setCurrentTab('receipts');
                }}
              />
            )}

            {currentTab === 'stock' && <StockView onNavigateTab={setCurrentTab} />}

            {currentTab === 'products' && <ProductList onNavigateTab={setCurrentTab} />}

            {currentTab === 'receipts' && (
              <Receipts initialProductToReceive={quickReceiptProduct} />
            )}

            {currentTab === 'deliveries' && <Deliveries />}

            {currentTab === 'transfers' && <Transfers />}

            {currentTab === 'adjustments' && <Adjustments />}

            {currentTab === 'ledger' && <StockLedger />}

            {currentTab === 'warehouses' && <Warehouses />}
            {currentTab === 'profile' && <Profile onNavigateTab={setCurrentTab} />}
          </div>
        </main>
      </div>
    </div>
  );
};

export function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}

export default App;
