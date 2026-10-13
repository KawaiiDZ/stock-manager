import React, { useState, useEffect } from 'react';
import { api, getRemoteHostUrl } from '../../services/api';
import { PrinterDiagnosticResponse, BusinessSettings } from '../../types';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import {
  Printer,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Trash2,
  Zap,
  Activity,
  Cpu,
  Server,
  Sliders,
  ExternalLink,
} from 'lucide-react';

interface PrinterDiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings?: BusinessSettings | null;
  initialError?: string | null;
}

export const PrinterDiagnosticsModal: React.FC<PrinterDiagnosticsModalProps> = ({
  isOpen,
  onClose,
  settings,
  initialError,
}) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [diagnostic, setDiagnostic] = useState<PrinterDiagnosticResponse | null>(null);
  const [clearingQueue, setClearingQueue] = useState<boolean>(false);
  const [testingPrint, setTestingPrint] = useState<boolean>(false);
  const [actionFeedback, setActionFeedback] = useState<{
    type: 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);

  const remoteHost = getRemoteHostUrl();

  const runDiagnostics = async () => {
    setLoading(true);
    setActionFeedback(null);
    try {
      const res = await api.diagnosePrinting(settings?.selected_thermal_printer || undefined);
      setDiagnostic(res);
    } catch (err: any) {
      setActionFeedback({
        type: 'error',
        message: err.detail || err.message || 'Failed to connect to host printer diagnostic service.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      runDiagnostics();
    }
  }, [isOpen]);

  const handleClearQueue = async () => {
    setClearingQueue(true);
    setActionFeedback(null);
    try {
      const res = await api.clearPrinterQueue(diagnostic?.resolved_printer || settings?.selected_thermal_printer || undefined);
      if (res.success) {
        setActionFeedback({
          type: 'success',
          message: res.message || 'Print queue cleared successfully! Pending jobs removed.',
        });
        // Re-run diagnostics to verify queue depth dropped to 0
        runDiagnostics();
      } else {
        setActionFeedback({
          type: 'error',
          message: res.message || 'Failed to clear print queue.',
        });
      }
    } catch (err: any) {
      setActionFeedback({
        type: 'error',
        message: err.detail || err.message || 'Failed to clear printer queue.',
      });
    } finally {
      setClearingQueue(false);
    }
  };

  const handleTestPrint = async () => {
    setTestingPrint(true);
    setActionFeedback(null);
    const startTime = performance.now();
    try {
      const res = await api.printThermalDiagnostic({
        printer_name: diagnostic?.resolved_printer || settings?.selected_thermal_printer || undefined,
        paper_width: settings?.receipt_printer_type || '80mm',
        printer_profile: settings?.thermal_printer_profile || 'standard_escpos',
        darkness: settings?.thermal_darkness || 'normal',
        cut_mode: settings?.thermal_cut_mode || 'partial',
        feed_lines: settings?.thermal_feed_lines ?? 4,
      });
      const elapsed = Math.round(performance.now() - startTime);
      if (res.is_online === false || res.warning) {
        setActionFeedback({
          type: 'warning',
          message: `⚠️ Job queued to ${res.printer} (${elapsed}ms), but printer reports OFFLINE / Powered Off. Check power switch.`,
        });
      } else {
        setActionFeedback({
          type: 'success',
          message: `✓ Diagnostic calibration receipt spooled successfully to "${res.printer}" in ${elapsed}ms!`,
        });
      }
    } catch (err: any) {
      const elapsed = Math.round(performance.now() - startTime);
      setActionFeedback({
        type: 'error',
        message: `Print test failed (${elapsed}ms): ${err.detail || err.message || 'Unknown error'}`,
      });
    } finally {
      setTestingPrint(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="POS Hardware & Printer Diagnostic Suite"
      maxWidth="4xl"
    >
      <div className="space-y-5 py-1">
        {/* Connection Host Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 text-emerald-800 rounded-xl shrink-0">
              <Server className="h-4 w-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-800 flex items-center gap-2">
                <span>Diagnostic Host:</span>
                <span className="font-mono text-emerald-700 bg-white px-2 py-0.5 rounded border border-emerald-200">
                  {remoteHost ? remoteHost : 'Local Host Server (127.0.0.1)'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                OS: <strong className="text-slate-700">{diagnostic?.os_name || 'Detecting...'}</strong> | Target: <strong className="text-slate-700">{settings?.selected_thermal_printer || 'Auto-detect'}</strong>
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={runDiagnostics}
            loading={loading}
            className="font-bold text-xs shrink-0 flex items-center gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
            <span>Re-scan Status</span>
          </Button>
        </div>

        {/* Initial Error Notice if passed */}
        {initialError && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3 text-rose-800 text-xs">
            <XCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
            <div>
              <span className="font-bold block">Triggered from POS Checkout Error:</span>
              <span className="font-mono text-[11px] leading-relaxed">{initialError}</span>
            </div>
          </div>
        )}

        {/* Action feedback banner */}
        {actionFeedback && (
          <div
            className={`p-3.5 rounded-2xl text-xs font-semibold flex items-center justify-between gap-2 border ${
              actionFeedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : actionFeedback.type === 'warning'
                ? 'bg-amber-50 border-amber-200 text-amber-800'
                : 'bg-rose-50 border-rose-200 text-rose-700'
            }`}
          >
            <span className="leading-snug">{actionFeedback.message}</span>
            <button
              type="button"
              onClick={() => setActionFeedback(null)}
              className="text-[10px] font-bold underline shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Core Subsystem Health Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          {/* Card 1: Overall Status */}
          <div className="p-3.5 rounded-2xl bg-white border border-slate-200 space-y-1">
            <span className="text-[10px] font-bold uppercase text-slate-400 block tracking-wider">
              Health Status
            </span>
            <div className="flex items-center gap-1.5 pt-0.5">
              {diagnostic?.status === 'healthy' ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span className="text-xs font-bold text-emerald-700">Healthy &amp; Ready</span>
                </>
              ) : diagnostic?.status === 'warning' ? (
                <>
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                  <span className="text-xs font-bold text-amber-700">Needs Attention</span>
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 text-rose-600 shrink-0" />
                  <span className="text-xs font-bold text-rose-700">Issues Detected</span>
                </>
              )}
            </div>
          </div>

          {/* Card 2: Print Spooler */}
          <div className="p-3.5 rounded-2xl bg-white border border-slate-200 space-y-1">
            <span className="text-[10px] font-bold uppercase text-slate-400 block tracking-wider">
              Print Spooler
            </span>
            <div className="flex items-center gap-1.5 pt-0.5">
              {diagnostic?.spooler_running ? (
                <>
                  <Activity className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span className="text-xs font-bold text-slate-800">Service Active</span>
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 text-rose-600 shrink-0" />
                  <span className="text-xs font-bold text-rose-700">Service Stopped</span>
                </>
              )}
            </div>
          </div>

          {/* Card 3: Target Printer */}
          <div className="p-3.5 rounded-2xl bg-white border border-slate-200 space-y-1">
            <span className="text-[10px] font-bold uppercase text-slate-400 block tracking-wider">
              Hardware State
            </span>
            <div className="flex items-center gap-1.5 pt-0.5">
              {diagnostic?.is_online ? (
                <>
                  <Printer className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span className="text-xs font-bold text-emerald-700 truncate" title={diagnostic?.resolved_printer || ''}>
                    Online (Ready)
                  </span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
                  <span className="text-xs font-bold text-rose-700 truncate">
                    Offline / Powered Off
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Card 4: Queue Depth */}
          <div className="p-3.5 rounded-2xl bg-white border border-slate-200 space-y-1">
            <span className="text-[10px] font-bold uppercase text-slate-400 block tracking-wider">
              Spooler Queue
            </span>
            <div className="flex items-center gap-1.5 pt-0.5">
              {diagnostic && diagnostic.queue_job_count > 0 ? (
                <>
                  <Trash2 className="h-4 w-4 text-amber-600 shrink-0" />
                  <span className="text-xs font-bold text-amber-700">
                    {diagnostic.queue_job_count} Stuck Job(s)
                  </span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span className="text-xs font-bold text-slate-800">Queue Empty (Clean)</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Issues & Remediation Plan */}
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <Sliders className="h-3.5 w-3.5 text-emerald-600" />
              Automated Root Cause Diagnosis &amp; Remediation
            </h4>
            <span className="text-[10px] font-bold text-slate-400">
              Resolved Device: {diagnostic?.resolved_printer || 'None'}
            </span>
          </div>

          {diagnostic?.issues && diagnostic.issues.length > 0 ? (
            <div className="space-y-2">
              <div className="space-y-1">
                {diagnostic.issues.map((iss, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-xs text-rose-700 font-medium bg-rose-50/70 p-2 rounded-xl border border-rose-200/50">
                    <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-rose-600" />
                    <span>{iss}</span>
                  </div>
                ))}
              </div>

              {diagnostic.recommendations && diagnostic.recommendations.length > 0 && (
                <div className="space-y-1 pt-1">
                  <span className="text-[11px] font-bold text-slate-700 block">Recommended Action:</span>
                  {diagnostic.recommendations.map((rec, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-xs text-slate-700 bg-white p-2.5 rounded-xl border border-slate-200">
                      <span className="h-4 w-4 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                        {idx + 1}
                      </span>
                      <span className="leading-relaxed">{rec}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200/80 flex items-center gap-2.5 text-emerald-800 text-xs font-medium">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>No hardware or spooler anomalies detected. Your thermal printer is communicating smoothly with StokFlow!</span>
            </div>
          )}
        </div>

        {/* 1-Click Repair & Test Spool Actions */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200 space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Hardware Testing &amp; Self-Healing Tools
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              loading={clearingQueue}
              onClick={handleClearQueue}
              className="font-bold text-xs flex items-center justify-center gap-2 border-rose-200 text-rose-700 hover:bg-rose-50"
            >
              <Trash2 className="h-3.5 w-3.5 text-rose-600" />
              <span>Purge &amp; Reset Stuck Print Queue</span>
            </Button>

            <Button
              type="button"
              variant="primary"
              size="sm"
              loading={testingPrint}
              onClick={handleTestPrint}
              className="font-bold text-xs flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 shadow-sm"
            >
              <Zap className="h-3.5 w-3.5" />
              <span>Print Hardware Calibration Test</span>
            </Button>
          </div>
        </div>

        {/* Detected System Printers Table */}
        {diagnostic?.printers && diagnostic.printers.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase text-slate-500">
                Connected OS Devices ({diagnostic.printers.length})
              </span>
              <span className="text-[10px] text-slate-400">
                Port &amp; Thermal Detection
              </span>
            </div>

            <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100 text-xs">
              {diagnostic.printers.map((p) => {
                const isSelected = p.name === settings?.selected_thermal_printer;
                return (
                  <div
                    key={p.name}
                    className={`p-2.5 flex items-center justify-between ${
                      isSelected ? 'bg-emerald-50/60 font-semibold text-emerald-950' : 'bg-white text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className={`h-2 w-2 rounded-full ${p.is_online ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                      <span className="truncate">{p.name}</span>
                      {p.is_thermal && (
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800">
                          Thermal
                        </span>
                      )}
                      {p.is_default && (
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                          Default
                        </span>
                      )}
                      {isSelected && (
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-600 text-white">
                          Assigned
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-mono text-slate-400 shrink-0">
                      {p.device_uri || 'USB / Spooler'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer Close */}
        <div className="flex justify-end pt-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose} className="font-bold text-xs">
            Close Diagnostics
          </Button>
        </div>
      </div>
    </Modal>
  );
};
