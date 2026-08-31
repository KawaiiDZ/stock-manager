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

  useEffect(() => {
    if (initialSaleId) {
      api.getSale(initialSaleId).then((sale) => {
        setFoundSale(sale);
        setReceiptSearch(sale.receipt_number);
        const initQtys: Record<number, number> = {};
        sale.items.forEach((it) => (initQtys[it.product_id] = 0));
        setReturnQtys(initQtys);
        setActiveTab('receipt');
      });
    }
  }, [initialSaleId]);

  const handleSearchReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiptSearch.trim()) return;
    setLoading(true);
    setErrorMsg(null);
    setFoundSale(null);
    try {
      const sales = await api.getSales({ search: receiptSearch.trim() });
      const exact = sales.find(
        (s) => s.receipt_number.toLowerCase() === receiptSearch.trim().toLowerCase()
      );
      if (!exact) {
        setErrorMsg(`Receipt '${receiptSearch}' was not found.`);
        return;
      }
      setFoundSale(exact);
      const initQtys: Record<number, number> = {};
      exact.items.forEach((it) => (initQtys[it.product_id] = 0));
      setReturnQtys(initQtys);
    } catch (err: any) {
      setErrorMsg(err.detail || 'Receipt not found.');
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

  const cashRefund = foundSale ? Math.min(totalReturnAmount, foundSale.paid_amount) : 0;
  const balanceCredit = foundSale ? totalReturnAmount - cashRefund : 0;

  const handleProcessReceiptReturn = async () => {
    if (!foundSale || totalReturnAmount <= 0) {
      setErrorMsg('Please select at least 1 item to return.');
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

      alert(
        `Return ${res.return_number} completed. Cash refund: ${formatCurrency(res.cash_refund_amount, currency)}, Customer due reduced by: ${formatCurrency(res.balance_credit_amount, currency)}.`
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
            Process returns with automatic stock restoration and cashback calculation
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 bg-slate-200/70 p-1.5 rounded-2xl">
          <button
            onClick={() => {
              setActiveTab('receipt');
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === 'receipt' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            Return from Receipt
          </button>
          <button
            onClick={() => {
              setActiveTab('manual');
              setErrorMsg(null);
              setSuccessMsg(null);
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
              setErrorMsg(null);
              setSuccessMsg(null);
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

      {/* Tab 1: Return from Receipt */}
      {activeTab === 'receipt' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
            <form onSubmit={handleSearchReceipt} className="flex gap-3 max-w-xl">
              <Input
                placeholder="Enter Receipt Number (e.g. R-000001)..."
                value={receiptSearch}
                onChange={(e) => setReceiptSearch(e.target.value)}
                autoFocus
              />
              <Button type="submit" variant="primary" loading={loading} icon={<Search className="h-4 w-4" />}>
                Find Sale
              </Button>
            </form>
          </div>

          {foundSale && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Items to return */}
              <div className="lg:col-span-8 bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="font-bold text-slate-800">
                      Receipt {foundSale.receipt_number}
                    </h3>
                    <p className="text-xs text-slate-400">
                      Customer: {foundSale.customer_name || 'Walk-in'} • Original Total:{' '}
                      {currency} {foundSale.total_amount} (Paid: {currency} {foundSale.paid_amount})
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {foundSale.items.map((item) => (
                    <div
                      key={item.product_id}
                      className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between gap-4"
                    >
                      <div>
                        <h4 className="font-bold text-slate-800 text-sm">{item.product_name}</h4>
                        <p className="text-xs text-slate-500">
                          Sold: {item.quantity} units @ {currency} {item.unit_price}
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <label className="text-xs font-semibold text-slate-500">
                          Return Qty:
                        </label>
                        <input
                          type="number"
                          min="0"
                          max={item.quantity}
                          value={returnQtys[item.product_id] || 0}
                          onChange={(e) =>
                            setReturnQtys({
                              ...returnQtys,
                              [item.product_id]: Math.min(
                                item.quantity,
                                Math.max(0, Number(e.target.value))
                              ),
                            })
                          }
                          className="w-16 text-center font-bold bg-white border border-slate-200 rounded-xl py-1 text-sm text-slate-800 focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <Input
                  label="Reason for Return (Optional)"
                  placeholder="e.g. Customer returned damaged item"
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                />
              </div>

              {/* Refund Breakdown (Section 29) */}
              <div className="lg:col-span-4 bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
                <h3 className="font-bold text-slate-800 border-b border-slate-100 pb-3">
                  Financial Breakdown
                </h3>

                <div className="space-y-2.5 text-sm">
                  <div className="flex justify-between text-slate-600">
                    <span>Total Return Value:</span>
                    <span className="font-bold text-slate-800">
                      {formatCurrency(totalReturnAmount, currency)}
                    </span>
                  </div>
                  <div className="flex justify-between text-emerald-700 font-semibold bg-emerald-50 p-2 rounded-xl">
                    <span>Cash Refund (Max Paid):</span>
                    <span>
                      {formatCurrency(cashRefund, currency)}
                    </span>
                  </div>
                  {balanceCredit > 0 && (
                    <div className="flex justify-between text-blue-700 font-semibold bg-blue-50 p-2 rounded-xl">
                      <span>Credit to Customer Due:</span>
                      <span>
                        {formatCurrency(balanceCredit, currency)}
                      </span>
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-slate-100">
                  <Button
                    variant="primary"
                    size="lg"
                    className="w-full font-bold"
                    disabled={totalReturnAmount <= 0 || submitting}
                    loading={submitting}
                    onClick={handleProcessReceiptReturn}
                  >
                    Process Return
                  </Button>
                </div>
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
