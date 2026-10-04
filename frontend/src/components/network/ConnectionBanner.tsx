import React from 'react';
import { WifiOff, RefreshCw, CheckCircle2, AlertTriangle, Network } from 'lucide-react';
import { useNetwork } from '../../context/NetworkContext';

interface ConnectionBannerProps {
  onOpenModal: () => void;
}

export const ConnectionBanner: React.FC<ConnectionBannerProps> = ({ onOpenModal }) => {
  const {
    isOnline,
    isHost,
    pendingSyncCount,
    isSyncing,
    syncNow,
    stationName,
  } = useNetwork();

  // If host and online with zero pending commits, don't show any intrusive banner
  if (isHost && isOnline && pendingSyncCount === 0) {
    return null;
  }

  // If connected client and online with zero pending commits, don't show intrusive banner
  if (!isHost && isOnline && pendingSyncCount === 0 && !isSyncing) {
    return null;
  }

  return (
    <div
      className={`px-4 py-2 text-xs font-medium flex items-center justify-between border-b transition-colors ${
        !isOnline
          ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-900/60'
          : isSyncing
          ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-200 border-blue-200 dark:border-blue-900/60'
          : pendingSyncCount > 0
          ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-900/60'
          : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
      }`}
    >
      <div className="flex items-center gap-2 overflow-hidden">
        {!isOnline ? (
          <>
            <WifiOff className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span className="truncate">
              <strong>Working Offline:</strong> Saved safely on this device. Everything will update the Main Counter once reconnected.
            </span>
          </>
        ) : isSyncing ? (
          <>
            <RefreshCw className="h-4 w-4 shrink-0 animate-spin text-blue-600 dark:text-blue-400" />
            <span className="truncate">Sending saved changes to {stationName}...</span>
          </>
        ) : pendingSyncCount > 0 ? (
          <>
            <AlertTriangle className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span className="truncate">
              <strong>{pendingSyncCount} saved change{pendingSyncCount > 1 ? 's' : ''} ready to send</strong> to {stationName}.
            </span>
          </>
        ) : (
          <>
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
            <span className="truncate">Connected to {stationName}</span>
          </>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0 ml-4">
        {pendingSyncCount > 0 && isOnline && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              syncNow();
            }}
            disabled={isSyncing}
            className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${isSyncing ? 'animate-spin' : ''}`} />
            Send Changes ({pendingSyncCount})
          </button>
        )}

        <button
          type="button"
          onClick={onOpenModal}
          className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition shadow-2xs"
        >
          <Network className="h-3 w-3" />
          Connection Details
        </button>
      </div>
    </div>
  );
};
