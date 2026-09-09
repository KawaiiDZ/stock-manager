import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../services/api';
import { BusinessSettings } from '../../types';
import {
  BarChart3,
  Printer,
  Download,
  Calendar,
  DollarSign,
  ShoppingBag,
  TrendingUp,
  Package,
  ArrowDownRight,
  AlertCircle,
  RotateCcw,
  CheckCircle2,
  Users,
  Building2,
  FileText,
  CreditCard,
} from 'lucide-react';
import { Button } from '../../components/common/Button';
import { DateFilter, formatLocalDate } from '../../components/common/DateFilter';
import { formatCurrency, formatMoney, formatDateTime } from '../../utils/format';

interface ReportsPageProps {
  settings: BusinessSettings | null;
}

type ReportTab =
  | 'sales'
  | 'sales_detail'
  | 'purchases'
  | 'inventory'
  | 'movements'
  | 'customers'
  | 'suppliers'
  | 'bills'
  | 'expenses';

export const ReportsPage: React.FC<ReportsPageProps> = ({ settings }) => {
  const [activeTab, setActiveTab] = useState<ReportTab>('sales');
  const [reportData, setReportData] = useState<any[]>([]);
  const [startDate, setStartDate] = useState<string | undefined>();
  const [endDate, setEndDate] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  const currency = settings?.currency || 'Rs.';
  const shopName = settings?.business_name || 'My Business';
  const shopAddress = settings?.address || '';
  const shopPhone = settings?.phone || '';
  const hasLetterhead = Boolean(settings?.show_letterhead && settings?.receipt_letterhead_path);
  const hideHeaderText = Boolean(hasLetterhead && settings?.hide_header_text_with_letterhead);

  const loadReport = async () => {
    setLoading(true);
    try {
      let data: any[] = [];
      if (activeTab === 'sales') {
        data = await api.getSalesReport(startDate, endDate);
      } else if (activeTab === 'sales_detail') {
        data = await api.getSalesDetailReport(startDate, endDate);
      } else if (activeTab === 'purchases') {
        data = await api.getPurchasesReport(startDate, endDate);
      } else if (activeTab === 'inventory') {
        data = await api.getInventoryReport();
      } else if (activeTab === 'movements') {
        data = await api.getStockMovementsReport(undefined, startDate, endDate);
      } else if (activeTab === 'customers') {
        data = await api.getCustomersReport();
      } else if (activeTab === 'suppliers') {
        data = await api.getSuppliersReport();
      } else if (activeTab === 'bills') {
        data = await api.getBillsReport();
      } else if (activeTab === 'expenses') {
        data = await api.getExpensesReport(startDate, endDate);
      }
      setReportData(data || []);
    } catch (err) {
      console.error('Failed to load report:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, [activeTab, startDate, endDate]);

  const reportTabs: { id: ReportTab; label: string; cleanName: string }[] = [
    { id: 'sales', label: '1. Sales Summary', cleanName: 'Sales Summary Report' },
    { id: 'sales_detail', label: '2. Sales Detail (Gross Profit)', cleanName: 'Sales Detail Report' },
    { id: 'purchases', label: '3. Purchases', cleanName: 'Purchases Report' },
    { id: 'inventory', label: '4. Inventory Valuation', cleanName: 'Inventory Valuation Report' },
    { id: 'movements', label: '5. Stock Movements', cleanName: 'Stock Movements Report' },
    { id: 'customers', label: '6. Customer Dues', cleanName: 'Customer Ledger & Dues Report' },
    { id: 'suppliers', label: '7. Supplier Dues', cleanName: 'Supplier Ledger & Dues Report' },
    { id: 'bills', label: '8. Bills Ledger', cleanName: 'Bills & Liabilities Report' },
    { id: 'expenses', label: '9. Expenses', cleanName: 'Operating Expenses Report' },
  ];

  const activeTabObj = reportTabs.find((t) => t.id === activeTab);
  const currentReportName = activeTabObj?.cleanName || 'Business Report';

  const handleExportCSV = () => {
    if (!reportData || reportData.length === 0) return;
    const keys = Object.keys(reportData[0]);
    const csvContent = [
      keys.join(','),
      ...reportData.map((row) =>
        keys
          .map((k) => {
            const val = row[k] === null || row[k] === undefined ? '' : String(row[k]);
            return `"${val.replace(/"/g, '""')}"`;
          })
          .join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${currentReportName.replace(/\s+/g, '_')}_${formatLocalDate(new Date())}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    const originalTitle = document.title;
    const dateStr = formatLocalDate(new Date());
    document.title = `${currentReportName} - ${dateStr}`;
    window.print();
    setTimeout(() => {
      document.title = originalTitle;
    }, 1200);
  };

  // Calculations for Grand Totals and KPI Metrics per report
  const summaryMetrics = useMemo(() => {
    if (!reportData || reportData.length === 0) return null;

    if (activeTab === 'sales') {
      let totalAmount = 0;
      let paidAmount = 0;
      let dueAmount = 0;
      let invoicedProfit = 0;
      let realizedProfit = 0;

      for (const r of reportData) {
        totalAmount += Number(r.total_amount || 0);
        paidAmount += Number(r.paid_amount || 0);
        dueAmount += Number(r.due_amount || 0);
        invoicedProfit += Number(r.gross_profit || 0);
        realizedProfit += Number(r.realized_profit || 0);
      }

      return {
        count: reportData.length,
        totalAmount,
        paidAmount,
        dueAmount,
        invoicedProfit,
        realizedProfit,
      };
    }

    if (activeTab === 'sales_detail') {
      let totalQty = 0;
      let revenue = 0;
      let totalCost = 0;
      let invoicedProfit = 0;
      let realizedProfit = 0;

      for (const r of reportData) {
        totalQty += Number(r.quantity || 0);
        revenue += Number(r.total_price || 0);
        totalCost += Number(r.total_cost || 0);
        invoicedProfit += Number(r.gross_profit || 0);
        realizedProfit += Number(r.realized_profit || 0);
      }

      return {
        count: reportData.length,
        totalQty,
        revenue,
        totalCost,
        invoicedProfit,
        realizedProfit,
      };
    }

    if (activeTab === 'purchases') {
      let totalCost = 0;
      let paid = 0;
      let due = 0;

      for (const r of reportData) {
        totalCost += Number(r.total_amount || 0);
        paid += Number(r.paid_amount || 0);
        due += Number(r.due_amount || 0);
      }

      return {
        count: reportData.length,
        totalCost,
        paid,
        due,
      };
    }

    if (activeTab === 'inventory') {
      let totalStock = 0;
      let totalValueCost = 0;
      let totalValueRetail = 0;

      for (const r of reportData) {
        totalStock += Number(r.current_stock || 0);
        totalValueCost += Number(r.stock_value_cost || 0);
        totalValueRetail += Number(r.stock_value_retail || 0);
      }

      return {
        count: reportData.length,
        totalStock,
        totalValueCost,
        totalValueRetail,
        potentialProfit: totalValueRetail - totalValueCost,
      };
    }

    if (activeTab === 'movements') {
      let netQty = 0;
      let inflows = 0;
      let outflows = 0;

      for (const r of reportData) {
        const q = Number(r.quantity || 0);
        netQty += q;
        if (q > 0) inflows += q;
        else outflows += Math.abs(q);
      }

      return {
        count: reportData.length,
        netQty,
        inflows,
        outflows,
      };
    }

    if (activeTab === 'customers') {
      let purchases = 0;
      let payments = 0;
      let returns = 0;
      let dues = 0;

      for (const r of reportData) {
        purchases += Number(r.total_purchases || 0);
        payments += Number(r.total_payments || 0);
        returns += Number(r.total_returns || 0);
        dues += Number(r.current_due || 0);
      }

      return {
        count: reportData.length,
        purchases,
        payments,
        returns,
        dues,
      };
    }

    if (activeTab === 'suppliers') {
      let purchases = 0;
      let payments = 0;
      let returns = 0;
      let dues = 0;

      for (const r of reportData) {
        purchases += Number(r.total_purchases || 0);
        payments += Number(r.total_payments || 0);
        returns += Number(r.total_returns || 0);
        dues += Number(r.current_due || 0);
      }

      return {
        count: reportData.length,
        purchases,
        payments,
        returns,
        dues,
      };
    }

    if (activeTab === 'bills') {
      let amount = 0;
      let paid = 0;
      let due = 0;

      for (const r of reportData) {
        amount += Number(r.amount || 0);
        paid += Number(r.paid_amount || 0);
        due += Number(r.due_amount || 0);
      }

      return {
        count: reportData.length,
        amount,
        paid,
        due,
      };
    }

    if (activeTab === 'expenses') {
      let totalAmount = 0;

      for (const r of reportData) {
        totalAmount += Number(r.amount || 0);
      }

      return {
        count: reportData.length,
        totalAmount,
      };
    }

    return null;
  }, [reportData, activeTab]);

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header Controls (Hidden on Print) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">Business Reports</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Corporate financial analytics, profit margins, inventory valuation, and ledgers in A4 print-ready layout
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="md"
            icon={<Download className="h-4 w-4" />}
            onClick={handleExportCSV}
            disabled={reportData.length === 0}
          >
            Export CSV
          </Button>

          <Button
            variant="primary"
            size="md"
            icon={<Printer className="h-4 w-4" />}
            onClick={handlePrint}
          >
            Print / Save as PDF
          </Button>
        </div>
      </div>

      {/* Tabs Navigation (Hidden on Print) */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 border-b border-slate-200 no-print">
        {reportTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition ${
              activeTab === tab.id
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Date Filter Bar where applicable (Hidden on Print) */}
      {['sales', 'sales_detail', 'purchases', 'movements', 'expenses'].includes(activeTab) && (
        <div className="flex flex-wrap items-center justify-between gap-3 no-print">
          <DateFilter
            onFilterChange={(start, end) => {
              setStartDate(start);
              setEndDate(end);
            }}
          />
          <div className="text-xs text-slate-500 font-semibold">
            {reportData.length} records found
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* Printable Corporate A4 Document (Formatted Identically to A4 Receipts) */}
      {/* ========================================================================= */}
      <div
        id="printable-pdf-receipt"
        className="bg-white text-slate-800 font-sans text-xs p-6 sm:p-8 max-w-[220mm] min-h-[285mm] mx-auto shadow-sm border border-slate-200 rounded-2xl print:border-none print:shadow-none print:p-0 print:m-0 print:max-w-none flex flex-col justify-between"
        style={{ boxSizing: 'border-box' }}
      >
        <div className="pdf-content-body flex-1">
          {/* 1. Custom Letterhead Stationary Banner (if uploaded and enabled) */}
          {hasLetterhead && settings?.receipt_letterhead_path && (
            <div className="mb-4 text-center border-b border-slate-200 pb-3 print-avoid-break">
              <img
                src={settings.receipt_letterhead_path}
                alt="Business Letterhead"
                className="w-full max-h-36 object-contain mx-auto"
              />
            </div>
          )}

          {/* 2. Top Header & Document Metadata (Unless suppressed by pre-printed letterhead) */}
          {!hideHeaderText && (
            <div className="flex justify-between items-start pb-5 border-b-2 border-slate-800 print-avoid-break">
              {/* Business branding */}
              <div className="flex gap-4 items-start max-w-[60%]">
                {!hasLetterhead && (
                  <img
                    src={settings?.receipt_logo_path || settings?.logo_path || '/stokflow-receipt.png'}
                    alt="Logo"
                    className="h-16 w-auto max-w-[120px] object-contain"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                )}
                <div>
                  <h1 className="text-xl font-black text-slate-900 tracking-tight uppercase">
                    {shopName}
                  </h1>
                  {shopAddress && <p className="text-slate-600 mt-0.5 leading-relaxed text-xs">{shopAddress}</p>}
                  {shopPhone && <p className="text-slate-600 font-medium text-xs">Phone: {shopPhone}</p>}
                  {settings?.receipt_header && (
                    <p className="text-slate-500 italic text-[11px] mt-1">{settings.receipt_header}</p>
                  )}
                </div>
              </div>

              {/* Document Meta */}
              <div className="text-right space-y-1">
                <div className="text-xl font-black text-slate-900 tracking-tight uppercase">
                  {currentReportName}
                </div>
                <div className="text-slate-600 text-xs font-semibold">
                  {startDate && endDate
                    ? `Period: ${startDate} to ${endDate}`
                    : startDate
                    ? `From: ${startDate}`
                    : endDate
                    ? `To: ${endDate}`
                    : 'Period: All Time Records'}
                </div>
                <div className="text-slate-400 text-[10px]">
                  Generated: {formatDateTime(new Date(), settings?.date_format)}
                </div>
                <div className="pt-1">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                    {reportData.length} Total Records
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* 2B. Compact Header when Pre-printed Letterhead suppresses text */}
          {hideHeaderText && (
            <div className="flex justify-between items-center pb-3 mb-4 border-b border-slate-200 print-avoid-break">
              <div className="text-lg font-black text-slate-900 uppercase tracking-tight">
                {currentReportName}
              </div>
              <div className="text-right flex items-center gap-4 text-xs">
                <span className="text-slate-600 font-semibold">
                  {startDate && endDate
                    ? `Period: ${startDate} to ${endDate}`
                    : startDate
                    ? `From: ${startDate}`
                    : endDate
                    ? `To: ${endDate}`
                    : 'Period: All Time Records'}
                </span>
                <span className="text-slate-400 text-[10px]">
                  {formatDateTime(new Date(), settings?.date_format)}
                </span>
              </div>
            </div>
          )}

          {/* 3. Executive KPI Summary Card Bar */}
          {summaryMetrics && (
            <div className="my-4 p-4 bg-slate-50 border border-slate-200 rounded-xl print-avoid-break">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                Executive Financial Summary
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* Sales Summary KPI */}
                {activeTab === 'sales' && (
                  <>
                    <div>
                      <div className="text-[10px] text-slate-500 font-medium">Invoiced Revenue</div>
                      <div className="text-sm font-black text-slate-900">
                        {formatCurrency(summaryMetrics.totalAmount, currency)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 font-medium">Collected Cash</div>
                      <div className="text-sm font-black text-emerald-700">
                        {formatCurrency(summaryMetrics.paidAmount, currency)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 font-medium">Customer Due</div>
                      <div className="text-sm font-black text-rose-700">
                        {formatCurrency(summaryMetrics.dueAmount, currency)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 font-medium">Realized Profit</div>
                      <div className="text-sm font-black text-emerald-800">
                        {formatCurrency(summaryMetrics.realizedProfit, currency)}
                      </div>
                    </div>
                  </>
                )}

                {/* Sales Detail KPI */}
                {activeTab === 'sales_detail' && (
                  <>
                    <div>
                      <div className="text-[10px] text-slate-500 font-medium">Total Units Sold</div>
                      <div className="text-sm font-black text-slate-900">{summaryMetrics.totalQty} Units</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 font-medium">Total Revenue</div>
                      <div className="text-sm font-black text-slate-900">
                        {formatCurrency(summaryMetrics.revenue, currency)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 font-medium">Total FIFO Cost</div>
                      <div className="text-sm font-black text-slate-600">
                        {formatCurrency(summaryMetrics.totalCost, currency)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 font-medium">Total Gross Profit</div>
                      <div className="text-sm font-black text-emerald-800">
                        {formatCurrency(summaryMetrics.invoicedProfit, currency)}
                      </div>
                    </div>
                  </>
                )}

                {/* Purchases KPI */}
                {activeTab === 'purchases' && (
                  <>
                    <div>
                      <div className="text-[10px] text-slate-500 font-medium">Purchases Count</div>
                      <div className="text-sm font-black text-slate-900">{summaryMetrics.count} Orders</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 font-medium">Total Purchase Cost</div>
                      <div className="text-sm font-black text-slate-900">
                        {formatCurrency(summaryMetrics.totalCost, currency)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 font-medium">Paid to Suppliers</div>
                      <div className="text-sm font-black text-emerald-700">
                        {formatCurrency(summaryMetrics.paid, currency)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 font-medium">Outstanding Payables</div>
                      <div className="text-sm font-black text-rose-700">
                        {formatCurrency(summaryMetrics.due, currency)}
                      </div>
                    </div>
                  </>
                )}

                {/* Inventory Valuation KPI */}
                {activeTab === 'inventory' && (
                  <>
                    <div>
                      <div className="text-[10px] text-slate-500 font-medium">Total Physical Units</div>
                      <div className="text-sm font-black text-slate-900">{summaryMetrics.totalStock} Units</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 font-medium">Valuation at Cost</div>
                      <div className="text-sm font-black text-slate-900">
                        {formatCurrency(summaryMetrics.totalValueCost, currency)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 font-medium">Valuation at Retail</div>
                      <div className="text-sm font-black text-emerald-700">
                        {formatCurrency(summaryMetrics.totalValueRetail, currency)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 font-medium">Gross Profit Potential</div>
                      <div className="text-sm font-black text-emerald-800">
                        {formatCurrency(summaryMetrics.potentialProfit, currency)}
                      </div>
                    </div>
                  </>
                )}

                {/* Stock Movements KPI */}
                {activeTab === 'movements' && (
                  <>
                    <div>
                      <div className="text-[10px] text-slate-500 font-medium">Movement Events</div>
                      <div className="text-sm font-black text-slate-900">{summaryMetrics.count} Logs</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 font-medium">Inflows Received</div>
                      <div className="text-sm font-black text-emerald-700">+{summaryMetrics.inflows} Units</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 font-medium">Outflows Deducted</div>
                      <div className="text-sm font-black text-rose-700">-{summaryMetrics.outflows} Units</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 font-medium">Net Delta</div>
                      <div className="text-sm font-black text-slate-900">{summaryMetrics.netQty} Units</div>
                    </div>
                  </>
                )}

                {/* Customer Dues KPI */}
                {activeTab === 'customers' && (
                  <>
                    <div>
                      <div className="text-[10px] text-slate-500 font-medium">Total Customers</div>
                      <div className="text-sm font-black text-slate-900">{summaryMetrics.count} Accounts</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 font-medium">Total Billed</div>
                      <div className="text-sm font-black text-slate-900">
                        {formatCurrency(summaryMetrics.purchases, currency)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 font-medium">Total Payments Received</div>
                      <div className="text-sm font-black text-emerald-700">
                        {formatCurrency(summaryMetrics.payments, currency)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 font-medium">Current Receivables Due</div>
                      <div className="text-sm font-black text-rose-700">
                        {formatCurrency(summaryMetrics.dues, currency)}
                      </div>
                    </div>
                  </>
                )}

                {/* Supplier Dues KPI */}
                {activeTab === 'suppliers' && (
                  <>
                    <div>
                      <div className="text-[10px] text-slate-500 font-medium">Total Suppliers</div>
                      <div className="text-sm font-black text-slate-900">{summaryMetrics.count} Vendors</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 font-medium">Total Procured</div>
                      <div className="text-sm font-black text-slate-900">
                        {formatCurrency(summaryMetrics.purchases, currency)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 font-medium">Total Payments Made</div>
                      <div className="text-sm font-black text-emerald-700">
                        {formatCurrency(summaryMetrics.payments, currency)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 font-medium">Current Payables Due</div>
                      <div className="text-sm font-black text-rose-700">
                        {formatCurrency(summaryMetrics.dues, currency)}
                      </div>
                    </div>
                  </>
                )}

                {/* Bills KPI */}
                {activeTab === 'bills' && (
                  <>
                    <div>
                      <div className="text-[10px] text-slate-500 font-medium">Total Invoices</div>
                      <div className="text-sm font-black text-slate-900">{summaryMetrics.count} Bills</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 font-medium">Total Billed</div>
                      <div className="text-sm font-black text-slate-900">
                        {formatCurrency(summaryMetrics.amount, currency)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 font-medium">Total Settled</div>
                      <div className="text-sm font-black text-emerald-700">
                        {formatCurrency(summaryMetrics.paid, currency)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 font-medium">Outstanding Liabilities</div>
                      <div className="text-sm font-black text-rose-700">
                        {formatCurrency(summaryMetrics.due, currency)}
                      </div>
                    </div>
                  </>
                )}

                {/* Expenses KPI */}
                {activeTab === 'expenses' && (
                  <>
                    <div>
                      <div className="text-[10px] text-slate-500 font-medium">Expense Entries</div>
                      <div className="text-sm font-black text-slate-900">{summaryMetrics.count} Records</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 font-medium">Total Operating Outlay</div>
                      <div className="text-sm font-black text-rose-700">
                        {formatCurrency(summaryMetrics.totalAmount, currency)}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* 4. Report Data Tables with Grand Totals */}
          {loading ? (
            <div className="py-24 text-center text-slate-400 font-medium">
              Generating {currentReportName}...
            </div>
          ) : reportData.length === 0 ? (
            <div className="py-24 text-center text-slate-400 font-medium">
              No transactions found for {currentReportName} within the selected period.
            </div>
          ) : (
            <div className="overflow-x-auto my-3">
              {/* Report 1: Sales Summary */}
              {activeTab === 'sales' && (
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 border-y border-slate-300 text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3">Receipt #</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Customer</th>
                      <th className="py-2.5 px-3 text-right">Total Amount</th>
                      <th className="py-2.5 px-3 text-right">Paid</th>
                      <th className="py-2.5 px-3 text-right">Due</th>
                      <th className="py-2.5 px-3 text-right">Invoiced Profit</th>
                      <th className="py-2.5 px-3 text-right">Realized Profit</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {reportData.map((row, i) => {
                      const dueNum = Number(row.due_amount || 0);
                      return (
                        <tr key={i} className="hover:bg-slate-50/70">
                          <td className="py-2.5 px-3 font-bold text-slate-900">{row.receipt_number}</td>
                          <td className="py-2.5 px-3 text-slate-500">
                            {formatDateTime(row.date, settings?.date_format)}
                          </td>
                          <td className="py-2.5 px-3 font-medium text-slate-800">{row.customer_name}</td>
                          <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                            {formatCurrency(row.total_amount, currency)}
                          </td>
                          <td className="py-2.5 px-3 text-right text-emerald-700 font-semibold">
                            {formatCurrency(row.paid_amount, currency)}
                          </td>
                          <td className="py-2.5 px-3 text-right text-rose-700 font-semibold">
                            {dueNum > 0 ? formatCurrency(dueNum, currency) : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-medium text-slate-600">
                            {formatCurrency(row.gross_profit || 0, currency)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-emerald-800">
                            {formatCurrency(row.realized_profit || 0, currency)}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                row.payment_status === 'PAID'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : row.payment_status === 'PARTIALLY_PAID'
                                  ? 'bg-amber-100 text-amber-800'
                                  : row.payment_status === 'UNPAID'
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-purple-100 text-purple-800'
                              }`}
                            >
                              {row.payment_status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {summaryMetrics && (
                    <tfoot className="border-t-2 border-slate-800 bg-slate-50 font-black text-slate-900 text-xs">
                      <tr>
                        <td colSpan={3} className="py-3 px-3 uppercase tracking-wider">
                          Grand Total ({summaryMetrics.count} Sales)
                        </td>
                        <td className="py-3 px-3 text-right">
                          {formatCurrency(summaryMetrics.totalAmount, currency)}
                        </td>
                        <td className="py-3 px-3 text-right text-emerald-800">
                          {formatCurrency(summaryMetrics.paidAmount, currency)}
                        </td>
                        <td className="py-3 px-3 text-right text-rose-800">
                          {formatCurrency(summaryMetrics.dueAmount, currency)}
                        </td>
                        <td className="py-3 px-3 text-right">
                          {formatCurrency(summaryMetrics.invoicedProfit, currency)}
                        </td>
                        <td className="py-3 px-3 text-right text-emerald-900">
                          {formatCurrency(summaryMetrics.realizedProfit, currency)}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              )}

              {/* Report 2: Sales Detail */}
              {activeTab === 'sales_detail' && (
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 border-y border-slate-300 text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3">Receipt #</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Product</th>
                      <th className="py-2.5 px-3 text-right">Qty</th>
                      <th className="py-2.5 px-3 text-right">Unit Price</th>
                      <th className="py-2.5 px-3 text-right">Revenue</th>
                      <th className="py-2.5 px-3 text-right">FIFO Cost</th>
                      <th className="py-2.5 px-3 text-right">Invoiced Profit</th>
                      <th className="py-2.5 px-3 text-right">Realized Profit</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {reportData.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50/70">
                        <td className="py-2.5 px-3 font-bold text-slate-900">{row.receipt_number}</td>
                        <td className="py-2.5 px-3 text-slate-500">
                          {formatDateTime(row.date, settings?.date_format)}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-slate-800">{row.product_name}</td>
                        <td className="py-2.5 px-3 text-right font-medium">{row.quantity}</td>
                        <td className="py-2.5 px-3 text-right text-slate-600">
                          {formatCurrency(row.unit_price, currency)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                          {formatCurrency(row.total_price, currency)}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-500">
                          {formatCurrency(row.total_cost, currency)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-medium text-slate-700">
                          {formatCurrency(row.gross_profit, currency)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-black text-emerald-700">
                          {formatCurrency(row.realized_profit || 0, currency)}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                              row.payment_status === 'PAID'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {row.payment_status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {summaryMetrics && (
                    <tfoot className="border-t-2 border-slate-800 bg-slate-50 font-black text-slate-900 text-xs">
                      <tr>
                        <td colSpan={3} className="py-3 px-3 uppercase tracking-wider">
                          Grand Total
                        </td>
                        <td className="py-3 px-3 text-right">{summaryMetrics.totalQty}</td>
                        <td></td>
                        <td className="py-3 px-3 text-right">
                          {formatCurrency(summaryMetrics.revenue, currency)}
                        </td>
                        <td className="py-3 px-3 text-right">
                          {formatCurrency(summaryMetrics.totalCost, currency)}
                        </td>
                        <td className="py-3 px-3 text-right">
                          {formatCurrency(summaryMetrics.invoicedProfit, currency)}
                        </td>
                        <td className="py-3 px-3 text-right text-emerald-900">
                          {formatCurrency(summaryMetrics.realizedProfit, currency)}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              )}

              {/* Report 3: Purchases */}
              {activeTab === 'purchases' && (
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 border-y border-slate-300 text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3">Purchase #</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Supplier</th>
                      <th className="py-2.5 px-3 text-right">Total Cost</th>
                      <th className="py-2.5 px-3 text-right">Paid</th>
                      <th className="py-2.5 px-3 text-right">Due</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {reportData.map((row, i) => {
                      const dueNum = Number(row.due_amount || 0);
                      return (
                        <tr key={i} className="hover:bg-slate-50/70">
                          <td className="py-2.5 px-3 font-bold text-slate-900">{row.purchase_number}</td>
                          <td className="py-2.5 px-3 text-slate-500">
                            {formatDateTime(row.date, settings?.date_format)}
                          </td>
                          <td className="py-2.5 px-3 font-medium text-slate-800">{row.supplier_name}</td>
                          <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                            {formatCurrency(row.total_amount, currency)}
                          </td>
                          <td className="py-2.5 px-3 text-right text-emerald-700 font-semibold">
                            {formatCurrency(row.paid_amount, currency)}
                          </td>
                          <td className="py-2.5 px-3 text-right text-rose-700 font-semibold">
                            {dueNum > 0 ? formatCurrency(dueNum, currency) : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                row.payment_status === 'PAID'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {row.payment_status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {summaryMetrics && (
                    <tfoot className="border-t-2 border-slate-800 bg-slate-50 font-black text-slate-900 text-xs">
                      <tr>
                        <td colSpan={3} className="py-3 px-3 uppercase tracking-wider">
                          Grand Total ({summaryMetrics.count} Purchases)
                        </td>
                        <td className="py-3 px-3 text-right">
                          {formatCurrency(summaryMetrics.totalCost, currency)}
                        </td>
                        <td className="py-3 px-3 text-right text-emerald-800">
                          {formatCurrency(summaryMetrics.paid, currency)}
                        </td>
                        <td className="py-3 px-3 text-right text-rose-800">
                          {formatCurrency(summaryMetrics.due, currency)}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              )}

              {/* Report 4: Inventory Valuation */}
              {activeTab === 'inventory' && (
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 border-y border-slate-300 text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3">Item #</th>
                      <th className="py-2.5 px-3">Product Name</th>
                      <th className="py-2.5 px-3">Category</th>
                      <th className="py-2.5 px-3 text-right">In Stock</th>
                      <th className="py-2.5 px-3 text-right">Unit Cost</th>
                      <th className="py-2.5 px-3 text-right">Retail Price</th>
                      <th className="py-2.5 px-3 text-right">Valuation (Cost)</th>
                      <th className="py-2.5 px-3 text-right">Valuation (Retail)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {reportData.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50/70">
                        <td className="py-2.5 px-3 font-mono font-semibold text-slate-600">{row.product_id}</td>
                        <td className="py-2.5 px-3 font-bold text-slate-900">{row.name}</td>
                        <td className="py-2.5 px-3 text-slate-500">{row.category_name || '—'}</td>
                        <td className="py-2.5 px-3 text-right font-black text-slate-800">{row.current_stock}</td>
                        <td className="py-2.5 px-3 text-right text-slate-600">
                          {formatCurrency(row.purchase_price, currency)}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-600">
                          {formatCurrency(row.selling_price, currency)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                          {formatCurrency(row.stock_value_cost, currency)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-emerald-800">
                          {formatCurrency(row.stock_value_retail, currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {summaryMetrics && (
                    <tfoot className="border-t-2 border-slate-800 bg-slate-50 font-black text-slate-900 text-xs">
                      <tr>
                        <td colSpan={3} className="py-3 px-3 uppercase tracking-wider">
                          Grand Total ({summaryMetrics.count} Products)
                        </td>
                        <td className="py-3 px-3 text-right">{summaryMetrics.totalStock} Units</td>
                        <td></td>
                        <td></td>
                        <td className="py-3 px-3 text-right">
                          {formatCurrency(summaryMetrics.totalValueCost, currency)}
                        </td>
                        <td className="py-3 px-3 text-right text-emerald-900">
                          {formatCurrency(summaryMetrics.totalValueRetail, currency)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              )}

              {/* Report 5: Stock Movements */}
              {activeTab === 'movements' && (
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 border-y border-slate-300 text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Product</th>
                      <th className="py-2.5 px-3">Movement Type</th>
                      <th className="py-2.5 px-3">Reference</th>
                      <th className="py-2.5 px-3 text-right">Quantity Delta</th>
                      <th className="py-2.5 px-3">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {reportData.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50/70">
                        <td className="py-2.5 px-3 text-slate-500">
                          {formatDateTime(row.date, settings?.date_format)}
                        </td>
                        <td className="py-2.5 px-3 font-bold text-slate-900">{row.product_name}</td>
                        <td className="py-2.5 px-3 font-semibold text-slate-700">
                          <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px]">
                            {row.movement_type}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-600">{row.reference_id}</td>
                        <td
                          className={`py-2.5 px-3 text-right font-black ${
                            Number(row.quantity) >= 0 ? 'text-emerald-700' : 'text-rose-700'
                          }`}
                        >
                          {Number(row.quantity) > 0 ? `+${row.quantity}` : row.quantity}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500">{row.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  {summaryMetrics && (
                    <tfoot className="border-t-2 border-slate-800 bg-slate-50 font-black text-slate-900 text-xs">
                      <tr>
                        <td colSpan={4} className="py-3 px-3 uppercase tracking-wider">
                          Net Quantity Delta ({summaryMetrics.count} Movements)
                        </td>
                        <td className="py-3 px-3 text-right">{summaryMetrics.netQty}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              )}

              {/* Report 6: Customer Dues */}
              {activeTab === 'customers' && (
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 border-y border-slate-300 text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3">Cust ID</th>
                      <th className="py-2.5 px-3">Customer Name</th>
                      <th className="py-2.5 px-3">Phone</th>
                      <th className="py-2.5 px-3 text-right">Total Purchases</th>
                      <th className="py-2.5 px-3 text-right">Total Payments</th>
                      <th className="py-2.5 px-3 text-right">Returns</th>
                      <th className="py-2.5 px-3 text-right text-rose-800">Outstanding Balance Due</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {reportData.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50/70">
                        <td className="py-2.5 px-3 font-mono text-slate-600">{row.customer_id}</td>
                        <td className="py-2.5 px-3 font-bold text-slate-900">{row.name}</td>
                        <td className="py-2.5 px-3 text-slate-500">{row.phone || '—'}</td>
                        <td className="py-2.5 px-3 text-right font-medium text-slate-900">
                          {formatCurrency(row.total_purchases, currency)}
                        </td>
                        <td className="py-2.5 px-3 text-right text-emerald-700 font-semibold">
                          {formatCurrency(row.total_payments, currency)}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-500">
                          {formatCurrency(row.total_returns, currency)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-black text-rose-700">
                          {formatCurrency(row.current_due, currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {summaryMetrics && (
                    <tfoot className="border-t-2 border-slate-800 bg-slate-50 font-black text-slate-900 text-xs">
                      <tr>
                        <td colSpan={3} className="py-3 px-3 uppercase tracking-wider">
                          Grand Total ({summaryMetrics.count} Accounts)
                        </td>
                        <td className="py-3 px-3 text-right">
                          {formatCurrency(summaryMetrics.purchases, currency)}
                        </td>
                        <td className="py-3 px-3 text-right text-emerald-800">
                          {formatCurrency(summaryMetrics.payments, currency)}
                        </td>
                        <td className="py-3 px-3 text-right text-slate-500">
                          {formatCurrency(summaryMetrics.returns, currency)}
                        </td>
                        <td className="py-3 px-3 text-right text-rose-800">
                          {formatCurrency(summaryMetrics.dues, currency)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              )}

              {/* Report 7: Supplier Dues */}
              {activeTab === 'suppliers' && (
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 border-y border-slate-300 text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3">Supp ID</th>
                      <th className="py-2.5 px-3">Supplier Name</th>
                      <th className="py-2.5 px-3">Phone</th>
                      <th className="py-2.5 px-3 text-right">Total Purchases</th>
                      <th className="py-2.5 px-3 text-right">Total Paid</th>
                      <th className="py-2.5 px-3 text-right">Returns</th>
                      <th className="py-2.5 px-3 text-right text-rose-800">Outstanding Payables Due</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {reportData.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50/70">
                        <td className="py-2.5 px-3 font-mono text-slate-600">{row.supplier_id}</td>
                        <td className="py-2.5 px-3 font-bold text-slate-900">{row.name}</td>
                        <td className="py-2.5 px-3 text-slate-500">{row.phone || '—'}</td>
                        <td className="py-2.5 px-3 text-right font-medium text-slate-900">
                          {formatCurrency(row.total_purchases, currency)}
                        </td>
                        <td className="py-2.5 px-3 text-right text-emerald-700 font-semibold">
                          {formatCurrency(row.total_payments, currency)}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-500">
                          {formatCurrency(row.total_returns, currency)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-black text-rose-700">
                          {formatCurrency(row.current_due, currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {summaryMetrics && (
                    <tfoot className="border-t-2 border-slate-800 bg-slate-50 font-black text-slate-900 text-xs">
                      <tr>
                        <td colSpan={3} className="py-3 px-3 uppercase tracking-wider">
                          Grand Total ({summaryMetrics.count} Vendors)
                        </td>
                        <td className="py-3 px-3 text-right">
                          {formatCurrency(summaryMetrics.purchases, currency)}
                        </td>
                        <td className="py-3 px-3 text-right text-emerald-800">
                          {formatCurrency(summaryMetrics.payments, currency)}
                        </td>
                        <td className="py-3 px-3 text-right text-slate-500">
                          {formatCurrency(summaryMetrics.returns, currency)}
                        </td>
                        <td className="py-3 px-3 text-right text-rose-800">
                          {formatCurrency(summaryMetrics.dues, currency)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              )}

              {/* Report 8: Bills Ledger */}
              {activeTab === 'bills' && (
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 border-y border-slate-300 text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3">Bill #</th>
                      <th className="py-2.5 px-3">Bill Title</th>
                      <th className="py-2.5 px-3">Category</th>
                      <th className="py-2.5 px-3">Due Date</th>
                      <th className="py-2.5 px-3 text-right">Amount</th>
                      <th className="py-2.5 px-3 text-right">Paid</th>
                      <th className="py-2.5 px-3 text-right text-rose-800">Remaining Due</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {reportData.map((row, i) => {
                      const dueNum = Number(row.due_amount || 0);
                      return (
                        <tr key={i} className="hover:bg-slate-50/70">
                          <td className="py-2.5 px-3 font-bold text-slate-900">{row.bill_number}</td>
                          <td className="py-2.5 px-3 font-semibold text-slate-800">{row.name}</td>
                          <td className="py-2.5 px-3 text-slate-500">{row.category_name}</td>
                          <td className="py-2.5 px-3 text-slate-500">
                            {formatDateTime(row.due_date, settings?.date_format)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                            {formatCurrency(row.amount, currency)}
                          </td>
                          <td className="py-2.5 px-3 text-right text-emerald-700 font-semibold">
                            {formatCurrency(row.paid_amount, currency)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-rose-700">
                            {dueNum > 0 ? formatCurrency(dueNum, currency) : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                row.status === 'PAID'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {row.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {summaryMetrics && (
                    <tfoot className="border-t-2 border-slate-800 bg-slate-50 font-black text-slate-900 text-xs">
                      <tr>
                        <td colSpan={4} className="py-3 px-3 uppercase tracking-wider">
                          Grand Total ({summaryMetrics.count} Bills)
                        </td>
                        <td className="py-3 px-3 text-right">
                          {formatCurrency(summaryMetrics.amount, currency)}
                        </td>
                        <td className="py-3 px-3 text-right text-emerald-800">
                          {formatCurrency(summaryMetrics.paid, currency)}
                        </td>
                        <td className="py-3 px-3 text-right text-rose-800">
                          {formatCurrency(summaryMetrics.due, currency)}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              )}

              {/* Report 9: Expenses */}
              {activeTab === 'expenses' && (
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 border-y border-slate-300 text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3">Expense #</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Category</th>
                      <th className="py-2.5 px-3">Title / Details</th>
                      <th className="py-2.5 px-3 text-right">Amount</th>
                      <th className="py-2.5 px-3 text-right">Payment Method</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {reportData.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50/70">
                        <td className="py-2.5 px-3 font-bold text-slate-900">{row.expense_number}</td>
                        <td className="py-2.5 px-3 text-slate-500">
                          {formatDateTime(row.date, settings?.date_format)}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 font-medium">{row.category_name}</td>
                        <td className="py-2.5 px-3 font-semibold text-slate-800">{row.title}</td>
                        <td className="py-2.5 px-3 text-right font-black text-rose-700">
                          {formatCurrency(row.amount, currency)}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-500">{row.payment_method}</td>
                      </tr>
                    ))}
                  </tbody>
                  {summaryMetrics && (
                    <tfoot className="border-t-2 border-slate-800 bg-slate-50 font-black text-slate-900 text-xs">
                      <tr>
                        <td colSpan={4} className="py-3 px-3 uppercase tracking-wider">
                          Grand Total ({summaryMetrics.count} Expenses)
                        </td>
                        <td className="py-3 px-3 text-right text-rose-800">
                          {formatCurrency(summaryMetrics.totalAmount, currency)}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              )}
            </div>
          )}
        </div>

        {/* 5. Corporate Signature & Verification Section (Anchored to Footer) */}
        <div className="pdf-footer-stamp mt-auto pt-6 border-t border-slate-200 flex justify-between items-end text-center text-slate-500 text-[11px] print-avoid-break">
          <div className="w-56 text-left">
            <span className="block text-[10px] text-slate-400 uppercase tracking-wider font-bold">
              Business Ledger
            </span>
            <span className="font-bold text-slate-800">{shopName}</span>
            <span className="block text-[10px] text-slate-400 mt-0.5">
              Generated: {formatDateTime(new Date(), settings?.date_format)}
            </span>
          </div>

          <div className="w-48">
            <div className="border-b border-dashed border-slate-400 pb-1 mb-1"></div>
            <span className="text-xs font-medium text-slate-600">Prepared By</span>
          </div>

          <div className="w-56">
            <div className="border-b border-dashed border-slate-400 pb-1 mb-1"></div>
            <span className="text-xs font-bold text-slate-800">Authorized Stamp & Signature</span>
          </div>
        </div>
      </div>
    </div>
  );
};
