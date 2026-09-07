import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../services/api';
import { BusinessSettings, CustomField, BackupFile } from '../../types';
import {
  Settings as SettingsIcon,
  Lock,
  Store,
  Percent,
  Sliders,
  Printer,
  Database,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Trash2,
  Plus,
  RefreshCw,
  Download,
  Upload,
  Image,
} from 'lucide-react';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Modal } from '../../components/common/Modal';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { SchemaBuilder } from './SchemaBuilder';
import { SetupWizardModal } from '../../components/wizard/SetupWizardModal';

interface SettingsPageProps {
  settings: BusinessSettings | null;
  onSettingsUpdated: () => void;
  onOpenWizard?: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  settings,
  onSettingsUpdated,
  onOpenWizard,
}) => {
  // PIN lock state
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [checkingPin, setCheckingPin] = useState(false);

  // Settings tab
  const [activeTab, setActiveTab] = useState<
    'business' | 'tax' | 'custom_fields' | 'printer' | 'backup' | 'security' | 'danger_zone'
  >('business');

  // Business Form State
  const [bizName, setBizName] = useState(settings?.business_name || '');
  const [bizPhone, setBizPhone] = useState(settings?.phone || '');
  const [bizAddress, setBizAddress] = useState(settings?.address || '');
  const [currency, setCurrency] = useState(settings?.currency || 'Rs.');
  const [showSku, setShowSku] = useState(settings?.show_sku ?? true);
  const [showBarcode, setShowBarcode] = useState(settings?.show_barcode ?? true);

  // Tax State
  const [taxEnabled, setTaxEnabled] = useState(settings?.tax_enabled || false);
  const [defaultTaxRate, setDefaultTaxRate] = useState(settings?.default_tax_rate || 0);

  // Printer State
  const [receiptHeader, setReceiptHeader] = useState(settings?.receipt_header || '');
  const [receiptFooter, setReceiptFooter] = useState(settings?.receipt_footer || '');
  const [printerType, setPrinterType] = useState(settings?.receipt_printer_type || '80mm');

  // Custom Fields
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [showAddCfModal, setShowAddCfModal] = useState(false);
  const [cfName, setCfName] = useState('');
  const [cfType, setCfType] = useState('text');

  // Backup & Restore
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [uploadingBackup, setUploadingBackup] = useState(false);
  const [selectedRestoreBackup, setSelectedRestoreBackup] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Passwords / PIN
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');

  // Reset / Wipe Data State
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetWipeMode, setResetWipeMode] = useState<'inventory_only' | 'all_data'>('inventory_only');
  const [resetPin, setResetPin] = useState('');
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  // Alerts
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setBizName(settings.business_name);
      setBizPhone(settings.phone);
      setBizAddress(settings.address);
      setCurrency(settings.currency);
      setTaxEnabled(settings.tax_enabled);
      setDefaultTaxRate(settings.default_tax_rate);
      setReceiptHeader(settings.receipt_header);
      setReceiptFooter(settings.receipt_footer);
      setPrinterType(settings.receipt_printer_type);
      setShowSku(settings.show_sku ?? true);
      setShowBarcode(settings.show_barcode ?? true);
    }
  }, [settings]);

  const loadCustomFields = async () => {
    try {
      const data = await api.getCustomFields(false);
      setCustomFields(data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadBackups = async () => {
    setLoadingBackups(true);
    try {
      const data = await api.getBackups();
      setBackups(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingBackups(false);
    }
  };

  const handleVerifyPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setCheckingPin(true);
    setPinError(null);
    try {
      const res = await api.verifyPin(pinInput.trim());
      if (res.valid) {
        setIsUnlocked(true);
        loadCustomFields();
        loadBackups();
      } else {
        setPinError('Incorrect PIN. Default PIN is 1234.');
      }
    } catch (err: any) {
      setPinError(err.detail || 'PIN verification failed.');
    } finally {
      setCheckingPin(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await api.updateSettings({
        business_name: bizName.trim(),
        phone: bizPhone.trim(),
        address: bizAddress.trim(),
        currency: currency.trim() || 'Rs.',
        tax_enabled: taxEnabled,
        default_tax_rate: defaultTaxRate,
        receipt_header: receiptHeader.trim(),
        receipt_footer: receiptFooter.trim(),
        receipt_printer_type: printerType,
        show_sku: showSku,
        show_barcode: showBarcode,
      });
      setSuccessMsg('Settings saved successfully!');
      onSettingsUpdated();
    } catch (err: any) {
      setErrorMsg(err.detail || 'Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  const handleLogoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setErrorMsg('Logo file size must be under 2MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = reader.result as string;
      setSaving(true);
      setErrorMsg(null);
      try {
        await api.updateSettings({ logo_path: base64Data });
        setSuccessMsg('Store logo uploaded and applied successfully!');
        onSettingsUpdated();
      } catch (err: any) {
        setErrorMsg(err.detail || 'Failed to upload store logo.');
      } finally {
        setSaving(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleResetLogo = async () => {
    setSaving(true);
    setErrorMsg(null);
    try {
      await api.updateSettings({ logo_path: '' });
      setSuccessMsg('Logo reset to default StokFlow branding!');
      onSettingsUpdated();
    } catch (err: any) {
      setErrorMsg(err.detail || 'Failed to reset logo.');
    } finally {
      setSaving(false);
    }
  };

  const handleReceiptLogoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setErrorMsg('Receipt logo file size must be under 2MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = reader.result as string;
      setSaving(true);
      setErrorMsg(null);
      try {
        await api.updateSettings({ receipt_logo_path: base64Data });
        setSuccessMsg('Thermal receipt logo uploaded and applied successfully!');
        onSettingsUpdated();
      } catch (err: any) {
        setErrorMsg(err.detail || 'Failed to upload thermal receipt logo.');
      } finally {
        setSaving(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleResetReceiptLogo = async () => {
    setSaving(true);
    setErrorMsg(null);
    try {
      await api.updateSettings({ receipt_logo_path: '' });
      setSuccessMsg('Receipt logo reset to default StokFlow branding!');
      onSettingsUpdated();
    } catch (err: any) {
      setErrorMsg(err.detail || 'Failed to reset receipt logo.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateCustomField = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cfName.trim()) return;
    try {
      await api.createCustomField({
        name: cfName.trim(),
        field_type: cfType,
        is_required: false,
      });
      setShowAddCfModal(false);
      setCfName('');
      loadCustomFields();
    } catch (err: any) {
      alert(err.detail || 'Failed to add custom field');
    }
  };

  const handleCreateBackup = async () => {
    try {
      const res = await api.createBackup();
      setSuccessMsg(res.message);
      loadBackups();
    } catch (err: any) {
      setErrorMsg(err.detail || 'Failed to create backup');
    }
  };

  const handleUploadBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.db')) {
      alert('Only .db SQLite database backup files can be imported.');
      return;
    }
    setUploadingBackup(true);
    try {
      const res = await api.uploadBackup(file);
      setSuccessMsg(`Backup '${res.filename}' imported successfully! You can now restore it anytime.`);
      loadBackups();
    } catch (err: any) {
      setErrorMsg(err.detail || 'Failed to import backup file');
    } finally {
      setUploadingBackup(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleConfirmRestore = async () => {
    if (!selectedRestoreBackup) return;
    try {
      const res = await api.restoreBackup(selectedRestoreBackup);
      alert(res.message);
      setSelectedRestoreBackup(null);
      window.location.reload();
    } catch (err: any) {
      alert(err.detail || 'Failed to restore backup');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPass || !newPass) return;
    try {
      await api.changePassword({
        current_password: currentPass,
        new_password: newPass,
      });
      setSuccessMsg('Password updated successfully!');
      setCurrentPass('');
      setNewPass('');
    } catch (err: any) {
      setErrorMsg(err.detail || 'Failed to change password');
    }
  };

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPin || !newPin) return;
    try {
      await api.changePin({
        current_pin: currentPin,
        new_pin: newPin,
      });
      setSuccessMsg('PIN updated successfully!');
      setCurrentPin('');
      setNewPin('');
    } catch (err: any) {
      setErrorMsg(err.detail || 'Failed to change PIN');
    }
  };

  const handleOpenResetModal = (mode: 'inventory_only' | 'all_data') => {
    setResetWipeMode(mode);
    setResetPin('');
    setResetError(null);
    setShowResetModal(true);
  };

  const handleExecuteReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPin) return;
    setResetting(true);
    setResetError(null);
    try {
      const res = await api.resetData({ confirm_pin: resetPin, wipe_mode: resetWipeMode });
      setSuccessMsg(res.message || 'Data wiped successfully!');
      setShowResetModal(false);
      setResetPin('');
      onSettingsUpdated();
    } catch (err: any) {
      setResetError(err.detail || 'Failed to reset data. Please verify your PIN.');
    } finally {
      setResetting(false);
    }
  };

  if (!isUnlocked) {
    return (
      <div className="max-w-md mx-auto my-12 bg-white rounded-3xl border border-slate-200 p-8 shadow-sm text-center">
        <div className="h-16 w-16 rounded-3xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4">
          <Lock className="h-8 w-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-800">Security Check</h2>
        <p className="text-xs text-slate-400 mt-1 mb-6">
          Enter your 4-digit Configuration PIN to access business settings.
        </p>

        {pinError && (
          <div className="p-3 mb-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
            {pinError}
          </div>
        )}

        <form onSubmit={handleVerifyPin} className="space-y-4">
          <Input
            type="password"
            placeholder="Enter PIN (Default: 1234)"
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
            maxLength={6}
            className="text-center text-lg tracking-widest font-bold"
            autoFocus
          />
          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full font-bold"
            loading={checkingPin}
          >
            Unlock Settings
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">Business Settings</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure business details, table attributes, tax rates, receipts, and local backups
          </p>
        </div>
        {onOpenWizard && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onOpenWizard}
            className="font-bold flex items-center gap-1.5 self-start sm:self-auto border-emerald-300 text-emerald-800 hover:bg-emerald-50"
          >
            Launch Setup Wizard
          </Button>
        )}
      </div>

      {/* Alerts */}
      {successMsg && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <div className="flex-1">{successMsg}</div>
          <button onClick={() => setSuccessMsg(null)} className="text-xs text-emerald-700 font-bold">
            Dismiss
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-medium">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <div className="flex-1">{errorMsg}</div>
          <button onClick={() => setErrorMsg(null)} className="text-xs text-rose-500 font-bold">
            Dismiss
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-slate-200">
        {[
          { id: 'business', label: 'Business Profile', icon: <Store className="h-4 w-4" /> },
          { id: 'tax', label: 'Tax Settings', icon: <Percent className="h-4 w-4" /> },
          { id: 'custom_fields', label: 'Custom Product Fields', icon: <Sliders className="h-4 w-4" /> },
          { id: 'printer', label: 'Receipt & Printer', icon: <Printer className="h-4 w-4" /> },
          { id: 'backup', label: 'Local Backup & Restore', icon: <Database className="h-4 w-4" /> },
          { id: 'security', label: 'Security & PIN', icon: <KeyRound className="h-4 w-4" /> },
          { id: 'danger_zone', label: 'Wipe / Reset Data', icon: <Trash2 className="h-4 w-4 text-rose-500" /> },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
              activeTab === tab.id
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: Business Profile */}
      {activeTab === 'business' && (
        <div className="max-w-3xl space-y-6">
          <form onSubmit={handleSaveSettings} className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-800 text-base mb-2">Business Profile</h3>
            <Input
              label="Shop / Business Name *"
              value={bizName}
              onChange={(e) => setBizName(e.target.value)}
              required
            />
            <Input
              label="Phone Number"
              value={bizPhone}
              onChange={(e) => setBizPhone(e.target.value)}
            />
            <Input
              label="Shop Address"
              value={bizAddress}
              onChange={(e) => setBizAddress(e.target.value)}
            />
            <Input
              label="Currency Symbol *"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              hint="e.g. Rs., PKR, $"
              required
            />

            {/* Product Identifiers: Barcode & SKU Visibility */}
            <div className="pt-3 border-t border-slate-100 space-y-3">
              <div>
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Product Identifiers (Catalog Display)
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Configure whether your business requires Barcodes and SKUs. Existing data is safely preserved even when hidden.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <label className="flex items-start gap-3 p-3.5 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 cursor-pointer transition">
                  <input
                    type="checkbox"
                    checked={showBarcode}
                    onChange={(e) => setShowBarcode(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <div className="text-xs">
                    <span className="font-bold text-slate-800 block">Show Barcode & Scanner</span>
                    <span className="text-slate-500 text-[11px] leading-relaxed">
                      Show barcode fields & scanner support in Catalog, Bulk Add, POS, and Stock Updates.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3.5 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 cursor-pointer transition">
                  <input
                    type="checkbox"
                    checked={showSku}
                    onChange={(e) => setShowSku(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <div className="text-xs">
                    <span className="font-bold text-slate-800 block">Show SKU (Stock Keeping Unit)</span>
                    <span className="text-slate-500 text-[11px] leading-relaxed">
                      Show SKU fields & search indexing in Catalog, Bulk Add, and Stock Updates.
                    </span>
                  </div>
                </label>
              </div>
            </div>

            <div className="pt-2">
              <Button type="submit" variant="primary" loading={saving}>
                Save Profile
              </Button>
            </div>
          </form>

          {/* 1-Click Store Logo Uploader */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-bold text-slate-800 text-base">Store Brand Logo</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Upload your shop logo to replace StokFlow branding across Login, Sidebar, and Receipts.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept="image/png, image/jpeg, image/svg+xml, image/webp"
                    onChange={handleLogoFileUpload}
                    className="hidden"
                  />
                  <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition">
                    <Upload className="h-4 w-4" />
                    Upload Logo
                  </span>
                </label>

                {settings?.logo_path && (
                  <button
                    type="button"
                    onClick={handleResetLogo}
                    className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-rose-50 hover:text-rose-700 text-slate-600 font-semibold text-xs transition"
                    title="Revert back to StokFlow default logo"
                  >
                    Reset to Default
                  </button>
                )}
              </div>
            </div>

            {/* Clean Live Preview */}
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="h-16 w-48 flex items-center justify-center">
                  <img
                    src={settings?.logo_path || '/stokflow-logo.png'}
                    alt="Active Brand Logo"
                    className="h-12 w-auto max-w-[180px] object-contain"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-800">
                      {settings?.logo_path ? 'Custom Store Logo' : 'Default StokFlow Logo'}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      settings?.logo_path ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'
                    }`}>
                      {settings?.logo_path ? 'Custom Active' : 'Default Active'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Automatically applied to Login Screen, Sidebar Header, and Print Invoices.
                  </p>
                </div>
              </div>

              {/* Recommended Dimensions Badges */}
              <div className="text-left sm:text-right space-y-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Recommended Dimensions
                </div>
                <div className="flex items-center gap-1.5 justify-start sm:justify-end">
                  <span className="font-mono text-[11px] font-bold px-2 py-0.5 bg-white border border-slate-200 rounded-md text-slate-700">
                    480 × 120 px
                  </span>
                  <span className="text-xs text-slate-400 font-bold">or</span>
                  <span className="font-mono text-[11px] font-bold px-2 py-0.5 bg-white border border-slate-200 rounded-md text-slate-700">
                    512 × 512 px
                  </span>
                </div>
                <div className="text-[10px] text-slate-400">
                  Transparent PNG or SVG (Max 2MB)
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Tax Settings */}
      {activeTab === 'tax' && (
        <form onSubmit={handleSaveSettings} className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm max-w-2xl space-y-5">
          <h3 className="font-bold text-slate-800 text-base">Tax Configuration</h3>
          
          <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100">
            <div>
              <div className="font-bold text-slate-800 text-sm">Enable Sales Tax</div>
              <p className="text-xs text-slate-400">Apply tax automatically on point of sale checkouts</p>
            </div>
            <input
              type="checkbox"
              checked={taxEnabled}
              onChange={(e) => setTaxEnabled(e.target.checked)}
              className="h-5 w-5 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
            />
          </div>

          {taxEnabled && (
            <Input
              label="Default Tax Rate (%)"
              type="number"
              step="0.01"
              min="0"
              value={defaultTaxRate}
              onChange={(e) => setDefaultTaxRate(Number(e.target.value))}
              hint="e.g. 5 for 5% tax"
            />
          )}

          <Button type="submit" variant="primary" loading={saving}>
            Save Tax Settings
          </Button>
        </form>
      )}

      {/* Tab: Custom Product Fields & Schema Customizer */}
      {activeTab === 'custom_fields' && (
        <SchemaBuilder
          onSchemaUpdated={onSettingsUpdated}
          onOpenWizard={onOpenWizard}
        />
      )}

      {/* Tab: Receipt & Printer */}
      {activeTab === 'printer' && (
        <div className="max-w-3xl space-y-6">
          <form onSubmit={handleSaveSettings} className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-800 text-base mb-2">Receipt & Thermal Printer Settings</h3>
            
            <div>
              <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">
                Receipt Printer Paper Size
              </label>
              <select
                value={printerType}
                onChange={(e) => setPrinterType(e.target.value as any)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-800 focus:outline-none focus:border-emerald-500"
              >
                <option value="80mm">80mm Thermal Receipt (Standard Wide)</option>
                <option value="58mm">58mm Thermal Receipt (Narrow Compact)</option>
                <option value="standard">Standard A4 / Letter Page</option>
              </select>
            </div>

            <Input
              label="Receipt Header Subtitle"
              placeholder="e.g. Welcome to our store"
              value={receiptHeader}
              onChange={(e) => setReceiptHeader(e.target.value)}
            />

            <Input
              label="Receipt Footer Note"
              placeholder="e.g. Thank you for shopping with us!"
              value={receiptFooter}
              onChange={(e) => setReceiptFooter(e.target.value)}
            />

            <div className="pt-2">
              <Button type="submit" variant="primary" loading={saving}>
                Save Printer Settings
              </Button>
            </div>
          </form>

          {/* 1-Click Thermal Receipt Print Logo Uploader */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-bold text-slate-800 text-base">Thermal Receipt Print Logo</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  High-contrast black & white logo printed at the top of 80mm & 58mm customer receipts.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept="image/png, image/jpeg, image/svg+xml, image/webp"
                    onChange={handleReceiptLogoFileUpload}
                    className="hidden"
                  />
                  <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition">
                    <Upload className="h-4 w-4" />
                    Upload Receipt Logo
                  </span>
                </label>

                {settings?.receipt_logo_path && (
                  <button
                    type="button"
                    onClick={handleResetReceiptLogo}
                    className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-rose-50 hover:text-rose-700 text-slate-600 font-semibold text-xs transition"
                    title="Revert back to StokFlow default thermal logo"
                  >
                    Reset to Default
                  </button>
                )}
              </div>
            </div>

            {/* Clean Live Receipt Preview */}
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="h-16 w-48 flex items-center justify-center">
                  <img
                    src={settings?.receipt_logo_path || settings?.logo_path || '/stokflow-receipt.png'}
                    alt="Active Receipt Logo"
                    className="h-10 w-auto max-w-[170px] object-contain filter grayscale contrast-200"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-800">
                      {settings?.receipt_logo_path ? 'Custom Receipt Logo' : 'Default StokFlow Thermal Logo'}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      settings?.receipt_logo_path ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'
                    }`}>
                      {settings?.receipt_logo_path ? 'Custom Active' : 'Default Active'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Printed cleanly at the top of customer POS thermal receipts.
                  </p>
                </div>
              </div>

              {/* Recommended Dimensions Badges */}
              <div className="text-left sm:text-right space-y-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Recommended Dimensions
                </div>
                <div className="flex items-center gap-1.5 justify-start sm:justify-end">
                  <span className="font-mono text-[11px] font-bold px-2 py-0.5 bg-white border border-slate-200 rounded-md text-slate-700">
                    384 × 128 px
                  </span>
                  <span className="text-xs text-slate-400 font-bold">or</span>
                  <span className="font-mono text-[11px] font-bold px-2 py-0.5 bg-white border border-slate-200 rounded-md text-slate-700">
                    200 × 100 px
                  </span>
                </div>
                <div className="text-[10px] text-slate-400">
                  Pure Black (#000000) on White/Transparent
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Backup & Restore */}
      {activeTab === 'backup' && (
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm max-w-3xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-slate-800 text-base">Database Backup & Recovery</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Create local snapshots of your database in the Backups folder and restore safely
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="file"
                ref={fileInputRef}
                accept=".db"
                className="hidden"
                onChange={handleUploadBackup}
              />
              <Button
                variant="outline"
                size="md"
                icon={<Upload className="h-4 w-4" />}
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingBackup}
              >
                {uploadingBackup ? 'Importing...' : 'Import Backup (.db)'}
              </Button>
              <Button
                variant="primary"
                size="md"
                icon={<Database className="h-4 w-4" />}
                onClick={handleCreateBackup}
              >
                Backup Now
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Saved Local Backups ({backups.length})
              </h4>
              <button
                onClick={loadBackups}
                className="text-xs text-emerald-600 hover:underline flex items-center gap-1 font-semibold"
              >
                <RefreshCw className="h-3 w-3" /> Refresh List
              </button>
            </div>

            <div className="divide-y divide-slate-100 border border-slate-100 rounded-2xl overflow-hidden">
              {loadingBackups ? (
                <div className="p-8 text-center text-slate-400 text-xs">Scanning backups folder...</div>
              ) : backups.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  No local backups found. Click "Backup Now" or "Import Backup (.db)" to manage backups.
                </div>
              ) : (
                backups.map((b) => (
                  <div key={b.filename} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white hover:bg-slate-50">
                    <div>
                      <div className="font-mono font-bold text-slate-800 text-xs">{b.filename}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {new Date(b.created_at).toLocaleString()} • {b.size_formatted}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <a
                        href={api.downloadBackupUrl(b.filename)}
                        download={b.filename}
                        className="inline-flex items-center gap-1.5 text-xs py-1.5 px-3 font-semibold text-slate-700 hover:bg-slate-100 border border-slate-200 rounded-xl transition"
                        title="Download backup file to USB or disk"
                      >
                        <Download className="h-3.5 w-3.5 text-slate-500" />
                        <span>Download</span>
                      </a>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedRestoreBackup(b.filename)}
                        className="text-xs py-1 px-3 font-semibold text-rose-700 hover:bg-rose-50 border-rose-200"
                      >
                        Restore This Backup
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Security */}
      {activeTab === 'security' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
          {/* Change Password */}
          <form onSubmit={handleChangePassword} className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-800 text-base mb-1">Change Admin Password</h3>
            <Input
              label="Current Password *"
              type="password"
              value={currentPass}
              onChange={(e) => setCurrentPass(e.target.value)}
              required
            />
            <Input
              label="New Password *"
              type="password"
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              required
            />
            <Button type="submit" variant="primary">
              Update Password
            </Button>
          </form>

          {/* Change Settings PIN */}
          <form onSubmit={handleChangePin} className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-800 text-base mb-1">Change Configuration PIN</h3>
            <Input
              label="Current PIN *"
              type="password"
              maxLength={6}
              value={currentPin}
              onChange={(e) => setCurrentPin(e.target.value)}
              required
            />
            <Input
              label="New PIN *"
              type="password"
              maxLength={6}
              value={newPin}
              onChange={(e) => setNewPin(e.target.value)}
              required
            />
            <Button type="submit" variant="primary">
              Update PIN
            </Button>
          </form>
        </div>
      )}

      {/* Tab: Danger Zone / Reset & Wipe Data */}
      {activeTab === 'danger_zone' && (
        <div className="space-y-6 max-w-4xl">
          <div className="p-6 bg-gradient-to-r from-rose-900 to-slate-900 rounded-3xl text-white shadow-lg space-y-2">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-rose-500/20 rounded-2xl border border-rose-400/30 text-rose-400">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-xl font-black tracking-tight">Data Reset & Inventory Wipe Zone</h2>
                <p className="text-xs text-rose-200">
                  Quickly wipe test inventory and sales data to reload fresh test products.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Option 1: Inventory & Sales Wipe (Recommended for Testing) */}
            <div className="bg-white rounded-3xl border-2 border-amber-200/80 p-6 shadow-sm flex flex-col justify-between space-y-5">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-amber-700">
                  <Trash2 className="h-5 w-5" />
                  <h3 className="font-black text-base">Wipe Inventory & Sales Data</h3>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Deletes all <strong>products, stock batches, movements, sales receipts, and purchase orders</strong>.
                  Resets customer/supplier dues to zero.
                </p>
                <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 font-semibold space-y-1">
                  <div>• Keeps your Business Profile & Currency</div>
                  <div>• Keeps Custom Table Columns & Attributes</div>
                  <div>• Keeps Product Categories</div>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={() => handleOpenResetModal('inventory_only')}
                className="w-full font-bold border-amber-400 text-amber-900 hover:bg-amber-100/70"
              >
                Wipe Inventory & Test Data
              </Button>
            </div>

            {/* Option 2: Full Factory Reset */}
            <div className="bg-white rounded-3xl border-2 border-rose-200/80 p-6 shadow-sm flex flex-col justify-between space-y-5">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-rose-700">
                  <AlertTriangle className="h-5 w-5" />
                  <h3 className="font-black text-base">Factory Reset Everything</h3>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Completely wipes <strong>all inventory, sales, purchases, customers, suppliers, bills, and expenses</strong>.
                  Returns the database to a blank slate.
                </p>
                <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-[11px] text-rose-900 font-semibold">
                  This action is permanent and cannot be undone. Create a backup first if needed.
                </div>
              </div>

              <Button
                type="button"
                variant="danger"
                size="md"
                onClick={() => handleOpenResetModal('all_data')}
                className="w-full font-bold shadow-md shadow-rose-600/20"
              >
                Factory Reset Entire System
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Confirmation Modal */}
      <Modal
        isOpen={showResetModal}
        onClose={() => setShowResetModal(false)}
        title={resetWipeMode === 'inventory_only' ? 'Confirm Inventory Wipe' : 'Confirm Factory Reset'}
        subtitle="Please enter your Configuration PIN to authorize this reset action."
        maxWidth="md"
      >
        <form onSubmit={handleExecuteReset} className="space-y-4">
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold space-y-1">
            <div className="font-black flex items-center gap-1.5 text-sm text-rose-900">
              <AlertTriangle className="h-4 w-4 text-rose-600" />
              Warning: Irreversible Action
            </div>
            <div>
              {resetWipeMode === 'inventory_only'
                ? 'All products, stock counts, sales receipts, and purchases will be permanently deleted.'
                : 'All system transactions, products, customers, suppliers, bills, and expenses will be permanently wiped.'}
            </div>
          </div>

          {resetError && (
            <div className="p-3 rounded-xl bg-rose-100 text-rose-800 text-xs font-bold">
              {resetError}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
              Enter 4-Digit Configuration PIN *
            </label>
            <Input
              type="password"
              maxLength={6}
              placeholder="Enter PIN (Default: 1234)"
              value={resetPin}
              onChange={(e) => setResetPin(e.target.value)}
              className="text-center text-lg tracking-widest font-bold"
              required
              autoFocus
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowResetModal(false)}
              disabled={resetting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="danger"
              loading={resetting}
              disabled={!resetPin}
              className="font-bold px-5"
            >
              Confirm & Wipe Data Now
            </Button>
          </div>
        </form>
      </Modal>

      {/* Add Custom Field Modal */}
      <Modal
        isOpen={showAddCfModal}
        onClose={() => setShowAddCfModal(false)}
        title="Add Custom Product Field"
        maxWidth="sm"
      >
        <form onSubmit={handleCreateCustomField} className="space-y-4">
          <Input
            label="Field Name *"
            placeholder="e.g. Brand, Warranty, Color, Model"
            value={cfName}
            onChange={(e) => setCfName(e.target.value)}
            required
            autoFocus
          />
          <div>
            <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">
              Field Type
            </label>
            <select
              value={cfType}
              onChange={(e) => setCfType(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-800"
            >
              <option value="text">Text (e.g. Sony, Blue)</option>
              <option value="number">Number (e.g. 12, 100)</option>
              <option value="date">Date</option>
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setShowAddCfModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Create Field
            </Button>
          </div>
        </form>
      </Modal>

      {/* Restore Safety Confirm Dialog (Section 62) */}
      <ConfirmDialog
        isOpen={Boolean(selectedRestoreBackup)}
        onClose={() => setSelectedRestoreBackup(null)}
        onConfirm={handleConfirmRestore}
        title="Restore Database from Backup?"
        message={`A pre-restore safety checkpoint will be saved automatically before restoring from '${selectedRestoreBackup}'. The application will reload after restoration.`}
        confirmText="Yes, Restore Now"
        variant="danger"
      />
    </div>
  );
};
