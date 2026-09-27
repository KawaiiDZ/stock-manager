import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { GoogleBackupStatusResponse, GoogleDriveFileItem } from '../../types';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import {
  Cloud,
  CloudUpload,
  CloudOff,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  Lock,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Key,
  ExternalLink,
  HardDriveDownload,
  Info,
} from 'lucide-react';

interface GoogleBackupCardProps {
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

export const GoogleBackupCard: React.FC<GoogleBackupCardProps> = ({ onSuccess, onError }) => {
  const [status, setStatus] = useState<GoogleBackupStatusResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [triggering, setTriggering] = useState<boolean>(false);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [customClientId, setCustomClientId] = useState<string>('');
  const [customClientSecret, setCustomClientSecret] = useState<string>('');
  const [savingCreds, setSavingCreds] = useState<boolean>(false);

  // Restore Modal State
  const [restoreModalFile, setRestoreModalFile] = useState<GoogleDriveFileItem | null>(null);
  const [restorePin, setRestorePin] = useState<string>('');
  const [restoring, setRestoring] = useState<boolean>(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  // Disconnect Confirmation State
  const [showDisconnectModal, setShowDisconnectModal] = useState<boolean>(false);
  const [disconnecting, setDisconnecting] = useState<boolean>(false);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const res = await api.getGoogleBackupStatus();
      setStatus(res);
      if (res.has_custom_credentials) {
        setCustomClientId('••••••••••••');
        setCustomClientSecret('••••••••••••');
      }
    } catch (err: any) {
      onError(err.detail || 'Failed to fetch Google Drive backup status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();

    // Listen for OAuth completion from popup window
    const handleAuthMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'GOOGLE_AUTH_SUCCESS') {
        onSuccess('Google Account linked successfully with restricted AppData scope!');
        fetchStatus();
      }
    };

    window.addEventListener('message', handleAuthMessage);
    return () => window.removeEventListener('message', handleAuthMessage);
  }, []);

  const handleConnectGoogle = async () => {
    try {
      const { auth_url } = await api.getGoogleAuthUrl();
      // Open in a centered popup window
      const width = 560;
      const height = 660;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;
      const popup = window.open(
        auth_url,
        'GoogleDriveAuth',
        `width=${width},height=${height},top=${top},left=${left},status=no,toolbar=no,menubar=no`
      );
      if (!popup) {
        // If popup blocked, fallback to direct navigation
        window.location.href = auth_url;
      }
    } catch (err: any) {
      onError(err.detail || 'Could not initiate Google connection. Check Client ID settings.');
    }
  };

  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSavingCreds(true);
      const res = await api.updateGoogleBackupSettings({
        custom_client_id: customClientId.startsWith('•••') ? undefined : customClientId,
        custom_client_secret: customClientSecret.startsWith('•••') ? undefined : customClientSecret,
      });
      setStatus(res);
      onSuccess('Custom Google Cloud OAuth credentials updated.');
    } catch (err: any) {
      onError(err.detail || 'Failed to update credentials.');
    } finally {
      setSavingCreds(false);
    }
  };

  const handleFrequencyChange = async (newFreq: '6h' | 'daily' | 'weekly' | 'manual') => {
    try {
      const res = await api.updateGoogleBackupSettings({ frequency: newFreq });
      setStatus(res);
      onSuccess(`Backup schedule updated to: ${newFreq.toUpperCase()}`);
    } catch (err: any) {
      onError(err.detail || 'Failed to update backup frequency');
    }
  };

  const handleToggleEnabled = async () => {
    if (!status) return;
    try {
      const newEnabled = !status.is_enabled;
      const res = await api.updateGoogleBackupSettings({ is_enabled: newEnabled });
      setStatus(res);
      onSuccess(newEnabled ? 'Automated cloud backup enabled.' : 'Automated cloud backup paused.');
    } catch (err: any) {
      onError(err.detail || 'Failed to toggle backup status');
    }
  };

  const handleTriggerBackupNow = async () => {
    try {
      setTriggering(true);
      const res = await api.triggerGoogleBackup();
      if (res.success) {
        onSuccess(res.message || 'Google Drive backup completed successfully!');
      } else {
        onError(res.message || 'Backup could not be completed.');
      }
      fetchStatus();
    } catch (err: any) {
      onError(err.detail || 'Cloud backup failed. Check connection.');
      fetchStatus();
    } finally {
      setTriggering(false);
    }
  };

  const handleConfirmDisconnect = async () => {
    try {
      setDisconnecting(true);
      await api.disconnectGoogleBackup();
      setShowDisconnectModal(false);
      onSuccess('Google Drive account disconnected.');
      fetchStatus();
    } catch (err: any) {
      onError(err.detail || 'Failed to disconnect account');
    } finally {
      setDisconnecting(false);
    }
  };

  const handleExecuteRestore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restoreModalFile) return;
    try {
      setRestoring(true);
      setRestoreError(null);

      // Verify PIN first
      const pinCheck = await api.verifyPin(restorePin);
      if (!pinCheck.valid) {
        setRestoreError('Invalid Configuration PIN. Action denied.');
        setRestoring(false);
        return;
      }

      const res = await api.restoreGoogleBackup(restoreModalFile.id, restorePin);
      alert(res.message || 'Database restored successfully!');

      window.location.reload();
    } catch (err: any) {
      setRestoreError(err.detail || 'Failed to restore backup from Google Drive.');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div className="flex items-start gap-3">
          <div className="h-11 w-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100/60 shadow-xs">
            <Cloud className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-800 text-base">Google Drive Backup (WhatsApp-Style)</h3>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-100/70 text-emerald-800 border border-emerald-200/50">
                Restricted AppData
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Automated offline-tolerant cloud snapshots stored privately in Google Drive's hidden app sandbox
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {status?.is_connected ? (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Connected: {status.google_email || 'Linked Account'}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-50 border border-slate-200 text-slate-500 text-xs font-semibold">
              <CloudOff className="h-3.5 w-3.5" />
              <span>Not Connected</span>
            </div>
          )}
          <button
            onClick={fetchStatus}
            disabled={loading}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition"
            title="Refresh status"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Feature Highlights Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-slate-50/70 p-3.5 rounded-2xl border border-slate-100 text-xs">
        <div className="flex items-start gap-2.5">
          <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-slate-700">Restricted Privacy</span>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Zero access to personal files, Docs, or photos. Confined strictly to WhatsApp-style hidden app storage.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-2.5">
          <RefreshCw className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-slate-700">Rolling 3-Backup Retention</span>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Strictly stores the last 3 healthy database snapshots. Automatically prunes older files to save space.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-2.5">
          <CheckCircle2 className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-slate-700">Universal Compatibility</span>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Every backup is protected with automated dynamic schema auto-upgrade. Restores safely on any version.
            </p>
          </div>
        </div>
      </div>

      {/* Body: Disconnected State */}
      {!status?.is_connected ? (
        <div className="space-y-4">
          <div className="p-6 rounded-2xl bg-white border border-dashed border-slate-200 text-center space-y-4">
            <div className="h-12 w-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
              <CloudUpload className="h-6 w-6" />
            </div>
            <div className="max-w-md mx-auto">
              <h4 className="text-sm font-bold text-slate-800">Connect Google Account</h4>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Link your Google account to automatically safeguard your sales, inventory, and ledger in Google Drive.
                Restricted to application data only.
              </p>
            </div>
            <div>
              <Button
                variant="primary"
                size="md"
                onClick={handleConnectGoogle}
                icon={
                  <svg className="h-4 w-4 mr-1" viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="currentColor"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                }
              >
                Sign in with Google
              </Button>
            </div>
          </div>

          {/* Advanced Developer / Custom Credentials Accordion */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden bg-slate-50/50">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full px-4 py-3 flex items-center justify-between text-xs font-semibold text-slate-600 hover:bg-slate-100/60 transition"
            >
              <div className="flex items-center gap-2">
                <Key className="h-3.5 w-3.5 text-slate-400" />
                <span>Custom Google Cloud OAuth Credentials (Optional / Enterprise)</span>
              </div>
              {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>

            {showAdvanced && (
              <form onSubmit={handleSaveCredentials} className="p-4 border-t border-slate-200 bg-white space-y-3">
                <p className="text-[11px] text-slate-400">
                  By default, StockFlow can use bundled credentials or system environment variables. Enterprise deployments
                  or private stores can configure their own Google Cloud Console OAuth Client ID & Secret below.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                      OAuth Client ID
                    </label>
                    <input
                      type="text"
                      value={customClientId}
                      onChange={(e) => setCustomClientId(e.target.value)}
                      placeholder="e.g. 12345-abc.apps.googleusercontent.com"
                      className="w-full text-xs font-mono px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                      Client Secret
                    </label>
                    <input
                      type="password"
                      value={customClientSecret}
                      onChange={(e) => setCustomClientSecret(e.target.value)}
                      placeholder="Enter Google client secret"
                      className="w-full text-xs font-mono px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button type="submit" variant="outline" size="sm" disabled={savingCreds}>
                    {savingCreds ? 'Saving...' : 'Save Credentials'}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : (
        /* Body: Connected State */
        <div className="space-y-6">
          {/* Controls Bar */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={status.is_enabled}
                  onChange={handleToggleEnabled}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                />
                <span className="text-xs font-bold text-slate-700">Automated Sync</span>
              </label>

              <div className="flex items-center gap-2 text-xs">
                <span className="font-semibold text-slate-500">Frequency:</span>
                <select
                  value={status.frequency}
                  onChange={(e) => handleFrequencyChange(e.target.value as any)}
                  className="bg-white border border-slate-200 rounded-xl px-2.5 py-1 text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value="daily">Daily</option>
                  <option value="6h">Every 6 Hours</option>
                  <option value="weekly">Weekly</option>
                  <option value="manual">Manual Only</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                icon={<CloudUpload className="h-3.5 w-3.5" />}
                onClick={handleTriggerBackupNow}
                disabled={triggering}
              >
                {triggering ? 'Backing Up...' : 'Backup to Cloud Now'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDisconnectModal(true)}
                className="text-rose-600 border-rose-200 hover:bg-rose-50"
              >
                Disconnect
              </Button>
            </div>
          </div>

          {/* Storage Quota Exceeded Alert */}
          {status.is_quota_exceeded && (
            <div className="bg-amber-50/90 border border-amber-200 rounded-2xl p-4 flex items-start gap-3.5 shadow-xs">
              <div className="p-2.5 rounded-xl bg-amber-100 text-amber-800 shrink-0 mt-0.5">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="space-y-1.5 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h5 className="text-xs font-bold text-amber-950 uppercase tracking-wide">
                    Google Account Storage Full ({status.quota_used_formatted || '15 GB'} / {status.quota_limit_formatted || '15 GB'} used)
                  </h5>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-200/80 text-amber-900 border border-amber-300">
                    Storage Limit Exceeded
                  </span>
                </div>
                <p className="text-xs text-amber-800 leading-relaxed">
                  Your Google account has reached or exceeded its 15 GB storage limit across Google Drive, Gmail, and Google Photos. Google blocks any new cloud uploads until space is freed up.
                </p>
                <div className="flex flex-wrap items-center gap-3 pt-1 text-xs font-semibold">
                  <a
                    href="https://one.google.com/storage"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-amber-900 underline hover:text-amber-950"
                  >
                    Clean Up Storage on Google <ExternalLink className="h-3 w-3" />
                  </a>
                  <span className="text-amber-300">•</span>
                  <button
                    type="button"
                    onClick={() => setShowDisconnectModal(true)}
                    className="text-rose-700 hover:text-rose-850 underline"
                  >
                    Switch to another Google Account
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Telemetry Status Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-xs">
              <div className="text-[11px] uppercase tracking-wider font-bold text-slate-400">Last Cloud Backup</div>
              <div className="text-xs font-bold text-slate-800 mt-1">
                {status.last_backup_at ? new Date(status.last_backup_at).toLocaleString() : 'Never'}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                Size: {status.last_backup_size_formatted || '0 B'}
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-xs">
              <div className="text-[11px] uppercase tracking-wider font-bold text-slate-400">Sync Status</div>
              <div className="mt-1">
                {status.last_backup_status === 'SUCCESS' && (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
                    <CheckCircle2 className="h-3 w-3" /> Healthy & Up to Date
                  </span>
                )}
                {status.last_backup_status === 'OFFLINE_SKIPPED' && (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200" title={status.last_error_message || ''}>
                    <AlertTriangle className="h-3 w-3" /> Store Offline (Skipped)
                  </span>
                )}
                {status.last_backup_status === 'FAILED' && (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-200" title={status.last_error_message || ''}>
                    <AlertCircle className="h-3 w-3" /> Sync Failed
                  </span>
                )}
                {status.last_backup_status === 'NEVER' && (
                  <span className="text-xs font-medium text-slate-400">Awaiting first backup</span>
                )}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5 truncate" title={status.last_error_message || ''}>
                {status.last_error_message || 'Automated daemon active'}
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-xs">
              <div className="text-[11px] uppercase tracking-wider font-bold text-slate-400">Retention Capacity</div>
              <div className="text-xs font-bold text-slate-800 mt-1">
                {status.cloud_backups.length} of 3 Slots Used
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                Automatically rotates to keep newest 3
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-xs">
              <div className="text-[11px] uppercase tracking-wider font-bold text-slate-400">Google Storage</div>
              <div className="text-xs font-bold text-slate-800 mt-1 flex items-center gap-1">
                <span>{status.quota_used_formatted || '15 GB'}</span>
                <span className="text-slate-400 font-normal">/ {status.quota_limit_formatted || '15 GB'}</span>
              </div>
              <div className="text-[10px] mt-0.5 font-medium">
                {status.is_quota_exceeded ? (
                  <span className="text-rose-600 font-bold">100% Full (Exceeded)</span>
                ) : (
                  <span className="text-emerald-600">Storage Available</span>
                )}
              </div>
            </div>
          </div>

          {/* Stored Cloud Backups (Last 3) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Cloud Backups in Google Drive ({status.cloud_backups.length} of 3)
              </h4>
              <button
                onClick={fetchStatus}
                className="text-xs text-emerald-600 hover:underline flex items-center gap-1 font-semibold"
              >
                <RefreshCw className="h-3 w-3" /> Refresh Cloud List
              </button>
            </div>

            <div className="divide-y divide-slate-100 border border-slate-100 rounded-2xl overflow-hidden bg-white">
              {status.cloud_backups.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  No cloud backups stored in Google Drive yet. Click "Backup to Cloud Now" to generate your first backup.
                </div>
              ) : (
                status.cloud_backups.map((cb, idx) => (
                  <div
                    key={cb.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 transition"
                  >
                    <div className="flex items-start gap-3">
                      <div className="h-8 w-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 text-xs font-bold border border-emerald-100">
                        #{idx + 1}
                      </div>
                      <div>
                        <div className="font-mono font-bold text-slate-800 text-xs">{cb.name}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {new Date(cb.created_at).toLocaleString()} • {cb.size_formatted}
                        </div>
                      </div>
                    </div>

                    <div>
                      <Button
                        variant="outline"
                        size="sm"
                        icon={<HardDriveDownload className="h-3.5 w-3.5 text-rose-600" />}
                        onClick={() => {
                          setRestoreModalFile(cb);
                          setRestorePin('');
                          setRestoreError(null);
                        }}
                        className="text-xs py-1 px-3 font-semibold text-rose-700 hover:bg-rose-50 border-rose-200"
                      >
                        Restore From Drive
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Restore Confirmation Modal */}
      {restoreModalFile && (
        <Modal
          isOpen={true}
          onClose={() => setRestoreModalFile(null)}
          title="Restore Database from Google Drive"
        >
          <form onSubmit={handleExecuteRestore} className="space-y-4">
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                <span>Critical Operation: Database Restore</span>
              </div>
              <p className="leading-relaxed">
                Restoring will replace the active database with the cloud snapshot from:
                <br />
                <span className="font-mono font-bold">{restoreModalFile.name}</span> ({restoreModalFile.size_formatted}).
              </p>
              <div className="p-2 rounded-xl bg-amber-100/60 font-semibold text-[11px]">
                🛡️ Automatic Safety Rollback: A local snapshot of your current database will be saved before restoring,
                ensuring zero data loss if you need to revert.
              </div>
            </div>

            {restoreError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                {restoreError}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Enter Configuration PIN to Authorize
              </label>
              <input
                type="password"
                maxLength={8}
                value={restorePin}
                onChange={(e) => setRestorePin(e.target.value)}
                placeholder="Enter 4-digit PIN"
                className="w-full text-center text-lg font-mono tracking-widest px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500"
                autoFocus
                required
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setRestoreModalFile(null)}
                disabled={restoring}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="danger"
                disabled={restoring || !restorePin}
              >
                {restoring ? 'Restoring Database...' : 'Confirm & Restore'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Disconnect Confirmation Modal */}
      {showDisconnectModal && (
        <Modal
          isOpen={true}
          onClose={() => setShowDisconnectModal(false)}
          title="Disconnect Google Account?"
        >
          <div className="space-y-4">
            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to disconnect <strong>{status?.google_email}</strong>? Automated cloud backups
              will be paused until you reconnect. Existing backups stored in Google Drive will remain safe and intact.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setShowDisconnectModal(false)}
                disabled={disconnecting}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handleConfirmDisconnect}
                disabled={disconnecting}
              >
                {disconnecting ? 'Disconnecting...' : 'Disconnect Account'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
