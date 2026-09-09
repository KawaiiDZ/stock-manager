import React, { useState, useEffect } from 'react';
import { api } from './services/api';
import { BusinessSettings, Product } from './types';
import { Sidebar } from './components/layout/Sidebar';
import { Topbar } from './components/layout/Topbar';

// Pages
import { LoginPage } from './pages/Auth/LoginPage';
import { DashboardPage } from './pages/Dashboard/DashboardPage';
import { NewSalePage } from './pages/Sales/NewSalePage';
import { SalesHistoryPage } from './pages/Sales/SalesHistoryPage';
import { SalesReturnsPage } from './pages/Sales/SalesReturnsPage';
import { ProductsPage } from './pages/Inventory/ProductsPage';
import { StockMovementsPage } from './pages/Inventory/StockMovementsPage';
import { PurchasesPage } from './pages/Inventory/PurchasesPage';
import { CustomersPage } from './pages/People/CustomersPage';
import { SuppliersPage } from './pages/People/SuppliersPage';
import { BillsPage } from './pages/Money/BillsPage';
import { ExpensesPage } from './pages/Money/ExpensesPage';
import { ReportsPage } from './pages/Reports/ReportsPage';
import { SettingsPage } from './pages/Settings/SettingsPage';
import { QuotationsPage } from './pages/Sales/QuotationsPage';
import { SetupWizardModal } from './components/wizard/SetupWizardModal';

import { setGlobalFormattingPreferences } from './utils/format';

