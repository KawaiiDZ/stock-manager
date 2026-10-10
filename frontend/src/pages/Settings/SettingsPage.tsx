import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../services/api';
import { BusinessSettings, CustomField, BackupFile, Sale, PrinterInfo } from '../../types';
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
  Scissors,
  Cpu,
  Eye,
  EyeOff,
  ShieldCheck,
  Receipt,
  RotateCcw,
  Zap,
  Flame,
  Info,
  Compass,
  Palette,
  Sun,
  Moon,
  Monitor,
  Check,
  Table,
  Sparkles,
  Leaf,
  Keyboard,
  Users,
} from 'lucide-react';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { useTheme, COLOR_THEME_OPTIONS, ThemeMode, ColorTheme } from '../../context/ThemeContext';
import { Modal } from '../../components/common/Modal';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { SchemaBuilder } from './SchemaBuilder';
import { SetupWizardModal } from '../../components/wizard/SetupWizardModal';
import { BarcodePrintModal } from '../../components/barcode/BarcodePrintModal';
import { ReceiptModal } from '../../components/receipts/ReceiptModal';
import { ThermalReceipt } from '../../components/receipts/ThermalReceipt';
import { printElement } from '../../utils/print';
import { STANDARD_LABEL_SIZES, generateBarcodeSvg, parseLabelDimensions } from '../../utils/barcode';
import { STANDARD_DATE_FORMATS, setGlobalFormattingPreferences, formatDate, formatCurrency } from '../../utils/format';
import { GoogleBackupCard } from '../../components/settings/GoogleBackupCard';
import { rasterizeReceiptElement } from '../../utils/receiptRasterizer';
import { UsersManagementTab } from '../../components/settings/UsersManagementTab';

export interface ThermalLayoutOption {
  id: 'classic' | 'modern' | 'tabular' | 'compact' | 'elegant';
  title: string;
  subtitle: string;
  badge?: string;
  badgeColor?: string;
  desc: string;
  iconName: 'receipt' | 'file-text' | 'table' | 'leaf' | 'sparkles';
}

export const THERMAL_LAYOUT_OPTIONS: ThermalLayoutOption[] = [
  {
    id: 'classic',
    title: 'Classic Retail POS',
    subtitle: 'Monospace & Dashed Rules',
    badge: 'Traditional (Default)',
    badgeColor: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300',
    desc: 'Traditional retail terminal with monospace font, dashed ASCII dividers, 2-line items, and double-bordered === TOTAL === banner. Standard supermarket receipt.',
    iconName: 'receipt',
  },
  {
    id: 'modern',
    title: 'Modern Clean',
    subtitle: 'Solid Rules & Framed Box',
    badge: 'Popular',
    badgeColor: 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300',
    desc: 'Contemporary layout with solid divider rules, uppercase headers, indented promo discounts, and a bold framed total box (+----+). Great for fashion and electronics.',
    iconName: 'file-text',
  },
  {
    id: 'tabular',
    title: 'Detailed Tabular',
    subtitle: 'Multi-Column Grid Table',
    badge: 'Wholesale / Grocery',
    badgeColor: 'bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-300',
    desc: 'Structured 4-column table (ITEM | QTY | PRICE | TOTAL) with vertical alignment and word wrapping. Perfect for supermarkets, pharmacies, hardware, and wholesale.',
    iconName: 'table',
  },
  {
    id: 'compact',
    title: 'Compact Express',
    subtitle: 'Eco Paper-Saver',
    badge: 'Save 40% Paper',
    badgeColor: 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300',
    desc: 'Space-saving express layout with single-line items, condensed 2-line totals, and minimal feed margins. Cuts thermal paper roll usage by 35%-45%. Ideal for busy cafes and kiosks.',
    iconName: 'leaf',
  },
  {
    id: 'elegant',
    title: 'Elegant Boutique',
    subtitle: 'Dot Leaders & Flourishes',
    badge: 'Café & Salon',
    badgeColor: 'bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-300',
    desc: 'Centered aesthetic with delicate star flourishes (* * * *), dot-leader price lines (. . . .), and courteous boutique closing notes. Tailored for fine dining, cafes, and salons.',
    iconName: 'sparkles',
  },
];

