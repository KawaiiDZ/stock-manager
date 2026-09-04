import React from 'react';
import { BusinessSettings } from '../../types';
import {
  LayoutDashboard,
  ShoppingCart,
  History,
  RotateCcw,
  Package,
  ArrowLeftRight,
  Truck,
  Users,
  Building2,
  Receipt,
  Wallet,
  BarChart3,
  Settings,
  Zap,
} from 'lucide-react';

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  isSellButton?: boolean;
  badge?: number;
}

interface NavSection {
  title: string | null;
  items: NavItem[];
}

interface SidebarProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  urgentBillsCount?: number;
  settings?: BusinessSettings | null;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onTabChange,
  urgentBillsCount = 0,
  settings,
}) => {
  const navSections: NavSection[] = [
    {
      title: null,
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-5 w-5" /> },
      ],
    },
    {
      title: 'SALES',
      items: [
        {
          id: 'new_sale',
          label: 'SELL NOW (F2)',
          icon: <Zap className="h-5 w-5 text-amber-300" />,
          isSellButton: true,
        },
        { id: 'sales_history', label: 'Sales History', icon: <History className="h-5 w-5" /> },
        { id: 'returns', label: 'Returns', icon: <RotateCcw className="h-5 w-5" /> },
      ],
    },
    {
      title: 'INVENTORY',
      items: [
        { id: 'products', label: 'Products & Stock', icon: <Package className="h-5 w-5" /> },
        { id: 'stock_movements', label: 'Stock Movements', icon: <ArrowLeftRight className="h-5 w-5" /> },
        { id: 'purchases', label: 'Purchases', icon: <Truck className="h-5 w-5" /> },
      ],
    },
    {
      title: 'PEOPLE',
      items: [
        { id: 'customers', label: 'Customers', icon: <Users className="h-5 w-5" /> },
        { id: 'suppliers', label: 'Suppliers', icon: <Building2 className="h-5 w-5" /> },
      ],
    },
    {
      title: 'MONEY',
      items: [
        {
          id: 'bills',
          label: 'Bills',
          icon: <Receipt className="h-5 w-5" />,
          badge: urgentBillsCount > 0 ? urgentBillsCount : undefined,
        },
        { id: 'expenses', label: 'Expenses', icon: <Wallet className="h-5 w-5" /> },
      ],
    },
    {
      title: null,
      items: [
        { id: 'reports', label: 'Reports', icon: <BarChart3 className="h-5 w-5" /> },
        { id: 'settings', label: 'Settings', icon: <Settings className="h-5 w-5" /> },
      ],
    },
  ];

  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col h-screen select-none shrink-0">
      {/* Brand Header */}
      <div className="h-16 flex items-center px-5 border-b border-slate-100 justify-between">
        <div className="flex items-center gap-2.5">
          <img
            src={settings?.logo_path || '/stokflow-logo.png'}
            alt={settings?.business_name || 'StokFlow'}
            className="h-8 w-auto max-w-[145px] object-contain"
          />
        </div>
        <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 tracking-wider">
          v1.0
        </span>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
        {navSections.map((section, idx) => (
          <div key={idx}>
            {section.title && (
              <p className="px-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                {section.title}
              </p>
            )}
            <div className="space-y-1">
              {section.items.map((item) => {
                const isActive = currentTab === item.id;
                if (item.isSellButton) {
                  return (
                    <button
                      key={item.id}
                      onClick={() => onTabChange(item.id)}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-black transition-all mb-2 ${
                        isActive
                          ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 ring-2 ring-emerald-500'
                          : 'bg-gradient-to-r from-emerald-600 to-teal-700 text-white hover:opacity-95 shadow-md shadow-emerald-600/20'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        {item.icon}
                        <span>{item.label}</span>
                      </div>
                      <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full font-mono">
                        POS
                      </span>
                    </button>
                  );
                }

                return (
                  <button
                    key={item.id}
                    onClick={() => onTabChange(item.id)}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-slate-900 text-white shadow-sm font-bold'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span>{item.icon}</span>
                      <span>{item.label}</span>
                    </div>
                    {item.badge !== undefined && (
                      <span className="bg-rose-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer info */}
      <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between text-xs text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
          Ready & Offline
        </span>
        <span>v1.0.0</span>
      </div>
    </aside>
  );
};
