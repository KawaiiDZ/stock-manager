import React, { useState, useEffect, useRef, useMemo } from 'react';
import { api } from '../../services/api';
import { Product, Customer, BusinessSettings, Sale, Quotation, QuotationCreate, Category, PaymentSplit, BillTemplate, BillTemplateItem } from '../../types';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  Barcode,
  DollarSign,
  Printer,
  Sparkles,
  UserPlus,
  AlertCircle,
  CheckCircle2,
  Zap,
  FileText,
  CreditCard,
  Wallet,
  Layers,
  BookmarkPlus,
  ChevronDown,
  Check,
  ArrowRight,
  X,
  User,
  Phone,
} from 'lucide-react';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Modal } from '../../components/common/Modal';
import { ReceiptModal } from '../../components/receipts/ReceiptModal';
import { ThermalReceipt } from '../../components/receipts/ThermalReceipt';
import { PdfInvoiceReceipt } from '../../components/receipts/PdfInvoiceReceipt';
import { printElement } from '../../utils/print';
import { QuotationModal } from '../../components/receipts/QuotationModal';
import { UnregisteredBarcodeModal } from '../../components/barcode/UnregisteredBarcodeModal';
import { QuickAddProductModal } from '../../components/products/QuickAddProductModal';
import { OutOfStockRestockModal } from '../../components/pos/OutOfStockRestockModal';
import { CartQuantityInput } from '../../components/pos/CartQuantityInput';
import { useBarcodeScanner, setNativeInputValue } from '../../hooks/useBarcodeScanner';
import { formatCurrency, formatMoney, formatQty } from '../../utils/format';
import { rasterizeReceiptFast, rasterizeReceiptOffscreen } from '../../utils/receiptRasterizer';
import { playCheckoutSuccessBeep } from '../../utils/audio';
import { PrinterDiagnosticsModal } from '../../components/printing/PrinterDiagnosticsModal';
import { SaveTemplateModal } from '../../components/pos/SaveTemplateModal';
import { SlotProductPicker, PosTemplateSlot } from '../../components/pos/SlotProductPicker';
import { AddToBillModal } from '../../components/sales/AddToBillModal';

interface CartItem {
  product: Product;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  notes?: string;
}

interface NewSalePageProps {
  settings: BusinessSettings | null;
  initialProduct?: Product | null;
  onClearInitialProduct?: () => void;
}