export const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<{ username: string; full_name: string } | null>(
    () => {
      const saved = localStorage.getItem('sm_user');
      return saved ? JSON.parse(saved) : null;
    }
  );

  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [urgentBillsCount, setUrgentBillsCount] = useState<number>(0);
  const [pendingQuotationsCount, setPendingQuotationsCount] = useState<number>(0);
  const [returnSaleId, setReturnSaleId] = useState<number | undefined>();
  const [preLoadedSellProduct, setPreLoadedSellProduct] = useState<Product | null>(null);
  const [showWizard, setShowWizard] = useState<boolean>(false);

  const loadSettingsAndBadges = async () => {
    try {
      const [bizSettings, billsAttention, pendingQuotes] = await Promise.all([
        api.getSettings(),
        api.getBillsAttention(),
        api.getQuotations('PENDING').catch(() => []),
      ]);
      setSettings(bizSettings);
      if (bizSettings) {
        setGlobalFormattingPreferences({
          dateFormat: bizSettings.date_format,
          formatPricesWithCommas: bizSettings.format_prices_with_commas,
        });
      }
      setUrgentBillsCount(billsAttention.length);
      setPendingQuotationsCount(pendingQuotes?.length || 0);

      // If business has not finished setup wizard, auto open
      if (bizSettings && bizSettings.setup_completed === false) {
        setShowWizard(true);
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  };

  useEffect(() => {
    // Always fetch business settings on initial mount so login page has brand logo and name
    api.getSettings().then((s) => {
      setSettings(s);
      if (s) {
        setGlobalFormattingPreferences({
          dateFormat: s.date_format,
          formatPricesWithCommas: s.format_prices_with_commas,
        });
      }
    }).catch(() => {});

    // Global UX enhancement: auto-select "0" in numeric inputs so typing replaces zero immediately
    const handleGlobalFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLInputElement;
      if (target && target.tagName === 'INPUT' && (target.type === 'number' || target.inputMode === 'numeric' || target.inputMode === 'decimal')) {
        if (target.value === '0' || target.value === '0.00' || target.value === '0.0') {
          setTimeout(() => target.select(), 10);
        }
      }
    };

    const handleGlobalInput = (e: Event) => {
      const target = e.target as HTMLInputElement;
      if (target && target.tagName === 'INPUT' && target.type === 'number') {
        const val = target.value;
        if (/^0\d+/.test(val) && !val.startsWith('0.')) {
          target.value = val.replace(/^0+/, '');
        }
      }
    };

    document.addEventListener('focusin', handleGlobalFocusIn);
    document.addEventListener('input', handleGlobalInput);
    return () => {
      document.removeEventListener('focusin', handleGlobalFocusIn);
      document.removeEventListener('input', handleGlobalInput);
    };
  }, []);

  useEffect(() => {
    if (currentUser) {
      loadSettingsAndBadges();
    }
  }, [currentUser]);

  const handleLoginSuccess = (user: { username: string; full_name: string }) => {
    localStorage.setItem('sm_user', JSON.stringify(user));
    setCurrentUser(user);
  };

  const handleLogout = () => {
    localStorage.removeItem('sm_user');
    setCurrentUser(null);
  };

  const handleNavigateToReturn = (saleId: number) => {
    setReturnSaleId(saleId);
    setCurrentTab('returns');
  };

  const handleSellProductFromCatalog = (product: Product) => {
    setPreLoadedSellProduct(product);
    setCurrentTab('new_sale');
  };

  // Keyboard shortcut F2 to open POS New Sale instantly
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        setCurrentTab('new_sale');
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  if (!currentUser) {
    return <LoginPage settings={settings} onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans text-slate-800">
      {/* Sidebar */}
      <Sidebar
        currentTab={currentTab}
        settings={settings}
        onTabChange={(tab) => {
          if (tab !== 'returns') setReturnSaleId(undefined);
          if (tab !== 'new_sale') setPreLoadedSellProduct(null);
          setCurrentTab(tab);
        }}
        urgentBillsCount={urgentBillsCount}
        pendingQuotationsCount={pendingQuotationsCount}
      />

      {/* Main Viewport Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Topbar
          settings={settings}
          onNewSaleClick={() => {
            setPreLoadedSellProduct(null);
            setCurrentTab('new_sale');
          }}
          onLogout={handleLogout}
        />

        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          {currentTab === 'dashboard' && (
            <DashboardPage
              settings={settings}
              onNavigate={(tab) => setCurrentTab(tab)}
            />
          )}

          {currentTab === 'new_sale' && (
            <NewSalePage
              settings={settings}
              initialProduct={preLoadedSellProduct}
            />
          )}

          {currentTab === 'sales_history' && (
            <SalesHistoryPage
              settings={settings}
              onNavigateToReturn={handleNavigateToReturn}
            />
          )}

          {currentTab === 'quotations' && (
            <QuotationsPage
              settings={settings}
              onNavigateToNewSale={() => {
                setPreLoadedSellProduct(null);
                setCurrentTab('new_sale');
              }}
              onQuotationConverted={loadSettingsAndBadges}
            />
          )}

          {currentTab === 'returns' && (
            <SalesReturnsPage settings={settings} initialSaleId={returnSaleId} />
          )}

          {currentTab === 'products' && (
            <ProductsPage
              settings={settings}
              onSellProduct={handleSellProductFromCatalog}
            />
          )}

          {currentTab === 'stock_movements' && (
            <StockMovementsPage settings={settings} />
          )}

          {currentTab === 'purchases' && <PurchasesPage settings={settings} />}

          {currentTab === 'customers' && <CustomersPage settings={settings} />}

          {currentTab === 'suppliers' && <SuppliersPage settings={settings} />}

          {currentTab === 'bills' && <BillsPage settings={settings} />}

          {currentTab === 'expenses' && <ExpensesPage settings={settings} />}

          {currentTab === 'reports' && <ReportsPage settings={settings} />}

          {currentTab === 'settings' && (
            <SettingsPage
              settings={settings}
              onSettingsUpdated={loadSettingsAndBadges}
              onOpenWizard={() => setShowWizard(true)}
            />
          )}
        </main>
      </div>

      {/* Onboarding & Setup Wizard Modal */}
      <SetupWizardModal
        isOpen={showWizard}
        onClose={() => setShowWizard(false)}
        currentSettings={settings}
        onSetupComplete={(updated) => {
          setSettings(updated);
          loadSettingsAndBadges();
        }}
      />
    </div>
  );
};
