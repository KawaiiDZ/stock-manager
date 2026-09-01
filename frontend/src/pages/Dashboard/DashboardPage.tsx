import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { DashboardStats, BillAttentionItem, MonthlySalesDataPoint, Sale, BusinessSettings } from '../../types';
import {
  DollarSign,
  TrendingUp,
  Users,
  Building2,
  AlertTriangle,
  Calendar,
  Eye,
  Plus,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import { Button } from '../../components/common/Button';
import { Modal } from '../../components/common/Modal';
import { Badge } from '../../components/common/Badge';
import { formatCurrency, formatMoney } from '../../utils/format';

interface DashboardPageProps {
  settings: BusinessSettings | null;
  onNavigate: (tab: string) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ settings, onNavigate }) => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [billsAttention, setBillsAttention] = useState<BillAttentionItem[]>([]);
  const [monthlyChart, setMonthlyChart] = useState<MonthlySalesDataPoint[]>([]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [loading, setLoading] = useState(true);

  // Day detail modal state
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [daySalesDetail, setDaySalesDetail] = useState<{
    date: string;
    sales_revenue: number;
    transaction_count: number;
    sales: Sale[];
  } | null>(null);
  const [loadingDay, setLoadingDay] = useState(false);

  const currency = settings?.currency || 'Rs.';

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const [statsRes, billsRes, chartRes] = await Promise.all([
        api.getDashboardKPIs(),
        api.getBillsAttention().catch(() => []),
        api.getMonthlySalesChart(selectedYear, selectedMonth).catch(() => ({ daily_sales: [] } as any)),
      ]);
      setStats(statsRes);
      setBillsAttention(billsRes || []);
      const points = Array.isArray(chartRes) ? chartRes : (chartRes?.daily_sales || []);
      setMonthlyChart(points);
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, [selectedYear, selectedMonth]);

  const handleOpenDayDetail = async (point: MonthlySalesDataPoint) => {
    setSelectedDate(point.date);
    setLoadingDay(true);
    try {
      const data = await api.getDaySalesDetail(point.date);
      setDaySalesDetail(data);
    } catch (err) {
      console.error('Failed to load day details:', err);
    } finally {
      setLoadingDay(false);
    }
  };

  // Find peak sales in month for relative bar heights
  const peakSale = Math.max(
    ...monthlyChart.map((d) => Number(d.sales_revenue || 0)),
    1000
  );

  return (
    <div className="space-y-6 pb-12">
      {/* Top Welcome Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-emerald-800 to-slate-900 rounded-3xl p-6 text-white shadow-lg shadow-emerald-950/10">
        <div>
          <h1 className="text-2xl font-black tracking-tight">
            Welcome to {settings?.business_name || 'Stock Manager'}
          </h1>
          <p className="text-emerald-200 text-sm mt-1">
            Here is your live daily business and inventory summary.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            size="md"
            className="bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-bold border-none"
            onClick={() => onNavigate('new_sale')}
            icon={<Plus className="h-4 w-4" />}
          >
            + New Sale
          </Button>
          <Button
            variant="outline"
            size="md"
            className="bg-white/10 hover:bg-white/20 text-white border-white/20"
            onClick={() => onNavigate('products')}
          >
            Manage Stock
          </Button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Today's Sales */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Today's Sales
            </span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
              <DollarSign className="h-5 w-5" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900">
              {formatCurrency(stats?.today_sales_revenue, currency)}
            </div>
            <p className="text-xs text-emerald-600 font-semibold mt-1">Revenue from today's sales</p>
          </div>
        </div>

        {/* Today's Gross Profit */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Today's Gross Profit
            </span>
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
              <TrendingUp className="h-5 w-5" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900">
              {formatCurrency(stats?.today_gross_profit, currency)}
            </div>
            <p className="text-xs text-slate-400 mt-1">Product margins (Sales - Cost)</p>
          </div>
        </div>

        {/* Customer Outstanding */}
        <div
          onClick={() => onNavigate('customers')}
          className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm flex flex-col justify-between cursor-pointer hover:border-emerald-300 transition"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Customer Due
            </span>
            <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
              <Users className="h-5 w-5" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-amber-700">
              {formatCurrency(stats?.customer_outstanding, currency)}
            </div>
            <p className="text-xs text-amber-600 font-semibold mt-1 flex items-center gap-1">
              Money customers owe you <ArrowRight className="h-3 w-3" />
            </p>
          </div>
        </div>

        {/* Supplier Outstanding */}
        <div
          onClick={() => onNavigate('suppliers')}
          className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm flex flex-col justify-between cursor-pointer hover:border-emerald-300 transition"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Supplier Payable
            </span>
            <div className="p-2 rounded-xl bg-rose-50 text-rose-600">
              <Building2 className="h-5 w-5" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-rose-700">
              {formatCurrency(stats?.supplier_outstanding, currency)}
            </div>
            <p className="text-xs text-rose-600 font-semibold mt-1 flex items-center gap-1">
              Money you owe suppliers <ArrowRight className="h-3 w-3" />
            </p>
          </div>
        </div>
      </div>

      {/* Main Charts & Side Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monthly Interactive Chart */}
        <div className="lg:col-span-2 bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="text-base font-black text-slate-800 tracking-tight">
                  Daily Sales Performance
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Click on any day bar to view individual receipts and sold items
                </p>
              </div>

              {/* Month/Year selector */}
              <div className="flex items-center gap-2">
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className="bg-slate-50 border border-slate-200 text-xs font-bold rounded-xl px-3 py-1.5 text-slate-700 focus:outline-none focus:border-emerald-500"
                >
                  {[
                    'January', 'February', 'March', 'April', 'May', 'June',
                    'July', 'August', 'September', 'October', 'November', 'December'
                  ].map((m, i) => (
                    <option key={i + 1} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>

                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="bg-slate-50 border border-slate-200 text-xs font-bold rounded-xl px-3 py-1.5 text-slate-700 focus:outline-none focus:border-emerald-500"
                >
                  {[2024, 2025, 2026, 2027].map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Custom Simple Bar Chart with Reference Grid */}
            {loading ? (
              <div className="py-24 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
                <RefreshCw className="h-5 w-5 animate-spin text-emerald-600" />
                <span>Loading daily sales performance...</span>
              </div>
            ) : monthlyChart.length === 0 ? (
              <div className="py-24 text-center text-slate-400 text-xs">
                No sales records found for this month.
              </div>
            ) : (
              <div className="pt-4">
                {/* Revenue Reference Guidelines */}
                <div className="relative">
                  <div className="flex flex-col justify-between absolute -left-1 top-0 bottom-6 right-0 pointer-events-none opacity-40">
                    <div className="border-b border-dashed border-slate-200 text-[9px] font-bold text-slate-400 pl-1">
                      {formatCurrency(peakSale, currency)}
                    </div>
                    <div className="border-b border-dashed border-slate-200 text-[9px] font-bold text-slate-400 pl-1">
                      {formatCurrency(peakSale / 2, currency)}
                    </div>
                    <div className="border-b border-slate-200 text-[9px] font-bold text-slate-400 pl-1">
                      0
                    </div>
                  </div>

                  <div className="flex items-end gap-1 sm:gap-1.5 h-56 border-b border-slate-200 pb-2 relative z-10 pl-2 pr-1">
                    {monthlyChart.map((d) => {
                      const revenueNum = Number(d.sales_revenue || 0);
                      const heightPercent = peakSale > 0 ? (revenueNum / peakSale) * 100 : 0;
                      const hasSales = revenueNum > 0;
                      const isToday =
                        selectedYear === new Date().getFullYear() &&
                        selectedMonth === new Date().getMonth() + 1 &&
                        d.day === new Date().getDate();

                      return (
                        <div
                          key={d.day}
                          onClick={() => handleOpenDayDetail(d)}
                          className="flex-1 h-full flex flex-col justify-end items-center group relative cursor-pointer"
                        >
                          {/* Tooltip */}
                          <div className="absolute -top-12 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 bg-slate-900 text-white text-[11px] py-1.5 px-2.5 rounded-xl shadow-xl whitespace-nowrap z-30 font-semibold">
                            <div className="font-bold text-emerald-400">Day {d.day} ({d.date})</div>
                            <div>{formatCurrency(revenueNum, currency)} • {d.transaction_count} sale{d.transaction_count === 1 ? '' : 's'}</div>
                          </div>

                          {/* Bar */}
                          <div
                            style={{ height: `${hasSales ? Math.max(8, heightPercent) : 4}%` }}
                            className={`w-full rounded-t-md transition-all duration-300 ${
                              hasSales
                                ? 'bg-emerald-500 hover:bg-emerald-400 group-hover:shadow-md shadow-emerald-500/20'
                                : 'bg-slate-100 hover:bg-slate-200'
                            } ${isToday ? 'ring-2 ring-emerald-600 ring-offset-1' : ''}`}
                          />

                          {/* Day Label */}
                          <span
                            className={`text-[9px] font-bold mt-1.5 ${
                              isToday
                                ? 'text-emerald-700 font-black'
                                : hasSales
                                ? 'text-slate-700'
                                : 'text-slate-300'
                            }`}
                          >
                            {d.day}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 mt-4">
            <div className="flex items-center gap-4">
              <span>
                Total Month Revenue:{' '}
                <strong className="text-slate-800 font-bold">
                  {formatCurrency(monthlyChart.reduce((sum, d) => sum + Number(d.sales_revenue || 0), 0), currency)}
                </strong>
              </span>
              <span>
                Total Transactions:{' '}
                <strong className="text-slate-800 font-bold">
                  {monthlyChart.reduce((sum, d) => sum + Number(d.transaction_count || 0), 0)}
                </strong>
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigate('sales_history')}
              className="text-xs font-bold"
            >
              View Full History →
            </Button>
          </div>
        </div>

        {/* Bills Needing Attention Card */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-rose-50 text-rose-600">
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <h3 className="text-sm font-black text-slate-800 tracking-tight">
                  Bills Needing Attention
                </h3>
              </div>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
                {billsAttention.length} Pending
              </span>
            </div>

            {billsAttention.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                🎉 No overdue or immediate upcoming bills!
              </div>
            ) : (
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                {billsAttention.map((b) => (
                  <div
                    key={b.id}
                    className="p-3.5 rounded-2xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition flex items-center justify-between"
                  >
                    <div>
                      <h4 className="text-sm font-bold text-slate-800">{b.name}</h4>
                      <div className="flex items-center gap-2 mt-1 text-xs">
                        <span className="font-semibold text-rose-600">{b.urgency_label}</span>
                        <span className="text-slate-300">•</span>
                        <span className="text-slate-500">
                          Due: {formatCurrency(b.due_amount, currency)}
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onNavigate('bills')}
                      className="text-xs py-1 px-2.5 font-semibold"
                    >
                      Pay
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-slate-100 mt-4">
            <Button
              variant="secondary"
              size="sm"
              className="w-full text-xs font-bold"
              onClick={() => onNavigate('bills')}
            >
              + Add New Bill
            </Button>
          </div>
        </div>
      </div>

      {/* Day Sales Detail Modal */}
      <Modal
        isOpen={Boolean(selectedDate)}
        onClose={() => {
          setSelectedDate(null);
          setDaySalesDetail(null);
        }}
        title={`Sales on ${selectedDate}`}
        subtitle={`${daySalesDetail?.transaction_count || 0} Transactions Completed`}
        maxWidth="2xl"
      >
        {loadingDay ? (
          <div className="py-12 text-center text-slate-400">Loading daily sales...</div>
        ) : daySalesDetail?.sales.length === 0 ? (
          <div className="py-8 text-center text-slate-500">
            No sales recorded on this day.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-emerald-50 text-emerald-900 rounded-2xl">
              <div>
                <span className="text-xs font-semibold uppercase text-emerald-700">
                  Total Day Sales Revenue
                </span>
                <div className="text-2xl font-black">
                  {formatCurrency(daySalesDetail?.sales_revenue, currency)}
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs font-semibold uppercase text-emerald-700">
                  Total Receipts
                </span>
                <div className="text-2xl font-black">{daySalesDetail?.transaction_count}</div>
              </div>
            </div>

            <div className="max-h-[350px] overflow-y-auto space-y-2">
              {daySalesDetail?.sales.map((sale) => (
                <div
                  key={sale.id}
                  className="flex items-center justify-between p-3.5 rounded-xl border border-slate-100 bg-white hover:bg-slate-50 transition text-sm"
                >
                  <div>
                    <div className="font-bold text-slate-800">{sale.receipt_number}</div>
                    <div className="text-xs text-slate-400">
                      {sale.customer_name || 'Walk-in Customer'} • {new Date(sale.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-slate-900">
                      {formatCurrency(sale.total_amount, currency)}
                    </div>
                    <Badge status={sale.payment_status} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
