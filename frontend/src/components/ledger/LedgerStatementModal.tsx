import React, { useState, useMemo } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { CustomerLedgerEntry, SupplierLedgerEntry, BusinessSettings } from '../../types';
import {
  BookOpen,
  Printer,
  Download,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  Receipt,
  ShoppingBag,
  CreditCard,
  Building,
  Layers,
  List,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  ArrowRight,
} from 'lucide-react';
import { formatCurrency, formatDateTime } from '../../utils/format';
import { printElement } from '../../utils/print';

export interface LedgerStatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: 'customer' | 'supplier';
  entityId: string;
  entityName: string;
  entityPhone?: string;
  currentDue: number;
  currency: string;
  settings: BusinessSettings | null;
  entries: (CustomerLedgerEntry | SupplierLedgerEntry)[];
  loading: boolean;
}

interface BillGroup {
  billReference: string;
  type: string;
  date: string;
  billAmount: number;
  paidSoFar: number;
  remainingDue: number;
  status: 'PAID' | 'PARTIALLY_PAID' | 'UNPAID';
  events: (CustomerLedgerEntry | SupplierLedgerEntry)[];
}

export const LedgerStatementModal: React.FC<LedgerStatementModalProps> = ({
  isOpen,
  onClose,
  entityType,
  entityId,
  entityName,
  entityPhone,
  currentDue,
  currency,
  settings,
  entries,
  loading,
}) => {
  const [activeTab, setActiveTab] = useState<'by-bill' | 'timeline'>('by-bill');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [expandedBills, setExpandedBills] = useState<Record<string, boolean>>({});

  const isCustomer = entityType === 'customer';

  // 1. Calculate Aggregate Financial Totals
  const summary = useMemo(() => {
    let totalBilled = 0;
    let totalPaid = 0;

    entries.forEach((e) => {
      const debit = Number(e.debit) || 0;
      const credit = Number(e.credit) || 0;

      if (isCustomer) {
        totalBilled += debit;
        totalPaid += credit;
      } else {
        totalBilled += credit;
        totalPaid += debit;
      }
    });

    const netBalance = entries.length > 0 ? Number(entries[entries.length - 1].balance) : currentDue;

    return {
      totalBilled,
      totalPaid,
      netBalance,
    };
  }, [entries, isCustomer, currentDue]);

  // 2. Derive Bill-by-Bill Groups
  const billGroups = useMemo(() => {
    const groups: Record<string, BillGroup> = {};
    const unlinkedEvents: (CustomerLedgerEntry | SupplierLedgerEntry)[] = [];

    entries.forEach((entry) => {
      const billRef = entry.bill_reference || (entry.type === 'Sale' || entry.type === 'Purchase' ? entry.reference : null);

      if (billRef) {
        if (!groups[billRef]) {
          groups[billRef] = {
            billReference: billRef,
            type: entry.type === 'Purchase' ? 'Purchase' : 'Sale',
            date: entry.date,
            billAmount: Number(entry.bill_amount) || Number(entry.debit || entry.credit) || 0,
            paidSoFar: 0,
            remainingDue: Number(entry.bill_amount) || Number(entry.debit || entry.credit) || 0,
            status: 'UNPAID',
            events: [],
          };
        }
        groups[billRef].events.push(entry);

        if (entry.bill_amount != null && Number(entry.bill_amount) > 0) {
          groups[billRef].billAmount = Number(entry.bill_amount);
        }
        if (entry.bill_remaining != null) {
          groups[billRef].remainingDue = Number(entry.bill_remaining);
        }
      } else {
        unlinkedEvents.push(entry);
      }
    });

    // Compute status and total paid for each group
    const groupList: BillGroup[] = Object.values(groups).map((group) => {
      const remaining = Math.max(0, group.remainingDue);
      const paid = Math.max(0, group.billAmount - remaining);
      let status: 'PAID' | 'PARTIALLY_PAID' | 'UNPAID' = 'UNPAID';

      if (remaining <= 0.009) {
        status = 'PAID';
      } else if (paid > 0.009) {
        status = 'PARTIALLY_PAID';
      }

      return {
        ...group,
        remainingDue: remaining,
        paidSoFar: paid,
        status,
      };
    });

    // Sort bills: newest first
    groupList.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return {
      bills: groupList,
      unlinkedEvents,
    };
  }, [entries]);

  // Toggle bill collapse
  const toggleBillExpand = (billRef: string) => {
    setExpandedBills((prev) => ({
      ...prev,
      [billRef]: !prev[billRef],
    }));
  };

  // 3. Filter Transactions for Timeline View
  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      const matchesSearch =
        search.trim() === '' ||
        entry.reference.toLowerCase().includes(search.toLowerCase()) ||
        (entry.bill_reference && entry.bill_reference.toLowerCase().includes(search.toLowerCase())) ||
        entry.description.toLowerCase().includes(search.toLowerCase()) ||
        entry.type.toLowerCase().includes(search.toLowerCase());

      const matchesType =
        typeFilter === 'ALL' ||
        entry.type.toUpperCase() === typeFilter.toUpperCase();

      return matchesSearch && matchesType;
    });
  }, [entries, search, typeFilter]);

  // Filter bills for By-Bill View
  const filteredBills = useMemo(() => {
    if (!search.trim()) return billGroups.bills;
    const query = search.toLowerCase();
    return billGroups.bills.filter(
      (b) =>
        b.billReference.toLowerCase().includes(query) ||
        b.events.some((e) => e.description.toLowerCase().includes(query) || e.reference.toLowerCase().includes(query))
    );
  }, [billGroups.bills, search]);

  // 4. Balance interpretation helper
  const formatBalanceStatus = (bal: number) => {
    if (Math.abs(bal) < 0.009) {
      return {
        amount: formatCurrency(0, currency),
        label: 'All Settled',
        variant: 'settled',
        color: 'text-slate-600 dark:text-slate-300',
        badgeBg: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700',
      };
    }

    if (isCustomer) {
      if (bal > 0) {
        return {
          amount: formatCurrency(bal, currency),
          label: 'Due (Dr)',
          variant: 'due',
          color: 'text-amber-700 dark:text-amber-400',
          badgeBg: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800',
        };
      } else {
        return {
          amount: formatCurrency(Math.abs(bal), currency),
          label: 'Advance (Cr)',
          variant: 'advance',
          color: 'text-emerald-700 dark:text-emerald-400',
          badgeBg: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
        };
      }
    } else {
      if (bal > 0) {
        return {
          amount: formatCurrency(bal, currency),
          label: 'Payable (Cr)',
          variant: 'due',
          color: 'text-rose-700 dark:text-rose-400',
          badgeBg: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800',
        };
      } else {
        return {
          amount: formatCurrency(Math.abs(bal), currency),
          label: 'Overpaid (Dr)',
          variant: 'advance',
          color: 'text-blue-700 dark:text-blue-400',
          badgeBg: 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800',
        };
      }
    }
  };

  const currentStatus = formatBalanceStatus(summary.netBalance);

  // Print Statement Handler
  const handlePrintStatement = () => {
    printElement('printable-ledger-statement', {
      title: `${entityType === 'customer' ? 'Customer' : 'Supplier'}_Statement_${entityId}`,
      isThermal: false,
    });
  };

  // CSV Export Handler
  const handleExportCsv = () => {
    if (entries.length === 0) return;

    const headers = [
      'Date',
      'Time',
      'Type',
      'Payment Method',
      'Bill Reference',
      'Voucher / Ref',
      'Description',
      'Bill Amount',
      'Paid / Credit',
      'Bill Remaining',
      'Running Balance',
    ];

    const rows = entries.map((e) => {
      const d = new Date(e.date);
      const dateStr = d.toISOString().split('T')[0];
      const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const billAmt = e.bill_amount != null ? Number(e.bill_amount).toFixed(2) : '';
      const paidAmt = e.paid_amount != null ? Number(e.paid_amount).toFixed(2) : (Number(e.credit || e.debit) || 0).toFixed(2);
      const billRem = e.bill_remaining != null ? Number(e.bill_remaining).toFixed(2) : '';
      const bal = Number(e.balance) || 0;

      return [
        dateStr,
        timeStr,
        e.type,
        `"${(e.payment_method || '').replace(/"/g, '""')}"`,
        e.bill_reference || '',
        e.reference,
        `"${e.description.replace(/"/g, '""')}"`,
        billAmt,
        paidAmt,
        billRem,
        bal.toFixed(2),
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${entityType}_statement_${entityId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${isCustomer ? 'Customer' : 'Supplier'} Statement: ${entityName}`}
      subtitle={`Account ID: ${entityId}${entityPhone ? ` • Phone: ${entityPhone}` : ''}`}
      maxWidth="5xl"
    >
      <div className="space-y-4">
        {/* 1. Aggregate Financial KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Total Invoiced / Purchases */}
          <div className="bg-slate-50 dark:bg-slate-800/80 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 flex items-center justify-between shadow-2xs">
            <div>
              <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {isCustomer ? 'Total Invoiced' : 'Total Purchases'}
              </p>
              <p className="text-lg font-black text-slate-900 dark:text-white mt-0.5">
                {formatCurrency(summary.totalBilled, currency)}
              </p>
            </div>
            <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              {isCustomer ? <ShoppingBag className="h-5 w-5" /> : <Building className="h-5 w-5" />}
            </div>
          </div>

          {/* Total Payments / Paid */}
          <div className="bg-slate-50 dark:bg-slate-800/80 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 flex items-center justify-between shadow-2xs">
            <div>
              <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {isCustomer ? 'Total Paid / Credited' : 'Total Paid / Returned'}
              </p>
              <p className="text-lg font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                {formatCurrency(summary.totalPaid, currency)}
              </p>
            </div>
            <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <CreditCard className="h-5 w-5" />
            </div>
          </div>

          {/* Net Balance */}
          <div className={`p-3.5 rounded-2xl border flex items-center justify-between shadow-2xs ${
            currentStatus.variant === 'due'
              ? 'bg-amber-50/70 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800'
              : currentStatus.variant === 'advance'
              ? 'bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800'
              : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700'
          }`}>
            <div>
              <div className="flex items-center gap-1.5">
                <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Net Balance
                </p>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${currentStatus.badgeBg}`}>
                  {currentStatus.label}
                </span>
              </div>
              <p className={`text-lg font-black mt-0.5 ${currentStatus.color}`}>
                {currentStatus.amount}
              </p>
            </div>
            <div className="w-9 h-9 rounded-xl bg-slate-200/80 dark:bg-slate-700/80 text-slate-700 dark:text-slate-200 flex items-center justify-center shrink-0">
              <BookOpen className="h-5 w-5" />
            </div>
          </div>
        </div>

        {/* 2. Mode Selector (Tabs) & Controls Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1 border-b border-slate-200 dark:border-slate-800 pb-3">
          {/* Tab buttons */}
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('by-bill')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                activeTab === 'by-bill'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Layers className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" />
              <span>By Invoice / Bill</span>
              {billGroups.bills.length > 0 && (
                <span className="ml-1 text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold">
                  {billGroups.bills.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('timeline')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                activeTab === 'timeline'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <List className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" />
              <span>All Transactions</span>
              {entries.length > 0 && (
                <span className="ml-1 text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold">
                  {entries.length}
                </span>
              )}
            </button>
          </div>

          {/* Search, Type Filter & Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[180px] flex-1 sm:flex-initial">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search bill #, ref, notes..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-2.5 py-1.5 rounded-xl text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {activeTab === 'timeline' && (
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="py-1.5 px-2.5 rounded-xl text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="ALL">All Types</option>
                <option value="SALE">Sales</option>
                <option value="PURCHASE">Purchases</option>
                <option value="PAYMENT">Payments</option>
                <option value="RETURN">Returns</option>
              </select>
            )}

            <Button
              variant="outline"
              size="sm"
              icon={<Download className="h-3.5 w-3.5" />}
              onClick={handleExportCsv}
              disabled={entries.length === 0}
            >
              CSV
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<Printer className="h-3.5 w-3.5" />}
              onClick={handlePrintStatement}
              disabled={entries.length === 0}
            >
              Print Statement
            </Button>
          </div>
        </div>

        {/* 3. Main Content Views */}
        {loading ? (
          <div className="py-20 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs">Loading statement data...</span>
          </div>
        ) : entries.length === 0 ? (
          <div className="py-16 text-center text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-800/30 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
            <BookOpen className="h-9 w-9 text-slate-400 mx-auto mb-2 opacity-50" />
            <p className="font-semibold text-sm">No transaction records found.</p>
            <p className="text-xs text-slate-400 mt-0.5">Transactions and payments will appear here once recorded.</p>
          </div>
        ) : activeTab === 'by-bill' ? (
          /* ========================================================
             TAB 1: BY INVOICE / BILL (GROUPED VIEW)
             ======================================================== */
          <div className="space-y-3.5 max-h-[460px] overflow-y-auto pr-1">
            {filteredBills.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                No invoices match your search term.
              </div>
            ) : (
              filteredBills.map((bill) => {
                const isExpanded = expandedBills[bill.billReference] ?? true;
                const billDate = new Date(bill.date);

                return (
                  <div
                    key={bill.billReference}
                    className={`rounded-2xl border transition-all ${
                      bill.status === 'PAID'
                        ? 'border-slate-200 dark:border-slate-750 bg-white dark:bg-slate-900/90 shadow-2xs'
                        : bill.status === 'PARTIALLY_PAID'
                        ? 'border-amber-200 dark:border-amber-900/50 bg-amber-50/20 dark:bg-amber-950/10 shadow-xs'
                        : 'border-rose-200 dark:border-rose-900/50 bg-rose-50/20 dark:bg-rose-950/10 shadow-xs'
                    }`}
                  >
                    {/* Bill Card Header */}
                    <div
                      onClick={() => toggleBillExpand(bill.billReference)}
                      className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer hover:bg-slate-50/50 dark:hover:bg-slate-800/40 select-none rounded-2xl transition"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                            bill.status === 'PAID'
                              ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400'
                              : bill.status === 'PARTIALLY_PAID'
                              ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400'
                              : 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400'
                          }`}
                        >
                          <Receipt className="h-4.5 w-4.5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-black text-sm text-slate-900 dark:text-white">
                              {isCustomer ? 'Invoice' : 'Purchase Order'}: #{bill.billReference}
                            </span>
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-bold border flex items-center gap-1 ${
                                bill.status === 'PAID'
                                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                                  : bill.status === 'PARTIALLY_PAID'
                                  ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                                  : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                              }`}
                            >
                              {bill.status === 'PAID' ? (
                                <CheckCircle2 className="h-3 w-3" />
                              ) : bill.status === 'PARTIALLY_PAID' ? (
                                <Clock className="h-3 w-3" />
                              ) : (
                                <AlertCircle className="h-3 w-3" />
                              )}
                              {bill.status === 'PAID'
                                ? 'Fully Settled'
                                : bill.status === 'PARTIALLY_PAID'
                                ? 'Partially Paid'
                                : 'Unpaid'}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Billed on{' '}
                            {billDate.toLocaleDateString(undefined, {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}{' '}
                            • {billDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>

                      {/* 3 Metric Pills: Bill Total | Paid | Remaining */}
                      <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                        <div className="flex items-center gap-1.5 sm:gap-3 bg-white dark:bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-200/80 dark:border-slate-700/80 text-xs">
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                              Bill Total
                            </span>
                            <span className="font-black text-slate-800 dark:text-slate-100">
                              {formatCurrency(bill.billAmount, currency)}
                            </span>
                          </div>
                          <div className="w-[1px] h-6 bg-slate-200 dark:bg-slate-700" />
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                              Paid
                            </span>
                            <span className="font-black text-emerald-600 dark:text-emerald-400">
                              {formatCurrency(bill.paidSoFar, currency)}
                            </span>
                          </div>
                          <div className="w-[1px] h-6 bg-slate-200 dark:bg-slate-700" />
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                              Remaining
                            </span>
                            <span
                              className={`font-black ${
                                bill.remainingDue > 0
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : 'text-slate-400 dark:text-slate-500'
                              }`}
                            >
                              {formatCurrency(bill.remainingDue, currency)}
                            </span>
                          </div>
                        </div>

                        <div className="text-slate-400">
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </div>
                      </div>
                    </div>

                    {/* Progressive Payoff Table for this specific bill */}
                    {isExpanded && (
                      <div className="border-t border-slate-200 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/60 p-3 rounded-b-2xl">
                        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-100/80 dark:bg-slate-800 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                              <tr>
                                <th className="py-2 px-3">Date & Time</th>
                                <th className="py-2 px-3">Event / Transaction</th>
                                <th className="py-2 px-3">Voucher / Ref</th>
                                <th className="py-2 px-3 text-right">Bill Total</th>
                                <th className="py-2 px-3 text-right">Amount Paid</th>
                                <th className="py-2 px-3 text-right">Bill Remaining</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                              {bill.events.map((ev, evIdx) => {
                                const evDate = new Date(ev.date);
                                const isInvoice = ev.type === 'Sale' || ev.type === 'Purchase';
                                const paidVal = ev.paid_amount != null ? Number(ev.paid_amount) : Number(ev.credit || ev.debit) || 0;
                                const remVal = ev.bill_remaining != null ? Number(ev.bill_remaining) : 0;

                                return (
                                  <tr
                                    key={evIdx}
                                    className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition ${
                                      isInvoice ? 'bg-slate-50/30 dark:bg-slate-800/20' : ''
                                    }`}
                                  >
                                    <td className="py-2 px-3 whitespace-nowrap text-slate-600 dark:text-slate-300">
                                      {evDate.toLocaleDateString(undefined, {
                                        month: 'short',
                                        day: 'numeric',
                                        year: 'numeric',
                                      })}{' '}
                                      <span className="text-[10px] text-slate-400">
                                        {evDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                      </span>
                                    </td>
                                    <td className="py-2 px-3 font-medium text-slate-800 dark:text-slate-200">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span
                                          className={`inline-block px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                            isInvoice
                                              ? 'bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300'
                                              : ev.type.toLowerCase() === 'payment'
                                              ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300'
                                              : 'bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300'
                                          }`}
                                        >
                                          {ev.type}
                                        </span>
                                        <span>{ev.description}</span>
                                        {ev.payment_method && (
                                          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                            <CreditCard className="w-2.5 h-2.5 text-slate-400" />
                                            {ev.payment_method}
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                    <td className="py-2 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                                      {ev.reference}
                                    </td>
                                    <td className="py-2 px-3 text-right font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                                      {formatCurrency(bill.billAmount, currency)}
                                    </td>
                                    <td className="py-2 px-3 text-right font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                                      <div>{isInvoice && paidVal === 0 ? '—' : formatCurrency(paidVal, currency)}</div>
                                      {ev.payment_method && paidVal > 0 && (
                                        <div className="text-[10px] font-normal text-slate-400 dark:text-slate-500">
                                          via {ev.payment_method}
                                        </div>
                                      )}
                                    </td>
                                    <td className="py-2 px-3 text-right font-bold whitespace-nowrap">
                                      <span
                                        className={
                                          remVal === 0
                                            ? 'text-emerald-600 dark:text-emerald-400 font-black'
                                            : 'text-rose-600 dark:text-rose-400 font-black'
                                        }
                                      >
                                        {formatCurrency(remVal, currency)}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {/* Standalone / Unlinked events (Advances or general credits) */}
            {billGroups.unlinkedEvents.length > 0 && (
              <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
                <div className="flex items-center gap-2 mb-2 font-bold text-xs text-slate-700 dark:text-slate-300">
                  <CreditCard className="h-4 w-4 text-emerald-600" />
                  <span>Advance Payments & General Credits (Unallocated)</span>
                </div>
                <div className="space-y-1.5">
                  {billGroups.unlinkedEvents.map((ev, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between text-xs py-1.5 px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-slate-500">{ev.reference}</span>
                        <span className="text-slate-700 dark:text-slate-300">{ev.description}</span>
                        {ev.payment_method && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                            <CreditCard className="w-2.5 h-2.5 text-slate-400" />
                            {ev.payment_method}
                          </span>
                        )}
                      </div>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(Number(ev.credit || ev.debit) || 0, currency)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ========================================================
             TAB 2: ALL TRANSACTIONS (TIMELINE STATEMENT VIEW)
             ======================================================== */
          <div className="overflow-x-auto max-h-[460px] overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xs">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider shadow-xs">
                <tr>
                  <th className="py-2.5 px-3 whitespace-nowrap">Date & Time</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Bill / Ref</th>
                  <th className="py-2.5 px-3 min-w-[160px]">Description</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Bill Total</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Paid / Settled</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Bill Remaining</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">
                    {isCustomer ? 'Net Account Balance' : 'Net Payable'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                {filteredEntries.map((entry, idx) => {
                  const entryDate = new Date(entry.date);
                  const isRecent = idx === filteredEntries.length - 1;
                  const balNum = Number(entry.balance) || 0;
                  const balStatus = formatBalanceStatus(balNum);
                  const isInvoice = entry.type === 'Sale' || entry.type === 'Purchase';

                  const billAmt = entry.bill_amount != null ? Number(entry.bill_amount) : null;
                  const paidAmt =
                    entry.paid_amount != null
                      ? Number(entry.paid_amount)
                      : Number(isCustomer ? entry.credit : entry.debit) || 0;
                  const billRem = entry.bill_remaining != null ? Number(entry.bill_remaining) : null;

                  return (
                    <tr
                      key={idx}
                      className={`hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors ${
                        isRecent ? 'bg-emerald-50/20 dark:bg-emerald-950/10' : ''
                      }`}
                    >
                      {/* Date & Time */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="font-semibold text-slate-800 dark:text-slate-200">
                          {entryDate.toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {entryDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>

                      {/* Bill / Ref */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="flex flex-col gap-0.5">
                          {entry.bill_reference && (
                            <span className="inline-flex items-center gap-1 font-mono font-bold text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-950/40 px-1.5 py-0.5 rounded text-[11px] border border-brand-200/60 dark:border-brand-800/60 w-fit">
                              <Receipt className="h-3 w-3" />
                              {entry.bill_reference}
                            </span>
                          )}
                          <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                            {entry.reference !== entry.bill_reference ? entry.reference : ''}
                          </span>
                        </div>
                      </td>

                      {/* Description */}
                      <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`inline-block px-1.5 py-0.2 rounded text-[10px] font-bold shrink-0 ${
                              isInvoice
                                ? 'bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300'
                                : entry.type.toLowerCase() === 'payment'
                                ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300'
                                : 'bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300'
                            }`}
                          >
                            {entry.type}
                          </span>
                          <span className="truncate max-w-[240px]">{entry.description}</span>
                          {entry.payment_method && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shrink-0">
                              <CreditCard className="w-2.5 h-2.5 text-slate-400" />
                              {entry.payment_method}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Bill Total */}
                      <td className="py-2.5 px-3 text-right font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">
                        {billAmt != null ? formatCurrency(billAmt, currency) : '—'}
                      </td>

                      {/* Paid / Settled */}
                      <td className="py-2.5 px-3 text-right font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                        <div>{paidAmt > 0 ? formatCurrency(paidAmt, currency) : '—'}</div>
                        {entry.payment_method && paidAmt > 0 && (
                          <div className="text-[10px] font-normal text-slate-400 dark:text-slate-500">
                            via {entry.payment_method}
                          </div>
                        )}
                      </td>

                      {/* Bill Remaining */}
                      <td className="py-2.5 px-3 text-right font-bold whitespace-nowrap">
                        {billRem != null ? (
                          <span
                            className={
                              billRem === 0
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-rose-600 dark:text-rose-400'
                            }
                          >
                            {formatCurrency(billRem, currency)}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>

                      {/* Net Account Balance */}
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <span className={`font-black ${balStatus.color}`}>{balStatus.amount}</span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold border ${balStatus.badgeBg}`}>
                            {balStatus.label}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 4. Footer info */}
        <div className="flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-400 pt-1 gap-2">
          <span>
            {activeTab === 'by-bill'
              ? `Showing ${filteredBills.length} invoices / bills with individual payment histories`
              : `Showing ${filteredEntries.length} chronological ledger events`}
          </span>
          <span className="italic">
            Bill-by-bill accounting tracks every progressive payment from checkout downpayment to full settlement
          </span>
        </div>
      </div>

      {/* 5. Printable A4 Document Template */}
      <div id="printable-ledger-statement" className="hidden print:block p-8 bg-white text-black font-sans">
        <div className="border-b-2 border-slate-900 pb-4 mb-6 flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">
              {settings?.business_name || 'Business Account Statement'}
            </h1>
            <p className="text-xs text-slate-600 mt-1">{settings?.address}</p>
            <p className="text-xs text-slate-600">Phone: {settings?.phone}</p>
          </div>
          <div className="text-right">
            <span className="inline-block px-3 py-1 bg-slate-900 text-white text-xs font-black uppercase tracking-wider rounded">
              {isCustomer ? 'Customer Statement' : 'Supplier Statement'}
            </span>
            <p className="text-xs text-slate-500 mt-2 font-mono">Date: {new Date().toLocaleDateString()}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-slate-50 border border-slate-200 mb-6 text-xs">
          <div>
            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider block">Account Party:</span>
            <p className="font-bold text-slate-900 text-sm">{entityName}</p>
            <p className="text-slate-600">ID: {entityId}</p>
            {entityPhone && <p className="text-slate-600">Phone: {entityPhone}</p>}
          </div>
          <div className="text-right flex flex-col justify-center">
            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider block">Net Balance:</span>
            <p className="text-xl font-black text-slate-900">
              {currentStatus.amount} ({currentStatus.label})
            </p>
          </div>
        </div>

        <div className="flex justify-between items-center px-4 py-2 bg-slate-100 rounded mb-4 text-xs font-bold">
          <span>{isCustomer ? 'Total Invoiced:' : 'Total Purchases:'} {formatCurrency(summary.totalBilled, currency)}</span>
          <span>Total Paid / Settled: {formatCurrency(summary.totalPaid, currency)}</span>
          <span>Closing Balance: {currentStatus.amount}</span>
        </div>

        <table className="w-full text-left text-xs border border-slate-300 mb-6">
          <thead className="bg-slate-200 text-slate-800 font-bold border-b border-slate-300">
            <tr>
              <th className="py-2 px-3">Date</th>
              <th className="py-2 px-3">Bill Ref</th>
              <th className="py-2 px-3">Voucher</th>
              <th className="py-2 px-3">Description</th>
              <th className="py-2 px-3">Method</th>
              <th className="py-2 px-3 text-right">Bill Total</th>
              <th className="py-2 px-3 text-right">Paid</th>
              <th className="py-2 px-3 text-right">Bill Remaining</th>
              <th className="py-2 px-3 text-right">Net Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {entries.map((entry, idx) => {
              const d = new Date(entry.date);
              const billAmt = entry.bill_amount != null ? formatCurrency(Number(entry.bill_amount), currency) : '—';
              const paidAmt =
                entry.paid_amount != null
                  ? formatCurrency(Number(entry.paid_amount), currency)
                  : formatCurrency(Number(isCustomer ? entry.credit : entry.debit) || 0, currency);
              const billRem =
                entry.bill_remaining != null ? formatCurrency(Number(entry.bill_remaining), currency) : '—';
              const balNum = Number(entry.balance) || 0;
              const balStatus = formatBalanceStatus(balNum);

              return (
                <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  <td className="py-2 px-3 whitespace-nowrap">{d.toLocaleDateString()}</td>
                  <td className="py-2 px-3 font-mono font-bold">{entry.bill_reference || '—'}</td>
                  <td className="py-2 px-3 font-mono">{entry.reference}</td>
                  <td className="py-2 px-3">{entry.description}</td>
                  <td className="py-2 px-3 font-semibold text-slate-700">{entry.payment_method || '—'}</td>
                  <td className="py-2 px-3 text-right">{billAmt}</td>
                  <td className="py-2 px-3 text-right font-medium">{paidAmt}</td>
                  <td className="py-2 px-3 text-right font-bold">{billRem}</td>
                  <td className="py-2 px-3 text-right font-bold">
                    {balStatus.amount} ({balStatus.label})
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="pt-6 border-t border-slate-300 flex justify-between text-[11px] text-slate-500">
          <span>Generated by StokFlow Accounting & Inventory</span>
          <span>Authorized Signature: __________________________</span>
        </div>
      </div>
    </Modal>
  );
};
