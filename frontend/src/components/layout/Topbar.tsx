import React from 'react';
import { BusinessSettings } from '../../types';
import { ShoppingCart, LogOut, Store, Zap } from 'lucide-react';
import { Button } from '../common/Button';

interface TopbarProps {
  settings: BusinessSettings | null;
  onNewSaleClick: () => void;
  onLogout: () => void;
}

export const Topbar: React.FC<TopbarProps> = ({
  settings,
  onNewSaleClick,
  onLogout,
}) => {
  return (
    <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0">
      {/* Shop Info */}
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700">
          <Store className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-slate-800 leading-tight">
            {settings?.business_name || 'My Local Business'}
          </h2>
          <p className="text-[11px] text-slate-400">
            {settings?.phone || 'Offline Mode'} {settings?.address ? `• ${settings.address}` : ''}
          </p>
        </div>
      </div>

      {/* Right actions: Big Sell Button + User Logout */}
      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          size="md"
          icon={<Zap className="h-4 w-4 text-amber-300 fill-amber-300" />}
          onClick={onNewSaleClick}
          className="font-black px-5 py-2 rounded-xl shadow-md shadow-emerald-600/20 bg-gradient-to-r from-emerald-600 to-teal-700 text-white hover:opacity-95"
        >
          SELL NOW (F2)
        </Button>

        <div className="h-6 w-px bg-slate-200 mx-1"></div>

        <button
          onClick={onLogout}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition"
          title="Sign out of system"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
};
