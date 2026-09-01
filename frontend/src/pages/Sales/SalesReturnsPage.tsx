import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { Sale, Customer, Product, SalesReturn, BusinessSettings } from '../../types';
import { RotateCcw, Search, AlertCircle, CheckCircle2, ArrowRight } from 'lucide-react';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Modal } from '../../components/common/Modal';
import { EmptyState } from '../../components/common/EmptyState';
import { formatCurrency, formatMoney } from '../../utils/format';

interface SalesReturnsPageProps {
  settings: BusinessSettings | null;
  initialSaleId?: number;
}

export const SalesReturnsPage: React.FC<SalesReturnsPageProps> = ({
  settings,
  initialSaleId,
}) => {
  const [activeTab, setActiveTab] = useState<'receipt' | 'manual' | 'history'>('receipt');
  const [returnsHistory, setReturnsHistory] = useState<SalesReturn[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  // Receipt Return Mode
  const [receiptSearch, setReceiptSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Sale[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [foundSale, setFoundSale] = useState<Sale | null>(null);
  const [returnQtys, setReturnQtys] = useState<Record<number, number>>({});
  const [returnReason, setReturnReason] = useState('');

  // Manual Return Mode
  const [manualCustomerId, setManualCustomerId] = useState<number>(1);
  const [manualProductId, setManualProductId] = useState<number>(0);
  const [manualQty, setManualQty] = useState<number>(1);
  const [manualPrice, setManualPrice] = useState<number>(0);
  const [manualReason, setManualReason] = useState('');

  const [loading, setLoading] = useState(false);
  const [searchingSales, setSearchingSales] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const currency = settings?.currency || 'Rs.';

  const loadData = async () => {
    try {
      const [historyData, custs, prods] = await Promise.all([
        api.getSalesReturns(),
        api.getCustomers({ is_active: true }),
        api.getProducts({ is_active: true }),
      ]);
      setReturnsHistory(historyData);
      setCustomers(custs);
      setProducts(prods);
      if (prods.length > 0) {
        setManualProductId(prods[0].id);
        setManualPrice(prods[0].selling_price);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const selectSaleForReturn = (sale: Sale) => {
    setFoundSale(sale);
    setReceiptSearch(sale.receipt_number);
    setShowSearchResults(false);
    setErrorMsg(null);
    // Automatically pick up the full number of units bought (e.g. 2 units)
    const initQtys: Record<number, number> = {};
    sale.items.forEach((it) => {
      initQtys[it.product_id] = it.quantity;
    });
    setReturnQtys(initQtys);
  };

  useEffect(() => {
    if (initialSaleId) {
      api.getSale(initialSaleId).then((sale) => {
        selectSaleForReturn(sale);
        setActiveTab('receipt');
      });
    }
  }, [initialSaleId]);

  // Live search sales by receipt number, customer name, phone, or date
  useEffect(() => {
    if (!receiptSearch.trim()) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }

    const timer = setTimeout(async () => {
      setSearchingSales(true);
      try {
        const sales = await api.getSales({ search: receiptSearch.trim() });
        setSearchResults(sales.slice(0, 8));
        setShowSearchResults(true);
      } catch (err) {
        console.error(err);
      } finally {
        setSearchingSales(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [receiptSearch]);

  const handleSearchReceiptSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiptSearch.trim()) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const sales = await api.getSales({ search: receiptSearch.trim() });
      if (sales.length === 0) {
        setErrorMsg(`No sales found matching '${receiptSearch}'.`);
        return;
      }
      selectSaleForReturn(sales[0]);
    } catch (err: any) {
      setErrorMsg(err.detail || 'Sale not found.');
    } finally {
      setLoading(false);
    }
  };

  // Compute Receipt Return Financials
  let totalReturnAmount = 0;
  if (foundSale) {
    foundSale.items.forEach((item) => {
      const qty = returnQtys[item.product_id] || 0;
      totalReturnAmount += qty * item.unit_price;
    });
  }

  // Financial calculations for partial payments
  const originalTotal = foundSale ? Number(foundSale.total_amount) : 0;
  const originalPaid = foundSale ? Number(foundSale.paid_amount) : 0;
  const originalDue = foundSale ? Math.max(0, originalTotal - originalPaid) : 0;

  // Debt reduction offsets remaining due first
  const dueReduction = foundSale ? Math.min(totalReturnAmount, originalDue) : 0;
  // Cash refund is only given for return value exceeding remaining due, capped at actual cash paid
  const excessReturn = Math.max(0, totalReturnAmount - dueReduction);
  const cashRefund = foundSale ? Math.min(originalPaid, excessReturn) : 0;
  const remainingDueAfterReturn = Math.max(0, originalDue - dueReduction);

  const handleProcessReceiptReturn = async () => {
    if (!foundSale || totalReturnAmount <= 0) {
      setErrorMsg('Please select at least 1 item to return (quantity > 0).');
      return;
    }

    const itemsToReturn = foundSale.items
      .filter((it) => (returnQtys[it.product_id] || 0) > 0)
      .map((it) => ({
        product_id: it.product_id,
        quantity: returnQtys[it.product_id],
        unit_price: it.unit_price,
      }));

    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await api.createSalesReturn({
        sale_id: foundSale.id,
        customer_id: foundSale.customer_id,
        items: itemsToReturn,
        reason: returnReason.trim() || undefined,
      });

      setSuccessMsg(
        `Return ${res.return_number} completed successfully! Cash Refund: ${formatCurrency(
          res.cash_refund_amount,
          currency
        )}, Customer Debt Reduced: ${formatCurrency(res.balance_credit_amount, currency)}.`
      );
      setFoundSale(null);
      setReceiptSearch('');
      setReturnQtys({});
      setReturnReason('');
      loadData();
    } catch (err: any) {
      setErrorMsg(err.detail || 'Failed to process return.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleProcessManualReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualProductId || manualQty <= 0) return;

    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await api.createSalesReturn({
        customer_id: manualCustomerId,
        items: [
          {
            product_id: manualProductId,
            quantity: manualQty,
            unit_price: manualPrice,
          },
        ],
        reason: manualReason.trim() || 'Manual customer return',
      });
      setSuccessMsg(`Manual Return ${res.return_number} processed successfully.`);
      setManualQty(1);
      setManualReason('');
      loadData();
    } catch (err: any) {
      setErrorMsg(err.detail || 'Failed to process manual return.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">Customer Returns</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Search sales by receipt #, customer, or phone. Automatic batch restoration and partial refund tracking.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 bg-slate-200/70 p-1.5 rounded-2xl">
          <button
            onClick={() => {
              setActiveTab('receipt');
              setSuccessMsg(null);
              setErrorMsg(null);
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === 'receipt' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            Return from Sale
          </button>
          <button
            onClick={() => {
              setActiveTab('manual');
              setSuccessMsg(null);
              setErrorMsg(null);
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === 'manual' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            Manual Return
          </button>
          <button
            onClick={() => {
              setActiveTab('history');
              setSuccessMsg(null);
              setErrorMsg(null);
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === 'history' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            Return History
          </button>
        </div>
      </div>

      {/* Success Alert */}
      {successMsg && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <div className="flex-1">{successMsg}</div>
          <button onClick={() => setSuccessMsg(null)} className="text-xs text-emerald-700 font-bold">
            Dismiss
          </button>
        </div>
      )}

      {/* Error Alert */}
      {errorMsg && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-medium">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <div className="flex-1">{errorMsg}</div>
          <button onClick={() => setErrorMsg(null)} className="text-xs text-rose-500 font-bold">
            Dismiss
          </button>
        </div>
      )}

      {/* Tab 1: Return from Sale / Receipt */}
      {activeTab === 'receipt' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm relative">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              Search Sale by Receipt #, Customer Name, or Phone
            </h3>
            <form onSubmit={handleSearchReceiptSubmit} className="flex gap-3 max-w-2xl relative">
              <div className="relative flex-1">
                <Input
                  placeholder="Type Receipt # (R-000001), Customer Name, or Phone..."
                  value={receiptSearch}
                  onChange={(e) => setReceiptSearch(e.target.value)}
                  onFocus={() => searchResults.length > 0 && setShowSearchResults(true)}
                  autoFocus
                />
              </div>
              <Button
                type="submit"
                variant="primary"
                loading={loading || searchingSales}
                icon={<Search className="h-4 w-4" />}
              >
                Find Sale
              </Button>

              {/* Live Search Results Dropdown */}
              {showSearchResults && searchResults.length > 0 && (
                <div className="absolute top-full left-0 right-32 mt-2 bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden z-40 max-h-72 overflow-y-auto">
                  <div className="p-2 bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Matching Sales ({searchResults.length})
                  </div>
                  {searchResults.map((s) => (
                    <div
                      key={s.id}
                      onClick={() => selectSaleForReturn(s)}
                      className="p-3 hover:bg-emerald-50/70 border-b border-slate-100 last:border-0 cursor-pointer flex items-center justify-between transition"
                    >
                      <div>
                        <div className="font-bold text-xs text-slate-900 flex items-center gap-2">
                          <span>{s.receipt_number}</span>
                          <span className="text-[11px] font-normal text-slate-500">
                            • {s.customer_name || 'Walk-in'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {new Date(s.created_at).toLocaleString()} • {s.items.length} item{s.items.length === 1 ? '' : 's'}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-xs text-slate-800">
                          {formatCurrency(s.total_amount, currency)}
                        </div>
                        <div className="text-[10px] font-semibold text-emerald-600">
                          Paid: {formatCurrency(s.paid_amount, currency)}
                          {Number(s.due_amount) > 0 && (
                            <span className="text-rose-600 ml-1">
                              (Due: {formatCurrency(s.due_amount, currency)})
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </form>
          </div>

          {foundSale && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Items to return */}
              <div className="lg:col-span-8 bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="font-bold text-slate-900 text-base">
                      Receipt {foundSale.receipt_number}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Customer: <strong className="text-slate-800">{foundSale.customer_name || 'Walk-in Customer'}</strong> • Date: {new Date(foundSale.created_at).toLocaleString()}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setFoundSale(null);
                      setReceiptSearch('');
                    }}
                    className="text-xs text-slate-400 hover:text-slate-600 font-semibold"
                  >
                    ✕ Close
                  </button>
                </div>

                {/* Items List */}
                <div className="space-y-3">
                  <div className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                    Select quantities to return (max units bought):
                  </div>
                  {foundSale.items.map((item) => {
                    const currentQty = returnQtys[item.product_id] ?? item.quantity;
                    const maxQty = item.quantity;

                    return (
                      <div
                        key={item.product_id}
                        className="p-4 rounded-2xl bg-slate-50 border border-slate-200/70 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      >
                        <div>
                          <h4 className="font-bold text-slate-800 text-sm">{item.product_name}</h4>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Purchased: <strong className="text-slate-700">{maxQty} units</strong> @ {formatCurrency(item.unit_price, currency)} / unit
                          </p>
                          <p className="text-[11px] text-slate-400">
                            Line Total: {formatCurrency(item.total_price, currency)}
                          </p>
                        </div>

                        {/* Stepper Quantity Control */}
                        <div className="flex items-center gap-3">
                          <label className="text-xs font-bold text-slate-600">Return Qty:</label>
                          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-2xl p-1 shadow-sm">
                            <button
                              type="button"
                              onClick={() =>
                                setReturnQtys({
                                  ...returnQtys,
                                  [item.product_id]: Math.max(0, currentQty - 1),
                                })
                              }
                              className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-sm flex items-center justify-center transition"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min="0"
                              max={maxQty}
                              value={currentQty}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                setReturnQtys({
                                  ...returnQtys,
                                  [item.product_id]: Math.min(maxQty, Math.max(0, isNaN(val) ? 0 : val)),
                                });
                              }}
                              className="w-14 text-center font-black text-sm text-slate-900 focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setReturnQtys({
                                  ...returnQtys,
                                  [item.product_id]: Math.min(maxQty, currentQty + 1),
                                })
                              }
                              className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-sm flex items-center justify-center transition"
                            >
                              +
                            </button>
                          </div>
                          <span className="text-[11px] font-semibold text-slate-400">
                            / {maxQty} max
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <Input
                  label="Reason for Return (Optional)"
                  placeholder="e.g. Customer returned undamaged box / change of mind"
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                />
              </div>

              {/* Refund Breakdown & Financial Rules */}
              <div className="lg:col-span-4 bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between space-y-6">
                <div>
                  <h3 className="font-bold text-slate-800 border-b border-slate-100 pb-3 text-base">
                    Financial & Refund Summary
                  </h3>

                  <div className="mt-4 space-y-3 text-xs">
                    <div className="flex justify-between text-slate-600">
                      <span>Original Sale Bill:</span>
                      <span className="font-bold text-slate-800">{formatCurrency(originalTotal, currency)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Customer Cash Paid:</span>
                      <span className="font-bold text-emerald-700">{formatCurrency(originalPaid, currency)}</span>
                    </div>
                    {originalDue > 0 && (
                      <div className="flex justify-between text-slate-600">
                        <span>Original Outstanding Due:</span>
                        <span className="font-bold text-rose-600">{formatCurrency(originalDue, currency)}</span>
                      </div>
                    )}

                    <div className="border-t border-slate-100 pt-3 flex justify-between text-sm">
                      <span className="font-bold text-slate-700">Total Return Value:</span>
                      <span className="font-black text-slate-900">{formatCurrency(totalReturnAmount, currency)}</span>
                    </div>

                    {/* Breakdown of how return value is applied */}
                    <div className="p-3.5 rounded-2xl bg-emerald-50/80 border border-emerald-200 space-y-2 mt-3">
                      <div className="flex justify-between font-bold text-emerald-900">
                        <span>💵 Cash Refund to Customer:</span>
                        <span>{formatCurrency(cashRefund, currency)}</span>
                      </div>
                      <p className="text-[10px] text-emerald-700 leading-relaxed">
                        (Only actual cash paid that exceeds remaining debt is refunded in cash)
                      </p>
                    </div>

                    {dueReduction > 0 && (
                      <div className="p-3.5 rounded-2xl bg-blue-50/80 border border-blue-200 space-y-1">
                        <div className="flex justify-between font-bold text-blue-900">
                          <span>🧾 Customer Debt Reduced:</span>
                          <span>{formatCurrency(dueReduction, currency)}</span>
                        </div>
                        <div className="text-[10px] text-blue-700 flex justify-between">
                          <span>Remaining debt after return:</span>
                          <strong>{formatCurrency(remainingDueAfterReturn, currency)}</strong>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <Button
                  variant="primary"
                  size="lg"
                  className="w-full font-black tracking-wide"
                  disabled={totalReturnAmount <= 0 || submitting}
                  loading={submitting}
                  onClick={handleProcessReceiptReturn}
                >
                  Confirm & Process Return
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Manual Return */}
      {activeTab === 'manual' && (
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm max-w-xl">
          <h3 className="font-bold text-slate-800 mb-4">Manual Return (Lost Receipt)</h3>
          <form onSubmit={handleProcessManualReturn} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">
                Customer
              </label>
              <select
                value={manualCustomerId}
                onChange={(e) => setManualCustomerId(Number(e.target.value))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-800 focus:outline-none focus:border-emerald-500"
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.phone ? `(${c.phone})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">
                Product to Return
              </label>
              <select
                value={manualProductId}
                onChange={(e) => {
                  const pid = Number(e.target.value);
                  setManualProductId(pid);
                  const prod = products.find((p) => p.id === pid);
                  if (prod) setManualPrice(prod.selling_price);
                }}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-800 focus:outline-none focus:border-emerald-500"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (Price: {currency} {p.selling_price})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Return Quantity *"
                type="number"
                min="1"
                value={manualQty}
                onChange={(e) => setManualQty(Math.max(1, Number(e.target.value)))}
                required
              />
              <Input
                label="Unit Price *"
                type="number"
                step="0.01"
                value={manualPrice}
                onChange={(e) => setManualPrice(Number(e.target.value))}
                prefix={currency}
                required
              />
            </div>

            <Input
              label="Reason (Optional)"
              placeholder="e.g. Return without receipt"
              value={manualReason}
              onChange={(e) => setManualReason(e.target.value)}
            />

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex justify-between items-center text-sm">
              <span className="font-semibold text-slate-600">Total Refund Value:</span>
              <span className="font-bold text-slate-900 text-lg">
                {formatCurrency(manualQty * manualPrice, currency)}
              </span>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full font-bold"
              loading={submitting}
            >
              Complete Manual Return
            </Button>
          </form>
        </div>
      )}

      {/* Tab 3: Returns History */}
      {activeTab === 'history' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          {returnsHistory.length === 0 ? (
            <EmptyState
              title="No returns yet"
              description="Customer returns will be logged here."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="py-3.5 px-6">Return #</th>
                    <th className="py-3.5 px-6">Date</th>
                    <th className="py-3.5 px-6">Receipt</th>
                    <th className="py-3.5 px-6">Customer</th>
                    <th className="py-3.5 px-6 text-right">Items</th>
                    <th className="py-3.5 px-6 text-right">Total Returned</th>
                    <th className="py-3.5 px-6 text-right">Cash Refund</th>
                    <th className="py-3.5 px-6 text-right">Due Credit</th>
                    <th className="py-3.5 px-6">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {returnsHistory.map((ret) => (
                    <tr key={ret.id} className="hover:bg-slate-50/60 transition">
                      <td className="py-4 px-6 font-bold text-slate-900">{ret.return_number}</td>
                      <td className="py-4 px-6 text-slate-500 text-xs">
                        {new Date(ret.created_at).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="py-4 px-6 text-slate-700 font-medium">
                        {ret.sale_receipt_number || 'Manual Return'}
                      </td>
                      <td className="py-4 px-6 font-medium text-slate-800">{ret.customer_name}</td>
                      <td className="py-4 px-6 text-right text-slate-500 text-xs">
                        {ret.items.length} items
                      </td>
                      <td className="py-4 px-6 text-right font-bold text-slate-900">
                        {formatCurrency(ret.total_return_amount, currency)}
                      </td>
                      <td className="py-4 px-6 text-right text-emerald-700 font-semibold">
                        {formatCurrency(ret.cash_refund_amount, currency)}
                      </td>
                      <td className="py-4 px-6 text-right text-blue-700 font-semibold">
                        {formatCurrency(ret.balance_credit_amount, currency)}
                      </td>
                      <td className="py-4 px-6 text-slate-500 text-xs">{ret.reason || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
