import React, { useState, useEffect } from 'react';
import { BusinessSettings } from '../../types';
import { api } from '../../services/api';
import { formatCurrency } from '../../utils/format';
import { SHORTCUT_REGISTRY } from '../../utils/shortcuts';
import {
  ShoppingCart,
  Package,
  Truck,
  Users,
  Wallet,
  BarChart3,
  FileText,
  Settings,
  ArrowRight,
  Zap,
  TrendingUp,
  AlertCircle,
  Clock,
  Compass,
  Keyboard,
  ShieldCheck,
  Search,
  Sun,
  Sunset,
  Moon,
} from 'lucide-react';

interface NavigationHubPageProps {
  settings: BusinessSettings | null;
  onNavigate: (tab: string) => void;
}

const getTimeGreeting = (businessName?: string) => {
  const hour = new Date().getHours();
  const name = businessName?.trim() ? `, ${businessName.trim()}` : '';
  if (hour >= 5 && hour < 12) {
    return {
      title: `Good morning${name}!`,
      message: 'Ready for a productive day? Here is your department overview.',
      icon: <Sun className="h-4 w-4 text-amber-400 shrink-0" />,
    };
  } else if (hour >= 12 && hour < 17) {
    return {
      title: `Good afternoon${name}!`,
      message: 'Here is your mid-day store overview and department status.',
      icon: <Sun className="h-4 w-4 text-amber-300 shrink-0" />,
    };
  } else if (hour >= 17 && hour < 22) {
    return {
      title: `Good evening${name}!`,
      message: 'Here is your evening operational summary and quick access links.',
      icon: <Sunset className="h-4 w-4 text-orange-400 shrink-0" />,
    };
  } else {
    return {
      title: `Working late${name}?`,
      message: 'Here is your store summary and department quick access.',
      icon: <Moon className="h-4 w-4 text-indigo-300 shrink-0" />,
    };
  }
};

