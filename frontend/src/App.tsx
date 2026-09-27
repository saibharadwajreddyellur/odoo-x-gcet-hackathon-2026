import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { StockAlertProvider, useStockAlerts } from './context/StockAlertContext';
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
  const { lowStockCount, outOfStockCount, totalAttentionCount } = useStockAlerts();
  const [authView, setAuthView] = useState<'LOGIN' | 'SIGNUP' | 'FORGOT'>('LOGIN');
  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard');
  const [quickReceiptProduct, setQuickReceiptProduct] = useState<Product | null>(null);
  const [globalSearch, setGlobalSearch] = useState('');
  const [stockStatusFilter, setStockStatusFilter] = useState<
    'ALL' | 'ATTENTION' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'IN_STOCK' | 'RESERVED'
  >('ALL');

  const handleOpenStockAlerts = () => {
    setStockStatusFilter('ATTENTION');
    setCurrentTab('stock');
  };

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
    <div className="h-screen bg-slate-50 flex flex-col font-sans text-slate-800 antialiased overflow-hidden">
      <Navbar
        searchTerm={globalSearch}
        onSearchChange={(val) => {
          setGlobalSearch(val);
          if (currentTab !== 'products' && currentTab !== 'stock' && val.trim().length > 0) {
            setCurrentTab('products');
          }
        }}
        onNavigateProfile={() => setCurrentTab('profile')}
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          currentTab={currentTab}
          onTabChange={(tab) => {
            if (tab === 'stock') {
              // Default to ALL when directly clicking stock nav tab unless already filtered
              setStockStatusFilter('ALL');
            }
            setCurrentTab(tab);
          }}
          lowStockCount={lowStockCount}
          outOfStockCount={outOfStockCount}
          totalAlertCount={totalAttentionCount}
          onOpenStockAlerts={handleOpenStockAlerts}
        />

        <main className="flex-1 overflow-y-auto bg-slate-50">
          <div className="p-5 lg:p-6 max-w-7xl mx-auto w-full">
            {currentTab === 'dashboard' && (
              <Dashboard
                onNavigateTab={setCurrentTab}
                onQuickReceipt={(prod) => {
                  setQuickReceiptProduct(prod);
                  setCurrentTab('receipts');
                }}
              />
            )}

            {currentTab === 'stock' && (
              <StockView
                onNavigateTab={setCurrentTab}
                externalSearchTerm={globalSearch}
                onSearchChange={setGlobalSearch}
                initialStatusFilter={stockStatusFilter}
                onStatusFilterChange={setStockStatusFilter}
              />
            )}

            {currentTab === 'products' && (
              <ProductList
                onNavigateTab={setCurrentTab}
                externalSearchTerm={globalSearch}
                onSearchChange={setGlobalSearch}
              />
            )}

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
      <StockAlertProvider>
        <MainApp />
      </StockAlertProvider>
    </AuthProvider>
  );
}

export default App;