export const NewSalePage: React.FC<NewSalePageProps> = ({
  settings,
  initialProduct,
  onClearInitialProduct,
}) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Bill / Product Kit Templates State
  const [availableTemplates, setAvailableTemplates] = useState<BillTemplate[]>([]);
  const [activeTemplate, setActiveTemplate] = useState<BillTemplate | null>(null);
  const [templateSlots, setTemplateSlots] = useState<PosTemplateSlot[]>([]);
  const [isTemplateDropdownOpen, setIsTemplateDropdownOpen] = useState(false);
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);

  // Add to Bill (External Sourced Item) State
  const [showAddToBillModal, setShowAddToBillModal] = useState(false);
  const [addToBillInitialName, setAddToBillInitialName] = useState('');

  // Customer Management on Sale
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [inlineCustomerName, setInlineCustomerName] = useState('');
  const [inlineCustomerPhone, setInlineCustomerPhone] = useState('');
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [customerActiveIndex, setCustomerActiveIndex] = useState(0);

  // Inline Customer Autocomplete State (Zero-Modal Fast Selection)
  const [isInlineCustomerDropdownOpen, setIsInlineCustomerDropdownOpen] = useState(false);
  const [inlineCustomerActiveIdx, setInlineCustomerActiveIdx] = useState(-1);
  const inlineCustomerInputRef = useRef<HTMLInputElement>(null);
  const inlineCustomerDropdownRef = useRef<HTMLDivElement>(null);

  // Financial inputs
  const [saleDiscount, setSaleDiscount] = useState<number>(0);
  const [taxRate, setTaxRate] = useState<number>(settings?.default_tax_rate || 0);
  const configuredPaymentAccounts = useMemo(() => {
    if (settings?.payment_accounts && settings.payment_accounts.length > 0) {
      return settings.payment_accounts;
    }
    return ['Cash', 'Bank Transfer', 'Easypaisa', 'Jazzcash'];
  }, [settings?.payment_accounts]);

  const [paymentMethod, setPaymentMethod] = useState<string>('Cash');
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [isPaidAmountCustomized, setIsPaidAmountCustomized] = useState(false);
  const [notes, setNotes] = useState('');

  // Submission state
  const [completing, setCompleting] = useState(false);
  const [savingQuotation, setSavingQuotation] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [createdQuotation, setCreatedQuotation] = useState<Quotation | null>(null);
  const [showQuotationModal, setShowQuotationModal] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [warningToast, setWarningToast] = useState<string | null>(null);
  const [showDiagnosticsModal, setShowDiagnosticsModal] = useState(false);
  const [printDiagnosticError, setPrintDiagnosticError] = useState<string | null>(null);
  const [isPrintingReceipt, setIsPrintingReceipt] = useState<{ receiptNumber: string } | null>(null);

  const [autoPrintEnabled, setAutoPrintEnabled] = useState<boolean>(Boolean(settings?.skip_receipt_preview));
  const isCompletingRef = useRef<boolean>(false);

  // Quick-Pay Dialogue State
  const [showQuickPayModal, setShowQuickPayModal] = useState(false);
  const [quickPayAmount, setQuickPayAmount] = useState<number>(0);
  const [quickPayTouched, setQuickPayTouched] = useState(false);
  const [quickPayMethod, setQuickPayMethod] = useState<string>('Cash');
  const [isQuickPaySplit, setIsQuickPaySplit] = useState(false);
  const [quickPaySplits, setQuickPaySplits] = useState<Array<{ payment_method: string; amount: number }>>([
    { payment_method: 'Cash', amount: 0 },
    { payment_method: 'Bank Transfer', amount: 0 },
  ]);
  const quickPayInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setAutoPrintEnabled(Boolean(settings?.skip_receipt_preview));
  }, [settings?.skip_receipt_preview]);

  const handleTogglePosAutoPrint = async () => {
    const nextVal = !autoPrintEnabled;
    setAutoPrintEnabled(nextVal);
    try {
      await api.updateSettings({
        skip_receipt_preview: nextVal,
      });
      setSuccessToast(
        nextVal
          ? '1-Click Auto-Print activated! Receipts will print automatically on checkout.'
          : 'Print Preview modal restored for checkout.'
      );
    } catch (err: any) {
      console.error('Failed to toggle auto-print from POS:', err);
    }
  };

  useEffect(() => {
    if (successToast) {
      const t = setTimeout(() => setSuccessToast(null), 4000);
      return () => clearTimeout(t);
    }
  }, [successToast]);

  useEffect(() => {
    if (warningToast) {
      const t = setTimeout(() => setWarningToast(null), 8000);
      return () => clearTimeout(t);
    }
  }, [warningToast]);

  // Unregistered Barcode & Quick Add Product state
  const [categories, setCategories] = useState<Category[]>([]);
  const [unregisteredBarcode, setUnregisteredBarcode] = useState<string | null>(null);
  const [quickAddBarcode, setQuickAddBarcode] = useState<string | null>(null);

  // Out of Stock & Instant Restock state
  const [outOfStockProduct, setOutOfStockProduct] = useState<Product | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Keyboard navigation target: 'search', or cart item index (0, 1, ...), or null (no arrow active)
  const [keyboardActiveTarget, setKeyboardActiveTarget] = useState<'search' | number | null>(null);

  // Active template slot picker index (when open for searching products via keyboard)
  const [activeSlotPickerIndex, setActiveSlotPickerIndex] = useState<number | null>(null);

  // Search dropdown active item index for keyboard arrow navigation (-1 = input, 0, 1, ... = dropdown items)
  const [dropdownActiveIndex, setDropdownActiveIndex] = useState<number>(-1);

  // Keep highlighted template slot row scrolled into view
  useEffect(() => {
    if (activeTemplate && typeof keyboardActiveTarget === 'number') {
      const el = document.getElementById(`template-slot-row-${keyboardActiveTarget}`);
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeTemplate, keyboardActiveTarget]);

  // Reset dropdown active index whenever search query changes
  useEffect(() => {
    setDropdownActiveIndex(-1);
  }, [searchQuery]);

  // Keep highlighted search dropdown item scrolled into view
  useEffect(() => {
    if (dropdownActiveIndex >= 0) {
      const el = document.getElementById(`search-result-${dropdownActiveIndex}`);
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [dropdownActiveIndex]);

  // Filtered customers for Customer Selection Modal
  const filteredModalCustomers = useMemo(() => {
    if (!customerSearchQuery.trim()) return customers;
    const q = customerSearchQuery.toLowerCase().trim();
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.phone && c.phone.includes(q)) ||
        c.customer_id.toLowerCase().includes(q)
    );
  }, [customers, customerSearchQuery]);

  useEffect(() => {
    setCustomerActiveIndex(filteredModalCustomers.length > 0 ? 0 : -1);
  }, [filteredModalCustomers]);

  useEffect(() => {
    if (customerActiveIndex >= 0 && showAddCustomerModal) {
      const el = document.getElementById(`modal-customer-item-${customerActiveIndex}`);
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [customerActiveIndex, showAddCustomerModal]);

  // Close inline customer autocomplete on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        inlineCustomerDropdownRef.current &&
        !inlineCustomerDropdownRef.current.contains(e.target as Node) &&
        inlineCustomerInputRef.current &&
        !inlineCustomerInputRef.current.contains(e.target as Node)
      ) {
        setIsInlineCustomerDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCartNavigateUp = (fromIndex: number) => {
    if (fromIndex > 0) {
      setKeyboardActiveTarget(fromIndex - 1);
    } else {
      // Reached the top item in the cart: move focus back up to search input
      setKeyboardActiveTarget('search');
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }
  };

  const handleCartNavigateDown = (fromIndex: number) => {
    const maxIdx = (activeTemplate ? templateSlots.length : cart.length) - 1;
    if (fromIndex < maxIdx) {
      setKeyboardActiveTarget(fromIndex + 1);
    }
  };

  const currency = settings?.currency || 'Rs.';
  const showSku = settings?.show_sku !== false;
  const showBarcode = settings?.show_barcode !== false;
  const scannerEnabled = settings?.enable_barcode_scanner !== false;
  const templatesEnabled = settings?.enable_bill_templates !== false;

  // Initial load & silent window focus background refresh
  const refreshCatalog = async () => {
    try {
      const prods = await api.getProducts({ is_active: true });
      if (prods) setProducts(prods);
    } catch {
      // silent background refresh
    }
  };

  useEffect(() => {
    const init = async () => {
      try {
        const [prods, custs, cats, tpls] = await Promise.all([
          api.getProducts({ is_active: true }),
          api.getCustomers({ is_active: true }),
          api.getCategories(true),
          api.getBillTemplates().catch(() => []),
        ]);
        setProducts(prods || []);
        setCustomers(custs || []);
        setCategories(cats || []);
        setAvailableTemplates(tpls || []);
      } catch (err) {
        console.error('Failed to load initial sales data:', err);
      }
    };
    init();

    const handleFocus = () => {
      refreshCatalog();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  // Handle pre-loaded product passed via [ Sell ] button
  useEffect(() => {
    if (initialProduct) {
      addToCart(initialProduct);
      if (onClearInitialProduct) onClearInitialProduct();
    }
  }, [initialProduct]);

  // Robust Hardware Barcode Scanner Handler
  const handleBarcodeScanned = async (scannedCode: string) => {
    const code = scannedCode.trim();
    if (!code) return;

    // Immediately clear search query & close dropdown so scanner input never lingers or concatenates
    setSearchQuery('');
    setDropdownActiveIndex(-1);
    if (searchInputRef.current) {
      setNativeInputValue(searchInputRef.current, '');
    }

    // 1. Check local in-memory catalog
    const localMatch = products.find(
      (p) =>
        (p.barcode && p.barcode.toLowerCase() === code.toLowerCase()) ||
        (p.sku && p.sku.toLowerCase() === code.toLowerCase()) ||
        (p.product_id && p.product_id.toLowerCase() === code.toLowerCase())
    );

    if (localMatch) {
      if (!localMatch.is_service && Number(localMatch.current_stock || 0) <= 0) {
        setOutOfStockProduct(localMatch);
        return;
      }
      addToCart(localMatch);
      return;
    }

    // 2. Query remote database if not currently in memory
    try {
      const remoteProd = await api.getProductByBarcode(code);
      if (remoteProd) {
        setProducts((prev) => (prev.some((p) => p.id === remoteProd.id) ? prev : [...prev, remoteProd]));
        if (!remoteProd.is_service && Number(remoteProd.current_stock || 0) <= 0) {
          setOutOfStockProduct(remoteProd);
          return;
        }
        addToCart(remoteProd);
      } else {
        // Prompt user to register product with this barcode
        setUnregisteredBarcode(code);
      }
    } catch {
      setUnregisteredBarcode(code);
    }
  };

  useBarcodeScanner({
    enabled: scannerEnabled,
    onScan: handleBarcodeScanned,
    playBeep: true,
  });

  // Global POS Keyboard Shortcuts & Arrow Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // If any dialogue modal or in-slot picker is open, avoid triggering global checkout shortcuts
      if (showQuickPayModal || Boolean(outOfStockProduct) || Boolean(unregisteredBarcode) || Boolean(quickAddBarcode) || showAddCustomerModal || activeSlotPickerIndex !== null) {
        if (e.key === 'Escape') {
          e.preventDefault();
          if (showQuickPayModal) setShowQuickPayModal(false);
          if (activeSlotPickerIndex !== null) setActiveSlotPickerIndex(null);
          searchInputRef.current?.focus();
        }
        return;
      }

      // F4 to focus search
      if (e.key === 'F4') {
        e.preventDefault();
        setKeyboardActiveTarget('search');
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }
      // F8 to open customer selector modal
      if (e.key === 'F8') {
        e.preventDefault();
        setShowAddCustomerModal(true);
        return;
      }
      // Escape to reset keyboard navigation to search
      if (e.key === 'Escape') {
        setKeyboardActiveTarget(null);
        searchInputRef.current?.focus();
        return;
      }
      // F9 to complete sale directly (same as clicking Complete Sale)
      if (e.key === 'F9') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        handleCompleteSale();
        return;
      }
      // Ctrl+Enter or Cmd+Enter to open Quick Pay (or complete directly if Quick Pay disabled)
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        handleOpenQuickPayOrComplete();
        return;
      }

      // Check active element
      const activeEl = document.activeElement;
      const activeTag = activeEl?.tagName.toLowerCase();
      const isSearchFocused = activeEl === searchInputRef.current;
      const isQuantityInput = activeEl?.getAttribute('inputmode') === 'numeric';
      const isDedicatedFormInput =
        activeEl &&
        (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') &&
        !isSearchFocused &&
        !isQuantityInput;

      // Do not intercept if user is inside search input (handled exclusively by handleSearchKeyDown),
      // or inside customer/payment/notes inputs, or inside double-clicked quantity editor
      if (isDedicatedFormInput || isQuantityInput || isSearchFocused) {
        return;
      }

      const activeListLength = activeTemplate ? templateSlots.length : cart.length;

      // Arrow navigation
      if (e.key === 'ArrowDown') {
        if (activeListLength > 0) {
          e.preventDefault();
          if (keyboardActiveTarget === null || keyboardActiveTarget === 'search') {
            setKeyboardActiveTarget(0);
            searchInputRef.current?.blur();
          } else if (typeof keyboardActiveTarget === 'number') {
            if (keyboardActiveTarget < activeListLength - 1) {
              setKeyboardActiveTarget(keyboardActiveTarget + 1);
            }
          }
        }
        return;
      }

      if (e.key === 'ArrowUp') {
        if (typeof keyboardActiveTarget === 'number') {
          e.preventDefault();
          if (keyboardActiveTarget > 0) {
            setKeyboardActiveTarget(keyboardActiveTarget - 1);
          } else {
            // Reached top item (cart or template) -> move active target up to search bar
            setKeyboardActiveTarget('search');
            searchInputRef.current?.focus();
            searchInputRef.current?.select();
          }
        }
        return;
      }

      if (e.key === 'ArrowLeft') {
        if (typeof keyboardActiveTarget === 'number') {
          e.preventDefault();
          if (activeTemplate) {
            const slot = templateSlots[keyboardActiveTarget];
            if (slot && slot.quantity > 1) {
              handleSlotQuantityChange(keyboardActiveTarget, slot.quantity - 1);
            }
          } else if (cart[keyboardActiveTarget]) {
            const targetItem = cart[keyboardActiveTarget];
            updateQuantity(targetItem.product.id, targetItem.quantity - 1);
          }
        }
        return;
      }

      if (e.key === 'ArrowRight') {
        if (typeof keyboardActiveTarget === 'number') {
          e.preventDefault();
          if (activeTemplate) {
            const slot = templateSlots[keyboardActiveTarget];
            if (slot) {
              handleSlotQuantityChange(keyboardActiveTarget, slot.quantity + 1);
            }
          } else if (cart[keyboardActiveTarget]) {
            const targetItem = cart[keyboardActiveTarget];
            updateQuantity(targetItem.product.id, targetItem.quantity + 1);
          }
        }
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (typeof keyboardActiveTarget === 'number') {
          e.preventDefault();
          if (activeTemplate) {
            const slot = templateSlots[keyboardActiveTarget];
            if (slot) {
              if (slot.selected_product) {
                handleSlotClearProduct(keyboardActiveTarget);
              } else if (templateSlots.length > 1) {
                handleSlotRemove(keyboardActiveTarget);
                if (keyboardActiveTarget >= templateSlots.length - 1) {
                  setKeyboardActiveTarget(Math.max(0, templateSlots.length - 2));
                }
              }
            }
          } else if (cart[keyboardActiveTarget]) {
            const targetItem = cart[keyboardActiveTarget];
            removeItem(targetItem.product.id);
          }
        }
        return;
      }

      // Enter or Space on an active template slot row opens in-slot product search
      if (e.key === 'Enter' || e.key === ' ') {
        if (activeTemplate && typeof keyboardActiveTarget === 'number' && templateSlots[keyboardActiveTarget]) {
          e.preventDefault();
          setActiveSlotPickerIndex(keyboardActiveTarget);
          return;
        }
      }

      // "typing in the POS area should always go in the search bar"
      if (
        e.key.length === 1 &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        if (!isSearchFocused) {
          e.preventDefault();
          setKeyboardActiveTarget(null);
          searchInputRef.current?.focus();
          setSearchQuery((prev) => prev + e.key);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart, activeTemplate, templateSlots, keyboardActiveTarget, activeSlotPickerIndex, paidAmount, isPaidAmountCustomized, inlineCustomerName, selectedCustomerId, searchQuery]);

  // Add product to cart
  const addToCart = (product: Product) => {
    setErrorMsg(null);

    // If a Bill Template is active, assign to a matching unfilled slot or append
    if (activeTemplate) {
      const unfilledIdx = templateSlots.findIndex(
        (s) =>
          !s.selected_product &&
          (s.category_id !== null && s.category_id !== undefined
            ? s.category_id === product.category_id
            : true)
      );

      if (unfilledIdx >= 0) {
        handleSlotSelectProduct(unfilledIdx, product);
        setSuccessToast(`Filled slot "${templateSlots[unfilledIdx].slot_name}" with ${product.name}.`);
        return;
      }

      // If no unfilled slot matches category, append an extra slot with this product
      const catName =
        (product as any).category?.name ||
        categories.find((c) => c.id === product.category_id)?.name ||
        'Component';

      setTemplateSlots((prev) => [
        ...prev,
        {
          slot_id: `extra-${Date.now()}`,
          display_order: prev.length + 1,
          slot_name: catName,
          category_id: product.category_id || null,
          category_name: catName,
          selected_product: product,
          quantity: 1,
          unit_price: Number(product.selling_price || 0),
        },
      ]);
      setSuccessToast(`Added ${product.name} to template.`);
      return;
    }

    const existingIndex = cart.findIndex((item) => item.product.id === product.id);

    const availableStock = Number(product.current_stock || 0);

    if (existingIndex >= 0) {
      const currentQty = cart[existingIndex].quantity;
      if (!product.is_service && !product.is_external && currentQty + 1 > availableStock) {
        if (availableStock <= 0) {
          setOutOfStockProduct(product);
          return;
        }
        setErrorMsg(
          `Not enough stock. Only ${availableStock} units of ${product.name} are available.`
        );
        return;
      }
      const updatedCart = [...cart];
      updatedCart[existingIndex].quantity += 1;
      setCart(updatedCart);
    } else {
      if (!product.is_service && !product.is_external && availableStock < 1) {
        setOutOfStockProduct(product);
        return;
      }
      const newCart = [
        ...cart,
        {
          product,
          quantity: 1,
          unit_price: Number(product.selling_price || 0),
          discount_amount: 0,
        },
      ];
      setCart(newCart);
    }
  };

  const handleAddExternalToBill = (item: { name: string; quantity: number; unit_price: number; notes?: string }) => {
    const fakeProduct: Product = {
      id: -Date.now(),
      product_id: 'EXT-' + Math.floor(1000 + Math.random() * 9000),
      name: item.name,
      purchase_price: item.unit_price,
      selling_price: item.unit_price,
      current_stock: 999999,
      is_service: true,
      is_external: true,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    setCart((prev) => [
      ...prev,
      {
        product: fakeProduct,
        quantity: item.quantity,
        unit_price: item.unit_price,
        discount_amount: 0,
        notes: item.notes,
      },
    ]);
    setSuccessToast(`Added "${item.name}" to bill.`);
  };

  const updateQuantity = (productId: number, qty: number) => {
    setErrorMsg(null);
    const item = cart.find((i) => i.product.id === productId);
    if (!item) return;

    const availableStock = Math.max(0, Number(item.product.current_stock || 0));

    let finalQty = qty;
    if (!item.product.is_service && !item.product.is_external && finalQty > availableStock) {
      finalQty = availableStock;
      setErrorMsg(
        `Quantity capped to maximum available stock (${availableStock} units of ${item.product.name}).`
      );
    }

    if (finalQty <= 0) {
      const newCart = cart.filter((i) => i.product.id !== productId);
      setCart(newCart);
      if (typeof keyboardActiveTarget === 'number' && keyboardActiveTarget >= newCart.length) {
        setKeyboardActiveTarget(newCart.length > 0 ? newCart.length - 1 : null);
      }
    } else {
      setCart(cart.map((i) => (i.product.id === productId ? { ...i, quantity: finalQty } : i)));
    }
  };

  const updateItemPrice = (productId: number, newPrice: number) => {
    setCart(
      cart.map((i) =>
        i.product.id === productId ? { ...i, unit_price: Math.max(0, newPrice) } : i
      )
    );
  };

  const removeItem = (productId: number) => {
    const newCart = cart.filter((i) => i.product.id !== productId);
    setCart(newCart);
    if (typeof keyboardActiveTarget === 'number' && keyboardActiveTarget >= newCart.length) {
      setKeyboardActiveTarget(newCart.length > 0 ? newCart.length - 1 : null);
    }
  };

  // Bill Template Handlers
  const handleSelectTemplate = (tpl: BillTemplate) => {
    setActiveTemplate(tpl);
    setIsTemplateDropdownOpen(false);

    const initialSlots: PosTemplateSlot[] = (tpl.items || []).map((item, idx) => {
      const matchingProduct = item.default_product_id
        ? products.find((p) => p.id === item.default_product_id) || null
        : null;

      return {
        slot_id: item.id || `slot-${idx}-${Date.now()}`,
        display_order: item.display_order || idx + 1,
        slot_name: item.slot_name,
        category_id: item.category_id || null,
        category_name: item.category_name || '',
        selected_product: matchingProduct,
        quantity: item.default_quantity || 1,
        unit_price: matchingProduct ? Number(matchingProduct.selling_price || 0) : 0,
      };
    });

    setTemplateSlots(initialSlots);
    setSuccessToast(`Loaded template "${tpl.name}" (${initialSlots.length} slots).`);
  };

  const handleClearTemplate = () => {
    setActiveTemplate(null);
    setTemplateSlots([]);
  };

  useEffect(() => {
    if (!templatesEnabled && activeTemplate) {
      handleClearTemplate();
    }
  }, [templatesEnabled, activeTemplate]);

  const handleSlotSelectProduct = (idx: number, prod: Product) => {
    setTemplateSlots((prev) => {
      const copy = [...prev];
      const slot = copy[idx];
      if (!slot) return prev;
      copy[idx] = {
        ...slot,
        selected_product: prod,
        unit_price: Number(prod.selling_price || 0),
      };
      return copy;
    });
  };

  const handleSlotClearProduct = (idx: number) => {
    setTemplateSlots((prev) => {
      const copy = [...prev];
      if (!copy[idx]) return prev;
      copy[idx] = {
        ...copy[idx],
        selected_product: null,
        unit_price: 0,
      };
      return copy;
    });
  };

  const handleSlotQuantityChange = (idx: number, qty: number) => {
    setTemplateSlots((prev) => {
      const copy = [...prev];
      if (!copy[idx]) return prev;
      const validQty = Math.max(1, isNaN(qty) ? 1 : qty);
      copy[idx] = {
        ...copy[idx],
        quantity: validQty,
      };
      return copy;
    });
  };

  const handleSlotPriceChange = (idx: number, price: number) => {
    setTemplateSlots((prev) => {
      const copy = [...prev];
      if (!copy[idx]) return prev;
      copy[idx] = {
        ...copy[idx],
        unit_price: Math.max(0, isNaN(price) ? 0 : price),
      };
      return copy;
    });
  };

  const handleSlotRemove = (idx: number) => {
    setTemplateSlots((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleAddExtraSlot = () => {
    const firstCat = categories[0];
    setTemplateSlots((prev) => [
      ...prev,
      {
        slot_id: `slot-extra-${Date.now()}`,
        display_order: prev.length + 1,
        slot_name: firstCat ? firstCat.name : 'Component',
        category_id: firstCat ? firstCat.id : null,
        category_name: firstCat ? firstCat.name : '',
        selected_product: null,
        quantity: 1,
        unit_price: 0,
      },
    ]);
  };

  // Filter products for live search across name, barcode, sku, and all custom attributes
  const filteredProducts = searchQuery.trim()
    ? products.filter((p) => {
        const q = searchQuery.toLowerCase().trim();
        const matchesCore =
          p.name.toLowerCase().includes(q) ||
          p.product_id.toLowerCase().includes(q) ||
          (showSku && p.sku && p.sku.toLowerCase().includes(q)) ||
          (showBarcode && p.barcode && p.barcode.toLowerCase().includes(q));
        if (matchesCore) return true;

        if (p.custom_fields && p.custom_fields.length > 0) {
          return p.custom_fields.some((cf) => cf.value.toLowerCase().includes(q));
        }
        return false;
      })
    : [];

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    // F9 to complete sale directly
    if (e.key === 'F9') {
      e.preventDefault();
      e.stopPropagation();
      handleCompleteSale();
      return;
    }

    // Complete sale from search bar via Ctrl+Enter or Cmd+Enter
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      handleOpenQuickPayOrComplete();
      return;
    }

    // F8 to open customer selector modal
    if (e.key === 'F8') {
      e.preventDefault();
      setShowAddCustomerModal(true);
      return;
    }

    const hasDropdownResults = searchQuery.trim().length > 0 && filteredProducts.length > 0;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (hasDropdownResults) {
        // Navigate down through search dropdown results
        setDropdownActiveIndex((prev) =>
          prev < filteredProducts.length - 1 ? prev + 1 : 0
        );
      } else {
        const itemsCount = activeTemplate ? templateSlots.length : cart.length;
        if (itemsCount > 0) {
          // Dropdown closed -> jump down into cart or template items
          setKeyboardActiveTarget(0);
          searchInputRef.current?.blur();
        }
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (hasDropdownResults) {
        // Navigate up through search dropdown results
        setDropdownActiveIndex((prev) =>
          prev > 0 ? prev - 1 : filteredProducts.length - 1
        );
      }
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredProducts.length > 0) {
        const targetProd =
          dropdownActiveIndex >= 0 && dropdownActiveIndex < filteredProducts.length
            ? filteredProducts[dropdownActiveIndex]
            : filteredProducts[0];
        addToCart(targetProd);
        setSearchQuery('');
        setDropdownActiveIndex(-1);
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      if (searchQuery.trim().length > 0) {
        setSearchQuery('');
        setDropdownActiveIndex(-1);
      } else {
        setKeyboardActiveTarget(null);
      }
      return;
    }
  };

  // Effective items for calculations and checkout:
  // When activeTemplate is set, ONLY FILLED SLOTS (with a product selected and qty > 0) are used!
  // Any rows that are left blank are COMPLETELY OMITTED from the bill and receipt!
  const effectiveCartItems = useMemo(() => {
    if (activeTemplate) {
      return templateSlots
        .filter((slot) => slot.selected_product !== null && Number(slot.quantity) > 0)
        .map((slot) => ({
          product: slot.selected_product!,
          quantity: Number(slot.quantity),
          unit_price: slot.selected_product!.is_service
            ? Number(slot.unit_price !== undefined ? slot.unit_price : slot.selected_product!.selling_price || 0)
            : Number(slot.selected_product!.selling_price || 0),
          discount_amount: 0,
          notes: '',
        }));
    }
    return cart;
  }, [activeTemplate, templateSlots, cart]);

  // Financial Calculations
  const subtotal = effectiveCartItems.reduce(
    (sum, item) =>
      sum + item.quantity * Number(item.unit_price) - Number(item.discount_amount || 0),
    0
  );
  const taxableAmount = Math.max(0, subtotal - Number(saleDiscount || 0));
  const taxAmount = (taxableAmount * Number(taxRate || 0)) / 100;
  const grandTotal = Math.max(0, taxableAmount + taxAmount);

  // Sync paid amount with grandTotal unless customized by user
  useEffect(() => {
    if (!isPaidAmountCustomized) {
      setPaidAmount(grandTotal);
    }
  }, [grandTotal, isPaidAmountCustomized]);

  const currentPaid = Number(paidAmount || 0);
  const dueAmount = Math.max(0, grandTotal - currentPaid);
  const changeAmount = Math.max(0, currentPaid - grandTotal);
  const paymentStatus: 'PAID' | 'PARTIAL' | 'UNPAID' =
    grandTotal === 0
      ? 'PAID'
      : currentPaid >= grandTotal
      ? 'PAID'
      : currentPaid > 0
      ? 'PARTIAL'
      : 'UNPAID';

  // Fast Inline Customer Suggestions (Top matches without opening modal)
  const inlineCustomerMatches = useMemo(() => {
    const q = (inlineCustomerName || '').trim().toLowerCase();
    if (q.length < 1 || selectedCustomerId !== null) return [];
    return customers
      .filter((c) => {
        return (
          c.name.toLowerCase().includes(q) ||
          (c.phone && c.phone.includes(q)) ||
          c.customer_id.toLowerCase().includes(q)
        );
      })
      .slice(0, 6);
  }, [customers, inlineCustomerName, selectedCustomerId]);

  // Smart Quick Cash Tender Denominations based on current Grand Total
  const quickCashOptions = useMemo(() => {
    if (grandTotal <= 0) return [];
    const options: number[] = [grandTotal];

    [500, 1000, 5000].forEach((note) => {
      if (note > grandTotal && !options.includes(note)) {
        options.push(note);
      }
    });

    if (grandTotal >= 500) {
      const round100 = Math.ceil((grandTotal + 1) / 100) * 100;
      if (round100 > grandTotal && !options.includes(round100)) options.push(round100);

      const round500 = Math.ceil((grandTotal + 1) / 500) * 500;
      if (round500 > grandTotal && !options.includes(round500)) options.push(round500);

      const round1000 = Math.ceil((grandTotal + 1) / 1000) * 1000;
      if (round1000 > grandTotal && !options.includes(round1000)) options.push(round1000);

      const round5000 = Math.ceil((grandTotal + 1) / 5000) * 5000;
      if (round5000 > grandTotal && !options.includes(round5000)) options.push(round5000);
    }

    return Array.from(new Set(options)).sort((a, b) => a - b).slice(0, 4);
  }, [grandTotal]);

  // Trigger Quick-Pay Modal if enabled, or complete immediately
  const handleOpenQuickPayOrComplete = () => {
    if (isPrintingReceipt) return;
    if (effectiveCartItems.length === 0) {
      setErrorMsg(
        activeTemplate
          ? 'Template has no filled items. Please select products for at least one slot.'
          : 'Cannot complete an empty sale. Please add items to cart.'
      );
      return;
    }
    const isQuickPayEnabled = settings?.enable_pos_quick_pay ?? true;
    if (isQuickPayEnabled) {
      setQuickPayAmount(grandTotal);
      setQuickPayTouched(false);
      setQuickPayMethod('Cash');
      setIsQuickPaySplit(false);
      const secondMethod = configuredPaymentAccounts.find((a) => a.toLowerCase() !== 'cash') || 'Bank Transfer';
      setQuickPaySplits([
        { payment_method: 'Cash', amount: grandTotal },
        { payment_method: secondMethod, amount: 0 },
      ]);
      setShowQuickPayModal(true);
      setTimeout(() => {
        quickPayInputRef.current?.focus();
        quickPayInputRef.current?.select();
      }, 50);
    } else {
      handleCompleteSale();
    }
  };

  // Complete Sale Execution
  const handleCompleteSale = async (
    overridePaidAmount?: number,
    overridePaymentMethod?: string,
    overridePaymentSplits?: PaymentSplit[]
  ) => {
    if (completing || isCompletingRef.current || isPrintingReceipt) return;
    if (effectiveCartItems.length === 0) {
      setErrorMsg(
        activeTemplate
          ? 'Template has no filled items. Please select products for at least one slot.'
          : 'Cannot complete an empty sale. Please add items to cart.'
      );
      return;
    }

    const effectivePaid = Math.max(
      0,
      overridePaidAmount !== undefined ? Number(overridePaidAmount) : Number(paidAmount || 0)
    );
    const effectiveDue = Math.max(0, grandTotal - effectivePaid);

    const selectedCust = customers.find((c) => c.id === selectedCustomerId);
    const isWalkIn = (!selectedCust && !inlineCustomerName.trim()) || selectedCust?.customer_id === 'C-000001';

    if (effectiveDue > 0 && isWalkIn) {
      setErrorMsg(
        'Walk-in / Counter Customer cannot purchase on credit. Please enter or select a customer name for partial or unpaid sales.'
      );
      return;
    }

    if (overridePaidAmount !== undefined) {
      setPaidAmount(effectivePaid);
      setIsPaidAmountCustomized(true);
    }

    const effectiveMethod = overridePaymentMethod || paymentMethod || 'Cash';
    if (overridePaymentMethod) {
      setPaymentMethod(overridePaymentMethod);
    }

    isCompletingRef.current = true;
    setCompleting(true);
    setErrorMsg(null);

    try {
      const payload: any = {
        items: effectiveCartItems.map((i) => ({
          product_id: i.product.is_external ? null : i.product.id,
          external_name: i.product.is_external ? i.product.name : undefined,
          is_external: Boolean(i.product.is_external),
          quantity: i.quantity,
          unit_price: Number(i.unit_price),
          discount_amount: Number(i.discount_amount || 0),
          notes: (i as any).notes || undefined,
        })),
        discount_amount: Number(saleDiscount || 0),
        tax_rate: Number(taxRate || 0),
        paid_amount: Math.min(grandTotal, effectivePaid),
        payment_method: effectiveMethod,
        notes: notes.trim() || undefined,
      };

      if (overridePaymentSplits && overridePaymentSplits.length > 0) {
        payload.payment_splits = overridePaymentSplits;
      }

      if (selectedCustomerId) {
        payload.customer_id = selectedCustomerId;
      } else if (inlineCustomerName.trim()) {
        payload.customer_name = inlineCustomerName.trim();
        payload.customer_phone = inlineCustomerPhone.trim() || undefined;
      }

      const res = await api.createSale(payload);

      // Sale succeeded!
      setCompletedSale(res);

      const isAutoPrint = autoPrintEnabled || Boolean(settings?.skip_receipt_preview);

      if (isAutoPrint) {
        setShowReceipt(false);
        const isThermal = settings?.receipt_type !== 'pdf';
        const pWidth = settings?.receipt_printer_type === '58mm' ? '58mm' : '80mm';

        if (isThermal) {
          // Play POS terminal confirmation chime immediately on silent checkout
          playCheckoutSuccessBeep();

          setIsPrintingReceipt({ receiptNumber: res.receipt_number });
          const isBrowserMode = settings?.thermal_print_mode === 'browser_kiosk' || settings?.thermal_print_mode === 'browser';

          if (isBrowserMode) {
            // ⚡ Instant High-Fidelity Browser / Kiosk Print:
            // 100% exact visual parity with preview modal (proportional typography, sharp vector barcodes, intact logos).
            // When Chrome/Edge runs with --kiosk-printing, prints silently with 0 clicks & 0 modals in ~50ms!
            setTimeout(() => {
              const targetNode =
                document.getElementById('autoprint-thermal-receipt-element') ||
                document.getElementById('autoprint-thermal-receipt');
              if (targetNode) {
                printElement(targetNode, {
                  title: `Receipt_${res.receipt_number}`,
                  isThermal: true,
                  paperWidth: pWidth,
                });
              }
              setIsPrintingReceipt(null);
              setSuccessToast(`Sale #${res.receipt_number} completed & sent to thermal printer!`);
            }, 80);
          } else {
            // Direct ESC/POS Hardware Spooler Dispatch
            const isRaster = (settings?.thermal_render_pipeline || 'raster_canvas') === 'raster_canvas';

            const dispatchPrint = (rasterData?: { compactBitmap?: string; dataUrl?: string; widthDots?: number; heightDots?: number } | string) => {
              const isObj = typeof rasterData === 'object' && rasterData !== null;
              return api.printThermalDirect({
                sale_id: res.id,
                printer_name: settings?.selected_thermal_printer || undefined,
                paper_width: pWidth,
                header_style: settings?.thermal_header_style || 'logo_text',
                layout: settings?.thermal_layout || 'classic',
                show_barcode: settings?.show_barcode ?? true,
                darkness: settings?.thermal_darkness || 'normal',
                printer_profile: settings?.thermal_printer_profile || 'standard_escpos',
                cut_mode: settings?.thermal_cut_mode || 'partial',
                feed_lines: settings?.thermal_feed_lines ?? 4,
                render_pipeline: isRaster ? 'raster_canvas' : 'native_text',
                beep_enabled: settings?.thermal_beep_enabled ?? true,
                raster_image: isObj ? (rasterData as any).dataUrl : (typeof rasterData === 'string' ? rasterData : undefined),
                compact_bitmap: isObj ? (rasterData as any).compactBitmap : undefined,
                bitmap_width: isObj ? (rasterData as any).widthDots : undefined,
                bitmap_height: isObj ? (rasterData as any).heightDots : undefined,
              });
            };

            const printPromise = isRaster
              ? rasterizeReceiptFast(res, settings, {
                  paperWidth: pWidth,
                  layout: settings?.thermal_layout as any,
                }).then((data) => dispatchPrint(data || undefined))
              : dispatchPrint(); // ⚡ Instant 0ms dispatch in Native ESC/POS mode

            printPromise.then((printRes) => {
              if (printRes.is_online === false || printRes.warning) {
                setWarningToast(
                  `⚠️ Sale #${res.receipt_number} queued, but printer is OFFLINE / Powered Off. Please check power switch & USB cable.`
                );
              } else {
                setSuccessToast(`Sale #${res.receipt_number} completed & printed to ${printRes.printer || 'thermal printer'}!`);
              }
            }).catch((err: any) => {
              console.error('Direct ESC/POS print failed:', err);
              // Automatic fallback: open receipt modal so cashier is never blocked or left without receipt
              setShowReceipt(true);
              const errDetail = err.detail || err.message || 'offline or timed out';
              setErrorMsg(`Could not send directly to printer (${errDetail}). Preview modal opened.`);
              setPrintDiagnosticError(errDetail);
            }).finally(() => {
              setIsPrintingReceipt(null);
            });
          }
        } else {
          // Standard PDF / A4 format
          setIsPrintingReceipt({ receiptNumber: res.receipt_number });
          const invoiceName = (settings?.invoice_title || 'Invoice').replace(/\s+/g, '_');
          setTimeout(() => {
            printElement('autoprint-pdf-invoice', {
              title: `${invoiceName}_${res.receipt_number}`,
              isThermal: false,
            });
            setIsPrintingReceipt(null);
            setSuccessToast(`Sale #${res.receipt_number} completed & sent to document printer!`);
          }, 200);
        }
      } else {
        setShowReceipt(true);
      }

      // Reset cart, template and fields
      setCart([]);
      setActiveTemplate(null);
      setTemplateSlots([]);
      setSelectedCustomerId(null);
      setInlineCustomerName('');
      setInlineCustomerPhone('');
      setSaleDiscount(0);
      setNotes('');
      setIsPaidAmountCustomized(false);
      setPaidAmount(0);

      // Refresh products & customers cache
      const [prods, custs] = await Promise.all([
        api.getProducts({ is_active: true }),
        api.getCustomers({ is_active: true }),
      ]);
      setProducts(prods || []);
      setCustomers(custs || []);

      searchInputRef.current?.focus();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.detail || 'Failed to complete sale. Please verify quantities.');
    } finally {
      setCompleting(false);
      setTimeout(() => {
        isCompletingRef.current = false;
      }, 500);
    }
  };

  // Create Quotation (No stock deduction, no money/accounts touched)
  const handleSaveQuotation = async () => {
    if (effectiveCartItems.length === 0) {
      setErrorMsg(
        activeTemplate
          ? 'Template has no filled items. Please select products for at least one slot.'
          : 'Cannot create an empty quotation. Please add items to cart.'
      );
      return;
    }

    const selectedCust = customers.find((c) => c.id === selectedCustomerId);
    const custName = (selectedCust ? selectedCust.name : inlineCustomerName).trim();
    const custPhone = (selectedCust ? (selectedCust.phone || '') : inlineCustomerPhone).trim();

    if (!custName || !custPhone) {
      setErrorMsg('Customer Name and Customer Phone Number are mandatory to create an official Quotation.');
      return;
    }

    setSavingQuotation(true);
    setErrorMsg(null);

    try {
      const payload: QuotationCreate = {
        customer_id: selectedCustomerId || undefined,
        customer_name: custName,
        customer_phone: custPhone,
        customer_address: selectedCust ? (selectedCust.address || undefined) : undefined,
        items: effectiveCartItems.map((i) => ({
          product_id: i.product.is_external ? null : i.product.id,
          external_name: i.product.is_external ? i.product.name : undefined,
          is_external: Boolean(i.product.is_external),
          quantity: i.quantity,
          unit_price: Number(i.unit_price),
          discount_amount: Number(i.discount_amount || 0),
          notes: (i as any).notes || undefined,
        })),
        discount_amount: Number(saleDiscount || 0),
        tax_rate: Number(taxRate || 0),
        notes: notes.trim() || undefined,
      };

      const res = await api.createQuotation(payload);
      setCreatedQuotation(res);
      setShowQuotationModal(true);

      // Reset cart, template and fields
      setCart([]);
      setActiveTemplate(null);
      setTemplateSlots([]);
      setSelectedCustomerId(null);
      setInlineCustomerName('');
      setInlineCustomerPhone('');
      setSaleDiscount(0);
      setNotes('');
      setIsPaidAmountCustomized(false);
      setPaidAmount(0);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.detail || 'Failed to save quotation.');
    } finally {
      setSavingQuotation(false);
    }
  };

  const selectedCustomerObj = customers.find((c) => c.id === selectedCustomerId);

  return (
    <div className="space-y-6 pb-12">
      {/* Live Printing In-Flight Cue */}
      {isPrintingReceipt && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl bg-slate-900/95 text-white shadow-2xl border border-slate-700 backdrop-blur-md animate-in fade-in slide-in-from-top-4 duration-200">
          <Printer className="h-5 w-5 text-emerald-400 animate-pulse shrink-0" />
          <div className="flex flex-col">
            <span className="text-sm font-bold flex items-center gap-2">
              Printing Receipt #{isPrintingReceipt.receiptNumber}...
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            </span>
            <span className="text-xs text-slate-300">Sending commands to printer. Please wait before next checkout.</span>
          </div>
        </div>
      )}

      {/* Instant Auto-Print Success Toast Notification */}
      {successToast && (
        <div className="flex items-center justify-between p-4 rounded-2xl bg-emerald-600 text-white shadow-xl shadow-emerald-950/20 border border-emerald-500 animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="h-5 w-5 text-emerald-200 shrink-0" />
            <span className="text-xs sm:text-sm font-bold tracking-tight">{successToast}</span>
          </div>
          {completedSale && (
            <button
              type="button"
              onClick={() => setShowReceipt(true)}
              className="px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white text-xs font-bold transition ml-3 shadow-xs"
            >
              Open Receipt Modal
            </button>
          )}
        </div>
      )}

      {/* Printer Offline / Warning Notification */}
      {warningToast && (
        <div className="flex items-center justify-between p-4 rounded-2xl bg-amber-600 text-white shadow-xl shadow-amber-950/20 border border-amber-500 animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="h-5 w-5 text-amber-200 shrink-0" />
            <span className="text-xs sm:text-sm font-bold tracking-tight">{warningToast}</span>
          </div>
          {completedSale && (
            <button
              type="button"
              onClick={() => setShowReceipt(true)}
              className="px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white text-xs font-bold transition ml-3 shadow-xs"
            >
              Open Receipt Modal
            </button>
          )}
        </div>
      )}

      {/* Top Command Bar (Compact & Ergonomic) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-emerald-700 via-emerald-800 to-slate-900 rounded-2xl py-2.5 px-4 sm:px-5 text-white shadow-md shadow-emerald-950/15">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 bg-emerald-500/20 rounded-xl border border-emerald-400/30 shrink-0">
            <Zap className="h-4 w-4 text-emerald-300" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base sm:text-lg font-black tracking-tight">Point of Sale</h1>
              {scannerEnabled && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-400/20 border border-emerald-300/40 text-emerald-200 text-[10px] font-bold tracking-wide">
                  <Barcode className="h-3 w-3 text-emerald-300" />
                  Scanner
                </span>
              )}
              <button
                type="button"
                onClick={handleTogglePosAutoPrint}
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide transition border ${
                  autoPrintEnabled
                    ? 'bg-amber-400/25 border-amber-300/50 text-amber-200 hover:bg-amber-400/35 shadow-xs'
                    : 'bg-white/10 border-white/20 text-slate-300 hover:bg-white/20'
                }`}
                title={
                  autoPrintEnabled
                    ? '1-Click Auto-Print is active: Completing sale prints automatically. Click to switch to Preview Modal.'
                    : 'Receipt Preview Modal is active: Click to enable 1-Click Auto-Print.'
                }
              >
                <Zap className={`h-3 w-3 ${autoPrintEnabled ? 'text-amber-300 animate-pulse' : 'text-slate-400'}`} />
                <span>{autoPrintEnabled ? '1-Click Print: Active' : 'Preview Modal: Active'}</span>
              </button>
            </div>
            <p className="text-emerald-200/90 text-[11px] font-medium flex items-center gap-1.5 flex-wrap mt-0.5">
              <span>{showBarcode ? 'Scan barcode or' : 'Search:'}</span>
              <span><kbd className="bg-white/20 px-1 py-0.2 rounded text-[10px] font-mono">F4</kbd> Search</span>
              <span>• <kbd className="bg-white/20 px-1 py-0.2 rounded text-[10px] font-mono">F8</kbd> Customer</span>
              <span>• <kbd className="bg-white/20 px-1 py-0.2 rounded text-[10px] font-mono">F9</kbd> Checkout</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0 justify-between sm:justify-end">
          {completedSale && (
            <button
              type="button"
              onClick={() => setShowReceipt(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/25 text-white text-[11px] font-bold transition shadow-xs"
              title="View or reprint receipt for the previous sale"
            >
              <Printer className="h-3.5 w-3.5 text-emerald-300" />
              <span>Reprint #{completedSale.receipt_number}</span>
            </button>
          )}

          <div className="text-right pl-3 sm:border-l sm:border-emerald-600/50">
            <div className="text-[10px] text-emerald-200/80 font-bold uppercase tracking-wider">Cart Total</div>
            <div className="text-xl sm:text-2xl font-black tracking-tight leading-tight">
              {formatCurrency(grandTotal, currency)}
            </div>
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {errorMsg && (
        <div className="flex items-center gap-2 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-medium">
          <AlertCircle className="h-5 w-5 shrink-0 text-rose-600" />
          <span className="flex-1">{errorMsg}</span>
          {(printDiagnosticError || errorMsg.toLowerCase().includes('printer') || errorMsg.toLowerCase().includes('timed out')) && (
            <button
              type="button"
              onClick={() => setShowDiagnosticsModal(true)}
              className="px-2.5 py-1 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm transition flex items-center gap-1 shrink-0"
            >
              <span>Diagnose & Fix</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setErrorMsg(null);
              setPrintDiagnosticError(null);
            }}
            className="text-xs text-rose-500 font-bold ml-1 hover:text-rose-700 transition"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Grid: Left Cart + Right Checkout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Product Search & Cart */}
        <div className="lg:col-span-7 space-y-4">
          {/* Live Search & Barcode Input + Bill Template Dropdown */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm relative transition-all">
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <Input
                  ref={searchInputRef}
                  placeholder={`Search by Product name, ID${showSku ? ', SKU' : ''}${showBarcode ? ', or scan barcode' : ''}... (Press Enter to add)`}
                  prefix={
                    <Search
                      className={`h-5 w-5 transition-colors ${
                        keyboardActiveTarget === 'search'
                          ? 'text-brand-600 stroke-[2.5]'
                          : 'text-brand-500'
                      }`}
                    />
                  }
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  onClick={() => {
                    if (keyboardActiveTarget === 'search') {
                      setKeyboardActiveTarget(null);
                    }
                  }}
                  className={`text-base py-3 rounded-2xl font-medium transition-all ${
                    keyboardActiveTarget === 'search'
                      ? '!border-2 !border-brand-500 !ring-4 !ring-brand-500/25 !bg-brand-50/25 dark:!bg-brand-950/30 shadow-md !text-slate-900 dark:!text-slate-100'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                  autoFocus
                />
              </div>

              {/* Add to Bill Button */}
              <button
                type="button"
                onClick={() => {
                  setAddToBillInitialName('');
                  setShowAddToBillModal(true);
                }}
                className="h-[48px] px-3.5 rounded-2xl flex items-center gap-1.5 font-bold text-xs transition border shadow-xs bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/50 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 shrink-0"
                title="Add external or sourced items to bill without affecting business profit"
              >
                <Plus className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <span className="hidden sm:inline">Add to Bill</span>
              </button>

              {/* Bill / Product Kit Template Selector Dropdown */}
              {templatesEnabled && (
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsTemplateDropdownOpen((prev) => !prev)}
                    className={`h-[48px] px-3.5 rounded-2xl flex items-center gap-2 font-bold text-xs transition border shadow-xs ${
                      activeTemplate
                        ? 'bg-teal-600 text-white border-teal-600 ring-2 ring-teal-500/30 shadow-teal-700/20'
                        : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/80'
                    }`}
                    title="Autofill POS with structured Product Kit Templates (Solar, AC, etc.)"
                  >
                    <Layers className={`h-4 w-4 ${activeTemplate ? 'text-white' : 'text-teal-600 dark:text-teal-400'}`} />
                    <span className="hidden sm:inline">
                      {activeTemplate ? activeTemplate.name : 'Templates'}
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                  </button>

                  {isTemplateDropdownOpen && (
                    <div className="absolute right-0 top-14 z-40 w-72 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl p-2 space-y-1.5 animate-in fade-in zoom-in-95 duration-100">
                      <div className="px-3 py-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                        <span className="flex items-center gap-1.5">
                          <Layers className="h-3.5 w-3.5 text-teal-500" />
                          Bill Templates
                        </span>
                        <span>{availableTemplates.length} saved</span>
                      </div>

                      {activeTemplate && (
                        <button
                          type="button"
                          onClick={() => {
                            handleClearTemplate();
                            setIsTemplateDropdownOpen(false);
                          }}
                          className="w-full text-left px-3 py-2 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition flex items-center gap-2"
                        >
                          <X className="h-3.5 w-3.5" />
                          <span>Exit Template Mode (Return to Regular Cart)</span>
                        </button>
                      )}

                      {availableTemplates.length === 0 ? (
                        <div className="p-4 text-center text-xs text-slate-400 dark:text-slate-500 space-y-1">
                          <p className="font-semibold text-slate-600 dark:text-slate-300">No templates saved yet</p>
                          <p className="text-[11px]">
                            Define templates in <strong>Settings → Bill Templates</strong> or save an active bill!
                          </p>
                        </div>
                      ) : (
                        <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                          {availableTemplates.map((tpl) => (
                            <button
                              key={tpl.id}
                              type="button"
                              onClick={() => handleSelectTemplate(tpl)}
                              className={`w-full text-left p-2.5 rounded-xl transition flex items-center justify-between text-xs ${
                                activeTemplate?.id === tpl.id
                                  ? 'bg-teal-50 dark:bg-teal-950/40 text-teal-900 dark:text-teal-200 font-bold border border-teal-200 dark:border-teal-800'
                                  : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200'
                              }`}
                            >
                              <div className="min-w-0 mr-2">
                                <div className="font-bold truncate">{tpl.name}</div>
                                {tpl.description && (
                                  <div className="text-[10px] text-slate-400 truncate">{tpl.description}</div>
                                )}
                              </div>
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 shrink-0 font-medium">
                                {tpl.items?.length || 0} slots
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Live Search Results Dropdown */}
            {searchQuery.trim().length > 0 && (
              <div className="absolute left-4 right-4 top-18 z-30 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                {filteredProducts.length === 0 ? (
                  <div className="p-4 text-center">
                    <p className="text-sm text-slate-400 dark:text-slate-500 mb-2">
                      No products match "{searchQuery}"
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setAddToBillInitialName(searchQuery.trim());
                        setShowAddToBillModal(true);
                        setSearchQuery('');
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-xs font-bold hover:bg-amber-100 dark:hover:bg-amber-900/60 transition shadow-xs"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add "{searchQuery}" directly to Bill
                    </button>
                  </div>
                ) : (
                  filteredProducts.map((prod, idx) => {
                    const isDropdownActive = dropdownActiveIndex === idx;
                    return (
                      <button
                        key={prod.id}
                        id={`search-result-${idx}`}
                        type="button"
                        onClick={() => {
                          addToCart(prod);
                          setSearchQuery('');
                          setDropdownActiveIndex(-1);
                          searchInputRef.current?.focus();
                        }}
                        onMouseEnter={() => setDropdownActiveIndex(idx)}
                        className={`w-full text-left p-3.5 flex items-center justify-between transition-colors group ${
                          isDropdownActive
                            ? 'bg-brand-50/95 dark:bg-brand-950/60 ring-2 ring-inset ring-brand-500/40 border-l-4 border-brand-600'
                            : 'hover:bg-brand-50/70 dark:hover:bg-brand-950/30 border-l-4 border-transparent'
                        }`}
                      >
                        <div>
                          <div
                            className={`font-bold text-sm flex items-center gap-1.5 ${
                              isDropdownActive
                                ? 'text-brand-950 dark:text-brand-200 font-extrabold'
                                : 'text-slate-800 dark:text-slate-100 group-hover:text-brand-900 dark:group-hover:text-brand-300'
                            }`}
                          >
                            <span>{prod.name}</span>
                            {prod.is_service && (
                              <span className="inline-flex items-center px-1.5 py-0.2 text-[10px] font-semibold bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded border border-blue-200 dark:border-blue-800/60 shrink-0">
                                No-Stock
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-400 dark:text-slate-500 flex flex-wrap items-center gap-1.5 mt-0.5">
                            <span>ID: {prod.product_id}</span>
                            {showBarcode && prod.barcode && <span>• BC: {prod.barcode}</span>}
                            {showSku && prod.sku && <span>• SKU: {prod.sku}</span>}
                            {prod.custom_fields &&
                              prod.custom_fields.map((cf) => (
                                <span
                                  key={cf.field_id}
                                  className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-1.5 py-0.2 rounded text-[10px] font-semibold"
                                >
                                  {cf.value}
                                </span>
                              ))}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-black text-slate-900 dark:text-slate-100 text-sm">
                            {formatCurrency(prod.selling_price, currency)}
                          </div>
                          {prod.is_service ? (
                            <div className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                              No-Stock Item
                            </div>
                          ) : (
                            <div
                              className={`text-xs font-semibold ${
                                Number(prod.current_stock) > 5
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : Number(prod.current_stock) > 0
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-rose-600 dark:text-rose-400'
                              }`}
                            >
                              Stock: {prod.current_stock}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Main POS Cart / Template Items Card */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden min-h-[380px] flex flex-col">
            <div className="p-3.5 sm:p-4 bg-slate-50/80 dark:bg-slate-800/80 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate mr-2">
                {activeTemplate
                  ? `Template: ${activeTemplate.name}`
                  : `Cart Items (${cart.reduce((sum, i) => sum + i.quantity, 0)} units)`}
              </span>

              <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                {activeTemplate ? (
                  <>
                    <button
                      type="button"
                      onClick={handleAddExtraSlot}
                      className="text-xs text-teal-600 dark:text-teal-400 font-bold hover:underline flex items-center gap-1"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add Row
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowSaveTemplateModal(true)}
                      className="text-xs text-teal-600 dark:text-teal-400 font-bold hover:underline flex items-center gap-1"
                    >
                      <BookmarkPlus className="h-3.5 w-3.5" />
                      Save as Template
                    </button>
                    <button
                      type="button"
                      onClick={handleClearTemplate}
                      className="text-xs text-rose-600 dark:text-rose-400 font-bold hover:underline"
                    >
                      Exit Template
                    </button>
                  </>
                ) : (
                  <>
                    {templatesEnabled && cart.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowSaveTemplateModal(true)}
                        className="text-xs text-teal-600 dark:text-teal-400 font-bold hover:underline flex items-center gap-1"
                      >
                        <BookmarkPlus className="h-3.5 w-3.5" />
                        Save as Template
                      </button>
                    )}
                    {cart.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setCart([])}
                        className="text-xs text-rose-600 dark:text-rose-400 font-bold hover:underline"
                      >
                        Clear All
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {activeTemplate ? (
              <div className="flex-1 overflow-x-auto max-h-[520px]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 uppercase font-bold text-[10px] tracking-wider">
                      <th className="py-2.5 px-2 w-8 text-center">#</th>
                      <th className="py-2.5 px-2 w-28">Category</th>
                      <th className="py-2.5 px-2">Product</th>
                      <th className="py-2.5 px-1.5 w-20 text-center">Qty</th>
                      <th className="py-2.5 px-2 w-24 text-right">Price</th>
                      <th className="py-2.5 px-2 w-24 text-right">Total</th>
                      <th className="py-2.5 px-1.5 w-7 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                    {templateSlots.map((slot, idx) => (
                      <tr
                        key={slot.slot_id}
                        id={`template-slot-row-${idx}`}
                        onClick={() => setKeyboardActiveTarget(idx)}
                        className={`transition-colors cursor-pointer ${
                          keyboardActiveTarget === idx
                            ? 'bg-brand-50/90 dark:bg-brand-950/60 ring-2 ring-inset ring-brand-500 border-l-4 border-l-brand-600'
                            : slot.selected_product
                            ? 'hover:bg-slate-50/80 dark:hover:bg-slate-800/50'
                            : 'bg-slate-50/30 dark:bg-slate-900/30 text-slate-400'
                        }`}
                      >
                        {/* # */}
                        <td className="py-2 px-2 text-center font-bold text-slate-400 text-xs">
                          {idx + 1}
                        </td>

                        {/* Category */}
                        <td className="py-2 px-2">
                          <div
                            className="font-semibold text-slate-800 dark:text-slate-200 text-xs truncate max-w-[110px]"
                            title={slot.category_name || slot.slot_name}
                          >
                            {slot.category_name || slot.slot_name}
                          </div>
                        </td>

                        {/* Product Selection */}
                        <td className="py-1.5 px-2">
                          <SlotProductPicker
                            slot={slot}
                            allProducts={products}
                            currency={currency}
                            onSelectProduct={(prod) => {
                              handleSlotSelectProduct(idx, prod);
                              setActiveSlotPickerIndex(null);
                            }}
                            onClearProduct={() => handleSlotClearProduct(idx)}
                            isPickerOpen={activeSlotPickerIndex === idx}
                            onTogglePicker={(open) => setActiveSlotPickerIndex(open ? idx : null)}
                          />
                        </td>

                        {/* Qty Stepper */}
                        <td className="py-1.5 px-1.5 text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="inline-flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg">
                            <button
                              type="button"
                              onClick={() => handleSlotQuantityChange(idx, slot.quantity - 1)}
                              disabled={slot.quantity <= 1}
                              className="w-5 h-5 rounded bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center font-bold text-xs disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min="1"
                              value={slot.quantity}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                handleSlotQuantityChange(idx, isNaN(val) || val < 1 ? 1 : val);
                              }}
                              onBlur={(e) => {
                                const val = parseInt(e.target.value, 10);
                                if (isNaN(val) || val < 1) {
                                  handleSlotQuantityChange(idx, 1);
                                }
                              }}
                              className="w-7 text-center text-xs font-bold bg-transparent border-none outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => handleSlotQuantityChange(idx, slot.quantity + 1)}
                              className="w-5 h-5 rounded bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center font-bold text-xs"
                            >
                              +
                            </button>
                          </div>
                        </td>

                        {/* Price */}
                        <td className="py-2 px-2 text-right font-medium text-slate-700 dark:text-slate-300 text-xs whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          {slot.selected_product ? (
                            slot.selected_product.is_service ? (
                              <div className="inline-flex items-center justify-end">
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  placeholder="0.00"
                                  value={(slot.unit_price !== undefined ? slot.unit_price : slot.selected_product.selling_price) || ''}
                                  onFocus={(e) => requestAnimationFrame(() => e.target.select())}
                                  onChange={(e) => {
                                    const raw = e.target.value.replace(/^0+(?=[1-9])/, '');
                                    const val = parseFloat(raw);
                                    handleSlotPriceChange(idx, isNaN(val) ? 0 : val);
                                  }}
                                  className="w-16 px-1.5 py-0.5 text-right text-xs font-bold bg-white dark:bg-slate-800 border border-teal-300 dark:border-teal-700 rounded text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
                                  title="Rate (editable)"
                                />
                              </div>
                            ) : (
                              formatCurrency(slot.selected_product.selling_price, currency)
                            )
                          ) : (
                            <span className="text-slate-300 dark:text-slate-600 font-normal">—</span>
                          )}
                        </td>

                        {/* Total */}
                        <td className="py-2 px-2 text-right font-bold text-slate-900 dark:text-white text-xs whitespace-nowrap">
                          {slot.selected_product && slot.quantity > 0 ? (
                            formatCurrency(
                              slot.quantity *
                                Number(
                                  slot.selected_product.is_service
                                    ? (slot.unit_price !== undefined ? slot.unit_price : slot.selected_product.selling_price || 0)
                                    : slot.selected_product.selling_price || 0
                                ),
                              currency
                            )
                          ) : (
                            <span className="text-slate-300 dark:text-slate-600 font-normal">—</span>
                          )}
                        </td>

                        {/* Remove */}
                        <td className="py-2 px-1.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleSlotRemove(idx)}
                            className="p-1 text-slate-300 hover:text-rose-500 transition"
                            title="Remove row"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (

              <div className="flex-1 overflow-y-auto max-h-[480px]">
                {cart.length === 0 ? (
                  <div className="py-24 text-center text-slate-400 dark:text-slate-500 flex flex-col items-center">
                    <div className="h-12 w-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500 mb-3">
                      <Barcode className="h-6 w-6" />
                    </div>
                    <p className="font-semibold text-slate-600 dark:text-slate-300 text-sm">Cart is empty</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                      {showBarcode
                        ? 'Scan a product barcode or use search above'
                        : 'Search products above to add to cart'}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 p-2 space-y-1">
                    {cart.map((item, idx) => (
                      <div
                        key={item.product.id}
                        onClick={() => setKeyboardActiveTarget(idx)}
                        className={`p-3.5 transition-all flex items-center justify-between gap-3 rounded-2xl cursor-pointer ${
                          keyboardActiveTarget === idx
                            ? 'bg-brand-50/80 dark:bg-brand-950/50 border-2 border-brand-500 shadow-xs ring-2 ring-brand-500/20'
                            : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/60 border-2 border-transparent'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-100 text-sm truncate">
                            <span className="truncate">{item.product.name}</span>
                            {item.product.is_external ? (
                              <span className="inline-flex items-center px-1.5 py-0.2 text-[10px] font-semibold bg-amber-50 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 rounded border border-amber-200 dark:border-amber-800/60 shrink-0">
                                Sourced Item
                              </span>
                            ) : item.product.is_service ? (
                              <span className="inline-flex items-center px-1.5 py-0.2 text-[10px] font-semibold bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded border border-blue-200 dark:border-blue-800/60 shrink-0">
                                No-Stock
                              </span>
                            ) : null}
                          </div>
                          <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                            {item.product.is_service || item.product.is_external ? (
                              <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                <span className="text-slate-500 font-medium">Rate:</span>
                                <div className="inline-flex items-center bg-white dark:bg-slate-800 border border-teal-300 dark:border-teal-700 rounded-lg px-2 py-0.5 shadow-2xs">
                                  <span className="text-[11px] font-bold text-slate-400 mr-1">{currency}</span>
                                  <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    placeholder="0.00"
                                    value={item.unit_price || ''}
                                    onFocus={(e) => requestAnimationFrame(() => e.target.select())}
                                    onChange={(e) => {
                                      const raw = e.target.value.replace(/^0+(?=[1-9])/, '');
                                      const val = parseFloat(raw);
                                      updateItemPrice(item.product.id, isNaN(val) ? 0 : val);
                                    }}
                                    className="w-16 text-xs font-bold text-slate-900 dark:text-slate-100 bg-transparent border-none outline-none focus:ring-0 p-0"
                                    title="Edit rate"
                                  />
                                </div>
                                {item.product.is_external ? (
                                  <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">(Zero Profit)</span>
                                ) : (
                                  <span className="text-[11px] text-teal-600 dark:text-teal-400 font-medium">(No Stock)</span>
                                )}
                              </div>
                            ) : (
                              <span>
                                Unit Price: {formatCurrency(item.unit_price, currency)} • Stock:{' '}
                                {item.product.current_stock}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Quantity Controls */}
                        <div
                          className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                            className="h-7 w-7 rounded-lg bg-white dark:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 shadow-sm font-bold transition disabled:opacity-40"
                            title="Decrease quantity"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <CartQuantityInput
                            productId={item.product.id}
                            productName={item.product.name}
                            quantity={item.quantity}
                            availableStock={Number(item.product.current_stock || 0)}
                            isService={item.product.is_service}
                            isActive={keyboardActiveTarget === idx}
                            onUpdateQuantity={updateQuantity}
                            onNotifyCapped={(maxStock, prodName) => {
                              setErrorMsg(
                                `Quantity capped to maximum available stock (${maxStock} units of ${prodName}).`
                              );
                            }}
                            onNavigateUp={() => handleCartNavigateUp(idx)}
                            onNavigateDown={() => handleCartNavigateDown(idx)}
                            onFocusItem={() => setKeyboardActiveTarget(idx)}
                          />
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                            className="h-7 w-7 rounded-lg bg-white dark:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 shadow-sm font-bold transition disabled:opacity-40"
                            title="Increase quantity"
                            disabled={!item.product.is_service && item.quantity >= Number(item.product.current_stock || 0)}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        {/* Item Total */}
                        <div className="w-24 text-right">
                          <span className="font-black text-slate-900 dark:text-slate-100 text-sm">
                            {formatCurrency(item.quantity * Number(item.unit_price), currency)}
                          </span>
                        </div>

                        {/* Remove Button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeItem(item.product.id);
                          }}
                          className="text-slate-300 dark:text-slate-600 hover:text-rose-500 dark:hover:text-rose-400 p-1 transition"
                          title="Remove"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Unified Checkout & Payment Panel */}
        <div className="lg:col-span-5">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm space-y-3.5 sticky top-4">
            {/* Header: Title & Select Existing Modal Trigger */}
            <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Customer & Checkout
              </span>
              <button
                type="button"
                onClick={() => setShowAddCustomerModal(true)}
                className="text-xs font-bold text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1"
                title="Open customer search modal (Press F8)"
              >
                <span>{selectedCustomerId ? 'Change Customer' : 'Select Existing'}</span>
                <kbd className="hidden sm:inline-block px-1 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-mono text-slate-500">F8</kbd>
              </button>
            </div>

            {/* Customer Section */}
            {selectedCustomerObj ? (
              <div className="flex items-center justify-between text-xs bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl px-3 py-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <User className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span className="font-bold text-emerald-900 dark:text-emerald-200 truncate">
                    {selectedCustomerObj.name}
                  </span>
                  {selectedCustomerObj.phone && (
                    <span className="text-[11px] text-emerald-700 dark:text-emerald-400">
                      ({selectedCustomerObj.phone})
                    </span>
                  )}
                  {Number(selectedCustomerObj.current_due || 0) > 0 && (
                    <span className="text-[10px] font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/60 px-1.5 py-0.5 rounded border border-rose-200 dark:border-rose-800 shrink-0 ml-1">
                      Due: {formatCurrency(selectedCustomerObj.current_due, currency)}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCustomerId(null);
                    setInlineCustomerName('');
                    setInlineCustomerPhone('');
                  }}
                  className="text-xs text-rose-600 dark:text-rose-400 hover:text-rose-700 font-bold hover:underline shrink-0 ml-2"
                >
                  ✕ Walk-in
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 relative">
                {/* Customer Name with Inline Autocomplete */}
                <div className="relative">
                  <Input
                    ref={inlineCustomerInputRef}
                    label="Customer Name"
                    placeholder="Walk-in Customer"
                    value={inlineCustomerName}
                    onChange={(e) => {
                      setInlineCustomerName(e.target.value);
                      setIsInlineCustomerDropdownOpen(true);
                      setInlineCustomerActiveIdx(-1);
                      if (selectedCustomerId) setSelectedCustomerId(null);
                    }}
                    onFocus={() => {
                      if (inlineCustomerMatches.length > 0) {
                        setIsInlineCustomerDropdownOpen(true);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (inlineCustomerMatches.length > 0) {
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          setIsInlineCustomerDropdownOpen(true);
                          setInlineCustomerActiveIdx((prev) =>
                            prev < inlineCustomerMatches.length - 1 ? prev + 1 : 0
                          );
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          setInlineCustomerActiveIdx((prev) =>
                            prev > 0 ? prev - 1 : inlineCustomerMatches.length - 1
                          );
                        } else if (e.key === 'Enter') {
                          e.preventDefault();
                          const target =
                            inlineCustomerActiveIdx >= 0
                              ? inlineCustomerMatches[inlineCustomerActiveIdx]
                              : inlineCustomerMatches[0];
                          if (target) {
                            setSelectedCustomerId(target.id);
                            setInlineCustomerName(target.name);
                            setInlineCustomerPhone(target.phone || '');
                            setIsInlineCustomerDropdownOpen(false);
                            setInlineCustomerActiveIdx(-1);
                          }
                        } else if (e.key === 'Escape') {
                          setIsInlineCustomerDropdownOpen(false);
                        }
                      }
                    }}
                    className="text-xs py-1.5"
                  />

                  {/* Floating Inline Autocomplete Dropdown */}
                  {isInlineCustomerDropdownOpen && inlineCustomerMatches.length > 0 && (
                    <div
                      ref={inlineCustomerDropdownRef}
                      className="absolute left-0 right-0 top-full mt-1 z-30 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800 max-h-52 overflow-y-auto"
                    >
                      {inlineCustomerMatches.map((c, cIdx) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setSelectedCustomerId(c.id);
                            setInlineCustomerName(c.name);
                            setInlineCustomerPhone(c.phone || '');
                            setIsInlineCustomerDropdownOpen(false);
                          }}
                          onMouseEnter={() => setInlineCustomerActiveIdx(cIdx)}
                          className={`w-full text-left p-2.5 transition flex items-center justify-between text-xs ${
                            inlineCustomerActiveIdx === cIdx
                              ? 'bg-brand-50 dark:bg-brand-950/60 text-brand-950 dark:text-brand-100 font-bold'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800/80 text-slate-800 dark:text-slate-200'
                          }`}
                        >
                          <div className="min-w-0 mr-2">
                            <div className="font-bold truncate">{c.name}</div>
                            <div className="text-[10px] text-slate-400 truncate">
                              {c.phone || c.customer_id}
                            </div>
                          </div>
                          {Number(c.current_due || 0) > 0 && (
                            <span className="text-[10px] font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/60 px-1.5 py-0.5 rounded border border-rose-200 dark:border-rose-800 shrink-0">
                              Due: {formatCurrency(c.current_due, currency)}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <Input
                  label="Phone Number"
                  placeholder="Optional"
                  value={inlineCustomerPhone}
                  onChange={(e) => setInlineCustomerPhone(e.target.value)}
                  className="text-xs py-1.5"
                />
              </div>
            )}

            {/* 1-Click Payment Method Quick Pills */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Payment Method
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setIsQuickPaySplit(true);
                    handleOpenQuickPayOrComplete();
                  }}
                  className="text-[11px] font-bold text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1"
                >
                  <Zap className="h-3 w-3 text-amber-500" />
                  <span>Split / Mix</span>
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {configuredPaymentAccounts.slice(0, 4).map((acc) => {
                  const isSelected = paymentMethod === acc;
                  return (
                    <button
                      key={acc}
                      type="button"
                      onClick={() => setPaymentMethod(acc)}
                      className={`py-2 px-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 border shadow-2xs ${
                        isSelected
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm shadow-emerald-600/20'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700/80'
                      }`}
                    >
                      {acc.toLowerCase().includes('cash') ? (
                        <DollarSign className="h-3.5 w-3.5 shrink-0" />
                      ) : acc.toLowerCase().includes('bank') ? (
                        <CreditCard className="h-3.5 w-3.5 shrink-0" />
                      ) : (
                        <Wallet className="h-3.5 w-3.5 shrink-0" />
                      )}
                      <span className="truncate">{acc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Financial Summary Box */}
            <div className="bg-slate-50/80 dark:bg-slate-800/50 rounded-2xl p-3 border border-slate-100 dark:border-slate-800/80 space-y-2">
              <div className="flex justify-between items-center text-xs text-slate-600 dark:text-slate-400">
                <span>Subtotal:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {formatCurrency(subtotal, currency)}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-600 dark:text-slate-400">Discount:</span>
                <div className="w-28">
                  <Input
                    type="number"
                    min="0"
                    prefix={currency}
                    placeholder="0.00"
                    value={saleDiscount || ''}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      setSaleDiscount(isNaN(v) || v < 0 ? 0 : v);
                    }}
                    className="text-xs py-1 text-right"
                  />
                </div>
              </div>
              {taxAmount > 0 && (
                <div className="flex justify-between text-slate-600 dark:text-slate-400 text-xs">
                  <span>Tax ({taxRate}%):</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    +{formatCurrency(taxAmount, currency)}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center text-slate-900 dark:text-slate-100 border-t border-slate-200 dark:border-slate-700/80 pt-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Net Total:
                </span>
                <span className="text-xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight">
                  {formatCurrency(grandTotal, currency)}
                </span>
              </div>
            </div>

            {/* Amount Paid & Live Settlement */}
            <div className="space-y-2">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    Amount Paid
                  </label>
                  {grandTotal > 0 && currentPaid !== grandTotal && (
                    <button
                      type="button"
                      onClick={() => {
                        setPaidAmount(grandTotal);
                        setIsPaidAmountCustomized(false);
                      }}
                      className="text-xs font-bold text-emerald-700 dark:text-emerald-400 hover:underline"
                    >
                      Exact Cash
                    </button>
                  )}
                </div>
                <Input
                  type="number"
                  step="any"
                  min="0"
                  prefix={currency}
                  placeholder={grandTotal > 0 ? formatMoney(grandTotal) : '0.00'}
                  value={paidAmount === 0 && isPaidAmountCustomized ? '' : paidAmount || ''}
                  onChange={(e) => {
                    const val = e.target.value === '' ? 0 : Math.max(0, parseFloat(e.target.value) || 0);
                    setPaidAmount(val);
                    setIsPaidAmountCustomized(true);
                  }}
                  className="text-sm font-black py-2"
                />
              </div>

              {/* Smart Quick Cash Tender Presets */}
              {paymentMethod.toLowerCase().includes('cash') && quickCashOptions.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-0.5">
                    Quick Cash:
                  </span>
                  {quickCashOptions.map((opt) => {
                    const isSelected = Number(paidAmount) === opt;
                    const isExact = opt === grandTotal;
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => {
                          setPaidAmount(opt);
                          setIsPaidAmountCustomized(true);
                        }}
                        className={`px-2 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 border ${
                          isSelected
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                            : 'bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60 hover:bg-emerald-100'
                        }`}
                      >
                        {isExact ? <span>Exact</span> : <span>{formatMoney(opt)}</span>}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* High-visibility Change Due Banner */}
              {changeAmount > 0 && (
                <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700 text-emerald-900 dark:text-emerald-100 shadow-xs animate-in fade-in duration-150">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xs font-extrabold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
                      Change to Return
                    </span>
                  </div>
                  <span className="text-base font-black text-emerald-800 dark:text-emerald-200">
                    {formatCurrency(changeAmount, currency)}
                  </span>
                </div>
              )}

              {/* Settlement Status Indicator */}
              <div className="flex items-center justify-between text-xs px-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 font-medium">Status:</span>
                  {paymentStatus === 'PAID' && (
                    <span className="px-2 py-0.5 rounded-md font-bold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
                      Fully Paid
                    </span>
                  )}
                  {paymentStatus === 'PARTIAL' && (
                    <span className="px-2 py-0.5 rounded-md font-bold text-amber-700 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800">
                      Partial Pay
                    </span>
                  )}
                  {paymentStatus === 'UNPAID' && (
                    <span className="px-2 py-0.5 rounded-md font-bold text-rose-700 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800">
                      Unpaid (Credit)
                    </span>
                  )}
                </div>

                {dueAmount > 0 ? (
                  <div className="text-right">
                    <span className="text-slate-500 mr-1">Remaining Due:</span>
                    <span className="font-bold text-rose-600 text-sm">
                      {formatCurrency(dueAmount, currency)}
                    </span>
                  </div>
                ) : changeAmount > 0 ? (
                  <div className="text-right">
                    <span className="text-slate-500 dark:text-slate-400 mr-1">Change:</span>
                    <span className="font-bold text-brand-600 dark:text-brand-400 text-sm">
                      {formatCurrency(changeAmount, currency)}
                    </span>
                  </div>
                ) : (
                  <span className="text-slate-400 dark:text-slate-500 font-medium">Settled</span>
                )}
              </div>
            </div>

            {/* Action Buttons: Complete Sale & Create Quotation */}
            <div className="flex flex-col sm:flex-row items-stretch gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
              {settings?.enable_quotations !== false && (
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  icon={<FileText className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />}
                  onClick={handleSaveQuotation}
                  disabled={effectiveCartItems.length === 0 || savingQuotation || completing}
                  loading={savingQuotation}
                  className="py-3 text-xs font-bold border-indigo-200 dark:border-indigo-800 text-indigo-900 dark:text-indigo-200 bg-indigo-50/50 dark:bg-indigo-950/40 hover:bg-indigo-100/60 dark:hover:bg-indigo-900/60 rounded-xl whitespace-nowrap"
                  title="Create uncharged quotation (does not deduct stock or money)"
                >
                  Quotation
                </Button>
              )}

              <Button
                type="button"
                variant="primary"
                size="lg"
                onClick={() => handleCompleteSale()}
                disabled={effectiveCartItems.length === 0 || completing || savingQuotation || Boolean(isPrintingReceipt)}
                loading={completing || Boolean(isPrintingReceipt)}
                className="flex-1 py-3 text-base font-bold tracking-wide rounded-xl shadow-lg shadow-emerald-600/20 bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-2"
              >
                {autoPrintEnabled && <Zap className="h-4 w-4 text-emerald-200 shrink-0" />}
                <span>Complete Sale ({formatCurrency(grandTotal, currency)})</span>
                <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded-md bg-white/20 text-white text-[10px] font-mono font-bold tracking-tight shadow-xs">
                  F9
                </kbd>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Existing Customer Selector Modal */}
      <Modal
        isOpen={showAddCustomerModal}
        onClose={() => {
          setShowAddCustomerModal(false);
          setCustomerSearchQuery('');
        }}
        title="Select Customer"
        maxWidth="md"
      >
        <div className="space-y-3">
          <Input
            placeholder="Search customer by name, phone, or ID (Use ↑↓ arrows + Enter)..."
            value={customerSearchQuery}
            onChange={(e) => setCustomerSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setCustomerActiveIndex((prev) =>
                  filteredModalCustomers.length === 0 ? -1 : Math.min(prev + 1, filteredModalCustomers.length - 1)
                );
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setCustomerActiveIndex((prev) => Math.max(prev - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                if (customerActiveIndex >= 0 && filteredModalCustomers[customerActiveIndex]) {
                  const c = filteredModalCustomers[customerActiveIndex];
                  setSelectedCustomerId(c.id);
                  setInlineCustomerName(c.name);
                  setInlineCustomerPhone(c.phone || '');
                  setShowAddCustomerModal(false);
                  setCustomerSearchQuery('');
                } else if (customerSearchQuery.trim()) {
                  setSelectedCustomerId(null);
                  setInlineCustomerName(customerSearchQuery.trim());
                  setShowAddCustomerModal(false);
                  setCustomerSearchQuery('');
                }
              }
            }}
            autoFocus
          />

          <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-2xl">
            {filteredModalCustomers.length === 0 ? (
              <div className="p-4 text-center space-y-2">
                <div className="text-xs text-slate-400">
                  No registered customers found matching "{customerSearchQuery}"
                </div>
                {customerSearchQuery.trim() && (
                  <Button
                    type="button"
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      setSelectedCustomerId(null);
                      setInlineCustomerName(customerSearchQuery.trim());
                      setShowAddCustomerModal(false);
                      setCustomerSearchQuery('');
                    }}
                    className="text-xs font-bold"
                  >
                    Use "{customerSearchQuery.trim()}" for this Sale
                  </Button>
                )}
              </div>
            ) : (
              filteredModalCustomers.map((c, idx) => {
                const isActive = customerActiveIndex === idx;
                return (
                  <button
                    key={c.id}
                    id={`modal-customer-item-${idx}`}
                    type="button"
                    onClick={() => {
                      setSelectedCustomerId(c.id);
                      setInlineCustomerName(c.name);
                      setInlineCustomerPhone(c.phone || '');
                      setShowAddCustomerModal(false);
                      setCustomerSearchQuery('');
                    }}
                    onMouseEnter={() => setCustomerActiveIndex(idx)}
                    className={`w-full p-3 text-left flex items-center justify-between transition ${
                      isActive
                        ? 'bg-brand-50/95 dark:bg-brand-950/60 ring-2 ring-inset ring-brand-500/40 border-l-4 border-brand-600'
                        : 'hover:bg-slate-50 border-l-4 border-transparent'
                    }`}
                  >
                    <div>
                      <div className={`font-bold text-sm ${isActive ? 'text-brand-900 font-extrabold' : 'text-slate-800'}`}>
                        {c.name}
                      </div>
                      <div className="text-xs text-slate-400">{c.phone || 'No phone'}</div>
                    </div>
                    {Number(c.current_due || 0) > 0 && (
                      <span className="text-xs font-bold text-rose-700 bg-rose-50 px-2 py-1 rounded-md">
                        Due: {formatCurrency(c.current_due, currency)}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      </Modal>

      {/* Off-screen Container for Instant Auto-Printing (rendered offscreen for exact layout geometry) */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          left: '-9999px',
          top: '0',
          width: '384px',
          opacity: 0,
          pointerEvents: 'none',
          zIndex: -9999,
        }}
      >
        {completedSale && (
          <>
            <div id="autoprint-thermal-receipt">
              <ThermalReceipt
                id="autoprint-thermal-receipt-element"
                sale={completedSale}
                settings={settings}
                businessName={settings?.business_name}
                phone={settings?.phone}
                address={settings?.address}
                currency={settings?.currency}
                headerText={settings?.receipt_header}
                footerText={settings?.receipt_footer}
                paperWidth={settings?.receipt_printer_type === '58mm' ? '58mm' : '80mm'}
                printerType={settings?.receipt_printer_type === '58mm' ? '58mm' : '80mm'}
                headerStyle={settings?.thermal_header_style || 'logo_text'}
                showBarcode={settings?.show_barcode ?? true}
                layout={settings?.thermal_layout || 'classic'}
              />
            </div>
            <div id="autoprint-pdf-invoice">
              <PdfInvoiceReceipt
                sale={completedSale}
                settings={settings}
                businessName={settings?.business_name}
                phone={settings?.phone}
                address={settings?.address}
                currency={settings?.currency}
                headerText={settings?.receipt_header}
                footerText={settings?.receipt_footer}
              />
            </div>
          </>
        )}
      </div>

      {/* Receipt Modal */}
      <ReceiptModal
        isOpen={showReceipt}
        onClose={() => setShowReceipt(false)}
        sale={completedSale}
        settings={settings}
      />

      {/* Printer Diagnostics Modal */}
      <PrinterDiagnosticsModal
        isOpen={showDiagnosticsModal}
        onClose={() => setShowDiagnosticsModal(false)}
        settings={settings}
      />

      {/* Quotation Print Modal */}
      <QuotationModal
        isOpen={showQuotationModal}
        onClose={() => {
          setShowQuotationModal(false);
          setCreatedQuotation(null);
        }}
        quotation={createdQuotation}
        settings={settings}
      />

      {/* Unregistered Barcode Prompt Modal */}
      <UnregisteredBarcodeModal
        isOpen={Boolean(unregisteredBarcode)}
        onClose={() => setUnregisteredBarcode(null)}
        barcode={unregisteredBarcode || ''}
        contextText="Once saved, this product will be automatically added to your current sale."
        onRegister={(code) => {
          setUnregisteredBarcode(null);
          setQuickAddBarcode(code);
        }}
      />

      {/* Quick Add Product Modal from POS */}
      <QuickAddProductModal
        isOpen={Boolean(quickAddBarcode)}
        onClose={() => setQuickAddBarcode(null)}
        initialBarcode={quickAddBarcode || ''}
        categories={categories}
        settings={settings}
        submitButtonText="Save & Add to Sale"
        onProductCreated={(newProd) => {
          setProducts((prev) => [newProd, ...prev]);
          addToCart(newProd);
          setQuickAddBarcode(null);
        }}
      />

      {/* Out of Stock & Instant Restock Modal */}
      {outOfStockProduct && (
        <OutOfStockRestockModal
          isOpen={Boolean(outOfStockProduct)}
          onClose={() => {
            setOutOfStockProduct(null);
            searchInputRef.current?.focus();
          }}
          product={outOfStockProduct}
          settings={settings}
          onRestocked={(updatedProduct, autoAddQty) => {
            setProducts((prev) =>
              prev.map((p) => (p.id === updatedProduct.id ? updatedProduct : p))
            );
            if (autoAddQty > 0) {
              setCart((prevCart) => {
                const exIdx = prevCart.findIndex((i) => i.product.id === updatedProduct.id);
                if (exIdx >= 0) {
                  const updated = [...prevCart];
                  updated[exIdx].quantity += autoAddQty;
                  return updated;
                }
                return [
                  ...prevCart,
                  {
                    product: updatedProduct,
                    quantity: autoAddQty,
                    unit_price: Number(updatedProduct.selling_price || 0),
                    discount_amount: 0,
                  },
                ];
              });
            }
            setOutOfStockProduct(null);
            searchInputRef.current?.focus();
          }}
        />
      )}

      {/* POS Quick-Pay Dialogue */}
      <Modal
        isOpen={showQuickPayModal}
        onClose={() => {
          setShowQuickPayModal(false);
          searchInputRef.current?.focus();
        }}
        title="POS Quick-Pay Checkout"
        subtitle="Select payment method, review total, and press Enter to finalize sale."
        maxWidth={isQuickPaySplit ? 'lg' : 'md'}
      >
        <div className="space-y-4">
          {/* Total Bill & Customer Summary Card */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">Total Bill</span>
              <span className="text-3xl font-black text-emerald-600 dark:text-emerald-400">
                {formatCurrency(grandTotal, currency)}
              </span>
              {selectedCustomerObj ? (
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 mt-0.5 flex items-center gap-1.5 flex-wrap">
                  <User className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                  <span>{selectedCustomerObj.name}</span>
                  {selectedCustomerObj.phone && (
                    <span className="text-[11px] text-slate-400">({selectedCustomerObj.phone})</span>
                  )}
                  {Number(selectedCustomerObj.current_due || 0) > 0 && (
                    <span className="text-[10px] font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/60 px-1.5 py-0.2 rounded border border-rose-200 dark:border-rose-800">
                      Due: {formatCurrency(selectedCustomerObj.current_due, currency)}
                    </span>
                  )}
                </div>
              ) : inlineCustomerName.trim() ? (
                <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 mt-0.5">
                  Customer: <strong>{inlineCustomerName.trim()}</strong>
                </div>
              ) : (
                <div className="text-xs text-slate-400 mt-0.5">
                  Walk-in Customer
                </div>
              )}
            </div>
            <div className="text-right">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Items in Cart</span>
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-700 px-3 py-1 rounded-xl border border-slate-200 dark:border-slate-600 inline-block mt-0.5 shadow-2xs">
                {effectiveCartItems.reduce((sum, item) => sum + item.quantity, 0)} units ({effectiveCartItems.length} items)
              </span>
            </div>
          </div>

          {/* Payment Method Selector Pills & Split Toggle */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Payment Method / Tender
              </label>
              <button
                type="button"
                onClick={() => {
                  const nextSplit = !isQuickPaySplit;
                  setIsQuickPaySplit(nextSplit);
                  if (nextSplit) {
                    const secondAcc = configuredPaymentAccounts.find((a) => a.toLowerCase() !== 'cash') || 'Bank Transfer';
                    setQuickPaySplits([
                      { payment_method: quickPayMethod || 'Cash', amount: grandTotal },
                      { payment_method: secondAcc, amount: 0 },
                    ]);
                  } else {
                    setQuickPayAmount(grandTotal);
                    setQuickPayTouched(true);
                  }
                }}
                className={`text-[11px] font-bold px-2.5 py-1 rounded-xl border transition flex items-center gap-1.5 ${
                  isQuickPaySplit
                    ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                    : 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800 hover:bg-purple-100'
                }`}
              >
                <Zap className="h-3 w-3" />
                <span>{isQuickPaySplit ? '✓ Split / Mix Active' : '+ Split / Mix Payment'}</span>
              </button>
            </div>

            {!isQuickPaySplit ? (
              /* Single Method Selection Pills (Symmetric Grid) */
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-0.5">
                {configuredPaymentAccounts.slice(0, 4).map((acc) => {
                  const isSelected = quickPayMethod === acc;
                  return (
                    <button
                      key={acc}
                      type="button"
                      onClick={() => {
                        setQuickPayMethod(acc);
                        setPaymentMethod(acc);
                        quickPayInputRef.current?.focus();
                      }}
                      className={`py-2 px-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 border shadow-2xs ${
                        isSelected
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm shadow-emerald-600/20'
                          : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750'
                      }`}
                    >
                      {acc.toLowerCase().includes('cash') ? (
                        <DollarSign className="h-3.5 w-3.5" />
                      ) : acc.toLowerCase().includes('bank') ? (
                        <CreditCard className="h-3.5 w-3.5" />
                      ) : (
                        <Wallet className="h-3.5 w-3.5" />
                      )}
                      <span className="truncate">{acc}</span>
                      {isSelected && <span className="text-[10px] ml-0.5 opacity-80">✓</span>}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          {!isQuickPaySplit ? (
            /* Single Tender Amount Input */
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Amount Paid / Tendered ({quickPayMethod}) *
                </label>
                <div className="flex items-center gap-1.5">
                  {grandTotal > 0 && Number(quickPayAmount || 0) !== grandTotal && (
                    <button
                      type="button"
                      onClick={() => {
                        setQuickPayAmount(grandTotal);
                        setQuickPayTouched(true);
                        quickPayInputRef.current?.focus();
                      }}
                      className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 hover:underline"
                    >
                      Exact Cash
                    </button>
                  )}
                </div>
              </div>

              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 font-bold text-base">
                  {currency}
                </div>
                <input
                  ref={quickPayInputRef}
                  type="number"
                  step="any"
                  min="0"
                  value={quickPayAmount === 0 && !quickPayTouched ? '' : quickPayAmount}
                  onFocus={(e) => requestAnimationFrame(() => e.target.select())}
                  onChange={(e) => {
                    setQuickPayTouched(true);
                    const raw = e.target.value.replace(/^0+(?=[1-9])/, '');
                    const val = parseFloat(raw);
                    setQuickPayAmount(isNaN(val) ? 0 : val);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      e.stopPropagation();
                      const isFull = Number(quickPayAmount || 0) >= grandTotal;
                      if (!isFull) {
                        setErrorMsg(
                          `Quick-Pay only accepts full payment (${formatCurrency(grandTotal, currency)}). For partial payments or credit sales, press Esc and enter customer details.`
                        );
                        return;
                      }
                      setShowQuickPayModal(false);
                      handleCompleteSale(quickPayAmount, quickPayMethod);
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowQuickPayModal(false);
                      searchInputRef.current?.focus();
                    }
                  }}
                  placeholder="0.00"
                  autoFocus
                  className="w-full pl-14 pr-4 py-3 rounded-2xl border-2 border-emerald-500 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/20 text-2xl font-black text-slate-900 dark:text-white bg-white dark:bg-slate-800 shadow-inner [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>

              {/* Smart Quick Cash Tender Presets */}
              {quickPayMethod.toLowerCase().includes('cash') && quickCashOptions.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-0.5">
                    Quick Cash:
                  </span>
                  {quickCashOptions.map((opt) => {
                    const isSelected = Number(quickPayAmount) === opt;
                    const isExact = opt === grandTotal;
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => {
                          setQuickPayAmount(opt);
                          setQuickPayTouched(true);
                          quickPayInputRef.current?.focus();
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 border ${
                          isSelected
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                            : 'bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60 hover:bg-emerald-100'
                        }`}
                      >
                        {isExact ? <span>Exact ({formatMoney(opt)})</span> : <span>{formatMoney(opt)}</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* Split / Mix Payment Mode */
            <div className="space-y-3 p-4 rounded-2xl bg-purple-50/40 dark:bg-purple-950/20 border border-purple-200/80 dark:border-purple-800/80">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                  <span className="text-xs font-bold text-purple-900 dark:text-purple-200">
                    Split / Mixed Tender Allocation
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const unused = configuredPaymentAccounts.find(
                      (acc) => !quickPaySplits.some((s) => s.payment_method === acc)
                    ) || configuredPaymentAccounts[0] || 'Bank Transfer';
                    setQuickPaySplits([...quickPaySplits, { payment_method: unused, amount: 0 }]);
                  }}
                  className="text-[11px] font-bold text-purple-700 dark:text-purple-300 hover:underline flex items-center gap-1 bg-white dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-purple-200 dark:border-purple-800 shadow-2xs"
                >
                  <Plus className="h-3 w-3" />
                  <span>Add Split Account</span>
                </button>
              </div>

              <div className="space-y-2.5">
                {quickPaySplits.map((split, sIdx) => {
                  return (
                    <div
                      key={sIdx}
                      className="p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5"
                    >
                      <div className="w-full sm:w-48 shrink-0">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                          Payment Account #{sIdx + 1}
                        </label>
                        <select
                          value={split.payment_method}
                          onChange={(e) => {
                            const updated = [...quickPaySplits];
                            updated[sIdx].payment_method = e.target.value;
                            setQuickPaySplits(updated);
                          }}
                          className="w-full bg-slate-50 dark:bg-slate-750 border border-slate-200 dark:border-slate-600 rounded-xl px-2.5 py-2 text-xs font-bold text-slate-800 dark:text-slate-100"
                        >
                          {configuredPaymentAccounts.map((acc) => (
                            <option key={acc} value={acc}>
                              {acc}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Amount Tendered
                          </label>
                          {sIdx > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                const currentSumExceptThis = quickPaySplits
                                  .filter((_, idx) => idx !== sIdx)
                                  .reduce((acc, it) => acc + (Number(it.amount) || 0), 0);
                                const remainder = Math.max(0, grandTotal - currentSumExceptThis);
                                const updated = [...quickPaySplits];
                                updated[sIdx].amount = remainder;
                                setQuickPaySplits(updated);
                              }}
                              className="text-[10px] font-bold text-brand-600 dark:text-brand-400 hover:underline"
                            >
                              Fill Remainder
                            </button>
                          )}
                        </div>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 font-bold text-xs">
                            {currency}
                          </div>
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={split.amount === 0 ? '' : split.amount}
                            onFocus={(e) => requestAnimationFrame(() => e.target.select())}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/^0+(?=[1-9])/, '');
                              const val = parseFloat(raw);
                              const updated = [...quickPaySplits];
                              updated[sIdx].amount = isNaN(val) ? 0 : val;
                              setQuickPaySplits(updated);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                const totalAllocated = quickPaySplits.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
                                if (totalAllocated >= grandTotal) {
                                  const validSplits = quickPaySplits.filter((s) => Number(s.amount) > 0);
                                  setShowQuickPayModal(false);
                                  handleCompleteSale(totalAllocated, 'Split', validSplits);
                                }
                              } else if (e.key === 'Escape') {
                                e.preventDefault();
                                setShowQuickPayModal(false);
                                searchInputRef.current?.focus();
                              }
                            }}
                            placeholder="0.00"
                            className="w-full pl-10 pr-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-base font-black text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-750"
                          />
                        </div>
                      </div>

                      {quickPaySplits.length > 2 && (
                        <button
                          type="button"
                          onClick={() => {
                            setQuickPaySplits(quickPaySplits.filter((_, idx) => idx !== sIdx));
                          }}
                          className="self-end sm:self-center p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition"
                          title="Remove split"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Change or Warning if not full payment */}
          {(() => {
            const paidNum = isQuickPaySplit
              ? quickPaySplits.reduce((acc, it) => acc + (Number(it.amount) || 0), 0)
              : Number(quickPayAmount || 0);
            const isFull = paidNum >= grandTotal;
            const change = Math.max(0, paidNum - grandTotal);
            const shortAmount = Math.max(0, grandTotal - paidNum);

            if (!isFull) {
              return (
                <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-300 dark:border-rose-800 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />
                      <span className="text-xs font-bold text-rose-800 dark:text-rose-300">
                        Quick-Pay requires full payment.
                      </span>
                    </div>
                    <span className="text-xs font-black text-rose-600 dark:text-rose-400">
                      Short by {formatCurrency(shortAmount, currency)}
                    </span>
                  </div>
                  <p className="text-[11px] text-rose-700 dark:text-rose-400 leading-relaxed">
                    Total tendered: {formatCurrency(paidNum, currency)} of {formatCurrency(grandTotal, currency)}. For partial or credit sales, press <kbd className="px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-900/60 font-mono text-[10px] font-bold">Esc</kbd> to return to screen and enter customer details.
                  </p>
                </div>
              );
            }

            if (change > 0) {
              return (
                <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                      Change to Return:
                    </span>
                  </div>
                  <span className="text-xl font-black text-emerald-700 dark:text-emerald-400">
                    {formatCurrency(change, currency)}
                  </span>
                </div>
              );
            }

            return (
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Payment Status:
                  </span>
                </div>
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">
                  {isQuickPaySplit ? 'Fully Settled (Split Payment)' : `Fully Settled (${quickPayMethod})`}
                </span>
              </div>
            );
          })()}

          {/* Modal Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setShowQuickPayModal(false);
                searchInputRef.current?.focus();
              }}
              className="text-xs font-semibold"
            >
              Back (Esc)
            </Button>

            <Button
              type="button"
              variant="primary"
              onClick={() => {
                if (isQuickPaySplit) {
                  const totalAllocated = quickPaySplits.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
                  if (totalAllocated < grandTotal) return;
                  const validSplits = quickPaySplits.filter((s) => Number(s.amount) > 0);
                  setShowQuickPayModal(false);
                  handleCompleteSale(totalAllocated, 'Split', validSplits);
                } else {
                  if (Number(quickPayAmount || 0) < grandTotal) return;
                  setShowQuickPayModal(false);
                  handleCompleteSale(quickPayAmount, quickPayMethod);
                }
              }}
              disabled={
                completing ||
                Boolean(isPrintingReceipt) ||
                (isQuickPaySplit
                  ? quickPaySplits.reduce((sum, s) => sum + (Number(s.amount) || 0), 0) < grandTotal
                  : Number(quickPayAmount || 0) < grandTotal)
              }
              className="font-bold flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/20 rounded-xl"
            >
              <span>Finalize Sale ({formatCurrency(grandTotal, currency)})</span>
              <kbd className="px-1.5 py-0.5 rounded bg-white/20 text-white text-[10px] font-mono font-bold">
                Enter ↵
              </kbd>
            </Button>
          </div>
        </div>
      </Modal>

      {/* Save Active Cart / Template as New Bill Template Modal */}
      <SaveTemplateModal
        isOpen={templatesEnabled && showSaveTemplateModal}
        onClose={() => setShowSaveTemplateModal(false)}
        cartItems={
          activeTemplate
            ? templateSlots
                .filter((s) => s.selected_product !== null && s.quantity > 0)
                .map((s) => ({
                  product: s.selected_product!,
                  quantity: s.quantity,
                  unit_price: Number(s.selected_product!.selling_price || 0),
                }))
            : cart.map((i) => ({
                product: i.product,
                quantity: i.quantity,
                unit_price: Number(i.product.selling_price || i.unit_price || 0),
              }))
        }
        onTemplateSaved={(newTpl) => {
          setAvailableTemplates((prev) => [newTpl, ...prev.filter((t) => t.id !== newTpl.id)]);
          setSuccessToast(`Template "${newTpl.name}" saved successfully!`);
          setShowSaveTemplateModal(false);
        }}
      />

      {/* Add Sourced Item to Bill Modal */}
      <AddToBillModal
        isOpen={showAddToBillModal}
        onClose={() => setShowAddToBillModal(false)}
        currency={currency}
        initialName={addToBillInitialName}
        onAdd={handleAddExternalToBill}
      />
    </div>
  );
};
