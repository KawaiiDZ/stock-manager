import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../services/api';
import { Sale, BusinessSettings } from '../../types';
import {
  ShoppingBag,
  Search,
  Eye,
  Printer,
  RotateCcw,
  DollarSign,
  Calendar,
  CheckCircle2,
  AlertCircle,
  X,
  CreditCard,
  ArrowDownRight,
  RefreshCw,
} from 'lucide-react';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Modal } from '../../components/common/Modal';
import { Badge } from '../../components/common/Badge';
import { DateFilter, DatePreset } from '../../components/common/DateFilter';
import { EmptyState } from '../../components/common/EmptyState';
import { ReceiptModal } from '../../components/receipts/ReceiptModal';
import { formatCurrency, formatMoney, formatDateTime } from '../../utils/format';
import { useBarcodeScanner } from '../../hooks/useBarcodeScanner';
import { rasterizeReceiptOffscreen } from '../../utils/receiptRasterizer';
import { playReceiptCutBeep } from '../../utils/audio';

interface SalesHistoryPageProps {
  settings: BusinessSettings | null;
  onNavigateToReturn?: (saleId: number) => void;
  onNavigateToNewSale?: () => void;
}

export const SalesHistoryPage: React.FC<SalesHistoryPageProps> = ({
  settings,
  onNavigateToReturn,
  onNavigateToNewSale,
}) => {
  const [sales, setSales] = useState<Sale[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [startDate, setStartDate] = useState<string | undefined>();
  const [endDate, setEndDate] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  // Print & Details Modal
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const handleQuickPrint = async (sale: Sale) => {
    if (settings?.skip_receipt_preview && settings?.thermal_print_mode === 'direct_escpos') {
      try {
        const pWidth = settings?.receipt_printer_type === '58mm' ? '58mm' : '80mm';
        const isRaster = settings?.thermal_render_pipeline === 'raster_canvas';

        const dispatchPrint = (rasterImage?: string) =>
          api.printThermalDirect({
            sale_id: sale.id,
            printer_name: settings?.selected_thermal_printer || undefined,
            paper_width: pWidth,
            header_style: settings?.thermal_header_style || 'logo_text',
            show_barcode: settings?.show_barcode ?? true,
            darkness: settings?.thermal_darkness || 'normal',
            layout: settings?.thermal_layout || 'classic',
            printer_profile: settings?.thermal_printer_profile || 'standard_escpos',
            cut_mode: settings?.thermal_cut_mode || 'partial',
            feed_lines: settings?.thermal_feed_lines ?? 4,
            render_pipeline: isRaster ? 'raster_canvas' : 'native_text',
            beep_enabled: settings?.thermal_beep_enabled ?? true,
            raster_image: rasterImage || undefined,
          });

        const res = isRaster
          ? await rasterizeReceiptOffscreen(sale, settings, {
              paperWidth: pWidth,
              layout: settings?.thermal_layout as any,
            }).then((img) => dispatchPrint(img || undefined))
          : await dispatchPrint();

        if (settings?.thermal_beep_enabled ?? true) {
          playReceiptCutBeep();
        }

        setToastMessage({
          type: 'success',
          text: `Receipt #${sale.receipt_number} sent to ${res.printer || 'thermal printer'}`,
        });
        return;
      } catch (err: any) {
        setToastMessage({
          type: 'error',
          text: err.detail || 'Direct print failed. Opening preview modal...',
        });
      }
    }
    setSelectedSale(sale);
    setShowReceiptModal(true);
  };

  // Receive Due Modal
  const [paymentSale, setPaymentSale] = useState<Sale | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<string>('Cash');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [submittingPayment, setSubmittingPayment] = useState(false);

  const currency = settings?.currency || 'Rs.';

  const loadSales = async () => {
    setLoading(true);
    try {
      const data = await api.getSales({
        search: search.trim() || undefined,
        payment_status: statusFilter === 'all' ? undefined : statusFilter,
        start_date: startDate,
        end_date: endDate,
      });
      setSales(data || []);
    } catch (err) {
      console.error('Failed to load sales:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSales();
  }, [search, statusFilter, startDate, endDate]);

  // Barcode scanner integration for instant receipt lookup
  useBarcodeScanner({
    enabled: !loading && !showReceiptModal && !paymentSale,
    onScan: async (scannedCode) => {
      const code = scannedCode.trim();
      setSearch(code);
      try {
        const data = await api.getSales({ search: code });
        if (data && data.length > 0) {
          const exact = data.find(s => s.receipt_number.toLowerCase() === code.toLowerCase()) || data[0];
          setSelectedSale(exact);
          setShowReceiptModal(true);
        }
      } catch (err) {
        console.error('Barcode lookup failed:', err);
      }
    },
  });

  // Aggregate KPI summary metrics for the currently filtered set
  const metrics = useMemo(() => {
    let revenue = 0;
    let paid = 0;
    let due = 0;
    let returned = 0;

    for (const s of sales) {
      revenue += Number(s.total_amount || 0);
      paid += Number(s.paid_amount || 0);
      due += Number(s.due_amount || 0);
      returned += Number(s.total_returned_amount || 0);
    }

    return {
      count: sales.length,
      revenue,
      paid,
      due,
      returned,
    };
  }, [sales]);

  const handleResetFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setStartDate(undefined);
    setEndDate(undefined);
    setDatePreset('all');
  };

  const hasActiveFilters = Boolean(
    search.trim() || statusFilter !== 'all' || startDate || endDate || datePreset !== 'all'
  );

  const handleOpenPayment = (sale: Sale) => {
    setPaymentSale(sale);
    setPaymentAmount(Number(sale.due_amount || 0));
    setPaymentMethod('Cash');
    setPaymentNotes('');
  };

  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentSale || paymentAmount <= 0) return;

    if (paymentAmount > Number(paymentSale.due_amount)) {
      alert(
        `Payment amount cannot exceed remaining due of ${formatCurrency(
          paymentSale.due_amount,
          currency
        )}`
      );
      return;
    }

    setSubmittingPayment(true);
    try {
      await api.recordSalePayment(paymentSale.id, paymentAmount, paymentMethod);
      setPaymentSale(null);
      loadSales();
    } catch (err: any) {
      alert(err.detail || 'Failed to record payment');
    } finally {
      setSubmittingPayment(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight">Sales History</h1>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
              {metrics.count} {metrics.count === 1 ? 'sale' : 'sales'}
            </span>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            View completed transactions, reprint thermal receipts & A4 invoices, and collect due balances
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="md"
            icon={<RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />}
            onClick={loadSales}
            title="Refresh Sales"
          >
            Refresh
          </Button>

          {onNavigateToNewSale && (
            <Button
              variant="primary"
              size="md"
              icon={<ShoppingBag className="h-4 w-4" />}
              onClick={onNavigateToNewSale}
            >
              + New Sale
            </Button>
          )}
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Total Transactions */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-3">
          <div className="p-3 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-xl">
            <ShoppingBag className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              Transactions
            </div>
            <div className="text-lg font-black text-slate-900 dark:text-white mt-0.5">{metrics.count}</div>
          </div>
        </div>

        {/* Total Revenue */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-3">
          <div className="p-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl">
            <DollarSign className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              Total Revenue
            </div>
            <div className="text-lg font-black text-slate-900 dark:text-white mt-0.5">
              {formatCurrency(metrics.revenue, currency)}
            </div>
          </div>
        </div>

        {/* Collected Amount */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-3">
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-xl">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              Collected
            </div>
            <div className="text-lg font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
              {formatCurrency(metrics.paid, currency)}
            </div>
          </div>
        </div>

        {/* Outstanding Due */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-3">
          <div className="p-3 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 rounded-xl">
            <AlertCircle className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              Due Balance
            </div>
            <div className="text-lg font-black text-rose-600 dark:text-rose-400 mt-0.5">
              {formatCurrency(metrics.due, currency)}
            </div>
          </div>
        </div>

        {/* Returned Value */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-3 col-span-2 sm:col-span-2 lg:col-span-1">
          <div className="p-3 bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 rounded-xl">
            <RotateCcw className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              Total Returns
            </div>
            <div className="text-lg font-black text-purple-600 dark:text-purple-400 mt-0.5">
              {formatCurrency(metrics.returned, currency)}
            </div>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3">
        <div className="flex flex-1 flex-col sm:flex-row items-stretch sm:items-center gap-3 min-w-0">
          <div className="flex-1 min-w-[200px] max-w-md relative">
            <Input
              placeholder="Search or scan Receipt # (press Enter to view)..."
              prefix={<Search className="h-4 w-4" />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && search.trim() && sales.length > 0) {
                  e.preventDefault();
                  const exact = sales.find(s => s.receipt_number.toLowerCase() === search.trim().toLowerCase()) || sales[0];
                  setSelectedSale(exact);
                  setShowReceiptModal(true);
                }
              }}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-full"
                title="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="shrink-0 w-full sm:w-52 min-w-[190px]">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full h-[42px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-semibold rounded-xl px-3.5 py-2 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-brand-500 shadow-sm cursor-pointer"
            >
              <option value="all">All Payment Statuses</option>
              <option value="PAID">Fully Paid</option>
              <option value="PARTIALLY_PAID">Partially Paid</option>
              <option value="UNPAID">Unpaid (Credit)</option>
              <option value="RETURNED">Returned</option>
              <option value="PARTIALLY_RETURNED">Partially Returned</option>
            </select>
          </div>
        </div>

        <div className="shrink-0 overflow-x-auto pb-1 sm:pb-0">
          <DateFilter
            activePreset={datePreset}
            onFilterChange={(start, end, preset) => {
              setStartDate(start);
              setEndDate(end);
              if (preset) setDatePreset(preset);
            }}
          />
        </div>
      </div>

      {/* Active Filter Indicators */}
      {hasActiveFilters && (
        <div className="flex items-center justify-between px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs text-slate-600 dark:text-slate-300 font-medium">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-slate-500 dark:text-slate-400">Filtered by:</span>
            {datePreset !== 'all' && (
              <span className="bg-white dark:bg-slate-700 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 font-semibold">
                Date: {datePreset.replace('_', ' ').toUpperCase()} {startDate ? `(${startDate} to ${endDate || 'now'})` : ''}
              </span>
            )}
            {statusFilter !== 'all' && (
              <span className="bg-white dark:bg-slate-700 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 font-semibold">
                Status: {statusFilter.replace('_', ' ')}
              </span>
            )}
            {search.trim() && (
              <span className="bg-white dark:bg-slate-700 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 font-semibold">
                Search: "{search.trim()}"
              </span>
            )}
          </div>

          <button
            onClick={handleResetFilters}
            className="text-rose-600 dark:text-rose-400 hover:text-rose-700 font-bold hover:underline ml-4"
          >
            Reset All Filters
          </button>
        </div>
      )}

      {/* Sales Table */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-20 text-center text-slate-400 dark:text-slate-500">Loading sales history...</div>
        ) : sales.length === 0 ? (
          <EmptyState
            title={hasActiveFilters ? 'No sales match your filters' : 'No sales transactions found'}
            description={
              hasActiveFilters
                ? 'Try broadening your date range, clearing your search term, or selecting all statuses.'
                : 'Completed sales will appear here with instant receipt reprinting and balance collection.'
            }
            actionText={hasActiveFilters ? 'Reset Filters' : onNavigateToNewSale ? '+ Create First Sale' : undefined}
            onAction={hasActiveFilters ? handleResetFilters : onNavigateToNewSale}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-800 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-6">Receipt #</th>
                  <th className="py-3.5 px-6">Date & Time</th>
                  <th className="py-3.5 px-6">Customer</th>
                  <th className="py-3.5 px-6 text-right">Items</th>
                  <th className="py-3.5 px-6 text-right">Total Amount</th>
                  <th className="py-3.5 px-6 text-right">Paid</th>
                  <th className="py-3.5 px-6 text-right">Due Balance</th>
                  <th className="py-3.5 px-6 text-center">Status</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {sales.map((sale) => {
                  const dueNum = Number(sale.due_amount || 0);
                  const returnedNum = Number(sale.total_returned_amount || 0);
                  return (
                    <tr
                      key={sale.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition cursor-pointer"
                      onClick={() => {
                        setSelectedSale(sale);
                        setShowReceiptModal(true);
                      }}
                    >
                      <td className="py-4 px-6 font-bold text-slate-900 dark:text-white">
                        <div className="flex flex-col">
                          <span className="hover:text-brand-600 dark:hover:text-brand-400 transition">{sale.receipt_number}</span>
                          {returnedNum > 0 && (
                            <span className="text-[10px] text-purple-600 dark:text-purple-400 font-semibold">
                              ({formatCurrency(returnedNum, currency)} returned)
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-6 text-slate-500 dark:text-slate-400 text-xs">
                        {formatDateTime(sale.created_at, settings?.date_format)}
                      </td>
                      <td className="py-4 px-6 font-medium text-slate-800 dark:text-slate-100">
                        <div>
                          <div>{sale.customer_name || 'Walk-in Customer'}</div>
                          {sale.customer_phone && (
                            <div className="text-[11px] text-slate-400 dark:text-slate-500">{sale.customer_phone}</div>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-6 text-right text-slate-500 dark:text-slate-400 text-xs">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 font-semibold text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700">
                          {sale.items ? sale.items.length : 0} items
                        </span>
                      </td>
                      <td className="py-4 px-6 text-right font-bold text-slate-900 dark:text-white">
                        {formatCurrency(sale.total_amount, currency)}
                      </td>
                      <td className="py-4 px-6 text-right text-emerald-600 dark:text-emerald-400 font-semibold">
                        {formatCurrency(sale.paid_amount, currency)}
                      </td>
                      <td className="py-4 px-6 text-right font-semibold text-rose-600 dark:text-rose-400">
                        {dueNum > 0 ? formatCurrency(dueNum, currency) : '—'}
                      </td>
                      <td className="py-4 px-6 text-center" onClick={(e) => e.stopPropagation()}>
                        <Badge status={sale.payment_status} />
                      </td>
                      <td className="py-4 px-6 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          {dueNum > 0 && sale.payment_status !== 'RETURNED' && (
                            <button
                              onClick={() => handleOpenPayment(sale)}
                              className="px-2.5 py-1.5 rounded-lg bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 font-semibold text-xs hover:bg-brand-100 dark:hover:bg-brand-900/60 transition"
                              title="Receive Due Payment"
                            >
                              Receive Due
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setSelectedSale(sale);
                              setShowReceiptModal(true);
                            }}
                            className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                            title="View Details & Receipt"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleQuickPrint(sale)}
                            className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                            title={settings?.skip_receipt_preview ? "1-Click Direct Print Receipt" : "Print Thermal / A4 Receipt"}
                          >
                            <Printer className="h-4 w-4" />
                          </button>
                          {onNavigateToReturn && (
                            <button
                              onClick={() => onNavigateToReturn(sale.id)}
                              className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition"
                              title="Return Items"
                            >
                              <RotateCcw className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Receipt Modal (Thermal Roll & Corporate A4 Invoice) */}
      <ReceiptModal
        isOpen={showReceiptModal}
        onClose={() => {
          setShowReceiptModal(false);
          setSelectedSale(null);
        }}
        sale={selectedSale}
        settings={settings}
      />

      {/* Receive Due Payment Modal */}
      <Modal
        isOpen={Boolean(paymentSale)}
        onClose={() => setPaymentSale(null)}
        title={`Receive Payment for ${paymentSale?.receipt_number}`}
        subtitle={paymentSale?.customer_name ? `Customer: ${paymentSale.customer_name}` : undefined}
        maxWidth="md"
      >
        {paymentSale && (
          <form onSubmit={handleSavePayment} className="space-y-4">
            {/* 1. Summary Cards */}
            <div className="grid grid-cols-3 gap-2.5 text-center">
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Invoice Total</span>
                <span className="text-base font-black text-slate-800 dark:text-slate-100 mt-0.5 block">
                  {formatCurrency(paymentSale.total_amount, currency)}
                </span>
              </div>
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Already Paid</span>
                <span className="text-base font-black text-emerald-600 dark:text-emerald-400 mt-0.5 block">
                  {formatCurrency(paymentSale.paid_amount, currency)}
                </span>
              </div>
              <div className="p-3 rounded-2xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider block">Current Due</span>
                <span className="text-base font-black text-rose-600 dark:text-rose-400 mt-0.5 block">
                  {formatCurrency(paymentSale.due_amount, currency)}
                </span>
              </div>
            </div>

            {/* 2. Amount Input & Quick Shortcuts */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Input
                  label="Payment Amount *"
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={Number(paymentSale.due_amount || 0)}
                  value={paymentAmount || ''}
                  onChange={(e) => setPaymentAmount(Number(e.target.value))}
                  prefix={currency}
                  required
                  autoFocus
                />
                <div className="flex items-center gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => setPaymentAmount(Number(paymentSale.due_amount || 0))}
                    className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 hover:underline bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800"
                  >
                    Full: {formatCurrency(paymentSale.due_amount, currency)}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentAmount(Math.round((Number(paymentSale.due_amount || 0) / 2) * 100) / 100)}
                    className="text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:underline bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700"
                  >
                    50% Half
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5">Payment Method *</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:border-brand-500 shadow-sm cursor-pointer"
                >
                  <option value="Cash">Cash</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Credit Card">Credit Card</option>
                  <option value="Debit Card">Debit Card</option>
                  <option value="Cheque">Cheque</option>
                  <option value="Online / Mobile Wallet">Online / Mobile Wallet</option>
                </select>
              </div>
            </div>

            <Input
              label="Notes (Optional)"
              placeholder="e.g. Counter collection, online ref #, check #"
              value={paymentNotes}
              onChange={(e) => setPaymentNotes(e.target.value)}
            />

            {/* 3. Live Amount Remaining & Dynamic Status Pill */}
            {(() => {
              const currentDueNum = Number(paymentSale.due_amount || 0);
              const isOverpayment = paymentAmount > currentDueNum;
              const newRemaining = Math.max(0, currentDueNum - paymentAmount);

              return (
                <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                      Amount Remaining:
                    </span>
                    <span className="text-sm font-black text-slate-900 dark:text-white">
                      {formatCurrency(newRemaining, currency)}
                    </span>
                  </div>

                  {/* Status Pill */}
                  {isOverpayment ? (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-200 border border-rose-300 dark:border-rose-800 animate-pulse">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mr-1.5" />
                      Overpaid
                    </span>
                  ) : newRemaining === 0 && paymentAmount > 0 ? (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-800">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5" />
                      Full (Paid Off)
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-800">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5" />
                      Still Due
                    </span>
                  )}
                </div>
              );
            })()}

            {paymentAmount > Number(paymentSale.due_amount || 0) && (
              <p className="text-xs text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4 shrink-0" />
                Payment amount cannot exceed the current invoice due balance.
              </p>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => setPaymentSale(null)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={submittingPayment}
                disabled={paymentAmount <= 0 || paymentAmount > Number(paymentSale.due_amount || 0)}
              >
                {paymentAmount > 0 ? `Receive ${formatCurrency(paymentAmount, currency)}` : 'Receive Payment'}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Floating Action Toast */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 animate-in fade-in slide-in-from-top-4 duration-300">
          <div
            className={`flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-xl text-sm font-semibold border ${
              toastMessage.type === 'success'
                ? 'bg-emerald-600 text-white border-emerald-500 shadow-emerald-600/20'
                : 'bg-rose-600 text-white border-rose-500 shadow-rose-600/20'
            }`}
          >
            {toastMessage.type === 'success' ? (
              <CheckCircle2 className="h-5 w-5 shrink-0" />
            ) : (
              <AlertCircle className="h-5 w-5 shrink-0" />
            )}
            <span>{toastMessage.text}</span>
            <button
              onClick={() => setToastMessage(null)}
              className="ml-2 p-1 hover:bg-white/20 rounded-lg transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
