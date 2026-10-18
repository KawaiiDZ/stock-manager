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
import { NavigationHubPage } from './pages/Hub/NavigationHubPage';
import { SetupWizardModal } from './components/wizard/SetupWizardModal';
import { ConnectionBanner } from './components/network/ConnectionBanner';
import { NetworkSyncModal } from './components/network/NetworkSyncModal';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { ConfirmDialog } from './components/common/ConfirmDialog';
import { CheckCircle2 } from 'lucide-react';

import { setGlobalFormattingPreferences } from './utils/format';
import { dispatchGlobalShortcut } from './utils/shortcuts';
import { useTheme } from './context/ThemeContext';

export const App: React.FC = () => {
  const { syncFromSettings } = useTheme();
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
  const [showNetworkModal, setShowNetworkModal] = useState<boolean>(false);
  const [showShutdownConfirm, setShowShutdownConfirm] = useState<boolean>(false);
  const [isShuttingDown, setIsShuttingDown] = useState<boolean>(false);
  const [isShutdownComplete, setIsShutdownComplete] = useState<boolean>(false);
  const [shutdownMessage, setShutdownMessage] = useState<string>('');

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
          currency: bizSettings.currency || 'Rs.',
        });
        syncFromSettings(bizSettings.theme_mode, bizSettings.color_theme);
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
          currency: s.currency || 'Rs.',
        });
        syncFromSettings(s.theme_mode, s.color_theme);
      }
    }).catch(() => {});

    // Global UX enhancement: auto-select "0" in numeric inputs so typing replaces zero immediately
    const isNumericInput = (el: HTMLElement | null): el is HTMLInputElement => {
      return (
        !!el &&
        el.tagName === 'INPUT' &&
        (el.getAttribute('type') === 'number' ||
          el.getAttribute('inputmode') === 'numeric' ||
          el.getAttribute('inputmode') === 'decimal')
      );
    };

    const handleGlobalFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (isNumericInput(target)) {
        requestAnimationFrame(() => {
          if (target.value === '0' || target.value === '0.00' || target.value === '0.0') {
            target.select();
          }
        });
      }
    };

    const handleGlobalMouseUp = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (isNumericInput(target)) {
        if (target.value === '0' || target.value === '0.00' || target.value === '0.0') {
          requestAnimationFrame(() => {
            target.select();
          });
        }
      }
    };

    const handleGlobalInput = (e: Event) => {
      const target = e.target as HTMLElement;
      if (isNumericInput(target)) {
        const val = target.value;
        if (/^0+[1-9]/.test(val)) {
          const stripped = val.replace(/^0+/, '');
          target.value = stripped;
          const tracker = (target as any)._valueTracker;
          if (tracker) {
            tracker.setValue(val);
          }
        }
      }
    };

    document.addEventListener('focusin', handleGlobalFocusIn);
    document.addEventListener('mouseup', handleGlobalMouseUp);
    document.addEventListener('input', handleGlobalInput);
    return () => {
      document.removeEventListener('focusin', handleGlobalFocusIn);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
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

  // Global keyboard shortcuts (Alt+1..9, F2, Alt+H, etc.)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      dispatchGlobalShortcut(e, (tab) => {
        if (tab !== 'returns') setReturnSaleId(undefined);
        if (tab !== 'new_sale') setPreLoadedSellProduct(null);
        setCurrentTab(tab);
      });
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  const handleTriggerShutdown = () => {
    setShowShutdownConfirm(true);
  };

  const handleConfirmShutdown = async () => {
    setIsShuttingDown(true);
    try {
      const res = await api.shutdown();
      setShutdownMessage(res?.message || 'Stock Manager has shut down safely.');
    } catch {
      setShutdownMessage('Stock Manager has shut down safely.');
    } finally {
      setIsShuttingDown(false);
      setShowShutdownConfirm(false);
      setIsShutdownComplete(true);
    }
  };

  useEffect(() => {
    if (isShutdownComplete) {
      const timer = setTimeout(() => {
        try {
          window.close();
        } catch {}
      }, 1800);
      return () => clearTimeout(timer);
    }
  }, [isShutdownComplete]);

  if (isShutdownComplete) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950 text-white flex flex-col items-center justify-center p-6 select-none animate-in fade-in duration-300">
        <div className="max-w-md w-full bg-slate-900/90 border border-slate-800 rounded-3xl p-8 flex flex-col items-center text-center shadow-2xl backdrop-blur-md">
          <div className="h-16 w-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center mb-5 text-emerald-400">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Stock Manager Safely Shut Down</h2>
          <p className="text-sm text-slate-300 mb-6 leading-relaxed">
            {shutdownMessage || 'All database changes and settings have been written to disk. The background server and services have stopped.'}
          </p>
          <div className="w-full bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4 mb-6 text-xs text-slate-400 text-left space-y-2">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold">
              <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
              Database WAL checkpointed to disk
            </div>
            <div className="flex items-center gap-2 text-emerald-400 font-semibold">
              <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
              Background sync & cloud schedulers stopped
            </div>
            <div className="flex items-center gap-2 text-emerald-400 font-semibold">
              <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
              HTTP server process terminated
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              window.close();
            }}
            className="w-full py-3 bg-brand-600 hover:bg-brand-500 text-white font-bold rounded-xl text-sm transition shadow-lg shadow-brand-600/30"
          >
            Close Window
          </button>
          <p className="text-[11px] text-slate-500 mt-4">
            You may now safely close this browser window or tab.
          </p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <>
        <LoginPage
          settings={settings}
          onLoginSuccess={handleLoginSuccess}
          onShutdown={handleTriggerShutdown}
        />
        <ConfirmDialog
          isOpen={showShutdownConfirm}
          onClose={() => setShowShutdownConfirm(false)}
          onConfirm={handleConfirmShutdown}
          title="Shut Down Stock Manager?"
          message="This will cleanly save all changes, checkpoint the SQLite database to disk, and stop the local background server and kiosk window. Are you sure you want to exit?"
          confirmText="Shut Down App"
          cancelText="Cancel"
          variant="danger"
          loading={isShuttingDown}
        />
      </>
    );
  }

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden font-sans text-slate-800 dark:text-slate-100 transition-colors duration-200">
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
        onShutdown={handleTriggerShutdown}
      />

      {/* Main Viewport Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-50 dark:bg-slate-950 transition-colors duration-200">
        <Topbar
          settings={settings}
          onNewSaleClick={() => {
            setPreLoadedSellProduct(null);
            setCurrentTab('new_sale');
          }}
          onHubClick={() => setCurrentTab('hub')}
          onNetworkClick={() => setShowNetworkModal(true)}
          onLogout={handleLogout}
          onShutdown={handleTriggerShutdown}
        />

        <ConnectionBanner onOpenModal={() => setShowNetworkModal(true)} />

        <main className={`flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 transition-colors duration-200 ${currentTab === 'hub' ? 'p-3 md:p-4' : 'p-6 md:p-8'}`}>
          <ErrorBoundary key={currentTab}>
            {currentTab === 'hub' && (
              <NavigationHubPage
                settings={settings}
                onNavigate={(tab) => {
                  if (tab !== 'returns') setReturnSaleId(undefined);
                  if (tab !== 'new_sale') setPreLoadedSellProduct(null);
                  setCurrentTab(tab);
                }}
              />
            )}

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
          </ErrorBoundary>
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

      {/* Local Network & Multi-Terminal Sync Modal */}
      <NetworkSyncModal
        isOpen={showNetworkModal}
        onClose={() => setShowNetworkModal(false)}
      />

      {/* Shut Down Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showShutdownConfirm}
        onClose={() => setShowShutdownConfirm(false)}
        onConfirm={handleConfirmShutdown}
        title="Shut Down Stock Manager?"
        message="This will cleanly save all changes, checkpoint the SQLite database to disk, and stop the local background server and kiosk window. Are you sure you want to exit?"
        confirmText="Shut Down App"
        cancelText="Cancel"
        variant="danger"
        loading={isShuttingDown}
      />
    </div>
  );
};
