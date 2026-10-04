import React from 'react';
import { BusinessSettings } from '../../types';
import { ShoppingCart, LogOut, Store, Zap, Compass, Sun, Moon, Radio, Wifi, WifiOff } from 'lucide-react';
import { Button } from '../common/Button';
import { useTheme } from '../../context/ThemeContext';
import { useNetwork } from '../../context/NetworkContext';

interface TopbarProps {
  settings: BusinessSettings | null;
  onNewSaleClick: () => void;
  onHubClick?: () => void;
  onNetworkClick?: () => void;
  onLogout: () => void;
}

export const Topbar: React.FC<TopbarProps> = ({
  settings,
  onNewSaleClick,
  onHubClick,
  onNetworkClick,
  onLogout,
}) => {
  const { effectiveMode, toggleDarkMode } = useTheme();
  const { isOnline, isHost, pendingSyncCount, isSyncing } = useNetwork();

  return (
    <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 flex items-center justify-between shrink-0 transition-colors">
      {/* Shop Info */}
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-300">
          <Store className="h-4 w-4 text-brand-600" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 leading-tight">
            {settings?.business_name || 'My Local Business'}
          </h2>
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            {settings?.phone || 'Offline Mode'} {settings?.address ? `• ${settings.address}` : ''}
          </p>
        </div>
      </div>

      {/* Right actions: Network Pill + Theme Toggle + Navigation Hub + Big Sell Button + User Logout */}
      <div className="flex items-center gap-3">
        {/* Network & Multi-Terminal Sync Pill */}
        {onNetworkClick && (
          <button
            type="button"
            onClick={onNetworkClick}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-xl border transition shadow-2xs ${
              !isOnline
                ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                : pendingSyncCount > 0
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                : isHost
                ? 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                : 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
            }`}
            title="Local Network & Multi-Terminal Status"
          >
            {!isOnline ? (
              <WifiOff className="h-3.5 w-3.5 text-amber-500" />
            ) : isSyncing ? (
              <Radio className="h-3.5 w-3.5 text-blue-500 animate-pulse" />
            ) : (
              <Wifi className={`h-3.5 w-3.5 ${isHost ? 'text-emerald-500' : 'text-blue-500'}`} />
            )}
            <span className="hidden sm:inline">
              {!isOnline ? 'Offline' : isHost ? 'Host' : 'Terminal'}
            </span>
            {pendingSyncCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-600 text-white font-bold">
                {pendingSyncCount}
              </span>
            )}
          </button>
        )}
        {/* Quick Theme Toggle */}
        <button
          type="button"
          onClick={toggleDarkMode}
          className="p-2 rounded-xl border border-slate-200/80 dark:border-slate-750 bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
          title={`Switch to ${effectiveMode === 'dark' ? 'Light' : 'Dark'} Mode`}
        >
          {effectiveMode === 'dark' ? (
            <Sun className="h-4 w-4 text-amber-400 animate-in spin-in-180 duration-200" />
          ) : (
            <Moon className="h-4 w-4 text-slate-600 animate-in spin-in-180 duration-200" />
          )}
        </button>

        {settings?.enable_navigation_hub !== false && onHubClick && (
          <button
            type="button"
            onClick={onHubClick}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-xl transition shadow-2xs"
            title="Open Central Navigation Hub"
          >
            <Compass className="h-4 w-4 text-indigo-500 dark:text-indigo-400" />
            <span className="hidden sm:inline">Hub</span>
          </button>
        )}

        <Button
          variant="primary"
          size="md"
          icon={<Zap className="h-4 w-4 text-amber-300 fill-amber-300" />}
          onClick={onNewSaleClick}
          className="font-black px-5 py-2 rounded-xl shadow-md shadow-brand-600/20 bg-brand-600 hover:bg-brand-700 text-white hover:opacity-95"
        >
          SELL NOW
        </Button>

        <div className="h-6 w-px bg-slate-200 dark:bg-slate-800 mx-1"></div>

        <button
          onClick={onLogout}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl transition"
          title="Sign out of system"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
};
