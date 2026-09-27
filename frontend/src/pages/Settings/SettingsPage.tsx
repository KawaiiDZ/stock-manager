import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../services/api';
import { BusinessSettings, CustomField, BackupFile, Sale } from '../../types';
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
  Calendar,
  FileText,
  Barcode,
  Eye,
  Receipt,
} from 'lucide-react';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Modal } from '../../components/common/Modal';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { SchemaBuilder } from './SchemaBuilder';
import { SetupWizardModal } from '../../components/wizard/SetupWizardModal';
import { BarcodePrintModal } from '../../components/barcode/BarcodePrintModal';
import { ReceiptModal } from '../../components/receipts/ReceiptModal';
import { STANDARD_LABEL_SIZES, generateBarcodeSvg, parseLabelDimensions } from '../../utils/barcode';
import { STANDARD_DATE_FORMATS, setGlobalFormattingPreferences, formatDate, formatCurrency } from '../../utils/format';
import { GoogleBackupCard } from '../../components/settings/GoogleBackupCard';

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
    'business' | 'tax' | 'custom_fields' | 'printer' | 'barcode' | 'backup' | 'security' | 'danger_zone'
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

  // Format & Receipt States
  const [dateFormat, setDateFormat] = useState(settings?.date_format || 'YYYY-MM-DD');
  const [formatPricesWithCommas, setFormatPricesWithCommas] = useState(settings?.format_prices_with_commas ?? true);
  const [receiptType, setReceiptType] = useState<'thermal' | 'pdf'>(settings?.receipt_type || 'thermal');
  const [showLetterhead, setShowLetterhead] = useState(settings?.show_letterhead ?? false);
  const [hideHeaderTextWithLetterhead, setHideHeaderTextWithLetterhead] = useState(settings?.hide_header_text_with_letterhead ?? false);
  const [letterheadImage, setLetterheadImage] = useState(settings?.receipt_letterhead_path || '');
  const [invoiceTitle, setInvoiceTitle] = useState(settings?.invoice_title || 'TAX INVOICE');
  const [enableQuotations, setEnableQuotations] = useState(settings?.enable_quotations ?? true);
  const [invoiceTerms, setInvoiceTerms] = useState(settings?.invoice_terms || '');
  const [quotationTerms, setQuotationTerms] = useState(settings?.quotation_terms || '');

  // Printer State
  const [receiptHeader, setReceiptHeader] = useState(settings?.receipt_header || '');
  const [receiptFooter, setReceiptFooter] = useState(settings?.receipt_footer || '');
  const [printerType, setPrinterType] = useState(settings?.receipt_printer_type || '80mm');

  // Barcode & Scanner State
  const [enableBarcodeScanner, setEnableBarcodeScanner] = useState(settings?.enable_barcode_scanner ?? true);
  const [enableBarcodePrinter, setEnableBarcodePrinter] = useState(settings?.enable_barcode_printer ?? true);
  const [barcodeLabelSize, setBarcodeLabelSize] = useState(settings?.barcode_label_size || '50x25mm');
  const [barcodeLabelShowBusinessName, setBarcodeLabelShowBusinessName] = useState(settings?.barcode_label_show_business_name ?? true);
  const [barcodeLabelShowProductName, setBarcodeLabelShowProductName] = useState(settings?.barcode_label_show_product_name ?? true);
  const [barcodeLabelShowPrice, setBarcodeLabelShowPrice] = useState(settings?.barcode_label_show_price ?? true);
  const [barcodeLabelShowSku, setBarcodeLabelShowSku] = useState(settings?.barcode_label_show_sku ?? true);
  const [barcodeLabelCustomText, setBarcodeLabelCustomText] = useState(settings?.barcode_label_custom_text || '');
  const [customLabelWidthMm, setCustomLabelWidthMm] = useState(50);
  const [customLabelHeightMm, setCustomLabelHeightMm] = useState(25);
  const [showTestBarcodeModal, setShowTestBarcodeModal] = useState(false);

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
  const [restoreLocalPin, setRestoreLocalPin] = useState<string>('');
  const [restoreLocalError, setRestoreLocalError] = useState<string | null>(null);
  const [restoringLocal, setRestoringLocal] = useState<boolean>(false);
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

  // Test Receipt Modal State
  const [showTestReceiptModal, setShowTestReceiptModal] = useState(false);

  // Realistic sample sale object for test receipt printing and preview
  const sampleTestSale: Sale = {
    id: 0,
    receipt_number: 'RCP-TEST-9001',
    customer_id: 0,
    customer_name: 'Walk-in Customer (Test)',
    subtotal: 3500,
    discount_amount: 250,
    tax_rate: Number(settings?.default_tax_rate || 0),
    tax_amount: Math.round(((3250 * Number(settings?.default_tax_rate || 0)) / 100) * 100) / 100,
    total_amount: 3250 + Math.round(((3250 * Number(settings?.default_tax_rate || 0)) / 100) * 100) / 100,
    paid_amount: 3250 + Math.round(((3250 * Number(settings?.default_tax_rate || 0)) / 100) * 100) / 100,
    due_amount: 0,
    total_cost: 2100,
    gross_profit: 1150,
    payment_status: 'PAID',
    items: [
      {
        id: 1,
        product_id: 101,
        product_name: 'Premium Wireless Optical Mouse',
        quantity: 2,
        unit_price: 1200,
        discount_amount: 100,
        total_price: 2300,
        unit_cost: 800,
        total_cost: 1600,
        gross_profit: 700,
        returned_quantity: 0,
      },
      {
        id: 2,
        product_id: 102,
        product_name: 'Type-C Braided Fast Charging Cable (1.5m)',
        quantity: 1,
        unit_price: 800,
        discount_amount: 50,
        total_price: 750,
        unit_cost: 400,
        total_cost: 400,
        gross_profit: 350,
        returned_quantity: 0,
      },
      {
        id: 3,
        product_id: 103,
        product_name: 'Anti-Glare Screen Cleaner Spray 100ml',
        quantity: 1,
        unit_price: 450,
        discount_amount: 100,
        total_price: 350,
        unit_cost: 250,
        total_cost: 250,
        gross_profit: 100,
        returned_quantity: 0,
      },
    ],
    payments: [
      {
        id: 1,
        amount: 3250 + Math.round(((3250 * Number(settings?.default_tax_rate || 0)) / 100) * 100) / 100,
        payment_method: 'Cash',
        created_at: new Date().toISOString(),
      },
    ],
    created_at: new Date().toISOString(),
  };

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
      setDateFormat(settings.date_format || 'YYYY-MM-DD');
      setFormatPricesWithCommas(settings.format_prices_with_commas ?? true);
      setReceiptType(settings.receipt_type || 'thermal');
      setShowLetterhead(settings.show_letterhead ?? false);
      setHideHeaderTextWithLetterhead(settings.hide_header_text_with_letterhead ?? false);
      setLetterheadImage(settings.receipt_letterhead_path || '');
      setInvoiceTitle(settings.invoice_title || 'TAX INVOICE');
      setEnableQuotations(settings.enable_quotations ?? true);
      setInvoiceTerms(settings.invoice_terms || '1. Goods once sold will be accepted for return within 7 days in original condition.\n2. Warranty claims require presenting this invoice.\n3. Thank you for your business!');
      setQuotationTerms(settings.quotation_terms || '1. This quotation is an estimate and valid for 15 days from issue date.\n2. Stock is subject to physical availability upon confirmation.\n3. This document does not constitute a tax invoice until approved.');
      setEnableBarcodeScanner(settings.enable_barcode_scanner ?? true);
      setEnableBarcodePrinter(settings.enable_barcode_printer ?? true);
      const bSize = settings.barcode_label_size || '50x25mm';
      setBarcodeLabelSize(bSize);
      const parsedDim = parseLabelDimensions(bSize);
      setCustomLabelWidthMm(parsedDim.widthMm);
      setCustomLabelHeightMm(parsedDim.heightMm);
      setBarcodeLabelShowBusinessName(settings.barcode_label_show_business_name ?? true);
      setBarcodeLabelShowProductName(settings.barcode_label_show_product_name ?? true);
      setBarcodeLabelShowPrice(settings.barcode_label_show_price ?? true);
      setBarcodeLabelShowSku(settings.barcode_label_show_sku ?? true);
      setBarcodeLabelCustomText(settings.barcode_label_custom_text || '');
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
        date_format: dateFormat,
        format_prices_with_commas: formatPricesWithCommas,
        receipt_type: receiptType,
        show_letterhead: showLetterhead,
        hide_header_text_with_letterhead: hideHeaderTextWithLetterhead,
        receipt_letterhead_path: letterheadImage || null,
        invoice_title: invoiceTitle.trim() || 'TAX INVOICE',
        enable_quotations: enableQuotations,
        invoice_terms: invoiceTerms,
        quotation_terms: quotationTerms,
        enable_barcode_scanner: enableBarcodeScanner,
        enable_barcode_printer: enableBarcodePrinter,
        barcode_label_size: barcodeLabelSize === 'custom' ? `${customLabelWidthMm}x${customLabelHeightMm}mm` : barcodeLabelSize,
        barcode_label_show_business_name: barcodeLabelShowBusinessName,
        barcode_label_show_product_name: barcodeLabelShowProductName,
        barcode_label_show_price: barcodeLabelShowPrice,
        barcode_label_show_sku: barcodeLabelShowSku,
        barcode_label_custom_text: barcodeLabelCustomText.trim(),
      });
      setGlobalFormattingPreferences({
        dateFormat,
        formatPricesWithCommas,
        currency: currency.trim() || 'Rs.',
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

  const handleLetterheadFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2.5 * 1024 * 1024) {
      setErrorMsg('Letterhead image file size must be under 2.5MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = reader.result as string;
      setLetterheadImage(base64Data);
      setSaving(true);
      setErrorMsg(null);
      try {
        await api.updateSettings({
          receipt_letterhead_path: base64Data,
          show_letterhead: true,
        });
        setShowLetterhead(true);
        setSuccessMsg('Letterhead banner uploaded and enabled successfully!');
        onSettingsUpdated();
      } catch (err: any) {
        setErrorMsg(err.detail || 'Failed to upload letterhead.');
      } finally {
        setSaving(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleResetLetterhead = async () => {
    setSaving(true);
    setErrorMsg(null);
    try {
      await api.updateSettings({
        receipt_letterhead_path: '',
        show_letterhead: false,
      });
      setLetterheadImage('');
      setShowLetterhead(false);
      setSuccessMsg('Custom letterhead removed successfully.');
      onSettingsUpdated();
    } catch (err: any) {
      setErrorMsg(err.detail || 'Failed to remove letterhead.');
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

  const handleConfirmRestore = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedRestoreBackup) return;
    try {
      setRestoringLocal(true);
      setRestoreLocalError(null);
      const res = await api.restoreBackup(selectedRestoreBackup, restoreLocalPin);
      alert(res.message);
      setSelectedRestoreBackup(null);
      window.location.reload();
    } catch (err: any) {
      setRestoreLocalError(err.detail || 'Failed to restore backup');
    } finally {
      setRestoringLocal(false);
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

  const currentBarcodeDim =
    barcodeLabelSize === 'custom'
      ? { widthMm: customLabelWidthMm, heightMm: customLabelHeightMm }
      : parseLabelDimensions(barcodeLabelSize);

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
          { id: 'barcode', label: 'Barcodes & Scanners', icon: <Barcode className="h-4 w-4" /> },
          { id: 'backup', label: 'Backup & Cloud Sync', icon: <Database className="h-4 w-4" /> },
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
            {/* Currency Selector with Presets & Live Preview */}
            <div className="md:col-span-2 p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    Currency Symbol & Code *
                  </label>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Choose your primary store currency. Defaults to <strong className="text-emerald-700 font-bold">Rs.</strong> with options for custom currencies.
                  </p>
                </div>

                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 shadow-sm text-xs font-bold text-slate-800">
                  <span className="text-slate-400">Live Preview:</span>
                  <span className="text-emerald-700">{formatCurrency(1250000.0, currency.trim() || 'Rs.')}</span>
                </div>
              </div>

              {/* Quick Preset Buttons */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {[
                  { code: 'Rs.', label: 'Rs. (Rupee - Default)' },
                  { code: 'PKR', label: 'PKR (Pakistani Rupee)' },
                  { code: '₹', label: '₹ (INR / Indian Rupee)' },
                  { code: '$', label: '$ (USD / Dollar)' },
                  { code: 'AED', label: 'AED (Dirham)' },
                  { code: 'SAR', label: 'SAR (Riyal)' },
                  { code: '€', label: '€ (Euro)' },
                  { code: '£', label: '£ (Pound)' },
                  { code: 'OMR', label: 'OMR (Omani Rial)' },
                  { code: 'KWD', label: 'KWD (Kuwaiti Dinar)' },
                  { code: 'BDT', label: 'BDT (Taka)' },
                ].map((preset) => {
                  const isSelected = currency.trim() === preset.code;
                  return (
                    <button
                      key={preset.code}
                      type="button"
                      onClick={() => setCurrency(preset.code)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                        isSelected
                          ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-600/30'
                          : 'bg-white text-slate-700 border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/50'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>

              {/* Custom Input for any custom string */}
              <div className="pt-2 max-w-xs">
                <Input
                  label="Custom Currency Code / Symbol"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  placeholder="e.g. Rs., PKR, $, QAR"
                  hint="Type any custom currency symbol or ISO code"
                  required
                />
              </div>
            </div>

            {/* Date & Number Formatting Preferences */}
            <div className="pt-3 border-t border-slate-100 space-y-3">
              <div>
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 text-emerald-600" />
                  Date & Number Formatting
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Select your preferred date format and number style to be applied across your app, invoices, and reports.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">
                    Date Format (Global & Invoices)
                  </label>
                  <select
                    value={dateFormat}
                    onChange={(e) => setDateFormat(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-800 focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    {STANDARD_DATE_FORMATS.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.id} (e.g. {formatDate(new Date(), f.id)})
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Today preview: <span className="font-semibold text-emerald-700">{formatDate(new Date(), dateFormat)}</span>
                  </p>
                </div>

                <div className="flex items-start">
                  <label className="flex items-start gap-3 p-3.5 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 cursor-pointer transition w-full">
                    <input
                      type="checkbox"
                      checked={formatPricesWithCommas}
                      onChange={(e) => setFormatPricesWithCommas(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div className="text-xs">
                      <span className="font-bold text-slate-800 block">Add Commas in Prices</span>
                      <span className="text-slate-500 text-[11px] leading-relaxed">
                        Display thousands separators across prices (e.g. {currency} 1,250,000.00 instead of {currency} 1250000.00).
                      </span>
                    </div>
                  </label>
                </div>
              </div>
            </div>

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
          <form onSubmit={handleSaveSettings} className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-6">
            <div>
              <h3 className="font-bold text-slate-800 text-base">Receipt & Invoice Formatting</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Choose between fast point-of-sale thermal receipts or full-page PDF/A4 corporate invoices with letterheads.
              </p>
            </div>

            {/* Receipt Format Selector Cards */}
            <div>
              <label className="block text-xs font-bold uppercase text-slate-500 mb-2">
                Default Receipt Format
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setReceiptType('thermal')}
                  className={`p-4 rounded-2xl border-2 text-left transition-all flex items-start gap-3.5 ${
                    receiptType === 'thermal'
                      ? 'border-emerald-600 bg-emerald-50/40 text-emerald-950 shadow-sm'
                      : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                  }`}
                >
                  <div className={`p-2.5 rounded-xl mt-0.5 ${receiptType === 'thermal' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                    <Printer className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-bold text-sm flex items-center gap-1.5">
                      Thermal Receipt Roll
                      {receiptType === 'thermal' && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 bg-emerald-200 text-emerald-800 rounded-md">Default</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Optimized for 80mm & 58mm thermal printers. Quick checkout, compact footprint, fast cuts.
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setReceiptType('pdf')}
                  className={`p-4 rounded-2xl border-2 text-left transition-all flex items-start gap-3.5 ${
                    receiptType === 'pdf'
                      ? 'border-emerald-600 bg-emerald-50/40 text-emerald-950 shadow-sm'
                      : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                  }`}
                >
                  <div className={`p-2.5 rounded-xl mt-0.5 ${receiptType === 'pdf' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                    <FileText className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-bold text-sm flex items-center gap-1.5">
                      Standard PDF / A4 Invoice
                      {receiptType === 'pdf' && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 bg-emerald-200 text-emerald-800 rounded-md">Default</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Full-page corporate layout. Supports custom letterhead graphics, detailed tables & signature blocks.
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {/* Conditional Options for Thermal */}
            {receiptType === 'thermal' && (
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
            )}

            {/* Conditional Options for PDF / A4 */}
            {receiptType === 'pdf' && (
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-bold text-slate-800 block">Custom / Pre-printed Letterhead</span>
                    <span className="text-xs text-slate-500">Enable custom full-width branding banner or pre-printed letterhead alignment</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showLetterhead}
                      onChange={(e) => setShowLetterhead(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>

                {showLetterhead && (
                  <div className="pt-3 border-t border-slate-200/80 space-y-3">
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={hideHeaderTextWithLetterhead}
                        onChange={(e) => setHideHeaderTextWithLetterhead(e.target.checked)}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4 mt-0.5"
                      />
                      <div>
                        <span className="text-xs font-semibold text-slate-800 block">
                          Hide Computer-Generated Business Header Text
                        </span>
                        <span className="text-[11px] text-slate-400">
                          Check this if your physical stationary or uploaded letterhead graphic already contains your business name, address, and phone number.
                        </span>
                      </div>
                    </label>
                  </div>
                )}

                <div className="pt-2">
                  <Input
                    label="A4 Invoice Document Heading Text"
                    placeholder="e.g. TAX INVOICE, COMMERCIAL INVOICE, SALES INVOICE, BILL OF SALE, RECEIPT"
                    value={invoiceTitle}
                    onChange={(e) => setInvoiceTitle(e.target.value)}
                    hint="Customize the main title text printed in bold capital letters at the top of A4/PDF invoices (Default: TAX INVOICE)."
                  />
                </div>
              </div>
            )}

            {/* Quotations Feature Optional Toggle Card */}
            <div className="p-4 rounded-2xl bg-indigo-50/50 border border-indigo-200 flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-indigo-600" />
                  <span className="text-sm font-bold text-slate-800">
                    Customer Quotations & Estimates
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${enableQuotations ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                    {enableQuotations ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed max-w-xl">
                  Allow cashiers to prepare non-binding quotation estimates in POS without deducting stock or money, and manage active offers in the sidebar. Turn off if your business does not require quotations.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                <input
                  type="checkbox"
                  checked={enableQuotations}
                  onChange={(e) => setEnableQuotations(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>

            {/* Customizable Terms & Conditions (T&Cs) */}
            <div className="space-y-4 pt-2 border-t border-slate-100">
              <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <FileText className="h-4 w-4 text-emerald-600" />
                Customizable Terms & Conditions (T&Cs)
              </h4>

              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5">
                    A4 / PDF Invoice Terms & Conditions
                  </label>
                  <textarea
                    rows={3}
                    value={invoiceTerms}
                    onChange={(e) => setInvoiceTerms(e.target.value)}
                    placeholder="Enter invoice terms and conditions to print at the bottom of standard A4 invoices..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-medium text-slate-800 focus:outline-none focus:border-emerald-500 leading-relaxed"
                  />
                  <span className="text-[11px] text-slate-400 block mt-1">
                    Printed at the bottom of all corporate A4 invoices (warranty, return policies, customer notice).
                  </span>
                </div>

                {enableQuotations && (
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5">
                      Quotation Terms & Conditions
                    </label>
                    <textarea
                      rows={3}
                      value={quotationTerms}
                      onChange={(e) => setQuotationTerms(e.target.value)}
                      placeholder="Enter quotation terms and conditions to print on customer quotation documents..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-medium text-slate-800 focus:outline-none focus:border-emerald-500 leading-relaxed"
                    />
                    <span className="text-[11px] text-slate-400 block mt-1">
                      Printed on commercial quotation documents (validity period, stock availability clause, acceptance terms).
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Receipt Header Subtitle"
                placeholder="e.g. Welcome to our store / Tax Invoice"
                value={receiptHeader}
                onChange={(e) => setReceiptHeader(e.target.value)}
              />

              <Input
                label="Receipt Footer Note"
                placeholder="e.g. Thank you for your business!"
                value={receiptFooter}
                onChange={(e) => setReceiptFooter(e.target.value)}
              />
            </div>

            <div className="pt-2">
              <Button type="submit" variant="primary" loading={saving}>
                Save Receipt & Printer Settings
              </Button>
            </div>
          </form>

          {/* Custom PDF / A4 Letterhead Banner Uploader */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-slate-800 text-base">Corporate A4 Letterhead Banner</h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">PDF / A4 Format</span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Upload an official high-resolution corporate header banner to print across the top of all PDF invoices.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept="image/png, image/jpeg, image/webp"
                    onChange={handleLetterheadFileUpload}
                    className="hidden"
                  />
                  <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition">
                    <Upload className="h-4 w-4" />
                    Upload Letterhead
                  </span>
                </label>

                {(letterheadImage || settings?.receipt_letterhead_path) && (
                  <button
                    type="button"
                    onClick={handleResetLetterhead}
                    className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-rose-50 hover:text-rose-700 text-slate-600 font-semibold text-xs transition"
                    title="Remove custom letterhead"
                  >
                    Remove Letterhead
                  </button>
                )}
              </div>
            </div>

            {/* Live Letterhead Preview */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
              {(letterheadImage || settings?.receipt_letterhead_path) ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-700 flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4" /> Custom Letterhead Active
                    </span>
                    <span className="text-[11px] text-slate-400">Preview scaled to fit container</span>
                  </div>
                  <div className="w-full bg-white border border-slate-200 rounded-xl p-2 overflow-hidden shadow-sm max-h-36 flex items-center justify-center">
                    <img
                      src={letterheadImage || settings?.receipt_letterhead_path}
                      alt="Uploaded Letterhead Banner"
                      className="w-full max-h-32 object-contain"
                    />
                  </div>
                </div>
              ) : (
                <div className="py-6 flex flex-col items-center justify-center text-center text-slate-400">
                  <Image className="h-10 w-10 stroke-1 text-slate-300 mb-2" />
                  <p className="text-xs font-semibold text-slate-600">No custom letterhead uploaded</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Standard business name, phone, address, and logo will be automatically rendered as the header.
                  </p>
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-200/60 gap-1">
                <span>Recommended Aspect Ratio: <strong>6:1 to 8:1</strong> (e.g. 1200×180px or 1600×220px)</span>
                <span>Supported: PNG, JPEG, WebP (Max 2.5MB)</span>
              </div>
            </div>
          </div>

          {/* 1-Click Thermal Receipt Print Logo Uploader */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-slate-800 text-base">Thermal Receipt Print Logo</h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">Thermal Roll Format</span>
                </div>
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

          {/* Print Test Receipt Diagnostic Tool */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                    <Printer className="h-5 w-5" />
                  </div>
                  <h3 className="font-bold text-slate-800 text-base">Print Test Receipt</h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                    Diagnostic Tool
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1 max-w-xl">
                  Test your connected thermal receipt printer or standard A4 printer using realistic sample retail items, discounts, tax, and a scannable Code-128 barcode before going live.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowTestReceiptModal(true)}
                  className="font-bold flex items-center gap-1.5"
                >
                  <Eye className="h-4 w-4" />
                  Preview Test Receipt
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => setShowTestReceiptModal(true)}
                  className="font-bold flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-600/20"
                >
                  <Printer className="h-4 w-4" />
                  Print Test Receipt
                </Button>
              </div>
            </div>

            {/* Test Receipt Feature Highlights & Roll Sizing */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Receipt className="h-3.5 w-3.5 text-emerald-600" />
                Sample Test Sale Details
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-600">
                <div className="bg-white p-3 rounded-xl border border-slate-200">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Sample Receipt #</div>
                  <div className="font-mono font-bold text-slate-800 mt-0.5">RCP-TEST-9001</div>
                  <div className="text-[10px] text-emerald-600 mt-1">Includes Code-128 Barcode</div>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-200">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Items & Discounts</div>
                  <div className="font-bold text-slate-800 mt-0.5">3 Items (4 Units)</div>
                  <div className="text-[10px] text-slate-500 mt-1">Tests item-level discount lines</div>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-200">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Supported Widths</div>
                  <div className="font-bold text-slate-800 mt-0.5">80mm, 58mm & A4</div>
                  <div className="text-[10px] text-slate-500 mt-1">Quick-switch inside preview</div>
                </div>
              </div>
              <p className="text-[11px] text-slate-400">
                Tip: Thermal receipts feature an automatic paper cutter feed margin at the bottom so your printer's blade doesn't clip your footer or barcode.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Barcodes & Scanners */}
      {activeTab === 'barcode' && (
        <div className="max-w-4xl space-y-6">
          <form onSubmit={handleSaveSettings} className="space-y-6">
            {/* 1. Barcode Scanner Configuration Card */}
            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                    <Barcode className="h-5 w-5 text-emerald-600" />
                    <span>Hardware Barcode Scanner Support</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Connect any standard USB or Bluetooth handheld barcode scanner (HID keyboard emulation).
                  </p>
                </div>

                {/* Master Toggle */}
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableBarcodeScanner}
                    onChange={(e) => setEnableBarcodeScanner(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                  <span className="ml-2.5 text-xs font-bold text-slate-700">
                    {enableBarcodeScanner ? 'Enabled' : 'Disabled'}
                  </span>
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                  <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span>Point of Sale (POS) Instant Scan</span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Scanning any product barcode, SKU, or Product ID instantly finds the product and adds it to the active sales cart (or increments quantity).
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                  <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span>Inventory Catalog Quick Filter</span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Scanning in the inventory list automatically populates the search filter and isolates the item for rapid edits, stock updates, or label reprinting.
                  </p>
                </div>
              </div>
            </div>

            {/* 2. Thermal Barcode Printer & Label Layout Card */}
            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                    <Printer className="h-5 w-5 text-emerald-600" />
                    <span>Barcode Printer & Label Generation</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Configure roll sticker sizes and custom metadata for thermal label printers (Zebra, Xprinter, TSC, Dymo).
                  </p>
                </div>

                {/* Master Toggle */}
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableBarcodePrinter}
                    onChange={(e) => setEnableBarcodePrinter(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                  <span className="ml-2.5 text-xs font-bold text-slate-700">
                    {enableBarcodePrinter ? 'Enabled' : 'Disabled'}
                  </span>
                </label>
              </div>

              {enableBarcodePrinter && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  {/* Left Column: Roll Sizing & Options */}
                  <div className="lg:col-span-7 space-y-4">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                        Standard Roll Label Size *
                      </label>
                      <select
                        value={barcodeLabelSize}
                        onChange={(e) => setBarcodeLabelSize(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-800 focus:outline-none focus:border-emerald-500 shadow-sm"
                      >
                        {STANDARD_LABEL_SIZES.map((preset) => (
                          <option key={preset.key} value={preset.key}>
                            {preset.name} - {preset.description}
                          </option>
                        ))}
                      </select>
                    </div>

                    {barcodeLabelSize === 'custom' && (
                      <div className="grid grid-cols-2 gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs">
                        <div>
                          <label className="block font-bold text-slate-700 mb-1">Custom Width (mm)</label>
                          <input
                            type="number"
                            min="20"
                            max="150"
                            value={customLabelWidthMm}
                            onChange={(e) => setCustomLabelWidthMm(Number(e.target.value))}
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 font-bold"
                          />
                        </div>
                        <div>
                          <label className="block font-bold text-slate-700 mb-1">Custom Height (mm)</label>
                          <input
                            type="number"
                            min="15"
                            max="150"
                            value={customLabelHeightMm}
                            onChange={(e) => setCustomLabelHeightMm(Number(e.target.value))}
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 font-bold"
                          />
                        </div>
                      </div>
                    )}

                    {/* Metadata Content Checkboxes */}
                    <div className="pt-2 border-t border-slate-100 space-y-2.5">
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                        Label Sticker Contents
                      </label>
                      <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-slate-700">
                        <label className="flex items-center gap-2 cursor-pointer p-2 rounded-xl bg-slate-50 border border-slate-200/80 hover:bg-slate-100 transition">
                          <input
                            type="checkbox"
                            checked={barcodeLabelShowBusinessName}
                            onChange={(e) => setBarcodeLabelShowBusinessName(e.target.checked)}
                            className="rounded text-emerald-600 focus:ring-emerald-500"
                          />
                          <span>Business Name</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer p-2 rounded-xl bg-slate-50 border border-slate-200/80 hover:bg-slate-100 transition">
                          <input
                            type="checkbox"
                            checked={barcodeLabelShowProductName}
                            onChange={(e) => setBarcodeLabelShowProductName(e.target.checked)}
                            className="rounded text-emerald-600 focus:ring-emerald-500"
                          />
                          <span>Product Name</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer p-2 rounded-xl bg-slate-50 border border-slate-200/80 hover:bg-slate-100 transition">
                          <input
                            type="checkbox"
                            checked={barcodeLabelShowPrice}
                            onChange={(e) => setBarcodeLabelShowPrice(e.target.checked)}
                            className="rounded text-emerald-600 focus:ring-emerald-500"
                          />
                          <span>Price ({currency})</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer p-2 rounded-xl bg-slate-50 border border-slate-200/80 hover:bg-slate-100 transition">
                          <input
                            type="checkbox"
                            checked={barcodeLabelShowSku}
                            onChange={(e) => setBarcodeLabelShowSku(e.target.checked)}
                            className="rounded text-emerald-600 focus:ring-emerald-500"
                          />
                          <span>SKU / Code</span>
                        </label>
                      </div>
                    </div>

                    {/* Custom Text / Warranty */}
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                        Custom Small Text / Notice (Printed at bottom)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Non-refundable if tag removed • 1 Year Warranty"
                        value={barcodeLabelCustomText}
                        onChange={(e) => setBarcodeLabelCustomText(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 shadow-sm focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  {/* Right Column: Live Scaled Preview & Test Print Button */}
                  <div className="lg:col-span-5 flex flex-col items-center justify-between p-5 rounded-3xl bg-slate-100/90 border border-slate-200 space-y-4">
                    <div className="w-full flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
                      <span className="flex items-center gap-1.5">
                        <Eye className="h-3.5 w-3.5 text-emerald-600" />
                        Live Label Preview
                      </span>
                      <span className="text-[11px] px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-700">
                        {currentBarcodeDim.widthMm}×{currentBarcodeDim.heightMm}mm
                      </span>
                    </div>

                    {/* Scaled Preview Box */}
                    <div
                      style={{
                        width: `${Math.min(240, currentBarcodeDim.widthMm * 4.4)}px`,
                        aspectRatio: `${currentBarcodeDim.widthMm} / ${currentBarcodeDim.heightMm}`,
                      }}
                      className="bg-white rounded-lg border-2 border-dashed border-slate-300 shadow-md p-2 flex flex-col items-center justify-between text-center overflow-hidden transition-all duration-200 select-none"
                    >
                      {barcodeLabelShowBusinessName && (
                        <div className="text-[10px] font-black uppercase tracking-wider text-slate-900 truncate w-full px-1">
                          {bizName || 'My Shop'}
                        </div>
                      )}

                      {barcodeLabelShowProductName && (
                        <div className="text-[11px] font-bold text-slate-800 truncate w-full px-1 leading-tight">
                          Sample Product Name
                        </div>
                      )}

                      <div
                        className="w-full flex justify-center my-0.5 overflow-hidden"
                        dangerouslySetInnerHTML={{
                          __html: generateBarcodeSvg('STOCKFLOW-PREVIEW', {
                            height: Math.max(22, currentBarcodeDim.heightMm * 1.1),
                            barWidth: 1.5,
                            includeText: true,
                            fontSize: 9,
                          }),
                        }}
                      />

                      <div className="w-full flex items-center justify-between px-1 text-[10px] font-bold text-slate-900 leading-tight">
                        {barcodeLabelShowSku ? (
                          <span className="text-slate-500 text-[9px] truncate max-w-[45%]">
                            SKU-SAMPLE
                          </span>
                        ) : <span />}

                        {barcodeLabelShowPrice && (
                          <span className="text-slate-900 font-black">
                            {formatCurrency(1999, currency)}
                          </span>
                        )}
                      </div>

                      {barcodeLabelCustomText.trim() && (
                        <div className="text-[8px] font-medium text-slate-500 truncate w-full leading-none mt-0.5">
                          {barcodeLabelCustomText.trim()}
                        </div>
                      )}
                    </div>

                    {/* Prominent Test Label Print Button */}
                    <div className="w-full pt-2 border-t border-slate-200 flex flex-col gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        icon={<Printer className="h-4 w-4 text-emerald-600" />}
                        onClick={() => setShowTestBarcodeModal(true)}
                        className="w-full bg-white hover:bg-emerald-50 border-emerald-300 text-emerald-800 font-bold shadow-sm justify-center py-2.5"
                      >
                        Print Test Label
                      </Button>
                      <p className="text-[11px] text-slate-400 text-center leading-tight">
                        Prints a test sticker with message <strong>"Thank you for using StockFlow"</strong> to check thermal roll alignment.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Save Button */}
            <div className="flex justify-end">
              <Button type="submit" variant="primary" loading={saving} className="px-6 font-bold shadow-md shadow-emerald-700/15">
                Save Barcode Settings
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Tab: Backup & Restore */}
      {activeTab === 'backup' && (
        <div className="max-w-3xl space-y-6">
          {/* Cloud Backup (WhatsApp-Style Google Drive) */}
          <GoogleBackupCard
            onSuccess={(msg) => setSuccessMsg(msg)}
            onError={(err) => setErrorMsg(err)}
          />

          {/* Local Database Backup & Recovery */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-bold text-slate-800 text-base">Local Database Snapshots</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Create offline snapshots of your database in the local Backups folder or import .db files
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
                          onClick={() => {
                            setSelectedRestoreBackup(b.filename);
                            setRestoreLocalPin('');
                            setRestoreLocalError(null);
                          }}
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

      {/* Restore Safety Modal with Server-Side PIN Verification */}
      {selectedRestoreBackup && (
        <Modal
          isOpen={true}
          onClose={() => {
            setSelectedRestoreBackup(null);
            setRestoreLocalPin('');
            setRestoreLocalError(null);
          }}
          title="Restore Database from Local Backup"
        >
          <form onSubmit={handleConfirmRestore} className="space-y-4">
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                <span>Critical Operation: Database Restore</span>
              </div>
              <p className="leading-relaxed">
                Restoring will replace the active database with the local snapshot from:
                <br />
                <span className="font-mono font-bold">{selectedRestoreBackup}</span>.
              </p>
              <div className="p-2 rounded-xl bg-amber-100/60 font-semibold text-[11px]">
                🛡️ Automatic Safety Rollback: A local checkpoint of your current database will be saved before restoring,
                ensuring zero data loss if you need to revert.
              </div>
            </div>

            {restoreLocalError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                {restoreLocalError}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Enter Configuration PIN to Authorize
              </label>
              <input
                type="password"
                maxLength={8}
                value={restoreLocalPin}
                onChange={(e) => setRestoreLocalPin(e.target.value)}
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
                onClick={() => {
                  setSelectedRestoreBackup(null);
                  setRestoreLocalPin('');
                  setRestoreLocalError(null);
                }}
                disabled={restoringLocal}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="danger"
                disabled={restoringLocal || !restoreLocalPin}
              >
                {restoringLocal ? 'Restoring Database...' : 'Confirm & Restore'}
              </Button>
            </div>
          </form>
        </Modal>
      )}


      {/* Test Barcode Print Modal */}
      <BarcodePrintModal
        isOpen={showTestBarcodeModal}
        onClose={() => setShowTestBarcodeModal(false)}
        settings={settings}
        products={[]}
        isTestMode={true}
        initialCopies={1}
      />

      {/* Test Receipt Modal */}
      {showTestReceiptModal && (
        <ReceiptModal
          isOpen={showTestReceiptModal}
          onClose={() => setShowTestReceiptModal(false)}
          sale={sampleTestSale}
          settings={settings}
        />
      )}
    </div>
  );
};
