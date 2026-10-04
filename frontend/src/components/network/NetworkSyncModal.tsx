import React, { useState, useEffect } from 'react';
import {
  X,
  Radio,
  Search,
  Wifi,
  WifiOff,
  Server,
  Laptop,
  CheckCircle2,
  RefreshCw,
  Copy,
  Check,
  AlertCircle,
  Lock,
  ArrowRight,
  Layers,
  Database
} from 'lucide-react';
import { useNetwork } from '../../context/NetworkContext';
import { api } from '../../services/api';
import { DiscoveredHost, SyncCommit } from '../../types';
import { getPendingCommits } from '../../services/offlineQueue';

interface NetworkSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NetworkSyncModal: React.FC<NetworkSyncModalProps> = ({ isOpen, onClose }) => {
  const {
    isOnline,
    isHost,
    remoteHostUrl,
    stationName,
    lanIp,
    pendingSyncCount,
    isSyncing,
    lastSyncTime,
    lastSyncResult,
    syncStatusMessage,
    connectToHost,
    disconnectFromHost,
    syncNow,
    refreshStatus,
  } = useNetwork();

  const [scanning, setScanning] = useState(false);
  const [discoveredHosts, setDiscoveredHosts] = useState<DiscoveredHost[]>([]);
  const [copiedIp, setCopiedIp] = useState(false);

