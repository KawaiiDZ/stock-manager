import React, { useState } from 'react';
import { Cloud, RefreshCw, CheckCircle2, AlertCircle, Database, ArrowUpRight } from 'lucide-react';
import { useNetwork } from '../../context/NetworkContext';
import { Button } from '../common/Button';

interface SupabaseCloudSyncCardProps {
  onSuccess?: (msg: string) => void;
  onError?: (err: string) => void;
}

export const SupabaseCloudSyncCard: React.FC<SupabaseCloudSyncCardProps> = ({ onSuccess, onError }) => {
  const { supabaseStatus, isSyncing, triggerCloudSync, seedCloudData } = useNetwork();
  const [seeding, setSeeding] = useState(false);

  const handleManualSync = async () => {
    try {
      await triggerCloudSync();
      onSuccess?.('Cloud sync completed successfully!');
    } catch (err: any) {
      onError?.(err.message || 'Cloud sync failed.');
    }
  };

  const handleSeedUpload = async () => {
    const confirmed = window.confirm(
      'Upload complete store data (products, categories, customers, and sales) to Supabase cloud? Existing records will be safely matched by sync UUID.'
    );
    if (!confirmed) return;

    setSeeding(true);
    try {
      const res = await seedCloudData();
      if (res.success) {
        onSuccess?.(res.message || 'Full store data uploaded to Supabase cloud!');
      } else {
        onError?.(res.message || 'Failed to upload store data.');
      }
    } catch (err: any) {
      onError?.(err.message || 'Upload failed.');
    } finally {
      setSeeding(false);
    }
  };

  const isConnected = supabaseStatus?.configured && supabaseStatus?.connected;
  const pendingCount = supabaseStatus?.pending_outbox_count || 0;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-2xl shrink-0">
            <Cloud className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-800 dark:text-white text-base">Supabase Cloud Sync (Optionally Online)</h3>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                  isConnected
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}
                ></span>
                {isConnected ? 'Online & Synced' : 'Ready & Offline'}
              </span>
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
              Zero-latency local SQLite operations with background synchronization to Supabase cloud PostgreSQL.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="md"
            icon={<RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />}
            onClick={handleManualSync}
            disabled={isSyncing || seeding}
          >
            {isSyncing ? 'Syncing...' : 'Sync Now'}
          </Button>

          <Button
            variant="primary"
            size="md"
            icon={<ArrowUpRight className="h-4 w-4" />}
            onClick={handleSeedUpload}
            disabled={isSyncing || seeding}
          >
            {seeding ? 'Uploading...' : 'Seed Store to Cloud'}
          </Button>
        </div>
      </div>

      {/* Status metrics grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
          <span className="text-[11px] text-slate-400 dark:text-slate-500 block font-medium">Cloud Server</span>
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate block mt-0.5" title={supabaseStatus?.url || ''}>
            {supabaseStatus?.url ? supabaseStatus.url.replace('https://', '') : 'Not Configured'}
          </span>
          {isConnected && supabaseStatus?.latency_ms && (
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono mt-0.5 block">
              Ping: {supabaseStatus.latency_ms} ms
            </span>
          )}
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
          <span className="text-[11px] text-slate-400 dark:text-slate-500 block font-medium">Pending Local Outbox</span>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-base font-bold ${pendingCount > 0 ? 'text-amber-600' : 'text-slate-700 dark:text-slate-200'}`}>
              {pendingCount}
            </span>
            <span className="text-[11px] text-slate-400">
              {pendingCount === 0 ? 'All changes saved to cloud' : 'changes queued'}
            </span>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
          <span className="text-[11px] text-slate-400 dark:text-slate-500 block font-medium">Last Cloud Sync</span>
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 block mt-0.5">
            {supabaseStatus?.last_synced_at
              ? new Date(supabaseStatus.last_synced_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
              : 'Continuous background sync'}
          </span>
          <span className="text-[10px] text-slate-400 mt-0.5 block">
            {supabaseStatus?.last_synced_at ? new Date(supabaseStatus.last_synced_at).toLocaleDateString() : 'Auto daemon active'}
          </span>
        </div>
      </div>
    </div>
  );
};
