import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { BusinessSettings } from '../../types';
import { BarChart3, Printer, Download, Calendar } from 'lucide-react';
import { Button } from '../../components/common/Button';
import { DateFilter } from '../../components/common/DateFilter';
import { formatCurrency, formatMoney } from '../../utils/format';

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

  const reportTabs: { id: ReportTab; label: string }[] = [
    { id: 'sales', label: '1. Sales Summary' },
    { id: 'sales_detail', label: '2. Sales Detail (Gross Profit)' },
    { id: 'purchases', label: '3. Purchases' },
    { id: 'inventory', label: '4. Inventory Valuation' },
    { id: 'movements', label: '5. Stock Movements' },
    { id: 'customers', label: '6. Customer Dues' },
    { id: 'suppliers', label: '7. Supplier Dues' },
    { id: 'bills', label: '8. Bills Ledger' },
    { id: 'expenses', label: '9. Expenses' },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">Business Reports</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Financial analytics, gross profit margins, inventory valuation, and ledger statements
          </p>
        </div>

        <Button
          variant="secondary"
          size="md"
          icon={<Printer className="h-4 w-4" />}
          onClick={() => window.print()}
        >
          Print Report
        </Button>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 border-b border-slate-200">
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

      {/* Date Filter Bar (where applicable) */}
      {['sales', 'sales_detail', 'purchases', 'movements', 'expenses'].includes(activeTab) && (
        <div className="flex items-center justify-between gap-3">
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

      {/* Report Table Card */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-20 text-center text-slate-400 font-medium">
            Generating {reportTabs.find((t) => t.id === activeTab)?.label}...
          </div>
        ) : reportData.length === 0 ? (
          <div className="py-20 text-center text-slate-400 font-medium">
            No records found for this report and filter range.
          </div>
        ) : (
          <div className="overflow-x-auto">
            {/* Sales Summary Report */}
            {activeTab === 'sales' && (
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="py-3.5 px-6">Receipt #</th>
                    <th className="py-3.5 px-6">Date</th>
                    <th className="py-3.5 px-6">Customer</th>
                    <th className="py-3.5 px-6 text-right">Total Amount</th>
                    <th className="py-3.5 px-6 text-right">Paid</th>
                    <th className="py-3.5 px-6 text-right">Due</th>
                    <th className="py-3.5 px-6 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reportData.map((row, i) => {
                    const dueNum = Number(row.due_amount || 0);
                    return (
                      <tr key={i} className="hover:bg-slate-50/60">
                        <td className="py-3.5 px-6 font-bold">{row.receipt_number}</td>
                        <td className="py-3.5 px-6 text-xs text-slate-500">
                          {new Date(row.date).toLocaleDateString()}
                        </td>
                        <td className="py-3.5 px-6 font-medium">{row.customer_name}</td>
                        <td className="py-3.5 px-6 text-right font-bold">
                          {formatCurrency(row.total_amount, currency)}
                        </td>
                        <td className="py-3.5 px-6 text-right text-emerald-700 font-semibold">
                          {formatCurrency(row.paid_amount, currency)}
                        </td>
                        <td className="py-3.5 px-6 text-right text-rose-700 font-semibold">
                          {dueNum > 0 ? formatCurrency(dueNum, currency) : '—'}
                        </td>
                        <td className="py-3.5 px-6 text-center text-xs font-bold text-slate-600">
                          {row.payment_status}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {/* Sales Detail Report (Gross Profit) */}
            {activeTab === 'sales_detail' && (
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="py-3.5 px-6">Receipt #</th>
                    <th className="py-3.5 px-6">Date</th>
                    <th className="py-3.5 px-6">Product</th>
                    <th className="py-3.5 px-6 text-right">Qty</th>
                    <th className="py-3.5 px-6 text-right">Sale Price</th>
                    <th className="py-3.5 px-6 text-right">Revenue</th>
                    <th className="py-3.5 px-6 text-right">FIFO Cost</th>
                    <th className="py-3.5 px-6 text-right text-emerald-800">Gross Profit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reportData.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50/60">
                      <td className="py-3.5 px-6 font-bold">{row.receipt_number}</td>
                      <td className="py-3.5 px-6 text-xs text-slate-500">
                        {new Date(row.date).toLocaleDateString()}
                      </td>
                      <td className="py-3.5 px-6 font-semibold">{row.product_name}</td>
                      <td className="py-3.5 px-6 text-right">{row.quantity}</td>
                      <td className="py-3.5 px-6 text-right">{formatCurrency(row.unit_price, currency)}</td>
                      <td className="py-3.5 px-6 text-right font-bold">{formatCurrency(row.total_price, currency)}</td>
                      <td className="py-3.5 px-6 text-right text-slate-500">{formatCurrency(row.total_cost, currency)}</td>
                      <td className="py-3.5 px-6 text-right font-black text-emerald-700">
                        {formatCurrency(row.gross_profit, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Purchases Report */}
            {activeTab === 'purchases' && (
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="py-3.5 px-6">Purchase #</th>
                    <th className="py-3.5 px-6">Date</th>
                    <th className="py-3.5 px-6">Supplier</th>
                    <th className="py-3.5 px-6 text-right">Total Cost</th>
                    <th className="py-3.5 px-6 text-right">Paid</th>
                    <th className="py-3.5 px-6 text-right">Due</th>
                    <th className="py-3.5 px-6 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reportData.map((row, i) => {
                    const dueNum = Number(row.due_amount || 0);
                    return (
                      <tr key={i} className="hover:bg-slate-50/60">
                        <td className="py-3.5 px-6 font-bold">{row.purchase_number}</td>
                        <td className="py-3.5 px-6 text-xs text-slate-500">
                          {new Date(row.date).toLocaleDateString()}
                        </td>
                        <td className="py-3.5 px-6 font-medium">{row.supplier_name}</td>
                        <td className="py-3.5 px-6 text-right font-bold">{formatCurrency(row.total_amount, currency)}</td>
                        <td className="py-3.5 px-6 text-right text-emerald-700 font-semibold">
                          {formatCurrency(row.paid_amount, currency)}
                        </td>
                        <td className="py-3.5 px-6 text-right text-rose-700 font-semibold">
                          {dueNum > 0 ? formatCurrency(dueNum, currency) : '—'}
                        </td>
                        <td className="py-3.5 px-6 text-center text-xs font-bold text-slate-600">
                          {row.payment_status}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {/* Inventory Valuation Report */}
            {activeTab === 'inventory' && (
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="py-3.5 px-6">Product ID</th>
                    <th className="py-3.5 px-6">Product Name</th>
                    <th className="py-3.5 px-6">Category</th>
                    <th className="py-3.5 px-6 text-right">Stock</th>
                    <th className="py-3.5 px-6 text-right">Unit Cost</th>
                    <th className="py-3.5 px-6 text-right">Selling Price</th>
                    <th className="py-3.5 px-6 text-right">Stock Value (Cost)</th>
                    <th className="py-3.5 px-6 text-right">Stock Value (Retail)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reportData.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50/60">
                      <td className="py-3.5 px-6 font-bold">{row.product_id}</td>
                      <td className="py-3.5 px-6 font-semibold">{row.name}</td>
                      <td className="py-3.5 px-6 text-xs text-slate-500">{row.category_name || '—'}</td>
                      <td className="py-3.5 px-6 text-right font-black text-slate-800">{row.current_stock}</td>
                      <td className="py-3.5 px-6 text-right text-slate-600">{formatCurrency(row.purchase_price, currency)}</td>
                      <td className="py-3.5 px-6 text-right text-slate-600">{formatCurrency(row.selling_price, currency)}</td>
                      <td className="py-3.5 px-6 text-right font-bold text-slate-900">
                        {formatCurrency(row.stock_value_cost, currency)}
                      </td>
                      <td className="py-3.5 px-6 text-right font-bold text-emerald-800">
                        {formatCurrency(row.stock_value_retail, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Stock Movements Report */}
            {activeTab === 'movements' && (
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="py-3.5 px-6">Date</th>
                    <th className="py-3.5 px-6">Product</th>
                    <th className="py-3.5 px-6">Movement</th>
                    <th className="py-3.5 px-6">Reference</th>
                    <th className="py-3.5 px-6 text-right">Quantity</th>
                    <th className="py-3.5 px-6">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reportData.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50/60">
                      <td className="py-3.5 px-6 text-xs text-slate-500">{new Date(row.date).toLocaleString()}</td>
                      <td className="py-3.5 px-6 font-bold">{row.product_name}</td>
                      <td className="py-3.5 px-6 text-xs font-semibold">{row.movement_type}</td>
                      <td className="py-3.5 px-6 font-mono text-xs">{row.reference_id}</td>
                      <td className="py-3.5 px-6 text-right font-bold">
                        {Number(row.quantity) > 0 ? `+${row.quantity}` : row.quantity}
                      </td>
                      <td className="py-3.5 px-6 text-xs text-slate-400">{row.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Customer Dues Report */}
            {activeTab === 'customers' && (
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="py-3.5 px-6">Customer ID</th>
                    <th className="py-3.5 px-6">Customer Name</th>
                    <th className="py-3.5 px-6">Phone</th>
                    <th className="py-3.5 px-6 text-right">Total Purchases</th>
                    <th className="py-3.5 px-6 text-right">Total Paid</th>
                    <th className="py-3.5 px-6 text-right">Total Returns</th>
                    <th className="py-3.5 px-6 text-right text-rose-800">Current Outstanding Due</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reportData.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50/60">
                      <td className="py-3.5 px-6 font-bold">{row.customer_id}</td>
                      <td className="py-3.5 px-6 font-bold">{row.name}</td>
                      <td className="py-3.5 px-6 text-slate-600">{row.phone || '—'}</td>
                      <td className="py-3.5 px-6 text-right">{formatCurrency(row.total_purchases, currency)}</td>
                      <td className="py-3.5 px-6 text-right text-emerald-700 font-semibold">{formatCurrency(row.total_payments, currency)}</td>
                      <td className="py-3.5 px-6 text-right text-slate-500">{formatCurrency(row.total_returns, currency)}</td>
                      <td className="py-3.5 px-6 text-right font-black text-rose-700">
                        {formatCurrency(row.current_due, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Supplier Dues Report */}
            {activeTab === 'suppliers' && (
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="py-3.5 px-6">Supplier ID</th>
                    <th className="py-3.5 px-6">Supplier Name</th>
                    <th className="py-3.5 px-6">Phone</th>
                    <th className="py-3.5 px-6 text-right">Total Purchases</th>
                    <th className="py-3.5 px-6 text-right">Total Paid</th>
                    <th className="py-3.5 px-6 text-right">Returns</th>
                    <th className="py-3.5 px-6 text-right text-rose-800">Current Payable Due</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reportData.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50/60">
                      <td className="py-3.5 px-6 font-bold">{row.supplier_id}</td>
                      <td className="py-3.5 px-6 font-bold">{row.name}</td>
                      <td className="py-3.5 px-6 text-slate-600">{row.phone || '—'}</td>
                      <td className="py-3.5 px-6 text-right">{formatCurrency(row.total_purchases, currency)}</td>
                      <td className="py-3.5 px-6 text-right text-emerald-700 font-semibold">{formatCurrency(row.total_payments, currency)}</td>
                      <td className="py-3.5 px-6 text-right text-slate-500">{formatCurrency(row.total_returns, currency)}</td>
                      <td className="py-3.5 px-6 text-right font-black text-rose-700">
                        {formatCurrency(row.current_due, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Bills Report */}
            {activeTab === 'bills' && (
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="py-3.5 px-6">Bill #</th>
                    <th className="py-3.5 px-6">Name</th>
                    <th className="py-3.5 px-6">Category</th>
                    <th className="py-3.5 px-6">Due Date</th>
                    <th className="py-3.5 px-6 text-right">Amount</th>
                    <th className="py-3.5 px-6 text-right">Paid</th>
                    <th className="py-3.5 px-6 text-right">Remaining Due</th>
                    <th className="py-3.5 px-6 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reportData.map((row, i) => {
                    const dueNum = Number(row.due_amount || 0);
                    return (
                      <tr key={i} className="hover:bg-slate-50/60">
                        <td className="py-3.5 px-6 font-bold">{row.bill_number}</td>
                        <td className="py-3.5 px-6 font-semibold">{row.name}</td>
                        <td className="py-3.5 px-6 text-xs text-slate-500">{row.category_name}</td>
                        <td className="py-3.5 px-6 text-xs">{new Date(row.due_date).toLocaleDateString()}</td>
                        <td className="py-3.5 px-6 text-right font-bold">{formatCurrency(row.amount, currency)}</td>
                        <td className="py-3.5 px-6 text-right text-emerald-700 font-semibold">{formatCurrency(row.paid_amount, currency)}</td>
                        <td className="py-3.5 px-6 text-right text-rose-700 font-semibold">
                          {dueNum > 0 ? formatCurrency(dueNum, currency) : '—'}
                        </td>
                        <td className="py-3.5 px-6 text-center text-xs font-bold text-slate-600">{row.status}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {/* Expenses Report */}
            {activeTab === 'expenses' && (
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="py-3.5 px-6">Expense #</th>
                    <th className="py-3.5 px-6">Date</th>
                    <th className="py-3.5 px-6">Category</th>
                    <th className="py-3.5 px-6">Title</th>
                    <th className="py-3.5 px-6 text-right">Amount</th>
                    <th className="py-3.5 px-6">Payment Method</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reportData.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50/60">
                      <td className="py-3.5 px-6 font-bold">{row.expense_number}</td>
                      <td className="py-3.5 px-6 text-xs text-slate-500">{new Date(row.date).toLocaleDateString()}</td>
                      <td className="py-3.5 px-6 text-xs text-slate-600">{row.category_name}</td>
                      <td className="py-3.5 px-6 font-semibold">{row.title}</td>
                      <td className="py-3.5 px-6 text-right font-black">{formatCurrency(row.amount, currency)}</td>
                      <td className="py-3.5 px-6 text-xs text-slate-500">{row.payment_method}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
