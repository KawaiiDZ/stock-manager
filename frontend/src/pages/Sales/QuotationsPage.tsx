import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { Quotation, QuotationConversionCheckResponse, BusinessSettings, Sale } from '../../types';
import { formatCurrency, formatDateTime } from '../../utils/format';
import {
  FileText,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  Printer,
  Trash2,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  DollarSign,
  Plus,
  RefreshCw,
  Eye,
  Check,
  X,
  Edit,
  RotateCcw
} from 'lucide-react';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Modal } from '../../components/common/Modal';
import { QuotationModal } from '../../components/receipts/QuotationModal';
import { ReceiptModal } from '../../components/receipts/ReceiptModal';
import { ReviseQuotationModal } from '../../components/quotations/ReviseQuotationModal';

interface QuotationsPageProps {
  settings: BusinessSettings | null;
  onNavigateToNewSale?: () => void;
  onQuotationConverted?: () => void;
}

export const QuotationsPage: React.FC<QuotationsPageProps> = ({
  settings,
  onNavigateToNewSale,
  onQuotationConverted,
}) => {
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('PENDING');
  const [search, setSearch] = useState('');

  // Quotation viewing/printing
  const [previewQuotation, setPreviewQuotation] = useState<Quotation | null>(null);

  // Agreement Revision Modal state
  const [revisingQuotation, setRevisingQuotation] = useState<Quotation | null>(null);

  // Approval / Conversion State
  const [approvingQuotation, setApprovingQuotation] = useState<Quotation | null>(null);
  const [checkLoading, setCheckLoading] = useState(false);
  const [conversionCheck, setConversionCheck] = useState<QuotationConversionCheckResponse | null>(null);
  const [priceMode, setPriceMode] = useState<'quoted' | 'current'>('quoted');
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'Card' | 'Bank Transfer' | 'Online'>('Cash');
  const [amountPaid, setAmountPaid] = useState<number>(0);
  const [isAmountPaidCustomized, setIsAmountPaidCustomized] = useState(false);
  const [conversionNotes, setConversionNotes] = useState('');
  const [converting, setConverting] = useState(false);
  const [conversionError, setConversionError] = useState<string | null>(null);

  // Completed converted sale modal
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);

  // Disapproval Modal
  const [rejectingQuotation, setRejectingQuotation] = useState<Quotation | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);

  // Message notifications
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const currency = settings?.currency || 'Rs.';

  const loadQuotations = async () => {
    try {
      setLoading(true);
      const data = await api.getQuotations(statusFilter === 'ALL' ? undefined : statusFilter, search);
      setQuotations(data || []);
    } catch (err: any) {
      console.error('Failed to load quotations:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQuotations();
  }, [statusFilter]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      loadQuotations();
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Handle open approval modal
  const handleOpenApproveModal = async (q: Quotation) => {
    setApprovingQuotation(q);
    setPriceMode('quoted');
    setPaymentMethod('Cash');
    setConversionNotes('');
    setConversionError(null);
    setIsAmountPaidCustomized(false);
    setAmountPaid(Number(q.total_amount || 0));

    try {
      setCheckLoading(true);
      const checkRes = await api.checkQuotationConversion(q.id);
      setConversionCheck(checkRes);
    } catch (err: any) {
      setConversionError(err.detail || 'Failed to check conversion status.');
    } finally {
      setCheckLoading(false);
    }
  };

  // Calculate dynamic total in approval modal based on priceMode
  const calculatedApprovalTotal = React.useMemo(() => {
    if (!approvingQuotation) return 0;
    if (priceMode === 'quoted' || !conversionCheck) {
      return Number(approvingQuotation.total_amount || 0);
    }
    // Calculate total at current prices
    let currentSubtotal = 0;
    for (const item of conversionCheck.items) {
      const origItem = approvingQuotation.items.find((it) => it.product_id === item.product_id);
      const disc = origItem ? Number(origItem.discount_amount || 0) : 0;
      currentSubtotal += Math.max(0, item.quantity * item.current_price - disc);
    }
    const saleDisc = Math.min(Number(approvingQuotation.discount_amount || 0), currentSubtotal);
    const taxable = Math.max(0, currentSubtotal - saleDisc);
    const tax = (taxable * Number(approvingQuotation.tax_rate || 0)) / 100;
    return Math.round((taxable + tax) * 100) / 100;
  }, [approvingQuotation, priceMode, conversionCheck]);

  // Keep amountPaid updated with calculatedApprovalTotal unless user typed custom amount
  useEffect(() => {
    if (!isAmountPaidCustomized) {
      setAmountPaid(calculatedApprovalTotal);
    }
  }, [calculatedApprovalTotal, isAmountPaidCustomized]);

  // Submit Approval & Convert to Sale
  const handleConfirmApproval = async () => {
    if (!approvingQuotation) return;
    setConverting(true);
    setConversionError(null);

    try {
      const sale = await api.convertQuotationToSale(approvingQuotation.id, {
        price_mode: priceMode,
        payment_method: paymentMethod,
        amount_paid: Number(amountPaid),
        notes: conversionNotes.trim() || undefined,
      });

      setApprovingQuotation(null);
      setCompletedSale(sale);
      setShowReceiptModal(true);
      setNotification({
        type: 'success',
        message: `Quotation ${approvingQuotation.quotation_number} approved and converted to Invoice ${sale.receipt_number}!`,
      });

      loadQuotations();
      if (onQuotationConverted) onQuotationConverted();
    } catch (err: any) {
      setConversionError(err.detail || 'Failed to convert quotation to invoice.');
    } finally {
      setConverting(false);
    }
  };

  // Submit Rejection
  const handleConfirmRejection = async () => {
    if (!rejectingQuotation) return;
    setRejecting(true);
    try {
      await api.rejectQuotation(rejectingQuotation.id, rejectReason.trim() || undefined);
      setRejectingQuotation(null);
      setRejectReason('');
      setNotification({
        type: 'success',
        message: `Quotation ${rejectingQuotation.quotation_number} has been marked as Disapproved.`,
      });
      loadQuotations();
      if (onQuotationConverted) onQuotationConverted();
    } catch (err: any) {
      alert(err.detail || 'Failed to disapprove quotation.');
    } finally {
      setRejecting(false);
    }
  };

  // Delete Quotation
  const handleDeleteQuotation = async (q: Quotation) => {
    if (!window.confirm(`Are you sure you want to permanently delete quotation "${q.quotation_number}"?`)) {
      return;
    }
    try {
      await api.deleteQuotation(q.id);
      setNotification({
        type: 'success',
        message: `Quotation ${q.quotation_number} deleted successfully.`,
      });
      loadQuotations();
      if (onQuotationConverted) onQuotationConverted();
    } catch (err: any) {
      alert(err.detail || 'Failed to delete quotation.');
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight flex items-center gap-2.5">
            <FileText className="h-7 w-7 text-brand-600 dark:text-brand-400" />
            Active Quotations & Estimates
          </h1>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            Track uncharged customer estimates, verify price changes, and convert approved offers directly into invoices
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="md"
            icon={<RefreshCw className="h-4 w-4 text-slate-600 dark:text-slate-300" />}
            onClick={loadQuotations}
            disabled={loading}
          >
            Refresh
          </Button>

          {onNavigateToNewSale && (
            <Button
              variant="primary"
              size="md"
              icon={<Plus className="h-4 w-4" />}
              onClick={onNavigateToNewSale}
              className="shadow-md"
            >
              + Create Quotation (POS)
            </Button>
          )}
        </div>
      </div>

      {/* Notifications */}
      {notification && (
        <div
          className={`p-4 rounded-2xl text-xs font-semibold flex items-center justify-between border transition ${
            notification.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 font-bold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Toolbar: Status Tabs & Search */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-bold">
          <button
            type="button"
            onClick={() => setStatusFilter('PENDING')}
            className={`px-3.5 py-1.5 rounded-lg transition ${
              statusFilter === 'PENDING'
                ? 'bg-amber-500 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Active Offers
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('APPROVED')}
            className={`px-3.5 py-1.5 rounded-lg transition ${
              statusFilter === 'APPROVED'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Approved (Invoices)
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('REJECTED')}
            className={`px-3.5 py-1.5 rounded-lg transition ${
              statusFilter === 'REJECTED'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Disapproved
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('SUPERSEDED')}
            className={`px-3.5 py-1.5 rounded-lg transition ${
              statusFilter === 'SUPERSEDED'
                ? 'bg-purple-700 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Superseded
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('ALL')}
            className={`px-3.5 py-1.5 rounded-lg transition ${
              statusFilter === 'ALL'
                ? 'bg-slate-900 dark:bg-slate-700 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            All History
          </button>
        </div>

        {/* Search */}
        <div className="w-full md:w-80">
          <Input
            placeholder="Search Quote #, Customer, Phone..."
            prefix={<Search className="h-4 w-4" />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Quotations List */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-16 text-center text-slate-400 dark:text-slate-500">Loading quotations...</div>
        ) : quotations.length === 0 ? (
          <div className="p-16 text-center space-y-3">
            <div className="inline-flex p-4 rounded-full bg-brand-50 dark:bg-brand-950/40 text-brand-600 dark:text-brand-400 mb-1">
              <FileText className="h-8 w-8" />
            </div>
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">No Quotations Found</h3>
            <p className="text-xs text-slate-400 dark:text-slate-500 max-w-sm mx-auto">
              {statusFilter === 'PENDING'
                ? 'There are no active quotation offers awaiting customer response right now.'
                : 'No quotations match the selected filters.'}
            </p>
            {onNavigateToNewSale && (
              <Button
                variant="outline"
                size="sm"
                onClick={onNavigateToNewSale}
                className="font-bold mt-2"
              >
                Go to POS to Create Quotation
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-6">Quote Number</th>
                  <th className="py-3.5 px-6">Date</th>
                  <th className="py-3.5 px-6">Customer</th>
                  <th className="py-3.5 px-6">Items Breakdown</th>
                  <th className="py-3.5 px-6 text-right">Total Amount</th>
                  <th className="py-3.5 px-6 text-center">Status</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {quotations.map((q) => {
                  const isPending = q.status === 'PENDING';
                  const isApproved = q.status === 'APPROVED';
                  const isRejected = q.status === 'REJECTED';
                  const isSuperseded = q.status === 'SUPERSEDED';

                  return (
                    <tr key={q.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition">
                      {/* Quote Number */}
                      <td className="py-4 px-6 whitespace-nowrap">
                        <span className="font-bold text-brand-700 dark:text-brand-300 block">{q.quotation_number}</span>
                        {isApproved && q.sale_id && (
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                            Invoice Linked
                          </span>
                        )}
                        {isSuperseded && (
                          <span className="text-[10px] text-purple-700 dark:text-purple-400 font-semibold bg-purple-50 dark:bg-purple-950/40 px-1.5 py-0.5 rounded border border-purple-200 dark:border-purple-800">
                            Superseded
                          </span>
                        )}
                      </td>

                      {/* Date */}
                      <td className="py-4 px-6 whitespace-nowrap text-xs text-slate-600 dark:text-slate-400">
                        {formatDateTime(q.created_at)}
                      </td>

                      {/* Customer Details */}
                      <td className="py-4 px-6 whitespace-nowrap">
                        <div className="font-bold text-slate-900 dark:text-white">{q.customer_name}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{q.customer_phone}</div>
                      </td>

                      {/* Items */}
                      <td className="py-4 px-6 text-xs text-slate-600 dark:text-slate-400 max-w-xs">
                        <div className="font-semibold text-slate-800 dark:text-slate-100">
                          {q.items.length} {q.items.length === 1 ? 'Product' : 'Products'}
                        </div>
                        <div className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                          {q.items.map((it) => `${it.product_name} (${it.quantity})`).join(', ')}
                        </div>
                      </td>

                      {/* Total */}
                      <td className="py-4 px-6 text-right whitespace-nowrap">
                        <div className="font-black text-slate-900 dark:text-white">
                          {formatCurrency(q.total_amount, currency)}
                        </div>
                        {Number(q.discount_amount || 0) > 0 && (
                          <div className="text-[10px] text-emerald-600 dark:text-emerald-400">
                            Disc: -{formatCurrency(q.discount_amount, currency)}
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-4 px-6 text-center whitespace-nowrap">
                        {isPending && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                            <Clock className="h-3 w-3" />
                            OFFER PENDING
                          </span>
                        )}
                        {isApproved && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                            <CheckCircle2 className="h-3 w-3" />
                            CONVERTED
                          </span>
                        )}
                        {isRejected && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800" title={q.rejection_reason || ''}>
                            <XCircle className="h-3 w-3" />
                            DISAPPROVED
                          </span>
                        )}
                        {isSuperseded && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 border border-purple-300 dark:border-purple-800" title={q.rejection_reason || 'Superseded by revised agreement'}>
                            <RotateCcw className="h-3 w-3" />
                            SUPERSEDED
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-6 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Print A4 */}
                          <Button
                            variant="secondary"
                            size="sm"
                            icon={<Printer className="h-3.5 w-3.5 text-slate-600 dark:text-slate-300" />}
                            onClick={() => setPreviewQuotation(q)}
                            title="View / Print A4 Quotation"
                            className="font-semibold"
                          >
                            A4
                          </Button>

                          {/* Edit / Revise Agreement Button */}
                          {!isApproved && !isSuperseded && (
                            <Button
                              variant="outline"
                              size="sm"
                              icon={<Edit className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" />}
                              onClick={() => setRevisingQuotation(q)}
                              title="Revise Quotation (Supersedes current agreement and creates revised quotation)"
                              className="border-brand-200 dark:border-brand-800 text-brand-700 dark:text-brand-300 hover:bg-brand-50 dark:hover:bg-brand-950/40 font-bold text-xs"
                            >
                              Edit
                            </Button>
                          )}

                          {isPending && (
                            <>
                              {/* Approve & Convert Button */}
                              <Button
                                variant="primary"
                                size="sm"
                                icon={<Check className="h-3.5 w-3.5" />}
                                onClick={() => handleOpenApproveModal(q)}
                                className="shadow-sm font-bold text-xs"
                                title="Approve & Convert to Invoice"
                              >
                                Approve
                              </Button>

                              {/* Disapprove Button */}
                              <Button
                                variant="outline"
                                size="sm"
                                icon={<X className="h-3.5 w-3.5 text-rose-600" />}
                                onClick={() => {
                                  setRejectingQuotation(q);
                                  setRejectReason('');
                                }}
                                className="border-rose-300 text-rose-700 hover:bg-rose-50 font-bold text-xs"
                                title="Disapprove Quotation"
                              >
                                Disapprove
                              </Button>
                            </>
                          )}

                          {!isApproved && !isSuperseded && (
                            <button
                              type="button"
                              onClick={() => handleDeleteQuotation(q)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                              title="Delete Quotation"
                            >
                              <Trash2 className="h-4 w-4" />
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

      {/* 1. Print A4 Quotation Modal */}
      <QuotationModal
        isOpen={Boolean(previewQuotation)}
        onClose={() => setPreviewQuotation(null)}
        quotation={previewQuotation}
        settings={settings}
      />

      {/* 2. Approval & Conversion Modal (Handles Price Discrepancies & Stock Checks) */}
      <Modal
        isOpen={Boolean(approvingQuotation)}
        onClose={() => setApprovingQuotation(null)}
        title="Approve & Convert Quotation to Invoice"
        subtitle={approvingQuotation ? `Quotation ${approvingQuotation.quotation_number} for ${approvingQuotation.customer_name}` : ''}
        maxWidth="2xl"
      >
        {approvingQuotation && (
          <div className="space-y-5">
            {checkLoading ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                Analyzing inventory stock and checking catalog prices...
              </div>
            ) : (
              <>
                {conversionError && (
                  <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{conversionError}</span>
                  </div>
                )}

                {/* Edge Case 1: Price Discrepancy Prompt */}
                {conversionCheck?.has_price_changes && (
                  <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 space-y-3">
                    <div className="flex items-start gap-2.5 text-amber-900">
                      <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-black text-sm text-amber-950">Catalog Price Changes Detected</h4>
                        <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                          Prices for some products have changed in your catalog since this quotation was created. Please select which pricing to apply for this invoice:
                        </p>
                      </div>
                    </div>

                    {/* Price Diff Table */}
                    <div className="bg-white rounded-xl border border-amber-200 overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-amber-100/60 text-amber-900 uppercase font-bold text-[10px]">
                          <tr>
                            <th className="py-2 px-3 text-left">Product</th>
                            <th className="py-2 px-3 text-right">Quoted Price</th>
                            <th className="py-2 px-3 text-right">Current Price</th>
                            <th className="py-2 px-3 text-right">Change</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-amber-100">
                          {conversionCheck.items
                            .filter((it) => it.price_changed)
                            .map((it) => (
                              <tr key={it.product_id}>
                                <td className="py-2 px-3 font-semibold text-slate-800">{it.product_name}</td>
                                <td className="py-2 px-3 text-right font-medium text-slate-600">
                                  {formatCurrency(it.quoted_price, currency)}
                                </td>
                                <td className="py-2 px-3 text-right font-bold text-slate-900">
                                  {formatCurrency(it.current_price, currency)}
                                </td>
                                <td className={`py-2 px-3 text-right font-bold ${
                                  it.price_difference > 0 ? 'text-rose-600' : 'text-emerald-600'
                                }`}>
                                  {it.price_difference > 0 ? '+' : ''}{formatCurrency(it.price_difference, currency)}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Radio Options */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                      <label
                        className={`p-3 rounded-xl border cursor-pointer flex items-center gap-2.5 transition ${
                          priceMode === 'quoted'
                            ? 'bg-amber-100/70 border-amber-500 ring-2 ring-amber-500/20'
                            : 'bg-white border-amber-200 hover:bg-amber-50/50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="priceMode"
                          value="quoted"
                          checked={priceMode === 'quoted'}
                          onChange={() => setPriceMode('quoted')}
                          className="text-amber-600"
                        />
                        <div className="text-xs">
                          <span className="font-bold text-slate-900 block">Honor Quoted Price</span>
                          <span className="text-slate-500 text-[11px]">Charge {formatCurrency(approvingQuotation.total_amount, currency)}</span>
                        </div>
                      </label>

                      <label
                        className={`p-3 rounded-xl border cursor-pointer flex items-center gap-2.5 transition ${
                          priceMode === 'current'
                            ? 'bg-amber-100/70 border-amber-500 ring-2 ring-amber-500/20'
                            : 'bg-white border-amber-200 hover:bg-amber-50/50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="priceMode"
                          value="current"
                          checked={priceMode === 'current'}
                          onChange={() => setPriceMode('current')}
                          className="text-amber-600"
                        />
                        <div className="text-xs">
                          <span className="font-bold text-slate-900 block">Update to Current Cost</span>
                          <span className="text-slate-500 text-[11px]">Charge at latest catalog rates</span>
                        </div>
                      </label>
                    </div>
                  </div>
                )}

                {/* Edge Case 2: Stock Shortages */}
                {conversionCheck?.has_stock_shortages && (
                  <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 space-y-2">
                    <div className="flex items-center gap-2 font-bold text-sm">
                      <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                      <span>Stock Shortage Detected</span>
                    </div>
                    <p className="text-xs text-rose-700 leading-relaxed">
                      Some items do not have enough inventory on hand:
                    </p>
                    <ul className="text-xs font-semibold text-rose-800 list-disc list-inside space-y-0.5">
                      {conversionCheck.items
                        .filter((it) => it.has_stock_shortage)
                        .map((it) => (
                          <li key={it.product_id}>
                            {it.product_name}: Requires {it.quantity} units (only {it.current_stock} currently in stock)
                          </li>
                        ))}
                    </ul>
                  </div>
                )}

                {/* Conversion Financials & Payment */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Invoice Total Due
                    </span>
                    <span className="text-lg font-black text-slate-900">
                      {formatCurrency(calculatedApprovalTotal, currency)}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                        Payment Method
                      </label>
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value as any)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold text-slate-800 focus:outline-none focus:border-emerald-500"
                      >
                        <option value="Cash">Cash</option>
                        <option value="Card">Card</option>
                        <option value="Bank Transfer">Bank Transfer</option>
                        <option value="Online">Online</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                        Amount Paid Now
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={amountPaid}
                          onChange={(e) => {
                            setIsAmountPaidCustomized(true);
                            setAmountPaid(parseFloat(e.target.value) || 0);
                          }}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      {amountPaid < calculatedApprovalTotal && (
                        (!approvingQuotation?.customer_id || approvingQuotation?.customer_id === 1 || approvingQuotation?.customer_name?.toLowerCase().includes('walk-in') || approvingQuotation?.customer_name?.toLowerCase().includes('counter')) ? (
                          <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs mt-2 space-y-1">
                            <span className="font-bold flex items-center gap-1.5 text-rose-700 dark:text-rose-300">
                              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                              Counter Credit Not Allowed
                            </span>
                            <p className="text-[11px] leading-relaxed text-rose-600 dark:text-rose-400">
                              Walk-in / Counter customers cannot purchase on credit. Either collect the full amount ({formatCurrency(calculatedApprovalTotal, currency)}) or revise this quotation with a specific customer account before converting.
                            </p>
                          </div>
                        ) : (
                          <span className="text-[10px] text-amber-700 dark:text-amber-400 font-bold block mt-1">
                            Remaining Due: {formatCurrency(calculatedApprovalTotal - amountPaid, currency)} (Recorded to Customer Account)
                          </span>
                        )
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                      Invoice Notes (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Order confirmed via phone call"
                      value={conversionNotes}
                      onChange={(e) => setConversionNotes(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                {/* Modal Buttons */}
                <div className="flex justify-end gap-3 pt-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setApprovingQuotation(null)}
                    disabled={converting}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    icon={<CheckCircle2 className="h-4 w-4" />}
                    onClick={handleConfirmApproval}
                    loading={converting}
                    disabled={Boolean(conversionCheck?.has_stock_shortages) || (amountPaid < calculatedApprovalTotal && (!approvingQuotation?.customer_id || approvingQuotation?.customer_id === 1 || approvingQuotation?.customer_name?.toLowerCase().includes('walk-in') || approvingQuotation?.customer_name?.toLowerCase().includes('counter')))}
                    className="bg-emerald-600 hover:bg-emerald-700 font-bold shadow-md shadow-emerald-600/20"
                  >
                    Confirm & Create Invoice
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>

      {/* 3. Disapproval Modal */}
      <Modal
        isOpen={Boolean(rejectingQuotation)}
        onClose={() => setRejectingQuotation(null)}
        title="Disapprove Quotation"
        subtitle={rejectingQuotation ? `Quotation ${rejectingQuotation.quotation_number}` : ''}
        maxWidth="md"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            Are you sure you want to disapprove this quotation? This will mark the quotation offer as rejected.
          </p>

          <div>
            <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
              Reason for Rejection (Optional)
            </label>
            <textarea
              rows={3}
              placeholder="e.g. Customer decided not to proceed / Found cheaper supplier"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:outline-none focus:border-rose-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setRejectingQuotation(null)}
              disabled={rejecting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              icon={<X className="h-4 w-4" />}
              onClick={handleConfirmRejection}
              loading={rejecting}
              className="font-bold"
            >
              Confirm Disapproval
            </Button>
          </div>
        </div>
      </Modal>

      {/* 4. Converted Sale Thermal / PDF Invoice Modal */}
      <ReceiptModal
        isOpen={showReceiptModal}
        onClose={() => {
          setShowReceiptModal(false);
          setCompletedSale(null);
        }}
        sale={completedSale}
        settings={settings}
      />

      {/* 5. Agreement Revision Modal */}
      <ReviseQuotationModal
        isOpen={Boolean(revisingQuotation)}
        onClose={() => setRevisingQuotation(null)}
        quotation={revisingQuotation}
        settings={settings}
        onRevised={(newQ) => {
          setNotification({
            type: 'success',
            message: `Quotation ${revisingQuotation?.quotation_number} was superseded. New revised quotation ${newQ.quotation_number} has been created!`,
          });
          loadQuotations();
          setPreviewQuotation(newQ);
        }}
      />
    </div>
  );
};
