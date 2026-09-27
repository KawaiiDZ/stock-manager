import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../services/api';
import { Product, Customer, BusinessSettings, Sale, Quotation, QuotationCreate, Category } from '../../types';
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
} from 'lucide-react';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Modal } from '../../components/common/Modal';
import { ReceiptModal } from '../../components/receipts/ReceiptModal';
import { QuotationModal } from '../../components/receipts/QuotationModal';
import { UnregisteredBarcodeModal } from '../../components/barcode/UnregisteredBarcodeModal';
import { QuickAddProductModal } from '../../components/products/QuickAddProductModal';
import { useBarcodeScanner } from '../../hooks/useBarcodeScanner';
import { formatCurrency, formatMoney, formatQty } from '../../utils/format';

interface CartItem {
  product: Product;
  quantity: number;
  unit_price: number;
  discount_amount: number;
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

  // Customer Management on Sale
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [inlineCustomerName, setInlineCustomerName] = useState('');
  const [inlineCustomerPhone, setInlineCustomerPhone] = useState('');
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);

  // Financial inputs
  const [saleDiscount, setSaleDiscount] = useState<number>(0);
  const [taxRate, setTaxRate] = useState<number>(settings?.default_tax_rate || 0);
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'Card' | 'Bank Transfer' | 'Online'>('Cash');
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

  // Unregistered Barcode & Quick Add Product state
  const [categories, setCategories] = useState<Category[]>([]);
  const [unregisteredBarcode, setUnregisteredBarcode] = useState<string | null>(null);
  const [quickAddBarcode, setQuickAddBarcode] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  const currency = settings?.currency || 'Rs.';
  const showSku = settings?.show_sku !== false;
  const showBarcode = settings?.show_barcode !== false;
  const scannerEnabled = settings?.enable_barcode_scanner !== false;

  // Initial load
  useEffect(() => {
    const init = async () => {
      try {
        const [prods, custs, cats] = await Promise.all([
          api.getProducts({ is_active: true }),
          api.getCustomers({ is_active: true }),
          api.getCategories(true),
        ]);
        setProducts(prods || []);
        setCustomers(custs || []);
        setCategories(cats || []);
      } catch (err) {
        console.error('Failed to load initial sales data:', err);
      }
    };
    init();
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

    // 1. Check local in-memory catalog
    const localMatch = products.find(
      (p) =>
        (p.barcode && p.barcode.toLowerCase() === code.toLowerCase()) ||
        (p.sku && p.sku.toLowerCase() === code.toLowerCase()) ||
        (p.product_id && p.product_id.toLowerCase() === code.toLowerCase())
    );

    if (localMatch) {
      addToCart(localMatch);
      return;
    }

    // 2. Query remote database if not currently in memory
    try {
      const remoteProd = await api.getProductByBarcode(code);
      if (remoteProd) {
        setProducts((prev) => (prev.some((p) => p.id === remoteProd.id) ? prev : [...prev, remoteProd]));
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

  // Global POS Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // F4 to focus search
      if (e.key === 'F4') {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      // Ctrl+Enter to complete sale
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        handleCompleteSale();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [products, cart, paidAmount, isPaidAmountCustomized, inlineCustomerName, selectedCustomerId]);

  // Add product to cart
  const addToCart = (product: Product) => {
    setErrorMsg(null);
    const existingIndex = cart.findIndex((item) => item.product.id === product.id);

    const availableStock = Number(product.current_stock || 0);

    if (existingIndex >= 0) {
      const currentQty = cart[existingIndex].quantity;
      if (currentQty + 1 > availableStock) {
        setErrorMsg(
          `Not enough stock. Only ${availableStock} units of ${product.name} are available.`
        );
        return;
      }
      const updatedCart = [...cart];
      updatedCart[existingIndex].quantity += 1;
      setCart(updatedCart);
    } else {
      if (availableStock < 1) {
        setErrorMsg(`Item ${product.name} is currently out of stock.`);
        return;
      }
      setCart([
        ...cart,
        {
          product,
          quantity: 1,
          unit_price: Number(product.selling_price || 0),
          discount_amount: 0,
        },
      ]);
    }
  };

  const updateQuantity = (productId: number, qty: number) => {
    setErrorMsg(null);
    const item = cart.find((i) => i.product.id === productId);
    if (!item) return;

    const availableStock = Number(item.product.current_stock || 0);

    if (qty > availableStock) {
      setErrorMsg(
        `Not enough stock. Only ${availableStock} units of ${item.product.name} are available.`
      );
      return;
    }

    if (qty <= 0) {
      setCart(cart.filter((i) => i.product.id !== productId));
    } else {
      setCart(cart.map((i) => (i.product.id === productId ? { ...i, quantity: qty } : i)));
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
    setCart(cart.filter((i) => i.product.id !== productId));
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
    if (e.key === 'Enter' && filteredProducts.length > 0) {
      addToCart(filteredProducts[0]);
      setSearchQuery('');
    }
  };

  // Financial Calculations
  const subtotal = cart.reduce(
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

  // Complete Sale Execution
  const handleCompleteSale = async () => {
    if (cart.length === 0) {
      setErrorMsg('Cannot complete an empty sale. Please add items to cart.');
      return;
    }

    const effectivePaid = Math.max(0, Number(paidAmount || 0));
    const effectiveDue = Math.max(0, grandTotal - effectivePaid);

    const selectedCust = customers.find((c) => c.id === selectedCustomerId);
    const isWalkIn = (!selectedCust && !inlineCustomerName.trim()) || selectedCust?.customer_id === 'C-000001';

    if (effectiveDue > 0 && isWalkIn) {
      setErrorMsg(
        'Walk-in / Counter Customer cannot purchase on credit. Please enter or select a customer name for partial or unpaid sales.'
      );
      return;
    }

    setCompleting(true);
    setErrorMsg(null);

    try {
      const payload: any = {
        items: cart.map((i) => ({
          product_id: i.product.id,
          quantity: i.quantity,
          unit_price: Number(i.unit_price),
          discount_amount: Number(i.discount_amount || 0),
        })),
        discount_amount: Number(saleDiscount || 0),
        tax_rate: Number(taxRate || 0),
        paid_amount: Math.min(grandTotal, effectivePaid),
        payment_method: paymentMethod,
        notes: notes.trim() || undefined,
      };

      if (selectedCustomerId) {
        payload.customer_id = selectedCustomerId;
      } else if (inlineCustomerName.trim()) {
        payload.customer_name = inlineCustomerName.trim();
        payload.customer_phone = inlineCustomerPhone.trim() || undefined;
      }

      const res = await api.createSale(payload);

      // Sale succeeded!
      setCompletedSale(res);
      setShowReceipt(true);

      // Reset cart and fields
      setCart([]);
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
    }
  };

  // Create Quotation (No stock deduction, no money/accounts touched)
  const handleSaveQuotation = async () => {
    if (cart.length === 0) {
      setErrorMsg('Cannot create an empty quotation. Please add items to cart.');
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
        items: cart.map((i) => ({
          product_id: i.product.id,
          quantity: i.quantity,
          unit_price: Number(i.unit_price),
          discount_amount: Number(i.discount_amount || 0),
        })),
        discount_amount: Number(saleDiscount || 0),
        tax_rate: Number(taxRate || 0),
        notes: notes.trim() || undefined,
      };

      const res = await api.createQuotation(payload);
      setCreatedQuotation(res);
      setShowQuotationModal(true);

      // Reset cart and fields
      setCart([]);
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
      {/* Top Banner with Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-emerald-700 via-emerald-800 to-slate-900 rounded-3xl p-6 text-white shadow-xl shadow-emerald-950/15">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-500/20 rounded-2xl border border-emerald-400/30">
            <Zap className="h-6 w-6 text-emerald-300 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-black tracking-tight">Point of Sale (POS)</h1>
              {scannerEnabled && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-400/20 border border-emerald-300/40 text-emerald-200 text-[11px] font-bold tracking-wide">
                  <Barcode className="h-3.5 w-3.5 text-emerald-300" />
                  Scanner Active
                </span>
              )}
            </div>
            <p className="text-emerald-200 text-xs mt-0.5 font-medium">
              {showBarcode ? 'Scan barcode or search product • ' : 'Search product • '}Press{' '}
              <kbd className="bg-white/20 px-1.5 py-0.5 rounded text-[10px] font-mono">F4</kbd> to
              search
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-xs text-emerald-100 font-semibold">Current Cart Total</div>
            <div className="text-2xl font-black tracking-tight">
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
          <button onClick={() => setErrorMsg(null)} className="text-xs text-rose-500 font-bold">
            Dismiss
          </button>
        </div>
      )}

      {/* Main Grid: Left Cart + Right Checkout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Product Search & Cart */}
        <div className="lg:col-span-7 space-y-4">
          {/* Live Search & Barcode Input */}
          <div className="bg-white rounded-3xl border border-slate-200 p-4 shadow-sm relative">
            <Input
              ref={searchInputRef}
              placeholder={`Search by Product name, ID${showSku ? ', SKU' : ''}${showBarcode ? ', or scan barcode' : ''}... (Press Enter to add)`}
              prefix={<Search className="h-5 w-5 text-emerald-600" />}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className="text-base py-3 rounded-2xl font-medium"
              autoFocus
            />

            {/* Live Search Results Dropdown */}
            {searchQuery.trim().length > 0 && (
              <div className="absolute left-4 right-4 top-18 z-30 bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden max-h-72 overflow-y-auto divide-y divide-slate-100">
                {filteredProducts.length === 0 ? (
                  <div className="p-4 text-center text-sm text-slate-400">
                    No products match "{searchQuery}"
                  </div>
                ) : (
                  filteredProducts.map((prod) => (
                    <button
                      key={prod.id}
                      type="button"
                      onClick={() => {
                        addToCart(prod);
                        setSearchQuery('');
                        searchInputRef.current?.focus();
                      }}
                      className="w-full text-left p-3.5 hover:bg-emerald-50/70 flex items-center justify-between transition group"
                    >
                      <div>
                        <div className="font-bold text-slate-800 text-sm group-hover:text-emerald-900">
                          {prod.name}
                        </div>
                        <div className="text-xs text-slate-400 flex flex-wrap items-center gap-1.5 mt-0.5">
                          <span>ID: {prod.product_id}</span>
                          {showBarcode && prod.barcode && <span>• BC: {prod.barcode}</span>}
                          {showSku && prod.sku && <span>• SKU: {prod.sku}</span>}
                          {prod.custom_fields &&
                            prod.custom_fields.map((cf) => (
                              <span
                                key={cf.field_id}
                                className="bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded text-[10px] font-semibold"
                              >
                                {cf.value}
                              </span>
                            ))}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-black text-slate-900 text-sm">
                          {formatCurrency(prod.selling_price, currency)}
                        </div>
                        <div
                          className={`text-xs font-semibold ${
                            Number(prod.current_stock) > 5
                              ? 'text-emerald-600'
                              : Number(prod.current_stock) > 0
                              ? 'text-amber-600'
                              : 'text-rose-600'
                          }`}
                        >
                          Stock: {prod.current_stock}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Cart Table */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden min-h-[380px] flex flex-col">
            <div className="p-4 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Cart Items ({cart.reduce((sum, i) => sum + i.quantity, 0)} units)
              </span>
              {cart.length > 0 && (
                <button
                  onClick={() => setCart([])}
                  className="text-xs text-rose-600 font-bold hover:underline"
                >
                  Clear All
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto max-h-[480px]">
              {cart.length === 0 ? (
                <div className="py-24 text-center text-slate-400 flex flex-col items-center">
                  <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
                    <Barcode className="h-6 w-6" />
                  </div>
                  <p className="font-semibold text-slate-600 text-sm">Cart is empty</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {showBarcode
                      ? 'Scan a product barcode or use search above'
                      : 'Search products above to add to cart'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {cart.map((item) => (
                    <div
                      key={item.product.id}
                      className="p-4 hover:bg-slate-50/60 transition flex items-center justify-between gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-slate-800 text-sm truncate">
                          {item.product.name}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          Unit Price: {formatCurrency(item.unit_price, currency)} • Stock:{' '}
                          {item.product.current_stock}
                        </div>
                      </div>

                      {/* Quantity Controls */}
                      <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                          className="h-7 w-7 rounded-lg bg-white flex items-center justify-center text-slate-700 hover:bg-slate-200 shadow-sm font-bold"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-8 text-center font-black text-sm text-slate-900">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                          className="h-7 w-7 rounded-lg bg-white flex items-center justify-center text-slate-700 hover:bg-slate-200 shadow-sm font-bold"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* Item Total */}
                      <div className="w-24 text-right">
                        <span className="font-black text-slate-900 text-sm">
                          {formatCurrency(item.quantity * Number(item.unit_price), currency)}
                        </span>
                      </div>

                      {/* Remove Button */}
                      <button
                        type="button"
                        onClick={() => removeItem(item.product.id)}
                        className="text-slate-300 hover:text-rose-500 p-1"
                        title="Remove"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Checkout & Payment Options */}
        <div className="lg:col-span-5 space-y-4">
          {/* Box 1: Customer & Payment Details */}
          <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Customer & Payment
              </span>
              <button
                type="button"
                onClick={() => setShowAddCustomerModal(true)}
                className="text-xs font-bold text-emerald-700 hover:text-emerald-900 underline"
              >
                {selectedCustomerId ? 'Change Customer' : 'Select Existing'}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Customer Name"
                placeholder="Walk-in Customer"
                value={inlineCustomerName}
                onChange={(e) => {
                  setInlineCustomerName(e.target.value);
                  if (selectedCustomerId) setSelectedCustomerId(null);
                }}
                className="text-xs py-2"
              />

              <Input
                label="Phone Number"
                placeholder="Optional"
                value={inlineCustomerPhone}
                onChange={(e) => setInlineCustomerPhone(e.target.value)}
                className="text-xs py-2"
              />

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                  Payment Method
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e: any) => setPaymentMethod(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800"
                >
                  <option value="Cash">Cash</option>
                  <option value="Card">Card</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Online">Online</option>
                </select>
              </div>

              <Input
                label="Discount"
                type="number"
                min="0"
                prefix={currency}
                placeholder="0.00"
                value={saleDiscount || ''}
                onChange={(e) => setSaleDiscount(Number(e.target.value))}
                className="text-xs py-2"
              />
            </div>

            {selectedCustomerObj && (
              <div className="flex items-center justify-between text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                <span className="text-slate-600 truncate">
                  Selected: <strong className="text-slate-900">{selectedCustomerObj.name}</strong>
                  {Number(selectedCustomerObj.current_due || 0) > 0 && (
                    <span className="text-rose-600 ml-1.5 font-semibold">
                      (Previous Due: {formatCurrency(selectedCustomerObj.current_due, currency)})
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCustomerId(null);
                    setInlineCustomerName('');
                    setInlineCustomerPhone('');
                  }}
                  className="text-xs text-rose-600 font-bold hover:underline ml-2"
                >
                  Clear
                </button>
              </div>
            )}
          </div>

          {/* Box 2: Totals & Settlement */}
          <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm space-y-4">
            {/* Financial Summary */}
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-slate-600 text-xs">
                <span>Subtotal:</span>
                <span className="font-semibold text-slate-800">
                  {formatCurrency(subtotal, currency)}
                </span>
              </div>
              {saleDiscount > 0 && (
                <div className="flex justify-between text-emerald-700 text-xs font-semibold">
                  <span>Discount:</span>
                  <span>- {formatCurrency(saleDiscount, currency)}</span>
                </div>
              )}
              {taxAmount > 0 && (
                <div className="flex justify-between text-slate-600 text-xs">
                  <span>Tax ({taxRate}%):</span>
                  <span className="font-semibold text-slate-800">
                    +{formatCurrency(taxAmount, currency)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-slate-900 font-black text-lg border-t border-slate-200 pt-2">
                <span>Net Total:</span>
                <span className="text-emerald-800 font-black">
                  {formatCurrency(grandTotal, currency)}
                </span>
              </div>
            </div>

            {/* Amount Paid Input & Live Settlement */}
            <div className="pt-3 border-t border-slate-200 space-y-2.5">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    Amount Paid
                  </label>
                  {grandTotal > 0 && (
                    <div className="flex items-center gap-2">
                      {currentPaid !== grandTotal && (
                        <button
                          type="button"
                          onClick={() => {
                            setPaidAmount(grandTotal);
                            setIsPaidAmountCustomized(false);
                          }}
                          className="text-xs font-bold text-emerald-700 hover:text-emerald-800 hover:underline"
                        >
                          Exact Cash
                        </button>
                      )}
                    </div>
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
                    const val = e.target.value === '' ? 0 : Number(e.target.value);
                    setPaidAmount(val);
                    setIsPaidAmountCustomized(true);
                  }}
                  className="text-sm font-bold py-2"
                />
              </div>

              {/* High-visibility Change Due Banner */}
              {changeAmount > 0 && (
                <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 shadow-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <span className="text-xs font-extrabold uppercase tracking-wide text-emerald-800">
                      Change to Return
                    </span>
                  </div>
                  <span className="text-base font-black text-emerald-800">
                    {formatCurrency(changeAmount, currency)}
                  </span>
                </div>
              )}

              {/* Settlement Status Indicator */}
              <div className="flex items-center justify-between text-xs px-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 font-medium">Status:</span>
                  {paymentStatus === 'PAID' && (
                    <span className="px-2 py-0.5 rounded-md font-bold text-emerald-700 bg-emerald-50 border border-emerald-200">
                      Fully Paid
                    </span>
                  )}
                  {paymentStatus === 'PARTIAL' && (
                    <span className="px-2 py-0.5 rounded-md font-bold text-amber-700 bg-amber-50 border border-amber-200">
                      Partial Pay
                    </span>
                  )}
                  {paymentStatus === 'UNPAID' && (
                    <span className="px-2 py-0.5 rounded-md font-bold text-rose-700 bg-rose-50 border border-rose-200">
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
                    <span className="text-slate-500 mr-1">Change:</span>
                    <span className="font-bold text-emerald-700 text-sm">
                      {formatCurrency(changeAmount, currency)}
                    </span>
                  </div>
                ) : (
                  <span className="text-slate-400 font-medium">Settled</span>
                )}
              </div>
            </div>

            {/* Action Buttons: Complete Sale & Create Quotation */}
            <div className="flex flex-col sm:flex-row items-stretch gap-2.5">
              {settings?.enable_quotations !== false && (
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  icon={<FileText className="h-5 w-5 text-indigo-600" />}
                  onClick={handleSaveQuotation}
                  disabled={cart.length === 0 || savingQuotation || completing}
                  loading={savingQuotation}
                  className="py-3.5 text-sm font-bold border-indigo-200 text-indigo-900 bg-indigo-50/50 hover:bg-indigo-100/60 rounded-2xl whitespace-nowrap"
                  title="Create uncharged quotation (does not deduct stock or money)"
                >
                  Save as Quotation
                </Button>
              )}

              <Button
                type="button"
                variant="primary"
                size="lg"
                onClick={handleCompleteSale}
                disabled={cart.length === 0 || completing || savingQuotation}
                loading={completing}
                className="flex-1 py-3.5 text-base font-bold tracking-wide rounded-2xl shadow-lg shadow-emerald-600/20"
              >
                Complete Sale ({formatCurrency(grandTotal, currency)})
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Existing Customer Selector Modal */}
      <Modal
        isOpen={showAddCustomerModal}
        onClose={() => setShowAddCustomerModal(false)}
        title="Select Customer"
        maxWidth="md"
      >
        <div className="space-y-3">
          <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-2xl">
            {customers.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setSelectedCustomerId(c.id);
                  setInlineCustomerName(c.name);
                  setInlineCustomerPhone(c.phone || '');
                  setShowAddCustomerModal(false);
                }}
                className="w-full p-3 text-left hover:bg-slate-50 flex items-center justify-between"
              >
                <div>
                  <div className="font-bold text-slate-800 text-sm">{c.name}</div>
                  <div className="text-xs text-slate-400">{c.phone || 'No phone'}</div>
                </div>
                {Number(c.current_due || 0) > 0 && (
                  <span className="text-xs font-bold text-rose-700 bg-rose-50 px-2 py-1 rounded-md">
                    Due: {formatCurrency(c.current_due, currency)}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </Modal>

      {/* Receipt Modal */}
      <ReceiptModal
        isOpen={showReceipt}
        onClose={() => setShowReceipt(false)}
        sale={completedSale}
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
    </div>
  );
};
