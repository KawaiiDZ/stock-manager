import React, { useState } from 'react';
import { BusinessSettings } from '../../types';
import {
  LayoutDashboard,
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
  Pin,
  FileText,
  Compass,
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
  pendingQuotationsCount?: number;
  settings?: BusinessSettings | null;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onTabChange,
  urgentBillsCount = 0,
  pendingQuotationsCount = 0,
  settings,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isPinned, setIsPinned] = useState(false);

  const isExpanded = isPinned || isHovered;

  const navSections: NavSection[] = [
    {
      title: null,
      items: [
        ...(settings?.enable_navigation_hub !== false
          ? [
              {
                id: 'hub',
                label: 'Navigation Hub',
                icon: <Compass className="h-5 w-5 text-indigo-400" />,
              },
            ]
          : []),
        { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-5 w-5" /> },
      ],
    },
    {
      title: 'SALES',
      items: [
        {
          id: 'new_sale',
          label: 'SELL NOW',
          icon: <Zap className="h-5 w-5 text-amber-300" />,
          isSellButton: true,
        },
        { id: 'sales_history', label: 'Sales History', icon: <History className="h-5 w-5" /> },
        ...(settings?.enable_quotations !== false
          ? [
              {
                id: 'quotations',
                label: 'Active Quotations',
                icon: <FileText className="h-5 w-5" />,
                badge: pendingQuotationsCount > 0 ? pendingQuotationsCount : undefined,
              },
            ]
          : []),
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
    <div
      className={`shrink-0 transition-all duration-300 ease-in-out relative z-40 ${
        isPinned ? 'w-64' : 'w-20'
      }`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <aside
        className={`h-screen bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col select-none transition-all duration-300 ease-in-out ${
          isExpanded
            ? 'w-64 shadow-2xl shadow-slate-900/15'
            : 'w-20 shadow-none'
        } ${!isPinned ? 'absolute inset-y-0 left-0' : 'w-64'}`}
      >
        {/* Brand Header */}
        <div className="h-16 flex items-center px-4 border-b border-slate-100 dark:border-slate-800 justify-between overflow-hidden">
          {isExpanded ? (
            <>
              <div className="flex items-center gap-2 min-w-0">
                <img
                  src={settings?.logo_path || '/stokflow-logo.png'}
                  alt={settings?.business_name || 'StokFlow'}
                  className="h-8 w-auto max-w-[125px] object-contain dark:brightness-110"
                />
                <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-full bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300 tracking-wider shrink-0">
                  v1.0
                </span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsPinned(!isPinned);
                }}
                className={`p-1.5 rounded-lg text-xs transition ${
                  isPinned
                    ? 'text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-950/50 hover:bg-brand-100 dark:hover:bg-brand-900/50'
                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
                title={isPinned ? 'Unpin sidebar (collapse to icons)' : 'Pin sidebar expanded'}
              >
                <Pin className={`h-4 w-4 transition-transform ${isPinned ? 'rotate-45 text-brand-700 dark:text-brand-300' : ''}`} />
              </button>
            </>
          ) : (
            <div className="w-full flex justify-center">
              {settings?.logo_path ? (
                <img
                  src={settings.logo_path}
                  alt={settings.business_name || 'Logo'}
                  className="h-9 w-9 object-contain rounded-xl dark:brightness-110"
                />
              ) : (
                <div className="h-9 w-9 rounded-xl bg-brand-600 text-white flex items-center justify-center font-black text-sm shadow-sm shadow-brand-600/30">
                  {(settings?.business_name || 'SF').substring(0, 2).toUpperCase()}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Navigation List */}
        <nav className="flex-1 overflow-y-auto px-2.5 py-3 space-y-3 overflow-x-hidden">
          {navSections.map((section, idx) => (
            <div key={idx}>
              {section.title && (
                isExpanded ? (
                  <p className="px-3 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 whitespace-nowrap">
                    {section.title}
                  </p>
                ) : (
                  <div className="my-2 border-t border-slate-100 dark:border-slate-800 mx-1.5" />
                )
              )}
              <div className="space-y-1">
                {section.items.map((item) => {
                  const isActive = currentTab === item.id;
                  if (item.isSellButton) {
                    return (
                      <button
                        key={item.id}
                        onClick={() => onTabChange(item.id)}
                        title={!isExpanded ? item.label : undefined}
                        className={`flex items-center transition-all mb-2 ${
                          isExpanded
                            ? 'w-full justify-between px-3.5 py-2.5 rounded-2xl text-sm font-black'
                            : 'w-11 h-11 mx-auto justify-center rounded-xl'
                        } ${
                          isActive
                            ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/30 ring-2 ring-brand-500'
                            : 'bg-brand-600 hover:bg-brand-700 text-white hover:opacity-95 shadow-md shadow-brand-600/20'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="shrink-0">{item.icon}</span>
                          {isExpanded && (
                            <span className="whitespace-nowrap text-xs font-black">{item.label}</span>
                          )}
                        </div>
                        {isExpanded && (
                          <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded-full font-mono shrink-0">
                            POS
                          </span>
                        )}
                      </button>
                    );
                  }

                  return (
                    <button
                      key={item.id}
                      onClick={() => onTabChange(item.id)}
                      title={!isExpanded ? item.label : undefined}
                      className={`flex items-center transition-all relative ${
                        isExpanded
                          ? 'w-full justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium'
                          : 'w-11 h-11 mx-auto justify-center rounded-xl'
                      } ${
                        isActive
                          ? 'bg-slate-900 dark:bg-slate-800 text-white dark:text-slate-100 shadow-sm font-bold'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="shrink-0">{item.icon}</span>
                        {isExpanded && (
                          <span className="whitespace-nowrap text-xs font-semibold truncate">
                            {item.label}
                          </span>
                        )}
                      </div>
                      {item.badge !== undefined && (
                        isExpanded ? (
                          <span className="bg-rose-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0">
                            {item.badge}
                          </span>
                        ) : (
                          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-900" />
                        )
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer info */}
        <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/60 flex items-center justify-between text-xs text-slate-400 dark:text-slate-500 overflow-hidden">
          {isExpanded ? (
            <>
              <span className="flex items-center gap-1.5 whitespace-nowrap text-[11px]">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                Ready & Offline
              </span>
              <span className="text-[10px] whitespace-nowrap">v2.1.0</span>
            </>
          ) : (
            <div className="w-full flex justify-center py-0.5" title="Ready & Offline (v2.1.0)">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
};