  // Manual connect inputs
  const [manualIp, setManualIp] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connectSuccess, setConnectSuccess] = useState<string | null>(null);

  // Selected host for credential input
  const [targetHostUrl, setTargetHostUrl] = useState<string>('');

  const [pendingList, setPendingList] = useState<SyncCommit[]>([]);

  useEffect(() => {
    if (isOpen) {
      setPendingList(getPendingCommits());
      refreshStatus();
      setConnectError(null);
      setConnectSuccess(null);
    }
  }, [isOpen, refreshStatus]);

  if (!isOpen) return null;

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(`http://${lanIp}:8000`);
    setCopiedIp(true);
    setTimeout(() => setCopiedIp(false), 2000);
  };

  const handleScan = async () => {
    setScanning(true);
    setConnectError(null);
    try {
      const res = await api.network.discover(true);
      if (res && res.hosts) {
        // Exclude own IP if discovered
        const filtered = res.hosts.filter(h => h.discovered_ip !== lanIp && h.ip !== lanIp);
        setDiscoveredHosts(filtered);
      }
    } catch (err: any) {
      setConnectError('Network scan failed: ' + (err.message || 'Unknown error'));
    } finally {
      setScanning(false);
    }
  };

  const handleConnect = async (urlToConnect: string) => {
    setConnectError(null);
    setConnectSuccess(null);

    const res = await connectToHost(urlToConnect, username.trim() || undefined, password || undefined);
    if (res.success) {
      setConnectSuccess(res.message);
      setTargetHostUrl('');
      setPassword('');
      setPendingList(getPendingCommits());
    } else {
      setConnectError(res.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-brand-50 dark:bg-brand-950/50 flex items-center justify-center text-brand-600 dark:text-brand-400">
              <Radio className="h-5 w-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 leading-tight">
                Local Network & Multi-Terminal Sync
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Connect secondary stations to restock inventory in real-time with zero cashier downtime.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Node Identity Card */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200">
                {isHost ? <Server className="h-5 w-5 text-emerald-600" /> : <Laptop className="h-5 w-5 text-blue-600" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                    {isHost ? 'Host Register' : 'Client Terminal'}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Status: {isOnline ? 'Online' : 'Offline'}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 mt-1">
                  {stationName}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                  LAN Address: http://{lanIp}:8000
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyUrl}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition"
              >
                {copiedIp ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedIp ? 'Copied' : 'Copy LAN URL'}
              </button>
            </div>
          </div>

          {/* Connected State / Disconnect Action */}
          {!isHost && remoteHostUrl && (
            <div className="p-4 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/50 dark:bg-blue-950/30 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-blue-800 dark:text-blue-300">
                  Connected to Remote Host:
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-400 font-mono mt-0.5">
                  {remoteHostUrl}
                </p>
              </div>
              <button
                type="button"
                onClick={disconnectFromHost}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
              >
                Disconnect & Use Local
              </button>
            </div>
          )}

          {/* Connect Section (If Host or switching host) */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Connect To Counter Host
              </h3>
              <button
                type="button"
                onClick={handleScan}
                disabled={scanning}
                className="flex items-center gap-1.5 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline disabled:opacity-50"
              >
                <Search className={`h-3.5 w-3.5 ${scanning ? 'animate-spin' : ''}`} />
                {scanning ? 'Scanning Network...' : 'Scan Local Network'}
              </button>
            </div>

            {/* Discovered Hosts List */}
            {discoveredHosts.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                  Found {discoveredHosts.length} Host{discoveredHosts.length > 1 ? 's' : ''} on LAN:
                </p>
                <div className="grid gap-2">
                  {discoveredHosts.map((h, i) => (
                    <div
                      key={i}
                      className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 flex items-center justify-between"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                            {h.station_name}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-mono">
                            v{h.version}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                          {h.url} ({h.discovery_method === 'udp' ? 'UDP Beacon' : 'Subnet Probe'})
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setTargetHostUrl(h.url);
                          setManualIp(h.url);
                        }}
                        className="px-3 py-1.5 text-xs font-bold rounded-lg bg-brand-600 hover:bg-brand-700 text-white transition flex items-center gap-1"
                      >
                        Select <ArrowRight className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Manual Connect / Host Credentials Form */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Host URL or IP Address
                </label>
                <input
                  type="text"
                  placeholder="e.g. http://192.168.1.50:8000"
                  value={targetHostUrl || manualIp}
                  onChange={(e) => {
                    setTargetHostUrl(e.target.value);
                    setManualIp(e.target.value);
                  }}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                    <Lock className="h-3 w-3 text-slate-400" /> Host Username
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. warehouse_staff"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                    <Lock className="h-3 w-3 text-slate-400" /> Password
                  </label>
                  <input
                    type="password"
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>

              {connectError && (
                <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2 border border-rose-200 dark:border-rose-900/60">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{connectError}</span>
                </div>
              )}

              {connectSuccess && (
                <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2 border border-emerald-200 dark:border-emerald-900/60">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>{connectSuccess}</span>
                </div>
              )}

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => handleConnect(targetHostUrl || manualIp)}
                  disabled={isSyncing || (!targetHostUrl && !manualIp)}
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-brand-600 hover:bg-brand-700 text-white transition disabled:opacity-50 flex items-center gap-1.5 shadow-xs"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                  {isSyncing ? 'Connecting...' : 'Connect to Host'}
                </button>
              </div>
            </div>
          </div>

          {/* Git-like Offline Commits Section */}
          <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-slate-500" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Offline Commit Queue ({pendingList.length} Pending)
                </h3>
              </div>
              {pendingList.length > 0 && isOnline && (
                <button
                  type="button"
                  onClick={async () => {
                    await syncNow();
                    setPendingList(getPendingCommits());
                  }}
                  disabled={isSyncing}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition flex items-center gap-1.5 shadow-2xs"
                >
                  <RefreshCw className={`h-3 w-3 ${isSyncing ? 'animate-spin' : ''}`} />
                  Push All Commits
                </button>
              )}
            </div>

            {syncStatusMessage && (
              <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                {syncStatusMessage}
              </p>
            )}

            {pendingList.length === 0 ? (
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 text-center">
                <CheckCircle2 className="h-6 w-6 text-emerald-500 mx-auto mb-1" />
                <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  All local changes are in sync with Host.
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Any products added or restocked while offline will queue here and merge additively.
                </p>
              </div>
            ) : (
              <div className="max-h-48 overflow-y-auto space-y-1.5 rounded-xl border border-slate-200 dark:border-slate-800 p-2 bg-slate-50/50 dark:bg-slate-800/30">
                {pendingList.map((commit, idx) => (
                  <div
                    key={commit.id || idx}
                    className="p-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-800 dark:text-slate-100">
                          {commit.data?.name || `Product #${commit.data?.product_id}`}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 font-mono">
                          {commit.action}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                        Qty: +{commit.data?.opening_stock || commit.data?.delta_quantity || 0} • {commit.id.substring(0, 12)}...
                      </p>
                    </div>
                    <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/60">
                      Unmerged
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/40">
          <span className="text-[11px] text-slate-400">
            {lastSyncTime ? `Last synced: ${lastSyncTime.toLocaleTimeString()}` : 'No sync recorded yet this session'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