export const NavigationHubPage: React.FC<NavigationHubPageProps> = ({
  settings,
  onNavigate,
}) => {
  const currency = settings?.currency || 'Rs.';
  const greetingData = getTimeGreeting(settings?.business_name);

  const [stats, setStats] = useState<{
    today_sales_revenue?: number;
    today_gross_profit?: number;
    customer_outstanding?: number;
    supplier_outstanding?: number;
  } | null>(null);

  const [productMetrics, setProductMetrics] = useState<{
    total: number;
    outOfStock: number;
    lowStock: number;
  }>({
    total: 0,
    outOfStock: 0,
    lowStock: 0,
  });
  const [customerCount, setCustomerCount] = useState<number>(0);
  const [urgentBillsCount, setUrgentBillsCount] = useState<number>(0);
  const [pendingQuotesCount, setPendingQuotesCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchFilter, setSearchFilter] = useState<string>('');

  useEffect(() => {
    let isMounted = true;
    const loadHubData = async () => {
      try {
        const [dashStats, products, customers, billsAttention, quotes] = await Promise.all([
          api.getDashboardStats().catch(() => null),
          api.getProducts().catch(() => []),
          api.getCustomers().catch(() => []),
          api.getBillsAttention().catch(() => []),
          settings?.enable_quotations !== false ? api.getQuotations('PENDING').catch(() => []) : Promise.resolve([]),
        ]);

        if (!isMounted) return;

        if (dashStats) {
          setStats({
            today_sales_revenue: Number(dashStats.today_sales_revenue || 0),
            today_gross_profit: Number(dashStats.today_gross_profit || 0),
            customer_outstanding: Number(dashStats.customer_outstanding || 0),
            supplier_outstanding: Number(dashStats.supplier_outstanding || 0),
          });
        }

        const prods = Array.isArray(products) ? products : [];
        const activeProds = prods.filter((p: any) => p.is_active !== false);

        // Out of stock / depleted items (matches ProductsPage "Needs Restock" queue)
        const outOfStock = activeProds.filter(
          (p: any) => Number(p.current_stock ?? 0) <= 0
        ).length;

        // Low stock items (stock > 0 and <= reorder threshold or 5)
        const lowStock = activeProds.filter((p: any) => {
          const currentStock = Number(p.current_stock ?? 0);
          const reorderThreshold = p.reorder_level != null ? Number(p.reorder_level) : 5;
          return currentStock > 0 && currentStock <= reorderThreshold;
        }).length;

        setProductMetrics({ total: activeProds.length, outOfStock, lowStock });

        setCustomerCount(Array.isArray(customers) ? customers.length : 0);
        setUrgentBillsCount(Array.isArray(billsAttention) ? billsAttention.length : 0);
        setPendingQuotesCount(Array.isArray(quotes) ? quotes.length : 0);
      } catch (err) {
        console.error('Failed to load navigation hub telemetry:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadHubData();
    return () => {
      isMounted = false;
    };
  }, [settings?.enable_quotations]);

  const cards = [
    {
      id: 'pos',
      tab: 'new_sale',
      title: 'Point of Sale (POS)',
      subtitle: 'Cash Register & Checkout',
      description: 'Rapid barcode scanner checkout, split payments, instant receipt printing & drawer control.',
      shortcut: SHORTCUT_REGISTRY.pos.displayKey,
      icon: <ShoppingCart className="h-5 w-5 text-emerald-600" />,
      accentColor: 'from-emerald-500 to-teal-600',
      badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-100',
      primaryAction: 'Launch POS Register',
      subLinks: [
        { label: 'Sales History', tab: 'sales_history' },
        { label: 'Returns', tab: 'returns' },
      ],
      stats: [
        {
          label: "Today's Sales",
          value: formatCurrency(stats?.today_sales_revenue || 0, currency),
          highlight: (stats?.today_sales_revenue || 0) > 0,
        },
      ],
    },
    {
      id: 'products',
      tab: 'products',
      title: 'Products & Inventory',
      subtitle: 'Stock & Catalog Management',
      description: 'Inventory levels, barcode labels, wholesale/retail pricing tiers, categories & reorder thresholds.',
      shortcut: SHORTCUT_REGISTRY.products.displayKey,
      icon: <Package className="h-5 w-5 text-blue-600" />,
      accentColor: 'from-blue-500 to-indigo-600',
      badgeBg: 'bg-blue-50 text-blue-700 border-blue-100',
      primaryAction: 'Manage Inventory',
      subLinks: [
        { label: 'Stock Movements', tab: 'stock_movements' },
      ],
      stats: [
        { label: 'Active Items', value: `${productMetrics.total} SKUs` },
        {
          label: 'Needs Restock',
          value:
            productMetrics.outOfStock > 0
              ? `${productMetrics.outOfStock} items`
              : 'All stocked',
          warn: productMetrics.outOfStock > 0,
          highlight: productMetrics.outOfStock === 0,
        },
      ],
    },
    {
      id: 'purchases',
      tab: 'purchases',
      title: 'Purchases & Restock',
      subtitle: 'Vendor Receiving & Stock Intake',
      description: 'Inbound inventory purchase orders, batch costs, unit receiving records & vendor balance updates.',
      shortcut: SHORTCUT_REGISTRY.purchases.displayKey,
      icon: <Truck className="h-5 w-5 text-teal-600" />,
      accentColor: 'from-teal-500 to-cyan-600',
      badgeBg: 'bg-teal-50 text-teal-700 border-teal-100',
      primaryAction: 'New Purchase Order',
      subLinks: [
        { label: 'Suppliers Directory', tab: 'suppliers' },
      ],
      stats: [
        {
          label: 'Vendor Payables',
          value: formatCurrency(stats?.supplier_outstanding || 0, currency),
          warn: (stats?.supplier_outstanding || 0) > 0,
        },
        {
          label: 'Restock Queue',
          value:
            productMetrics.outOfStock > 0
              ? `${productMetrics.outOfStock} need restock`
              : 'No restock required',
          warn: productMetrics.outOfStock > 0,
          highlight: productMetrics.outOfStock === 0,
        },
      ],
    },
    {
      id: 'customers',
      tab: 'customers',
      title: 'Customers & CRM',
      subtitle: 'Ledger, Debt & Credit Accounts',
      description: 'Customer profiles, transaction histories, credit balances, ledger statements & payment receipts.',
      shortcut: SHORTCUT_REGISTRY.customers.displayKey,
      icon: <Users className="h-5 w-5 text-indigo-600" />,
      accentColor: 'from-indigo-500 to-violet-600',
      badgeBg: 'bg-indigo-50 text-indigo-700 border-indigo-100',
      primaryAction: 'Customer Ledger',
      subLinks: [],
      stats: [
        { label: 'Registered', value: `${customerCount} Accounts` },
        {
          label: 'Receivables',
          value: formatCurrency(stats?.customer_outstanding || 0, currency),
          warn: (stats?.customer_outstanding || 0) > 0,
        },
      ],
    },
    {
      id: 'expenses',
      tab: 'expenses',
      title: 'Bills & Operating Expenses',
      subtitle: 'Cash Outflow & Due Utilities',
      description: 'Operational expenses, daily petty cash, shop rent, utility bills & payable reminders.',
      shortcut: SHORTCUT_REGISTRY.expenses.displayKey,
      icon: <Wallet className="h-5 w-5 text-amber-600" />,
      accentColor: 'from-amber-500 to-orange-600',
      badgeBg: 'bg-amber-50 text-amber-700 border-amber-100',
      primaryAction: 'Track Expenses',
      subLinks: [
        { label: 'Urgent Bills', tab: 'bills' },
      ],
      stats: [
        {
          label: 'Due Bills',
          value: urgentBillsCount > 0 ? `${urgentBillsCount} urgent` : 'All clear',
          warn: urgentBillsCount > 0,
        },
      ],
    },
    {
      id: 'reports',
      tab: 'reports',
      title: 'Reports & Analytics',
      subtitle: 'Financial Audits & Intelligence',
      description: 'Comprehensive Profit & Loss statements, top seller analysis, daily registers & tax reports.',
      shortcut: SHORTCUT_REGISTRY.reports.displayKey,
      icon: <BarChart3 className="h-5 w-5 text-purple-600" />,
      accentColor: 'from-purple-500 to-pink-600',
      badgeBg: 'bg-purple-50 text-purple-700 border-purple-100',
      primaryAction: 'Financial Analytics',
      subLinks: [
        { label: 'Executive Dashboard', tab: 'dashboard' },
      ],
      stats: [
        {
          label: "Today's Profit",
          value: formatCurrency(stats?.today_gross_profit || 0, currency),
          highlight: (stats?.today_gross_profit || 0) > 0,
        },
      ],
    },
    ...(settings?.enable_quotations !== false
      ? [
          {
            id: 'quotations',
            tab: 'quotations',
            title: 'Quotations & Estimates',
            subtitle: 'Client Proposals & Offers',
            description: 'Customer price estimates, offer validity periods, terms and 1-click conversion into invoices.',
            shortcut: SHORTCUT_REGISTRY.quotations.displayKey,
            icon: <FileText className="h-5 w-5 text-sky-600" />,
            accentColor: 'from-sky-500 to-blue-600',
            badgeBg: 'bg-sky-50 text-sky-700 border-sky-100',
            primaryAction: 'Review Quotations',
            subLinks: [],
            stats: [
              {
                label: 'Active Offers',
                value: `${pendingQuotesCount} pending`,
                highlight: pendingQuotesCount > 0,
              },
            ],
          },
        ]
      : []),
    {
      id: 'settings',
      tab: 'settings',
      title: 'Settings & Hardware',
      subtitle: 'Printers, Schema & Backups',
      description: 'Thermal receipt printers, ESC/POS hardware spoolers, sales tax rates, custom fields & local backups.',
      shortcut: SHORTCUT_REGISTRY.settings.displayKey,
      icon: <Settings className="h-5 w-5 text-slate-700" />,
      accentColor: 'from-slate-600 to-slate-800',
      badgeBg: 'bg-slate-100 text-slate-700 border-slate-200',
      primaryAction: 'Open System Settings',
      subLinks: [],
      stats: [
        {
          label: 'Thermal Mode',
          value: settings?.thermal_print_mode === 'direct_escpos' ? 'Direct ESC/POS' : 'Browser Dialog',
        },
      ],
    },
  ];

  const filteredCards = cards.filter((c) => {
    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase();
    return (
      c.title.toLowerCase().includes(q) ||
      c.subtitle.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q) ||
      c.shortcut.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-3 pb-2 animate-fadeIn max-w-7xl mx-auto">
      {/* Sleek Compact Header Bar with Time-of-Day Greeting */}
      <div className="relative rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white px-4 py-2.5 sm:px-5 sm:py-3 shadow-md border border-slate-800">
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Left: Dynamic Time-of-Day Greeting & Contextual Subtext */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center shrink-0">
              {greetingData.icon}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-sm sm:text-base font-black tracking-tight text-white truncate">
                  {greetingData.title}
                </h1>
                <span className="hidden md:inline-block text-[11px] font-medium text-slate-300">
                  • {greetingData.message}
                </span>
              </div>
              <p className="text-[11px] text-slate-300 md:hidden truncate">
                {greetingData.message}
              </p>
            </div>
          </div>

          {/* Right: Quick Search Filter */}
          <div className="relative shrink-0 sm:w-60">
            <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Filter departments..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-full pl-8.5 pr-7 py-1.5 rounded-xl bg-white/10 border border-white/15 text-white placeholder-slate-400 text-xs font-semibold focus:outline-none focus:bg-white/15 focus:border-indigo-400 backdrop-blur-sm transition"
            />
            {searchFilter && (
              <button
                type="button"
                onClick={() => setSearchFilter('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Cards Grid: 4 columns on large screens for a neat 4x2 matrix */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {filteredCards.map((card) => (
          <div
            key={card.id}
            onClick={() => onNavigate(card.tab)}
            className="group relative bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-4 shadow-2xs hover:shadow-lg hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-200 flex flex-col justify-between cursor-pointer overflow-hidden hover:-translate-y-0.5"
          >
            {/* Top Row: Icon Badge & Corner Shortcut Pill */}
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="h-9 w-9 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 flex items-center justify-center group-hover:scale-105 group-hover:bg-slate-100/80 dark:group-hover:bg-slate-700 transition-all duration-200 shadow-2xs">
                {card.icon}
              </div>

              {/* Corner Shortcut Badge */}
              <kbd
                className="inline-flex items-center justify-center px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 group-hover:bg-slate-900 dark:group-hover:bg-slate-700 group-hover:text-amber-300 text-slate-600 dark:text-slate-300 border border-slate-200/90 dark:border-slate-700 font-sans text-[11px] font-bold tracking-tight shadow-2xs transition-colors shrink-0"
                title={`Keyboard Shortcut: ${card.shortcut}`}
              >
                {card.shortcut}
              </kbd>
            </div>

            {/* Department Title & Subtitle */}
            <div className="space-y-0.5 mb-2">
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm group-hover:text-brand-600 transition-colors truncate">
                {card.title}
              </h3>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {card.subtitle}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal pt-0.5 line-clamp-1">
                {card.description}
              </p>
            </div>

            {/* Middle: Useful Live Metrics / Badges */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 mb-2.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                {card.stats.map((st, i) => (
                  <div
                    key={i}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold border flex items-center gap-1 ${
                      (st as any).warn
                        ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'
                        : (st as any).highlight
                        ? 'bg-brand-50 dark:bg-brand-950/40 border-brand-200 dark:border-brand-800 text-brand-800 dark:text-brand-300'
                        : 'bg-slate-50 dark:bg-slate-800 border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <span className="text-slate-400 dark:text-slate-500 text-[9px] uppercase">{st.label}:</span>
                    <span>{st.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom Row: Action Pill & Sub Links */}
            <div className="pt-0.5 flex items-center justify-between gap-1.5">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigate(card.tab);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 dark:bg-slate-800 group-hover:bg-brand-600 text-white text-[11px] font-bold transition shadow-2xs"
              >
                <span>{card.primaryAction}</span>
                <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
              </button>

              {card.subLinks.length > 0 && (
                <div className="flex items-center gap-1.5">
                  {card.subLinks.map((sub, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onNavigate(sub.tab);
                      }}
                      className="px-2 py-0.5 rounded-md text-[10px] font-semibold text-slate-500 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 bg-slate-100/70 dark:bg-slate-800/70 hover:bg-brand-50 dark:hover:bg-brand-950/50 transition"
                    >
                      {sub.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