const renderLayoutIcon = (iconName: string) => {
  const iconClass = "h-4 w-4";
  switch (iconName) {
    case 'file-text':
      return <FileText className={iconClass} />;
    case 'table':
      return <Table className={iconClass} />;
    case 'leaf':
      return <Leaf className={iconClass} />;
    case 'sparkles':
      return <Sparkles className={iconClass} />;
    case 'receipt':
    default:
      return <Receipt className={iconClass} />;
  }
};

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

  const { themeMode, colorTheme, effectiveMode, setThemeMode, setColorTheme } = useTheme();

  // Settings tab
  const [activeTab, setActiveTab] = useState<
    'business' | 'appearance' | 'tax' | 'custom_fields' | 'printer' | 'barcode' | 'backup' | 'users' | 'security' | 'danger_zone'
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
  const [enableNavigationHub, setEnableNavigationHub] = useState(settings?.enable_navigation_hub ?? true);
  const [enablePosQuickPay, setEnablePosQuickPay] = useState(settings?.enable_pos_quick_pay ?? true);
  const [invoiceTerms, setInvoiceTerms] = useState(settings?.invoice_terms || '');
  const [quotationTerms, setQuotationTerms] = useState(settings?.quotation_terms || '');

  // Printer State
  const [receiptHeader, setReceiptHeader] = useState(settings?.receipt_header || '');
  const [receiptFooter, setReceiptFooter] = useState(settings?.receipt_footer || '');
  const [printerType, setPrinterType] = useState(settings?.receipt_printer_type || '80mm');
  const [thermalPrintMode, setThermalPrintMode] = useState<'browser' | 'direct_escpos'>(
    settings?.thermal_print_mode || 'browser'
  );
  const [thermalHeaderStyle, setThermalHeaderStyle] = useState<'logo_text' | 'text_only'>(
    settings?.thermal_header_style || 'logo_text'
  );
  const [thermalDarkness, setThermalDarkness] = useState<'maximum' | 'high' | 'normal'>(
    settings?.thermal_darkness || 'normal'
  );
  const [thermalLayout, setThermalLayout] = useState<
    'classic' | 'modern' | 'tabular' | 'compact' | 'elegant'
  >(settings?.thermal_layout || 'classic');
  const [thermalPrinterProfile, setThermalPrinterProfile] = useState<
    'standard_escpos' | 'xprinter_enhanced' | 'star_line' | 'generic_plain'
  >(settings?.thermal_printer_profile || 'standard_escpos');
  const [thermalCutMode, setThermalCutMode] = useState<'partial' | 'full' | 'tear_only'>(
    settings?.thermal_cut_mode || 'partial'
  );
  const [thermalFeedLines, setThermalFeedLines] = useState<number>(
    settings?.thermal_feed_lines ?? 4
  );
  const [selectedThermalPrinter, setSelectedThermalPrinter] = useState<string>(
    settings?.selected_thermal_printer || ''
  );
  const [selectedA4Printer, setSelectedA4Printer] = useState<string>(
    settings?.selected_a4_printer || ''
  );
  const [skipReceiptPreview, setSkipReceiptPreview] = useState<boolean>(
    Boolean(settings?.skip_receipt_preview)
  );
  const [systemPrinters, setSystemPrinters] = useState<PrinterInfo[]>([]);
  const [loadingPrinters, setLoadingPrinters] = useState<boolean>(false);
  const [directPrintingTest, setDirectPrintingTest] = useState<boolean>(false);
  const [diagnosticPrintingTest, setDiagnosticPrintingTest] = useState<boolean>(false);
  const [clearingQueue, setClearingQueue] = useState<boolean>(false);
  const [testPrintFeedback, setTestPrintFeedback] = useState<{
    type: 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);

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

  // Dashboard Financial Privacy State
  const [lockDashboardFinances, setLockDashboardFinances] = useState<boolean>(
    Boolean(settings?.lock_dashboard_finances)
  );
  const [dashboardFinancialsPin, setDashboardFinancialsPin] = useState<string>('');
  const [savingPrivacy, setSavingPrivacy] = useState<boolean>(false);

  // Reset / Wipe Data State
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetWipeMode, setResetWipeMode] = useState<'sales_only' | 'inventory_only' | 'all_data'>('sales_only');
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
      setCurrency(settings.currency || 'Rs.');
      setTaxEnabled(settings.tax_enabled);
      setDefaultTaxRate(settings.default_tax_rate);
      setReceiptHeader(settings.receipt_header);
      setReceiptFooter(settings.receipt_footer);
      setPrinterType(settings.receipt_printer_type);
      setThermalPrintMode(settings.thermal_print_mode || 'browser');
      setThermalHeaderStyle(settings.thermal_header_style || 'logo_text');
      setThermalDarkness(settings.thermal_darkness || 'normal');
      setThermalLayout(settings.thermal_layout || 'classic');
      setThermalPrinterProfile(settings.thermal_printer_profile || 'standard_escpos');
      setThermalCutMode(settings.thermal_cut_mode || 'partial');
      setThermalFeedLines(settings.thermal_feed_lines ?? 4);
      setSelectedThermalPrinter(settings.selected_thermal_printer || '');
      setSelectedA4Printer(settings.selected_a4_printer || '');
      setSkipReceiptPreview(Boolean(settings.skip_receipt_preview));
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
      setEnableNavigationHub(settings.enable_navigation_hub ?? true);
      setEnablePosQuickPay(settings.enable_pos_quick_pay ?? true);
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
      setLockDashboardFinances(Boolean(settings.lock_dashboard_finances));
    }
  }, [settings]);

  const loadPrinters = async () => {
    setLoadingPrinters(true);
    try {
      const list = await api.getSystemPrinters();
      setSystemPrinters(list);
      if (list.length > 0) {
        setSelectedThermalPrinter((prev) => {
          const thermal = list.find((p) => p.is_thermal);
          if (prev && list.some((p) => p.name === prev && p.is_thermal)) return prev;
          if (thermal) return thermal.name;
          if (prev && list.some((p) => p.name === prev)) return prev;
          const def = list.find((p) => p.is_default);
          return def ? def.name : list[0].name;
        });
        setSelectedA4Printer((prev) => {
          if (prev && list.some((p) => p.name === prev)) return prev;
          const a4Default = list.find((p) => !p.is_thermal && p.is_default);
          const nonThermal = list.find((p) => !p.is_thermal);
          const def = list.find((p) => p.is_default);
          return a4Default ? a4Default.name : (nonThermal ? nonThermal.name : (def ? def.name : list[0].name));
        });
      }
    } catch (err) {
      console.error('Failed to load system printers:', err);
    } finally {
      setLoadingPrinters(false);
    }
  };

  useEffect(() => {
    if (isUnlocked && activeTab === 'printer') {
      loadPrinters();
    }
  }, [isUnlocked, activeTab]);

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
        loadPrinters();
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
        thermal_print_mode: thermalPrintMode,
        thermal_header_style: thermalHeaderStyle,
        thermal_layout: thermalLayout,
        thermal_darkness: thermalDarkness,
        thermal_printer_profile: thermalPrinterProfile,
        thermal_cut_mode: thermalCutMode,
        thermal_feed_lines: thermalFeedLines,
        selected_thermal_printer: selectedThermalPrinter,
        selected_a4_printer: selectedA4Printer,
        skip_receipt_preview: skipReceiptPreview,
        show_letterhead: showLetterhead,
        hide_header_text_with_letterhead: hideHeaderTextWithLetterhead,
        receipt_letterhead_path: letterheadImage || null,
        invoice_title: invoiceTitle.trim() || 'TAX INVOICE',
        enable_quotations: enableQuotations,
        enable_navigation_hub: enableNavigationHub,
        enable_pos_quick_pay: enablePosQuickPay,
        theme_mode: themeMode,
        color_theme: colorTheme,
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

  const handleToggleLockDashboardFinances = async (checked: boolean) => {
    setLockDashboardFinances(checked);
    setSaving(true);
    setErrorMsg(null);
    try {
      await api.updateSettings({
        lock_dashboard_finances: checked,
      });
      onSettingsUpdated();
      setSuccessMsg(
        checked
          ? 'Dashboard financial lock enabled! Unmasking revenue and profit on the dashboard will require a PIN or password.'
          : 'Dashboard financial lock disabled. Financials can now be toggled freely.'
      );
    } catch (err: any) {
      setLockDashboardFinances(!checked);
      setErrorMsg(err.detail || 'Failed to update dashboard financial privacy lock.');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateDashboardPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dashboardFinancialsPin.trim()) return;
    setSavingPrivacy(true);
    setErrorMsg(null);
    try {
      await api.updateSettings({
        dashboard_financials_pin: dashboardFinancialsPin.trim(),
      });
      onSettingsUpdated();
      setSuccessMsg('Dashboard Financial Unlock PIN updated successfully!');
      setDashboardFinancialsPin('');
    } catch (err: any) {
      setErrorMsg(err.detail || 'Failed to update dashboard unlock PIN.');
    } finally {
      setSavingPrivacy(false);
    }
  };

  const handleToggleSkipReceiptPreview = async (checked: boolean) => {
    setSkipReceiptPreview(checked);
    const targetMode = checked && thermalPrintMode === 'browser' ? 'direct_escpos' : thermalPrintMode;
    if (targetMode !== thermalPrintMode) {
      setThermalPrintMode(targetMode);
    }
    try {
      await api.updateSettings({
        skip_receipt_preview: checked,
        thermal_print_mode: targetMode,
      });
      onSettingsUpdated();
      setSuccessMsg(
        checked
          ? '1-Click Auto-Print enabled! Completing a sale will automatically print directly without preview.'
          : 'Preview modal restored for POS checkout.'
      );
    } catch (err: any) {
      setErrorMsg(err.detail || 'Failed to update auto-print setting.');
    }
  };

  const handleChangeThermalPrinter = async (printerName: string) => {
    setSelectedThermalPrinter(printerName);
    try {
      await api.updateSettings({
        selected_thermal_printer: printerName,
      });
      onSettingsUpdated();
      setSuccessMsg(`Thermal printer assigned to "${printerName || 'Auto-detect'}"`);
    } catch (err: any) {
      setErrorMsg(err.detail || 'Failed to save assigned thermal printer.');
    }
  };

  const handleChangeA4Printer = async (printerName: string) => {
    setSelectedA4Printer(printerName);
    try {
      await api.updateSettings({
        selected_a4_printer: printerName,
      });
      onSettingsUpdated();
      setSuccessMsg(`A4 document printer assigned to "${printerName || 'System Default'}"`);
    } catch (err: any) {
      setErrorMsg(err.detail || 'Failed to save assigned A4 printer.');
    }
  };

  const handleChangeThermalPrintMode = async (mode: 'browser' | 'direct_escpos') => {
    setThermalPrintMode(mode);
    try {
      await api.updateSettings({
        thermal_print_mode: mode,
      });
      onSettingsUpdated();
      setSuccessMsg(
        mode === 'direct_escpos'
          ? 'Direct ESC/POS engine active! Fast 1-click instant receipt spooling.'
          : 'Browser print dialog mode active.'
      );
    } catch (err: any) {
      setErrorMsg(err.detail || 'Failed to update printing mode.');
    }
  };

  const handleChangeThermalLayout = async (
    layout: 'classic' | 'modern' | 'tabular' | 'compact' | 'elegant'
  ) => {
    setThermalLayout(layout);
    try {
      await api.updateSettings({
        thermal_layout: layout,
      });
      onSettingsUpdated();
      const layoutNames: Record<string, string> = {
        classic: 'Classic Retail POS (Default)',
        modern: 'Modern Clean',
        tabular: 'Detailed Multi-Column Tabular',
        compact: 'Compact Express (Paper Saver)',
        elegant: 'Elegant Boutique (Café & Salon)',
      };
      setSuccessMsg(`Thermal receipt layout set to ${layoutNames[layout] || layout}!`);
    } catch (err: any) {
      setErrorMsg(err.detail || 'Failed to update layout setting.');
    }
  };

  const handleChangeThermalHeaderStyle = async (style: 'logo_text' | 'text_only') => {
    setThermalHeaderStyle(style);
    try {
      await api.updateSettings({
        thermal_header_style: style,
      });
      onSettingsUpdated();
      setSuccessMsg(
        style === 'logo_text'
          ? 'Thermal receipt header set to Logo + Text (Active)!'
          : 'Thermal receipt header set to Clean Text-Only (No Logo)!'
      );
    } catch (err: any) {
      setErrorMsg(err.detail || 'Failed to update header style setting.');
    }
  };

  const handleChangePrinterProfile = async (
    profile: 'standard_escpos' | 'xprinter_enhanced' | 'star_line' | 'generic_plain'
  ) => {
    setThermalPrinterProfile(profile);
    try {
      await api.updateSettings({
        thermal_printer_profile: profile,
      });
      onSettingsUpdated();
      setSuccessMsg(`Thermal printer hardware profile set to ${profile.toUpperCase()}`);
    } catch (err: any) {
      setErrorMsg(err.detail || 'Failed to update printer profile.');
    }
  };

  const handleChangeCutMode = async (mode: 'partial' | 'full' | 'tear_only') => {
    setThermalCutMode(mode);
    try {
      await api.updateSettings({
        thermal_cut_mode: mode,
      });
      onSettingsUpdated();
      setSuccessMsg(`Auto-cutter action set to ${mode.toUpperCase()}`);
    } catch (err: any) {
      setErrorMsg(err.detail || 'Failed to update cutter action.');
    }
  };

  const handleChangeFeedLines = async (lines: number) => {
    setThermalFeedLines(lines);
    try {
      await api.updateSettings({
        thermal_feed_lines: lines,
      });
      onSettingsUpdated();
    } catch (err: any) {
      setErrorMsg(err.detail || 'Failed to update feed spacing.');
    }
  };

  const handleChangePrinterType = async (type: any) => {
    setPrinterType(type);
    try {
      await api.updateSettings({
        receipt_printer_type: type,
      });
      onSettingsUpdated();
      setSuccessMsg(`Receipt roll width set to ${type}`);
    } catch (err: any) {
      setErrorMsg(err.detail || 'Failed to update roll width.');
    }
  };

  const handleClearPrinterQueue = async () => {
    setClearingQueue(true);
    try {
      const res = await api.clearPrinterQueue(selectedThermalPrinter || undefined);
      setSuccessMsg(res.message);
      await loadPrinters();
    } catch (err: any) {
      setErrorMsg(err.detail || 'Failed to clear printer queue.');
    } finally {
      setClearingQueue(false);
    }
  };

  const handleTestDirectPrint = async () => {
    setDirectPrintingTest(true);
    setTestPrintFeedback(null);
    try {
      // Snapshot the live preview receipt in settings for 100% exact visual parity
      const rasterImage = await rasterizeReceiptElement('settings-preview-thermal-receipt');

      const res = await api.printThermalDirect({
        is_sample: true,
        printer_name: selectedThermalPrinter || undefined,
        paper_width: printerType,
        header_style: thermalHeaderStyle,
        layout: thermalLayout,
        show_barcode: showBarcode,
        darkness: thermalDarkness,
        printer_profile: thermalPrinterProfile,
        cut_mode: thermalCutMode,
        feed_lines: thermalFeedLines,
        raster_image: rasterImage || undefined,
      });
      if (res.is_online === false || res.warning) {
        setTestPrintFeedback({
          type: 'warning',
          message: `⚠️ Test receipt spooled for '${res.printer}', but printer is currently OFFLINE or Powered Off. Turn on printer power or check USB connection to complete printing.`,
        });
      } else {
        setTestPrintFeedback({
          type: 'success',
          message: `Direct ESC/POS test receipt sent to '${res.printer}' successfully! (${res.bytes_sent} bytes dispatched)`,
        });
      }
    } catch (err: any) {
      setTestPrintFeedback({
        type: 'error',
        message: err.detail || 'Direct ESC/POS test print failed. Check printer connection or power.',
      });
    } finally {
      setDirectPrintingTest(false);
    }
  };

  const handleTestDiagnosticPrint = async () => {
    setDiagnosticPrintingTest(true);
    setTestPrintFeedback(null);
    try {
      const res = await api.printThermalDiagnostic({
        printer_name: selectedThermalPrinter || undefined,
        paper_width: printerType,
        printer_profile: thermalPrinterProfile,
        darkness: thermalDarkness,
        cut_mode: thermalCutMode,
        feed_lines: thermalFeedLines,
      });
      if (res.is_online === false || res.warning) {
        setTestPrintFeedback({
          type: 'warning',
          message: `⚠️ Diagnostic receipt spooled for '${res.printer}', but printer is currently OFFLINE or Powered Off. Turn on printer power or check USB connection to complete calibration.`,
        });
      } else {
        setTestPrintFeedback({
          type: 'success',
          message: `Universal Diagnostic & Calibration receipt sent to '${res.printer}' successfully! (${res.bytes_sent} bytes dispatched)`,
        });
      }
    } catch (err: any) {
      setTestPrintFeedback({
        type: 'error',
        message: err.detail || 'Diagnostic print failed. Check printer connection or network IP.',
      });
    } finally {
      setDiagnosticPrintingTest(false);
    }
  };

  const handleTestBrowserPrint = () => {
    printElement('settings-preview-thermal-receipt', {
      title: 'Sample_Test_Receipt',
      isThermal: true,
      paperWidth: (printerType === '58mm' ? '58mm' : '80mm'),
    });
  };

  const handleOpenResetModal = (mode: 'sales_only' | 'inventory_only' | 'all_data') => {
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
      <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-slate-200 dark:border-slate-800">
        {[
          { id: 'business', label: 'Business Profile', icon: <Store className="h-4 w-4" /> },
          { id: 'appearance', label: 'Appearance & Themes', icon: <Palette className="h-4 w-4" /> },
          { id: 'tax', label: 'Tax Settings', icon: <Percent className="h-4 w-4" /> },
          { id: 'custom_fields', label: 'Custom Product Fields', icon: <Sliders className="h-4 w-4" /> },
          { id: 'printer', label: 'Receipt & Printer', icon: <Printer className="h-4 w-4" /> },
          { id: 'barcode', label: 'Barcodes & Scanners', icon: <Barcode className="h-4 w-4" /> },
          { id: 'backup', label: 'Backup & Cloud Sync', icon: <Database className="h-4 w-4" /> },
          { id: 'users', label: 'Staff & Devices', icon: <Users className="h-4 w-4" /> },
          { id: 'security', label: 'Security & PIN', icon: <KeyRound className="h-4 w-4" /> },
          { id: 'danger_zone', label: 'Wipe / Reset Data', icon: <Trash2 className="h-4 w-4 text-rose-500" /> },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
              activeTab === tab.id
                ? 'bg-slate-900 dark:bg-slate-800 text-white shadow-sm'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/80'
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

            {/* Central Navigation Hub Toggle */}
            <div className="pt-3 border-t border-slate-100 space-y-3">
              <div>
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Compass className="h-4 w-4 text-emerald-600" />
                  Navigation Hub
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Enable the central departmental visual dashboard with live statistics and keyboard quick-links. Keyboard shortcuts remain active across the entire app at all times.
                </p>
              </div>

              <label className="flex items-start gap-3 p-3.5 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 cursor-pointer transition">
                <input
                  type="checkbox"
                  checked={enableNavigationHub}
                  onChange={(e) => setEnableNavigationHub(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <div className="text-xs">
                  <span className="font-bold text-slate-800 block">Enable Central Navigation Hub</span>
                  <span className="text-slate-500 text-[11px] leading-relaxed">
                    Display the Navigation Hub in the sidebar and top navigation for quick departmental overview and access.
                  </span>
                </div>
              </label>
            </div>

            {/* POS & Keyboard Navigation */}
            <div className="pt-3 border-t border-slate-100 space-y-3">
              <div>
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Keyboard className="h-4 w-4 text-emerald-600" />
                  POS & Keyboard Navigation
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Optimize checkout speed with keyboard-first flows.
                </p>
              </div>

              <label className="flex items-start gap-3 p-3.5 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 cursor-pointer transition">
                <input
                  type="checkbox"
                  checked={enablePosQuickPay}
                  onChange={(e) => setEnablePosQuickPay(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <div className="text-xs">
                  <span className="font-bold text-slate-800 block">
                    Quick-Pay Dialogue on Ctrl + Enter (or Cmd + Enter / F9)
                  </span>
                  <span className="text-slate-500 text-[11px] leading-relaxed">
                    When pressing Ctrl+Enter in POS, opens a fast pop-up dialogue to enter the amount paid, preview change or remaining due, and finalize on Enter. Pressing Esc closes the dialogue and preserves the sale on screen.
                  </span>
                </div>
              </label>
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

      {/* Tab: Appearance & Themes */}
      {activeTab === 'appearance' && (
        <div className="max-w-3xl space-y-6">
          {/* Display Mode (Light / Dark / System) */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-5">
            <div>
              <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base flex items-center gap-2">
                <Palette className="h-5 w-5 text-brand-600" />
                Display Theme & Mode
              </h3>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                Customize your display mode to reduce eye strain or match your operating system theme.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                {
                  id: 'light',
                  title: 'Light Mode',
                  desc: 'Crisp daylight interface',
                  icon: <Sun className="h-5 w-5 text-amber-500" />,
                },
                {
                  id: 'dark',
                  title: 'Dark Mode',
                  desc: 'Deep slate & charcoal palette',
                  icon: <Moon className="h-5 w-5 text-indigo-400" />,
                },
                {
                  id: 'system',
                  title: 'System Auto',
                  desc: 'Matches device OS setting',
                  icon: <Monitor className="h-5 w-5 text-slate-400" />,
                },
              ].map((m) => {
                const isSelected = themeMode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setThemeMode(m.id as ThemeMode)}
                    className={`flex flex-col text-left p-4 rounded-2xl border-2 transition-all relative ${
                      isSelected
                        ? 'border-brand-600 bg-brand-50/50 dark:bg-brand-950/30 ring-2 ring-brand-500/20 shadow-sm'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/40 dark:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-2">
                      <div className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 shadow-2xs">
                        {m.icon}
                      </div>
                      {isSelected && (
                        <div className="h-5 w-5 rounded-full bg-brand-600 text-white flex items-center justify-center">
                          <Check className="h-3 w-3 stroke-[3]" />
                        </div>
                      )}
                    </div>
                    <span className="font-bold text-sm text-slate-800 dark:text-slate-100">{m.title}</span>
                    <span className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 leading-snug">{m.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Color Themes */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-5">
            <div>
              <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base">Brand Accent Color</h3>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                Choose the primary accent color applied across buttons, highlights, badges, and POS controls.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {COLOR_THEME_OPTIONS.map((c) => {
                const isSelected = colorTheme === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setColorTheme(c.id)}
                    className={`flex items-start gap-3.5 p-4 rounded-2xl border-2 transition-all text-left relative ${
                      isSelected
                        ? 'border-brand-600 bg-brand-50/40 dark:bg-brand-950/20 ring-2 ring-brand-500/20 shadow-sm'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/30 dark:bg-slate-800/30'
                    }`}
                  >
                    <div
                      className={`h-9 w-9 rounded-xl ${c.previewClass} flex items-center justify-center text-white shadow-sm shrink-0`}
                    >
                      {isSelected ? <Check className="h-4 w-4 stroke-[3]" /> : null}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-slate-800 dark:text-slate-100">{c.name}</span>
                        {isSelected && (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-100 text-brand-800 dark:bg-brand-900/60 dark:text-brand-300">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 leading-snug">{c.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Live Component Preview */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
                Live Component Preview
              </span>
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700 flex flex-wrap items-center gap-3">
                <Button variant="primary" size="sm">
                  Primary Action
                </Button>
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300 border border-brand-200 dark:border-brand-800"
                >
                  Active Tag
                </button>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-600 dark:text-brand-400">
                  <span className="h-2 w-2 rounded-full bg-brand-500 animate-pulse"></span>
                  Live Indicator
                </div>
              </div>
            </div>
          </div>

          {/* Thermal Receipt Layout & Styling (Near Themes) */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base flex items-center gap-2">
                  <Receipt className="h-5 w-5 text-brand-600" />
                  Thermal Receipt Layout & Styling
                </h3>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                  Select a popular visual layout for your printed thermal receipts and checkout preview.
                </p>
              </div>
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 self-start sm:self-auto">
                Auto-saves instantly
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {THERMAL_LAYOUT_OPTIONS.map((lo) => {
                const isSelected = thermalLayout === lo.id;
                return (
                  <button
                    key={lo.id}
                    type="button"
                    onClick={() => handleChangeThermalLayout(lo.id)}
                    className={`flex flex-col text-left p-4 rounded-2xl border-2 transition-all relative ${
                      isSelected
                        ? 'border-brand-600 bg-brand-50/50 dark:bg-brand-950/30 ring-2 ring-brand-500/20 shadow-sm'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/40 dark:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-2">
                      <div
                        className={`p-2 rounded-xl border shadow-2xs ${
                          isSelected
                            ? 'bg-brand-600 text-white border-brand-500'
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {renderLayoutIcon(lo.iconName)}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {lo.badge && (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${lo.badgeColor}`}>
                            {lo.badge}
                          </span>
                        )}
                        {isSelected && (
                          <div className="h-5 w-5 rounded-full bg-brand-600 text-white flex items-center justify-center">
                            <Check className="h-3 w-3 stroke-[3]" />
                          </div>
                        )}
                      </div>
                    </div>
                    <span className="font-bold text-sm text-slate-800 dark:text-slate-100">{lo.title}</span>
                    <span className="text-[11px] font-semibold text-brand-600 dark:text-brand-400 mt-0.5">{lo.subtitle}</span>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 leading-snug">{lo.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Receipt Print Protection Banner */}
          <div className="p-4 rounded-2xl bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 flex items-start gap-3">
            <Info className="h-5 w-5 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
            <div className="text-xs">
              <span className="font-bold text-sky-900 dark:text-sky-200 block">Print & Thermal Immunity</span>
              <span className="text-sky-700 dark:text-sky-300 leading-relaxed block mt-0.5">
                Regardless of the selected theme or dark mode, thermal receipts and A4 invoices always print with crisp black text on pure white paper to conserve printer ink and ensure professional legal compliance.
              </span>
            </div>
          </div>

          {/* Save Button */}
          <div className="pt-1 flex items-center gap-3">
            <Button
              type="button"
              variant="primary"
              loading={saving}
              onClick={handleSaveSettings}
            >
              Save Appearance
            </Button>
            <span className="text-xs text-slate-400 dark:text-slate-500">
              Settings persist across restarts and browser sessions.
            </span>
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
        <div className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            {/* Left Column: Configuration Forms (7 cols on XL) */}
            <div className="xl:col-span-7 space-y-6">
              <form onSubmit={handleSaveSettings} className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-slate-800 text-base">Receipt & Invoice Formatting</h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Configure thermal receipt printing, raw ESC/POS hardware spooling, and corporate PDF/A4 letterheads.
                    </p>
                  </div>
                  <Button type="submit" variant="primary" loading={saving} size="sm" className="font-bold shrink-0 shadow-sm">
                    Save Receipt Settings
                  </Button>
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
                            <span className="text-[10px] font-bold px-1.5 py-0.5 bg-emerald-200 text-emerald-800 rounded-md">Active</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                          Optimized for 80mm & 58mm thermal printers. Fast checkout, compact footprint, fast cuts.
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
                            <span className="text-[10px] font-bold px-1.5 py-0.5 bg-emerald-200 text-emerald-800 rounded-md">Active</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                          Full-page corporate layout. Supports custom letterhead graphics, detailed tables & signature blocks.
                        </p>
                      </div>
                    </button>
                  </div>
                </div>

                {/* POS Checkout Receipt Preview Modal & 1-Click Print Checkbox */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-start justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-emerald-600" />
                      <span className="text-sm font-bold text-slate-800">
                        Receipt Preview Pop-up Modal
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${!skipReceiptPreview ? 'bg-indigo-100 text-indigo-800' : 'bg-emerald-100 text-emerald-800'}`}>
                        {!skipReceiptPreview ? 'Preview Modal Active' : '1-Click Silent Print'}
                      </span>
                    </div>
                    <label className="flex items-center gap-2.5 cursor-pointer pt-1">
                      <input
                        type="checkbox"
                        checked={!skipReceiptPreview}
                        onChange={(e) => handleToggleSkipReceiptPreview(!e.target.checked)}
                        className="h-4 w-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer accent-emerald-600"
                      />
                      <span className="text-xs font-bold text-slate-700">
                        Show receipt preview pop-up modal before printing
                      </span>
                    </label>
                    <p className="text-xs text-slate-500 leading-relaxed max-w-xl pl-6.5">
                      Keep this checked to review receipts in the interactive pop-up before printing. Uncheck it to enable fast <strong>1-Click Silent Print</strong> directly to your assigned printer on sale confirmation.
                    </p>
                  </div>
                </div>

                {/* Dual Hardware Printer Devices (Avoid Hardware Conflicts) */}
                <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                        <Printer className="h-4 w-4 text-emerald-600" />
                        Hardware Printer Device Assignments
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Assign independent physical printers for POS receipts vs A4 invoices/reports to prevent device conflicts.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleClearPrinterQueue}
                        disabled={clearingQueue}
                        className="px-2.5 py-1 text-xs font-bold text-slate-600 hover:text-rose-700 flex items-center gap-1 rounded-lg border border-slate-200 bg-white hover:bg-rose-50 transition"
                        title="Cancel all pending/stuck print jobs in the printer queue"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                        <span>{clearingQueue ? 'Clearing...' : 'Clear Queue'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={loadPrinters}
                        disabled={loadingPrinters}
                        className="px-2.5 py-1 text-xs font-bold text-slate-600 hover:text-emerald-700 flex items-center gap-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition"
                        title="Rescan connected printers"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${loadingPrinters ? 'animate-spin text-emerald-600' : ''}`} />
                        <span>Rescan</span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Device 1: Thermal Receipt Printer */}
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                          <Receipt className="h-3.5 w-3.5 text-emerald-600" />
                          POS Thermal Receipt Printer
                        </label>
                        <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60">
                          POS Rolls
                        </span>
                      </div>
                      <select
                        value={selectedThermalPrinter}
                        onChange={(e) => handleChangeThermalPrinter(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-emerald-500 shadow-xs"
                      >
                        <option value="">-- Auto-detect Thermal Printer --</option>
                        {systemPrinters.map((p) => (
                          <option key={p.name} value={p.name}>
                            {p.name} {p.is_online === false ? '● [Offline / Powered Off]' : '● [Online]'} {p.is_thermal ? '★ (Detected Thermal POS)' : ''} {p.is_default ? '(Default)' : ''}
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-slate-500">
                        Assigned to: <strong className="text-slate-800 font-mono">{selectedThermalPrinter || 'Auto-detect'}</strong>
                      </p>
                    </div>

                    {/* Device 2: Document / A4 Invoice Printer */}
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                          <FileText className="h-3.5 w-3.5 text-blue-600" />
                          Document & A4 Invoice Printer
                        </label>
                        <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200/60">
                          A4 Invoices & Reports
                        </span>
                      </div>
                      <select
                        value={selectedA4Printer}
                        onChange={(e) => handleChangeA4Printer(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-blue-500 shadow-xs"
                      >
                        <option value="">-- System Default A4 Printer --</option>
                        {systemPrinters.map((p) => (
                          <option key={p.name} value={p.name}>
                            {p.name} {p.is_online === false ? '● [Offline / Powered Off]' : '● [Online]'} {!p.is_thermal ? '★ (Standard A4 / Laser)' : ''} {p.is_default ? '(Default)' : ''}
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-slate-500">
                        Assigned to: <strong className="text-slate-800 font-mono">{selectedA4Printer || 'System Default'}</strong>
                      </p>
                    </div>
                  </div>
                </div>

                {/* Conditional Options for Thermal */}
                {receiptType === 'thermal' && (
                  <div className="space-y-5 pt-3 border-t border-slate-100">
                    {/* Thermal Print Engine Mode Selection */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                          Thermal Printing Engine Mode
                        </label>
                        <span className="text-[11px] text-slate-400">
                          Dual Option: macOS & Windows
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Option 1: Direct ESC/POS */}
                        <button
                          type="button"
                          onClick={() => handleChangeThermalPrintMode('direct_escpos')}
                          className={`p-4 rounded-2xl border-2 text-left transition-all flex flex-col justify-between ${
                            thermalPrintMode === 'direct_escpos'
                              ? 'border-emerald-600 bg-emerald-50/40 shadow-sm ring-1 ring-emerald-500/20'
                              : 'border-slate-200 hover:border-slate-300 bg-white'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between gap-1 mb-1.5">
                              <span className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                                <Zap className="h-4 w-4 text-emerald-600" />
                                Direct ESC/POS Engine
                              </span>
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 shrink-0">
                                Recommended
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 leading-relaxed">
                              Dispatches raw binary commands straight to the thermal printer via system spooler. 1-click instant checkout, automatic continuous paper cut, and completely immune to PostScript errors.
                            </p>
                          </div>
                          <div className="mt-3 text-[10px] font-semibold text-emerald-700 flex items-center gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5" /> 1-Click fast raw printing without browser dialog
                          </div>
                        </button>

                        {/* Option 2: Browser Print Dialog */}
                        <button
                          type="button"
                          onClick={() => handleChangeThermalPrintMode('browser')}
                          className={`p-4 rounded-2xl border-2 text-left transition-all flex flex-col justify-between ${
                            thermalPrintMode === 'browser'
                              ? 'border-emerald-600 bg-emerald-50/40 shadow-sm ring-1 ring-emerald-500/20'
                              : 'border-slate-200 hover:border-slate-300 bg-white'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between gap-1 mb-1.5">
                              <span className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                                <Printer className="h-4 w-4 text-blue-600" />
                                Browser Print Dialog
                              </span>
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 shrink-0">
                                Standard OS
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 leading-relaxed">
                              Opens your browser's native print preview dialog. Standard for Windows environments with official vendor printer drivers installed, or when selecting different destination printers on the fly.
                            </p>
                          </div>
                          <div className="mt-3 text-[10px] font-semibold text-slate-600 flex items-center gap-1">
                            <span>Continuous single-loop roll without browser page breaks</span>
                          </div>
                        </button>
                      </div>

                      {/* Browser Print Preview Configuration Guide */}
                      {thermalPrintMode === 'browser' && (
                        <div className="mt-3 p-4 rounded-2xl bg-blue-50/70 border border-blue-200/80 space-y-2.5">
                          <div className="flex items-center gap-2">
                            <Info className="h-4 w-4 text-blue-600 shrink-0" />
                            <span className="text-xs font-bold text-blue-950">
                              Browser Print Configuration Guide (Optimal Continuous Output)
                            </span>
                          </div>
                          <p className="text-[11px] text-blue-900 leading-relaxed">
                            Stock Manager overrides browser page heights dynamically. For flawless continuous loop printing without gaps or cuts:
                          </p>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                            <div className="bg-white p-2.5 rounded-xl border border-blue-100">
                              <span className="block text-[10px] font-bold uppercase text-slate-400">Margins</span>
                              <span className="text-xs font-bold text-slate-800">None (0mm)</span>
                            </div>
                            <div className="bg-white p-2.5 rounded-xl border border-blue-100">
                              <span className="block text-[10px] font-bold uppercase text-slate-400">Scale</span>
                              <span className="text-xs font-bold text-slate-800">100% / Default</span>
                            </div>
                            <div className="bg-white p-2.5 rounded-xl border border-blue-100">
                              <span className="block text-[10px] font-bold uppercase text-slate-400">Headers & Footers</span>
                              <span className="text-xs font-bold text-rose-700">Unchecked (Off)</span>
                            </div>
                            <div className="bg-white p-2.5 rounded-xl border border-blue-100">
                              <span className="block text-[10px] font-bold uppercase text-slate-400">Paper Size</span>
                              <span className="text-xs font-bold text-emerald-700">Roll / Continuous</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Paper Size & Barcode Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Receipt Printer Paper Size */}
                      <div>
                        <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">
                          Receipt Paper Width & Geometry
                        </label>
                        <select
                          value={printerType}
                          onChange={(e) => handleChangePrinterType(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-800 focus:outline-none focus:border-emerald-500"
                        >
                          <option value="80mm">80mm Thermal Roll (Standard Wide - 48 cols)</option>
                          <option value="80mm_compact">80mm Compact / Star (42 cols)</option>
                          <option value="58mm">58mm Thermal Roll (Standard - 32 cols)</option>
                          <option value="58mm_narrow">58mm Narrow POS (Budget - 30 cols)</option>
                          <option value="standard">Standard A4 / Letter Page</option>
                        </select>
                      </div>

                      {/* Barcode toggle on receipt */}
                      <div>
                        <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">
                          Receipt Barcode (Code-128)
                        </label>
                        <label className="flex items-center gap-2.5 p-2.5 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100/60 transition">
                          <input
                            type="checkbox"
                            checked={showBarcode}
                            onChange={(e) => setShowBarcode(e.target.checked)}
                            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                          />
                          <span className="text-xs font-bold text-slate-700">
                            Print Barcode at Bottom
                          </span>
                        </label>
                      </div>
                    </div>

                    {/* Printer Hardware Profile / Dialect */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-bold uppercase text-slate-500 flex items-center gap-1.5">
                          <Cpu className="h-3.5 w-3.5 text-emerald-600" />
                          Printer Hardware Protocol & Dialect
                        </label>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                          Multi-Brand Universal
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                        <button
                          type="button"
                          onClick={() => handleChangePrinterProfile('standard_escpos')}
                          className={`p-3 rounded-2xl border-2 text-left transition flex flex-col justify-between ${
                            thermalPrinterProfile === 'standard_escpos'
                              ? 'border-emerald-600 bg-emerald-50/40 text-emerald-950 shadow-sm'
                              : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                          }`}
                        >
                          <div>
                            <span className="font-bold text-xs block">Standard ESC/POS</span>
                            <span className="text-[10px] text-emerald-700 font-semibold">Universal Default</span>
                            <p className="text-[10px] text-slate-500 mt-1 leading-snug">
                              Epson (TM-T88/T20), Bixolon, Citizen, Rongta, Munbyn, and standard POS printers.
                            </p>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleChangePrinterProfile('xprinter_enhanced')}
                          className={`p-3 rounded-2xl border-2 text-left transition flex flex-col justify-between ${
                            thermalPrinterProfile === 'xprinter_enhanced'
                              ? 'border-emerald-600 bg-emerald-50/40 text-emerald-950 shadow-sm'
                              : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                          }`}
                        >
                          <div>
                            <span className="font-bold text-xs block">Xprinter / POS-80</span>
                            <span className="text-[10px] text-blue-700 font-semibold">Heating Booster</span>
                            <p className="text-[10px] text-slate-500 mt-1 leading-snug">
                              POS-80, POS-58, Xprinter, Zijiang, Gprinter with hardware heating registers.
                            </p>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleChangePrinterProfile('star_line')}
                          className={`p-3 rounded-2xl border-2 text-left transition flex flex-col justify-between ${
                            thermalPrinterProfile === 'star_line'
                              ? 'border-emerald-600 bg-emerald-50/40 text-emerald-950 shadow-sm'
                              : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                          }`}
                        >
                          <div>
                            <span className="font-bold text-xs block">Star Micronics</span>
                            <span className="text-[10px] text-indigo-700 font-semibold">Star Line Mode</span>
                            <p className="text-[10px] text-slate-500 mt-1 leading-snug">
                              Star TSP100, TSP143, TSP650, TSP700, and mC-Print receipt printers.
                            </p>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleChangePrinterProfile('generic_plain')}
                          className={`p-3 rounded-2xl border-2 text-left transition flex flex-col justify-between ${
                            thermalPrinterProfile === 'generic_plain'
                              ? 'border-emerald-600 bg-emerald-50/40 text-emerald-950 shadow-sm'
                              : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                          }`}
                        >
                          <div>
                            <span className="font-bold text-xs block">Generic Plain Text</span>
                            <span className="text-[10px] text-slate-600 font-semibold">Zero Escape Codes</span>
                            <p className="text-[10px] text-slate-500 mt-1 leading-snug">
                              Clean ASCII only. For serial ticket loggers or basic dot-matrix printers.
                            </p>
                          </div>
                        </button>
                      </div>
                    </div>

                    {/* Cutter Action & Feed Distance */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Cutter Action */}
                      <div>
                        <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5 flex items-center gap-1.5">
                          <Scissors className="h-3.5 w-3.5 text-emerald-600" />
                          Auto-Cutter Action
                        </label>
                        <select
                          value={thermalCutMode}
                          onChange={(e) => handleChangeCutMode(e.target.value as any)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-800 focus:outline-none focus:border-emerald-500"
                        >
                          <option value="partial">Partial Cut (Recommended - Keeps receipt attached)</option>
                          <option value="full">Full Cut (Completely slices off receipt)</option>
                          <option value="tear_only">Manual Tear Bar Only (No mechanical blade command)</option>
                        </select>
                      </div>

                      {/* Feed Lines Before Cut */}
                      <div>
                        <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">
                          Paper Feed Spacing Before Cut / Tear
                        </label>
                        <select
                          value={thermalFeedLines}
                          onChange={(e) => handleChangeFeedLines(Number(e.target.value))}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-800 focus:outline-none focus:border-emerald-500"
                        >
                          <option value="2">2 Lines (Ultra-compact)</option>
                          <option value="3">3 Lines (Compact)</option>
                          <option value="4">4 Lines (Standard POS Default)</option>
                          <option value="5">5 Lines (Safe for manual tear bars)</option>
                          <option value="6">6 Lines (Extended margin)</option>
                        </select>
                      </div>
                    </div>

                    {/* Thermal Receipt Layout Style */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-bold uppercase text-slate-500">
                          Thermal Receipt Layout Style
                        </label>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                          Unified ESC/POS & Browser Output
                        </span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {THERMAL_LAYOUT_OPTIONS.map((lo) => {
                          const isSelected = thermalLayout === lo.id;
                          return (
                            <button
                              key={lo.id}
                              type="button"
                              onClick={() => handleChangeThermalLayout(lo.id)}
                              className={`p-3.5 rounded-2xl border-2 text-left transition flex flex-col justify-between relative ${
                                isSelected
                                  ? 'border-emerald-600 bg-emerald-50/40 text-emerald-950 shadow-sm ring-2 ring-emerald-500/20'
                                  : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                              }`}
                            >
                              <div className="flex items-center justify-between w-full mb-2">
                                <div
                                  className={`p-2 rounded-xl mt-0.5 ${
                                    isSelected ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'
                                  }`}
                                >
                                  {renderLayoutIcon(lo.iconName)}
                                </div>
                                <div className="flex items-center gap-1.5">
                                  {lo.badge && (
                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${lo.badgeColor}`}>
                                      {lo.badge}
                                    </span>
                                  )}
                                  {isSelected && (
                                    <div className="h-4 w-4 rounded-full bg-emerald-600 text-white flex items-center justify-center">
                                      <Check className="h-2.5 w-2.5 stroke-[3]" />
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div>
                                <span className="font-bold text-xs block">{lo.title}</span>
                                <span className="text-[10px] font-semibold text-emerald-700 block mt-0.5">{lo.subtitle}</span>
                                <p className="text-[11px] text-slate-500 mt-1 leading-snug">{lo.desc}</p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Thermal Header Style Cards */}
                    <div>
                      <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">
                        Thermal Receipt Header Style
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => handleChangeThermalHeaderStyle('logo_text')}
                          className={`p-3.5 rounded-2xl border-2 text-left transition flex items-start gap-3 ${
                            thermalHeaderStyle === 'logo_text'
                              ? 'border-emerald-600 bg-emerald-50/40 text-emerald-950 shadow-sm'
                              : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                          }`}
                        >
                          <div className={`p-2 rounded-xl mt-0.5 ${thermalHeaderStyle === 'logo_text' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                            <Image className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="font-bold text-xs">Logo + Text Header</div>
                            <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                              Renders thermal store logo graphic followed by business details.
                            </p>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleChangeThermalHeaderStyle('text_only')}
                          className={`p-3.5 rounded-2xl border-2 text-left transition flex items-start gap-3 ${
                            thermalHeaderStyle === 'text_only'
                              ? 'border-emerald-600 bg-emerald-50/40 text-emerald-950 shadow-sm'
                              : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                          }`}
                        >
                          <div className={`p-2 rounded-xl mt-0.5 ${thermalHeaderStyle === 'text_only' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                            <FileText className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="font-bold text-xs">Clean Text-Only Header</div>
                            <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                              Ultra-fast pure text header. Zero image raster data, 100% universal compatibility.
                            </p>
                          </div>
                        </button>
                      </div>
                    </div>

                    {/* Thermal Print Darkness & Density */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                          Thermal Print Darkness & Density
                        </label>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 flex items-center gap-1 shadow-xs">
                          <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Standard POS Contrast
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {/* Standard POS (Recommended) */}
                        <button
                          type="button"
                          onClick={() => setThermalDarkness('normal')}
                          className={`p-3.5 rounded-2xl border-2 text-left transition-all flex flex-col justify-between ${
                            thermalDarkness === 'normal'
                              ? 'border-emerald-600 bg-emerald-50/40 text-emerald-950 shadow-sm ring-1 ring-emerald-500/20'
                              : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between gap-1 mb-1.5">
                              <span className="font-bold text-xs flex items-center gap-1.5">
                                Standard POS
                              </span>
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                                Recommended
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 leading-relaxed">
                              Standard factory heating and single-burn density. Clean, crisp letters without bleeding or smudging, fast roll throughput.
                            </p>
                          </div>
                          <div className="mt-3 text-[10px] font-bold text-emerald-700 flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Standard in all POS systems
                          </div>
                        </button>

                        {/* High Density */}
                        <button
                          type="button"
                          onClick={() => setThermalDarkness('high')}
                          className={`p-3.5 rounded-2xl border-2 text-left transition-all flex flex-col justify-between ${
                            thermalDarkness === 'high'
                              ? 'border-emerald-600 bg-emerald-50/40 text-emerald-950 shadow-sm'
                              : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between gap-1 mb-1.5">
                              <span className="font-bold text-xs flex items-center gap-1.5">
                                High Density
                              </span>
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                                75% Heat
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 leading-relaxed">
                              Balanced heating duration + density 24. Crisp darker printout for high-volume receipting.
                            </p>
                          </div>
                          <div className="mt-3 text-[10px] font-medium text-slate-400">
                            Fast & clear
                          </div>
                        </button>

                        {/* Maximum Dark */}
                        <button
                          type="button"
                          onClick={() => setThermalDarkness('maximum')}
                          className={`p-3.5 rounded-2xl border-2 text-left transition-all flex flex-col justify-between ${
                            thermalDarkness === 'maximum'
                              ? 'border-slate-900 bg-slate-900 text-white shadow-md'
                              : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between gap-1 mb-1.5">
                              <span className="font-bold text-xs flex items-center gap-1.5">
                                <Flame className={`h-4 w-4 ${thermalDarkness === 'maximum' ? 'text-amber-400' : 'text-amber-600'}`} />
                                Maximum Dark
                              </span>
                              <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${
                                thermalDarkness === 'maximum' ? 'bg-amber-400 text-slate-950' : 'bg-amber-100 text-amber-900'
                              }`}>
                                100% Heat
                              </span>
                            </div>
                            <p className={`text-[11px] leading-relaxed ${thermalDarkness === 'maximum' ? 'text-slate-300' : 'text-slate-500'}`}>
                              Full 2.55ms burn time + double-strike burn. Useful only for worn or faint thermal heads.
                            </p>
                          </div>
                          <div className={`mt-3 text-[10px] font-medium ${thermalDarkness === 'maximum' ? 'text-amber-300' : 'text-slate-400'}`}>
                            Extra dark burn
                          </div>
                        </button>
                      </div>
                    </div>
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
                  <div>
                    <Input
                      label="Receipt Header Subtitle"
                      placeholder="e.g. Welcome to our store / ~ Boutique Guest Receipt ~"
                      value={receiptHeader}
                      onChange={(e) => setReceiptHeader(e.target.value)}
                    />
                    <div className="flex items-center justify-between mt-1 text-[11px] text-slate-500">
                      <span>Controls subtitle below shop name. Clear to remove completely.</span>
                      {receiptHeader && (
                        <button
                          type="button"
                          onClick={() => setReceiptHeader('')}
                          className="text-rose-600 hover:text-rose-700 font-semibold cursor-pointer underline text-[10.5px]"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <Input
                      label="Receipt Footer Note"
                      placeholder="e.g. Thank you for your business!"
                      value={receiptFooter}
                      onChange={(e) => setReceiptFooter(e.target.value)}
                    />
                    <div className="flex items-center justify-between mt-1 text-[11px] text-slate-500">
                      <span>Printed at receipt bottom. Clear to remove completely.</span>
                      {receiptFooter && (
                        <button
                          type="button"
                          onClick={() => setReceiptFooter('')}
                          className="text-rose-600 hover:text-rose-700 font-semibold cursor-pointer underline text-[10.5px]"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <Button type="submit" variant="primary" loading={saving}>
                    Save Receipt & Printer Settings
                  </Button>
                </div>
              </form>

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
                    <div className="h-16 w-48 flex items-center justify-center bg-white rounded-xl border border-slate-200 p-1">
                      <img
                        src={settings?.receipt_logo_path || settings?.logo_path || '/stokflow-receipt.png'}
                        alt="Active Receipt Logo"
                        className="h-10 w-auto max-w-[170px] object-contain"
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
                        Printed cleanly at the top of customer POS thermal receipts when Header Style is set to "Logo + Text".
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
            </div>

            {/* Right Column: Live Interactive Thermal Receipt Preview (5 cols on XL) */}
            <div className="xl:col-span-5 space-y-4">
              <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm space-y-4 sticky top-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                      <Receipt className="h-4 w-4 text-emerald-600" />
                      Live Receipt Preview
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Updates instantly as you modify settings on the left
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md">
                      {printerType === '58mm' ? '58mm Roll' : '80mm Roll'}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md">
                      {thermalLayout === 'classic' ? 'Classic POS' : 'Modern Clean'}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-md">
                      {thermalHeaderStyle === 'logo_text' ? 'Logo + Text' : 'Text Only'}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 ${
                      thermalDarkness === 'maximum'
                        ? 'bg-slate-900 text-amber-300'
                        : thermalDarkness === 'high'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-200 text-slate-700'
                    }`}>
                      <Flame className="h-3 w-3" />
                      {thermalDarkness === 'maximum' ? 'Max Dark' : thermalDarkness === 'high' ? 'High Dark' : 'Standard'}
                    </span>
                  </div>
                </div>

                {/* Live Thermal Receipt Component Display */}
                <div className="bg-slate-100/90 p-3 sm:p-4 rounded-2xl border border-slate-200 max-h-[520px] overflow-y-auto flex justify-center shadow-inner">
                  <ThermalReceipt
                    id="settings-preview-thermal-receipt"
                    sale={sampleTestSale}
                    businessName={bizName}
                    phone={bizPhone}
                    address={bizAddress}
                    currency={currency}
                    headerText={receiptHeader}
                    footerText={receiptFooter}
                    paperWidth={printerType === '58mm' ? '58mm' : '80mm'}
                    headerStyle={thermalHeaderStyle}
                    layout={thermalLayout}
                    showBarcode={showBarcode}
                    settings={{
                      ...(settings || {}),
                      business_name: bizName,
                      phone: bizPhone,
                      address: bizAddress,
                      currency: currency,
                      receipt_header: receiptHeader,
                      receipt_footer: receiptFooter,
                      receipt_printer_type: printerType as any,
                      thermal_header_style: thermalHeaderStyle,
                      thermal_layout: thermalLayout,
                      thermal_darkness: thermalDarkness,
                      show_barcode: showBarcode,
                      receipt_logo_path: settings?.receipt_logo_path,
                      logo_path: settings?.logo_path,
                    } as any}
                  />
                </div>

                {/* Feedback banner */}
                {testPrintFeedback && (
                  <div
                    className={`p-3 rounded-xl text-xs font-semibold flex items-center justify-between gap-2 ${
                      testPrintFeedback.type === 'success'
                        ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                        : testPrintFeedback.type === 'warning'
                        ? 'bg-amber-50 border border-amber-200 text-amber-800'
                        : 'bg-rose-50 border border-rose-200 text-rose-700'
                    }`}
                  >
                    <span className="leading-snug">{testPrintFeedback.message}</span>
                    <button
                      type="button"
                      onClick={() => setTestPrintFeedback(null)}
                      className="text-[10px] font-bold underline shrink-0"
                    >
                      Dismiss
                    </button>
                  </div>
                )}

                {/* Live Test Actions */}
                <div className="space-y-2 pt-1">
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      loading={directPrintingTest}
                      onClick={handleTestDirectPrint}
                      className="font-bold text-xs flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 shadow-sm"
                      title="Send raw ESC/POS commands directly to the selected thermal printer"
                    >
                      <Zap className="h-3.5 w-3.5" />
                      Test Direct Print
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleTestBrowserPrint}
                      className="font-bold text-xs flex items-center justify-center gap-1.5"
                      title="Open browser print dialog for the live receipt"
                    >
                      <Printer className="h-3.5 w-3.5" />
                      Test Browser Print
                    </Button>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    loading={diagnosticPrintingTest}
                    onClick={handleTestDiagnosticPrint}
                    className="w-full font-bold text-xs flex items-center justify-center gap-1.5 bg-slate-50 hover:bg-slate-100 border-dashed border-slate-300 text-slate-700 shadow-xs"
                    title="Print full hardware calibration test with column rulers, density test, and cutter check"
                  >
                    <Sliders className="h-3.5 w-3.5 text-emerald-600" />
                    Print Diagnostic & Calibration Test
                  </Button>
                </div>

                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={() => setShowTestReceiptModal(true)}
                    className="text-[11px] font-semibold text-slate-500 hover:text-emerald-700 underline"
                  >
                    Open Fullscreen Interactive Test Dialog
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* OS Driver Advisory: macOS CUPS vs Windows */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-2xl bg-amber-50 text-amber-600 mt-0.5 shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h4 className="font-bold text-slate-800 text-sm">
                  Thermal Printer Troubleshooting & OS Driver Setup (macOS & Windows)
                </h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Understanding why thermal printers can print endless PostScript code (such as <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[10px]">/imageType 3 /InterleaveType 2 /DataDict currentdict</code>) and how StokFlow guarantees clean receipt printing.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2.5">
                <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-800 font-mono text-[10px]">macOS</span>
                  <span>CUPS Driver PostScript Bypass</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  When USB thermal printers are plugged into a Mac without manufacturer drivers, macOS defaults them to <strong>"Generic PostScript Printer"</strong>. PostScript drivers attempt to render CSS graphics as PostScript code, causing thermal printers to print code endlessly.
                </p>
                <div className="text-[11px] text-emerald-800 font-semibold bg-emerald-50/80 p-2.5 rounded-xl border border-emerald-200/60 leading-relaxed">
                  ✓ <strong>Recommended Fix:</strong> Select <strong>"Direct ESC/POS Engine"</strong> above. StokFlow sends raw commands directly to <code className="font-mono text-[10px]">/usr/bin/lpr -l</code>, bypassing CUPS PostScript filters completely!
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2.5">
                <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-mono text-[10px]">Windows</span>
                  <span>Native Spooler & Dual Mode Support</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  On Windows 10/11, official POS receipt drivers (POS-80, POS-58, Xprinter, Epson) install raster spoolers that work out-of-the-box with both <strong>Browser Print Dialog</strong> and <strong>Direct ESC/POS Engine</strong>.
                </p>
                <div className="text-[11px] text-blue-800 font-semibold bg-blue-50/80 p-2.5 rounded-xl border border-blue-200/60 leading-relaxed">
                  ✓ <strong>On Windows:</strong> Both modes function seamlessly. Direct ESC/POS offers the speed advantage of skipping the print dialog on every checkout.
                </div>
              </div>
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

      {/* Tab: Users & Terminals */}
      {activeTab === 'users' && (
        <div className="max-w-4xl">
          <UsersManagementTab />
        </div>
      )}

      {/* Tab: Security */}
      {activeTab === 'security' && (
        <div className="space-y-6 max-w-4xl">
          {/* Dashboard Financial Privacy Card */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-6">
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-lg">Dashboard Financial Privacy & Masking</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Control who can view daily revenue, gross profit, and sensitive financial statistics on the dashboard.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                  lockDashboardFinances 
                    ? 'bg-amber-50 text-amber-700 border border-amber-200' 
                    : 'bg-slate-100 text-slate-600'
                }`}>
                  {lockDashboardFinances ? 'Password / PIN Locked' : 'Unlocked Mode'}
                </span>
              </div>
            </div>

            {/* Toggle Switch */}
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-200">
              <div className="space-y-1 pr-4">
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4 text-slate-700" />
                  <span className="font-semibold text-slate-800 text-sm">
                    Lock Revenue & Profit Behind PIN / Password
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  When enabled, clicking the eye icon on the dashboard to reveal masked revenue or profits prompts for a PIN or admin password.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                <input
                  type="checkbox"
                  checked={lockDashboardFinances}
                  onChange={(e) => handleToggleLockDashboardFinances(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>

            {/* Optional Custom Unlock PIN Form */}
            {lockDashboardFinances && (
              <form onSubmit={handleUpdateDashboardPin} className="space-y-4 pt-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-slate-800 text-sm">Custom Financial Unlock PIN (Optional)</h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Set a dedicated quick PIN to reveal financials. If not set, your Configuration PIN (default: 1234) or Admin Password can also be used.
                    </p>
                  </div>
                  {settings?.has_dashboard_financials_pin && (
                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Custom PIN Active
                    </span>
                  )}
                </div>

                <div className="flex gap-3 items-end max-w-md">
                  <div className="flex-1">
                    <Input
                      label="New Financial Unlock PIN"
                      type="password"
                      placeholder="e.g. 5555"
                      maxLength={8}
                      value={dashboardFinancialsPin}
                      onChange={(e) => setDashboardFinancialsPin(e.target.value)}
                    />
                  </div>
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={savingPrivacy || !dashboardFinancialsPin.trim()}
                    className="mb-0.5"
                  >
                    {savingPrivacy ? 'Saving...' : 'Set PIN'}
                  </Button>
                </div>
              </form>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Option 1: Reset Sales & Records (Retains Stock & Products) */}
            <div className="bg-white rounded-3xl border-2 border-indigo-200/90 p-6 shadow-sm flex flex-col justify-between space-y-5">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-indigo-700">
                    <RotateCcw className="h-5 w-5" />
                    <h3 className="font-black text-base">Reset Sales & Records</h3>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Retains Stock
                  </span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Purges all <strong>sales receipts, sale items, payments, returns, quotations, and customer payments</strong>.
                  Safely restores all consumed inventory back to your in-stock counts.
                </p>
                <div className="p-3 rounded-2xl bg-indigo-50/70 border border-indigo-100 text-[11px] text-indigo-900 font-semibold space-y-1">
                  <div>• Retains 100% of Products & Categories</div>
                  <div>• Restores Consumed Stock Batches to Pre-Sale Count</div>
                  <div>• Retains Purchases, Suppliers, Bills & Expenses</div>
                </div>
              </div>

              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={() => handleOpenResetModal('sales_only')}
                className="w-full font-bold bg-indigo-600 hover:bg-indigo-700 shadow-sm"
              >
                Reset Sales & Records Only
              </Button>
            </div>

            {/* Option 2: Inventory & Sales Wipe */}
            <div className="bg-white rounded-3xl border-2 border-amber-200/80 p-6 shadow-sm flex flex-col justify-between space-y-5">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-amber-700">
                  <Trash2 className="h-5 w-5" />
                  <h3 className="font-black text-base">Wipe Inventory & Sales</h3>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Deletes all <strong>products, stock batches, movements, sales receipts, and purchase orders</strong>.
                  Resets customer/supplier dues to zero.
                </p>
                <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 font-semibold space-y-1">
                  <div>• Keeps Business Profile & Currency</div>
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

            {/* Option 3: Full Factory Reset */}
            <div className="bg-white rounded-3xl border-2 border-rose-200/80 p-6 shadow-sm flex flex-col justify-between space-y-5">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-rose-700">
                  <AlertTriangle className="h-5 w-5" />
                  <h3 className="font-black text-base">Factory Reset All</h3>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Completely wipes <strong>all inventory, sales, purchases, customers, suppliers, bills, and expenses</strong>.
                  Returns database to a blank slate.
                </p>
                <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-[11px] text-rose-900 font-semibold">
                  Permanent action. Create a backup first if needed.
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
        title={
          resetWipeMode === 'sales_only'
            ? 'Confirm Sales & Records Reset'
            : resetWipeMode === 'inventory_only'
            ? 'Confirm Inventory Wipe'
            : 'Confirm Factory Reset'
        }
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
              {resetWipeMode === 'sales_only' && (
                <span>
                  All sales receipts, sale items, payments, returns, quotations, and customer payments will be deleted.
                  <strong> All products, categories, purchase records, and original stock counts will be safely preserved.</strong>
                </span>
              )}
              {resetWipeMode === 'inventory_only' && (
                <span>All products, stock counts, sales receipts, and purchases will be permanently deleted.</span>
              )}
              {resetWipeMode === 'all_data' && (
                <span>All system transactions, products, customers, suppliers, bills, and expenses will be permanently wiped.</span>
              )}
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
              variant={resetWipeMode === 'sales_only' ? 'primary' : 'danger'}
              loading={resetting}
              disabled={!resetPin}
              className={`font-bold px-5 ${resetWipeMode === 'sales_only' ? 'bg-indigo-600 hover:bg-indigo-700' : ''}`}
            >
              {resetWipeMode === 'sales_only' ? 'Confirm & Reset Sales Data' : 'Confirm & Wipe Data Now'}
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
          settings={{
            ...(settings || {}),
            business_name: bizName,
            phone: bizPhone,
            address: bizAddress,
            currency: currency,
            receipt_header: receiptHeader,
            receipt_footer: receiptFooter,
            receipt_printer_type: printerType as any,
            thermal_print_mode: thermalPrintMode,
            thermal_header_style: thermalHeaderStyle,
            thermal_layout: thermalLayout,
            thermal_darkness: thermalDarkness,
            selected_thermal_printer: selectedThermalPrinter,
            selected_a4_printer: selectedA4Printer,
            skip_receipt_preview: skipReceiptPreview,
            show_barcode: showBarcode,
            show_sku: showSku,
          } as any}
        />
      )}
    </div>
  );
};
