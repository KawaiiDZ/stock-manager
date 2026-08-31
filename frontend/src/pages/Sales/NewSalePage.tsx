import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../services/api';
import { Product, Customer, BusinessSettings, Sale } from '../../types';
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
} from 'lucide-react';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Modal } from '../../components/common/Modal';
import { ReceiptModal } from '../../components/receipts/ReceiptModal';
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
  const [paymentMode, setPaymentMode] = useState<'FULL' | 'PARTIAL' | 'UNPAID'>('FULL');
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'Card' | 'Bank Transfer' | 'Online'>('Cash');
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [notes, setNotes] = useState('');

  // Submission state
  const [completing, setCompleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const barcodeBufferRef = useRef<{ code: string; time: number }>({ code: '', time: 0 });

  const currency = settings?.currency || 'Rs.';

  // Initial load
  useEffect(() => {
    const init = async () => {
      try {
        const [prods, custs] = await Promise.all([
          api.getProducts({ is_active: true }),
          api.getCustomers({ is_active: true }),
        ]);
        setProducts(prods || []);
        setCustomers(custs || []);
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

  // Global USB Barcode Scanner & Keyboard Listener
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

      // Hardware Barcode Scanner Buffer
      const currentTime = Date.now();
      if (e.key === 'Enter') {
        const scanned = barcodeBufferRef.current.code.trim();
        if (scanned.length >= 3) {
          const match = products.find(
            (p) =>
              p.barcode?.toLowerCase() === scanned.toLowerCase() ||
              p.sku?.toLowerCase() === scanned.toLowerCase()
          );
          if (match) {
            addToCart(match);
            barcodeBufferRef.current = { code: '', time: 0 };
            return;
          }
        }
        barcodeBufferRef.current = { code: '', time: 0 };
      } else if (e.key.length === 1) {
        if (currentTime - barcodeBufferRef.current.time > 150) {
          barcodeBufferRef.current.code = '';
        }
        barcodeBufferRef.current.code += e.key;
        barcodeBufferRef.current.time = currentTime;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [products, cart, paymentMode, paidAmount, inlineCustomerName, selectedCustomerId]);

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
          (p.sku && p.sku.toLowerCase().includes(q)) ||
          (p.barcode && p.barcode.toLowerCase().includes(q));
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

  // Sync paid amount when full or unpaid mode is active
  useEffect(() => {
    if (paymentMode === 'FULL') {
      setPaidAmount(grandTotal);
    } else if (paymentMode === 'UNPAID') {
      setPaidAmount(0);
    }
  }, [paymentMode, grandTotal]);

  const dueAmount = Math.max(0, grandTotal - Number(paidAmount || 0));

  // Complete Sale Execution
  const handleCompleteSale = async () => {
    if (cart.length === 0) {
      setErrorMsg('Cannot complete an empty sale. Please add items to cart.');
      return;
    }

    if (paymentMode !== 'FULL' && !selectedCustomerId && !inlineCustomerName.trim()) {
      setErrorMsg(
        'Customer details are required when money is owed (Partially Paid or Unpaid). Please enter the customer name.'
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
        paid_amount: Number(paidAmount || 0),
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
      setPaymentMode('FULL');

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
            <h1 className="text-2xl font-black tracking-tight">Point of Sale (POS)</h1>
            <p className="text-emerald-200 text-xs mt-0.5 font-medium">
              Scan barcode or search product • Press{' '}
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
              placeholder="Search by Product name, ID, or scan barcode... (Press Enter to add)"
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
                          {prod.barcode && <span>• BC: {prod.barcode}</span>}
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
                    Scan a product barcode or use search above
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
          <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm space-y-5">
            {/* Payment Mode Selector */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                Payment Mode
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMode('FULL')}
                  className={`p-3 rounded-2xl text-xs font-black transition text-center border ${
                    paymentMode === 'FULL'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/20'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  ✓ Fully Paid
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMode('PARTIAL')}
                  className={`p-3 rounded-2xl text-xs font-black transition text-center border ${
                    paymentMode === 'PARTIAL'
                      ? 'bg-amber-600 text-white border-amber-600 shadow-md shadow-amber-600/20'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  ⏳ Partial Pay
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMode('UNPAID')}
                  className={`p-3 rounded-2xl text-xs font-black transition text-center border ${
                    paymentMode === 'UNPAID'
                      ? 'bg-rose-600 text-white border-rose-600 shadow-md shadow-rose-600/20'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  📝 Credit (Due)
                </button>
              </div>
            </div>

            {/* Customer Information (Hidden for cash sales; required when money is owed) */}
            {paymentMode !== 'FULL' ? (
              <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-black text-amber-900 uppercase tracking-wider">
                    <UserPlus className="h-4 w-4 text-amber-700" />
                    Customer Account (Credit)
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAddCustomerModal(true)}
                    className="text-xs text-amber-800 font-bold underline hover:text-amber-950"
                  >
                    {selectedCustomerId ? 'Change' : 'Pick Existing'}
                  </button>
                </div>

                {selectedCustomerObj ? (
                  <div className="p-3 bg-white rounded-xl border border-amber-200 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-slate-900 text-sm">
                        {selectedCustomerObj.name}
                      </div>
                      <div className="text-xs text-slate-400">
                        {selectedCustomerObj.phone || 'No phone recorded'} • Due:{' '}
                        {formatCurrency(selectedCustomerObj.current_due, currency)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedCustomerId(null)}
                      className="text-xs text-rose-600 font-bold hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-amber-800">
                      Enter customer name & phone to record their outstanding ledger:
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        placeholder="Customer Name *"
                        value={inlineCustomerName}
                        onChange={(e) => setInlineCustomerName(e.target.value)}
                        className="bg-white text-xs py-2"
                        required
                      />
                      <Input
                        placeholder="Phone (e.g. 0300...)"
                        value={inlineCustomerPhone}
                        onChange={(e) => setInlineCustomerPhone(e.target.value)}
                        className="bg-white text-xs py-2"
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                <span>Customer: <strong>Walk-in Counter Sale</strong></span>
                <button
                  type="button"
                  onClick={() => setShowAddCustomerModal(true)}
                  className="text-emerald-700 font-semibold hover:underline"
                >
                  + Assign Customer
                </button>
              </div>
            )}

            {/* Payment Method & Discount */}
            <div className="grid grid-cols-2 gap-3">
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
                  <option value="Card">Credit/Debit Card</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Online">Online / Mobile Wallet</option>
                </select>
              </div>

              <Input
                label="Sale Discount"
                type="number"
                min="0"
                prefix={currency}
                value={saleDiscount || ''}
                onChange={(e) => setSaleDiscount(Number(e.target.value))}
                className="text-xs py-2"
              />
            </div>

            {/* Financial Summary */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2 text-sm">
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

              {/* Partial Payment Amount Input */}
              {paymentMode === 'PARTIAL' && (
                <div className="pt-2 border-t border-slate-200/80">
                  <Input
                    label="Cash Received Now *"
                    type="number"
                    step="0.01"
                    min="0"
                    max={grandTotal}
                    prefix={currency}
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(Number(e.target.value))}
                    required
                  />
                  <div className="flex justify-between text-xs text-rose-700 font-bold mt-2">
                    <span>Remaining Due:</span>
                    <span>{formatCurrency(dueAmount, currency)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* BIG COMPLETE SALE BUTTON */}
            <Button
              type="button"
              variant="primary"
              size="lg"
              onClick={handleCompleteSale}
              disabled={cart.length === 0 || completing}
              loading={completing}
              className="w-full py-4 text-base font-black tracking-wide shadow-xl shadow-emerald-600/30 rounded-2xl"
            >
              ⚡ COMPLETE SALE ({formatCurrency(grandTotal, currency)})
            </Button>
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
    </div>
  );
};
