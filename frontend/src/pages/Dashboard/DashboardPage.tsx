import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../services/api';
import {
  DashboardStats, BillAttentionItem, MonthlySalesDataPoint, Sale, BusinessSettings,
  DaySalesDetail, CashFlowSummary, AccountTransfer
} from '../../types';
import {
  DollarSign,
  TrendingUp,
  Users,
  Building2,
  AlertTriangle,
  Calendar,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Plus,
  ArrowRight,
  RefreshCw,
  Wallet,
  Landmark,
  Smartphone,
  ArrowLeftRight,
  History,
  CreditCard,
  Send,
  Trash2,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '../../components/common/Button';
import { Modal } from '../../components/common/Modal';
import { Badge } from '../../components/common/Badge';
import { Input } from '../../components/common/Input';
import { formatCurrency, formatMoney, formatDateTime } from '../../utils/format';

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

  // Financial Privacy State (mask revenue & gross profit)
  const [isFinancesHidden, setIsFinancesHidden] = useState<boolean>(() => {
    return localStorage.getItem('sm_hide_dashboard_finances') === 'true';
  });
  const [showUnlockModal, setShowUnlockModal] = useState<boolean>(false);
  const [unlockPin, setUnlockPin] = useState<string>('');
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState<boolean>(false);

  // Cash Flow & Accounts State
  const [cashFlow, setCashFlow] = useState<CashFlowSummary | null>(null);
  const [showTransferModal, setShowTransferModal] = useState<boolean>(false);
  const [transferFrom, setTransferFrom] = useState<string>('Cash');
  const [transferTo, setTransferTo] = useState<string>('Bank Transfer');
  const [transferAmount, setTransferAmount] = useState<string>('');
  const [transferNotes, setTransferNotes] = useState<string>('');
  const [transferring, setTransferring] = useState<boolean>(false);
  const [transferError, setTransferError] = useState<string | null>(null);

  const [showTransferHistoryModal, setShowTransferHistoryModal] = useState<boolean>(false);
  const [transfersList, setTransfersList] = useState<AccountTransfer[]>([]);
  const [loadingTransfers, setLoadingTransfers] = useState<boolean>(false);

  // Day detail modal state
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [daySalesDetail, setDaySalesDetail] = useState<DaySalesDetail | null>(null);
  const [loadingDay, setLoadingDay] = useState(false);

  const currency = settings?.currency || 'Rs.';

  const maskFinancial = (val: any) => {
    if (isFinancesHidden) {
      return '••••••';
    }
    return formatCurrency(val, currency);
  };

  const handleToggleFinancesPrivacy = () => {
    if (isFinancesHidden) {
      // User wants to reveal financials
      if (settings?.lock_dashboard_finances) {
        setUnlockPin('');
        setUnlockError(null);
        setShowUnlockModal(true);
      } else {
        setIsFinancesHidden(false);
        localStorage.setItem('sm_hide_dashboard_finances', 'false');
      }
    } else {
      // User wants to hide financials (always 1-click, no password required)
      setIsFinancesHidden(true);
      localStorage.setItem('sm_hide_dashboard_finances', 'true');
    }
  };

  const handleConfirmUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unlockPin.trim()) return;
    setUnlocking(true);
    setUnlockError(null);
    try {
      const res = await api.verifyDashboardPin(unlockPin.trim());
      if (res.valid) {
        setIsFinancesHidden(false);
        localStorage.setItem('sm_hide_dashboard_finances', 'false');
        setShowUnlockModal(false);
        setUnlockPin('');
      } else {
        setUnlockError(res.message || 'Incorrect PIN or Password.');
      }
    } catch (err: any) {
      setUnlockError(err.detail || err.message || 'Failed to verify PIN.');
    } finally {
      setUnlocking(false);
    }
  };

  const getAccountIcon = (accountName: string) => {
    const lower = (accountName || '').toLowerCase();
    if (lower.includes('cash')) {
      return <Wallet className="h-5 w-5 text-emerald-500" />;
    } else if (lower.includes('bank') || lower.includes('transfer') || lower.includes('meezan') || lower.includes('hbl') || lower.includes('alfalah')) {
      return <Landmark className="h-5 w-5 text-blue-500" />;
    } else if (lower.includes('easypaisa') || lower.includes('jazzcash') || lower.includes('nayapay') || lower.includes('sadapay') || lower.includes('wallet') || lower.includes('mobile')) {
      return <Smartphone className="h-5 w-5 text-purple-500" />;
    }
    return <CreditCard className="h-5 w-5 text-amber-500" />;
  };

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const [statsRes, billsRes, chartRes, cashFlowRes] = await Promise.all([
        api.getDashboardKPIs(),
        api.getBillsAttention().catch(() => []),
        api.getMonthlySalesChart(selectedYear, selectedMonth).catch(() => ({ daily_sales: [] } as any)),
        api.getCashFlowSummary().catch(() => null),
      ]);
      setStats(statsRes);
      setBillsAttention(billsRes || []);
      const points = Array.isArray(chartRes) ? chartRes : (chartRes?.daily_sales || []);
      setMonthlyChart(points);
      if (cashFlowRes) setCashFlow(cashFlowRes);
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

  const handleOpenTodaySalesDetail = async () => {
    const todayStr = new Date().toISOString().split('T')[0];
    setSelectedDate(todayStr);
    setLoadingDay(true);
    try {
      const data = await api.getDaySalesDetail(todayStr);
      setDaySalesDetail(data);
    } catch (err) {
      console.error('Failed to load today sales details:', err);
    } finally {
      setLoadingDay(false);
    }
  };

  const availableAccounts = useMemo(() => {
    const fromCashFlow = cashFlow?.accounts.map((a) => a.account) || [];
    const fromSettings = settings?.payment_accounts || ['Cash', 'Bank Transfer', 'Easypaisa', 'Jazzcash'];
    const combined = Array.from(new Set([...fromCashFlow, ...fromSettings]))
      .map((a) => a.trim())
      .filter((a) => a && a.toLowerCase() !== 'split');
    if (!combined.some((a) => a.toLowerCase() === 'cash')) {
      combined.unshift('Cash');
    }
    return combined;
  }, [cashFlow, settings]);

  const handleOpenTransfer = (fromAcc?: string) => {
    const from = fromAcc && fromAcc.toLowerCase() !== 'split' ? fromAcc : (availableAccounts[0] || 'Cash');
    const to = availableAccounts.find((a) => a.toLowerCase() !== from.toLowerCase()) || (availableAccounts[1] || 'Bank Transfer');
    setTransferFrom(from);
    setTransferTo(to);
    setTransferAmount('');
    setTransferNotes('');
    setTransferError(null);
    setShowTransferModal(true);
  };

  const handleExecuteTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(transferAmount);
    if (!amt || amt <= 0) {
      setTransferError('Please enter a valid transfer amount greater than 0.');
      return;
    }
    if (transferFrom.toLowerCase() === transferTo.toLowerCase()) {
      setTransferError('From Account and To Account cannot be the same account.');
      return;
    }

    const fromAccObj = cashFlow?.accounts?.find(
      (a) => a.account.toLowerCase() === transferFrom.toLowerCase()
    );
    const fromBalance = Number(fromAccObj?.current_balance || 0);

    if (fromBalance <= 0) {
      setTransferError(`Cannot transfer from '${transferFrom}' because it has no available funds (Balance: ${formatCurrency(fromBalance, currency)}).`);
      return;
    }

    if (amt > fromBalance) {
      setTransferError(`Transfer amount (${formatCurrency(amt, currency)}) cannot exceed available balance (${formatCurrency(fromBalance, currency)}) in '${transferFrom}'.`);
      return;
    }

    setTransferring(true);
    setTransferError(null);
    try {
      await api.createAccountTransfer({
        from_account: transferFrom,
        to_account: transferTo,
        amount: amt,
        notes: transferNotes.trim() || undefined,
      });
      setShowTransferModal(false);
      // Refresh dashboard & cash flow summary
      await loadDashboardData();
      if (selectedDate) {
        const data = await api.getDaySalesDetail(selectedDate);
        setDaySalesDetail(data);
      }
    } catch (err: any) {
      setTransferError(err.detail || err.message || 'Failed to complete transfer.');
    } finally {
      setTransferring(false);
    }
  };

  const handleOpenTransferHistory = async () => {
    setShowTransferHistoryModal(true);
    setLoadingTransfers(true);
    try {
      const list = await api.getAccountTransfers(100);
      setTransfersList(list || []);
    } catch (err) {
      console.error('Failed to load transfers:', err);
    } finally {
      setLoadingTransfers(false);
    }
  };

  const handleDeleteTransfer = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this transfer record?')) return;
    try {
      await api.deleteAccountTransfer(id);
      setTransfersList((prev) => prev.filter((t) => t.id !== id));
      const updated = await api.getCashFlowSummary();
      setCashFlow(updated);
    } catch (err: any) {
      alert(err.detail || err.message || 'Failed to delete transfer.');
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-brand-700 via-brand-800 to-slate-900 rounded-3xl p-6 text-white shadow-lg shadow-brand-950/10">
        <div>
          <h1 className="text-2xl font-black tracking-tight">
            Welcome to {settings?.business_name || 'Stock Manager'}
          </h1>
          <p className="text-brand-100 text-sm mt-1">
            Here is your live daily business and inventory summary.
          </p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Privacy Eye Toggle Button */}
          <button
            type="button"
            onClick={handleToggleFinancesPrivacy}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition shadow-xs border ${
              isFinancesHidden
                ? 'bg-amber-500/25 hover:bg-amber-500/35 text-amber-200 border-amber-300/40 shadow-amber-950/20'
                : 'bg-white/10 hover:bg-white/20 text-white border-white/20'
            }`}
            title={
              isFinancesHidden
                ? settings?.lock_dashboard_finances
                  ? 'Revenue & profits are hidden (Password protected). Click to unlock.'
                  : 'Revenue & profits are hidden. Click to reveal.'
                : 'Click to hide revenue and profits (Privacy Mode)'
            }
          >
            {isFinancesHidden ? (
              <>
                <EyeOff className="h-4 w-4 text-amber-300 shrink-0" />
                <span>Financials: Hidden</span>
                {settings?.lock_dashboard_finances && <Lock className="h-3 w-3 text-amber-300 ml-0.5" />}
              </>
            ) : (
              <>
                <Eye className="h-4 w-4 text-emerald-300 shrink-0" />
                <span>Hide Financials</span>
              </>
            )}
          </button>

          <Button
            variant="primary"
            size="md"
            className="font-bold border-none shadow-md"
            onClick={() => onNavigate('new_sale')}
            icon={<Plus className="h-4 w-4" />}
          >
            New Sale
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
        <div
          onClick={handleOpenTodaySalesDetail}
          className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between cursor-pointer hover:border-emerald-400 dark:hover:border-emerald-600 transition group hover:shadow-md"
          title="Click to view sales and account breakdown"
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                Today's Sales
              </span>
              <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 group-hover:scale-105 transition">
                <DollarSign className="h-5 w-5" />
              </div>
            </div>

            <div className="text-2xl lg:text-3xl font-black text-slate-900 dark:text-white">
              {maskFinancial(stats?.today_sales_revenue)}
            </div>

            {/* Account Collection Mini Pills */}
            {stats?.today_account_breakdown && stats.today_account_breakdown.length > 0 && !isFinancesHidden && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {stats.today_account_breakdown
                  .filter((item) => item.account.toLowerCase() !== 'split')
                  .map((item) => (
                    <span
                      key={item.account}
                      className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200/70 dark:border-slate-700"
                    >
                      <span className="text-slate-400">{item.account}:</span>
                      <span className="text-emerald-600 dark:text-emerald-400">{formatCurrency(item.total_collected, currency)}</span>
                    </span>
                  ))}
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
            {stats && (stats.today_past_debt_collected || 0) > 0 ? (
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 font-semibold text-slate-500 dark:text-slate-400">
                  <span>Cash:</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">{maskFinancial(stats.today_sales_cash || 0)}</span>
                  <span className="text-[11px] text-slate-400">(+{maskFinancial(stats.today_past_debt_collected)} debt)</span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 font-semibold text-slate-500 dark:text-slate-400">
                <span>Collected:</span>
                <span className="text-emerald-700 dark:text-emerald-400 font-bold">
                  {maskFinancial(stats?.today_sales_cash !== undefined ? stats.today_sales_cash : (stats?.today_collected_cash || 0))}
                  {stats && Number(stats.today_sales_revenue) > 0 && Number(stats.today_sales_cash ?? stats.today_collected_cash ?? 0) >= Number(stats.today_sales_revenue) && !isFinancesHidden ? ' (100%)' : ''}
                </span>
                {stats && Number(stats.today_sales_revenue) > Number(stats.today_sales_cash ?? stats.today_collected_cash ?? 0) && (
                  <span className="text-[11px] text-amber-600 font-semibold ml-1">
                    (Due: {maskFinancial(Number(stats.today_sales_revenue) - Number(stats.today_sales_cash ?? stats.today_collected_cash ?? 0))})
                  </span>
                )}
              </div>
            )}
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 group-hover:translate-x-0.5 transition-transform shrink-0 ml-2">
              Accounts <ArrowRight className="h-3 w-3" />
            </span>
          </div>
        </div>

        {/* Today's Gross Profit */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                Today's Gross Profit
              </span>
              <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">
                <TrendingUp className="h-5 w-5" />
              </div>
            </div>
            <div className="text-2xl lg:text-3xl font-black text-emerald-600 dark:text-emerald-400">
              {maskFinancial(stats?.today_gross_profit)}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
            {stats && (stats.today_past_debt_profit || 0) > 0 ? (
              <div className="flex items-center gap-1.5 font-semibold text-slate-500 dark:text-slate-400">
                <span>Realized:</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">{maskFinancial(stats.today_realized_profit || 0)}</span>
                <span className="text-[11px] text-slate-400">(+{maskFinancial(stats.today_past_debt_profit)} debt)</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 font-semibold text-slate-500 dark:text-slate-400">
                <span>Realized:</span>
                <span className="text-slate-700 dark:text-slate-300 font-bold">
                  {maskFinancial(stats?.today_realized_profit || 0)}
                  {stats && Number(stats.today_gross_profit) > 0 && Number(stats.today_realized_profit) >= Number(stats.today_gross_profit) && !isFinancesHidden ? ' (100%)' : ''}
                </span>
                {stats && Number(stats.today_unrealized_profit || 0) > 0 && (
                  <span className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold ml-1">
                    (Pending: {maskFinancial(stats.today_unrealized_profit || 0)})
                  </span>
                )}
              </div>
            )}
            <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500">
              Net Margin
            </span>
          </div>
        </div>

        {/* Customer Outstanding */}
        <div
          onClick={() => onNavigate('customers')}
          className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between cursor-pointer hover:border-amber-300 dark:hover:border-amber-700 transition group hover:shadow-md"
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                Customer Due
              </span>
              <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 group-hover:scale-105 transition">
                <Users className="h-5 w-5" />
              </div>
            </div>
            <div className="text-2xl lg:text-3xl font-black text-amber-600 dark:text-amber-400">
              {formatCurrency(stats?.customer_outstanding, currency)}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400 font-medium">
              Money customers owe you
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 dark:text-amber-400 group-hover:translate-x-0.5 transition-transform shrink-0">
              Manage <ArrowRight className="h-3 w-3" />
            </span>
          </div>
        </div>

        {/* Supplier Outstanding */}
        <div
          onClick={() => onNavigate('suppliers')}
          className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between cursor-pointer hover:border-rose-300 dark:hover:border-rose-700 transition group hover:shadow-md"
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                Supplier Payable
              </span>
              <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 group-hover:scale-105 transition">
                <Building2 className="h-5 w-5" />
              </div>
            </div>
            <div className="text-2xl lg:text-3xl font-black text-rose-600 dark:text-rose-400">
              {formatCurrency(stats?.supplier_outstanding, currency)}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400 font-medium">
              Money you owe suppliers
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 dark:text-rose-400 group-hover:translate-x-0.5 transition-transform shrink-0">
              Manage <ArrowRight className="h-3 w-3" />
            </span>
          </div>
        </div>
      </div>

      {/* Main Charts & Side Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monthly Interactive Chart */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="text-base font-black text-slate-800 dark:text-slate-100 tracking-tight">
                  Daily Sales Performance
                </h3>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                  Click on any day bar to view individual receipts and sold items
                </p>
              </div>

              {/* Month/Year selector */}
              <div className="flex items-center gap-2">
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold rounded-xl px-3 py-1.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-brand-500"
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
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold rounded-xl px-3 py-1.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-brand-500"
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
              <div className="py-24 text-center text-slate-400 dark:text-slate-500 text-xs flex flex-col items-center justify-center gap-2">
                <RefreshCw className="h-5 w-5 animate-spin text-brand-600" />
                <span>Loading daily sales performance...</span>
              </div>
            ) : monthlyChart.length === 0 ? (
              <div className="py-24 text-center text-slate-400 dark:text-slate-500 text-xs">
                No sales records found for this month.
              </div>
            ) : (
              <div className="pt-4">
                <div className="flex gap-2 sm:gap-3 h-56">
                  {/* Dedicated Y-Axis Labels Column */}
                  <div className="w-16 sm:w-20 shrink-0 flex flex-col justify-between text-right text-[10px] font-bold text-slate-400 dark:text-slate-500 pb-6 pr-1 select-none">
                    <span className="truncate" title={isFinancesHidden ? '••••' : formatCurrency(peakSale, currency)}>
                      {isFinancesHidden ? '••••' : formatCurrency(peakSale, currency)}
                    </span>
                    <span className="truncate" title={isFinancesHidden ? '••••' : formatCurrency(peakSale / 2, currency)}>
                      {isFinancesHidden ? '••••' : formatCurrency(peakSale / 2, currency)}
                    </span>
                    <span>0</span>
                  </div>

                  {/* Chart Grid & Bars Container */}
                  <div className="relative flex-1 h-full">
                    {/* Dashed Reference Guidelines spanning across */}
                    <div className="absolute inset-x-0 top-0 bottom-6 flex flex-col justify-between pointer-events-none opacity-40">
                      <div className="border-b border-dashed border-slate-200 dark:border-slate-800 w-full" />
                      <div className="border-b border-dashed border-slate-200 dark:border-slate-800 w-full" />
                      <div className="border-b border-slate-200 dark:border-slate-800 w-full" />
                    </div>

                    {/* Bars Flex Row */}
                    <div className="flex items-end gap-1 sm:gap-1.5 h-full relative z-10 border-b border-slate-200 dark:border-slate-800 pb-1">
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
                            <div className="absolute -top-12 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 bg-slate-900 dark:bg-slate-800 text-white text-[11px] py-1.5 px-2.5 rounded-xl shadow-xl whitespace-nowrap z-30 font-semibold border border-slate-700/50">
                              <div className="font-bold text-brand-400">Day {d.day} ({d.date})</div>
                              <div>{maskFinancial(revenueNum)} • {d.transaction_count} sale{d.transaction_count === 1 ? '' : 's'}</div>
                            </div>

                            {/* Bar */}
                            <div
                              style={{ height: `${hasSales ? Math.max(8, heightPercent) : 4}%` }}
                              className={`w-full rounded-t-md transition-all duration-300 ${
                                hasSales
                                  ? 'bg-brand-500 hover:bg-brand-400 group-hover:shadow-md shadow-brand-500/20'
                                  : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700'
                              } ${isToday ? 'ring-2 ring-brand-600 ring-offset-1 dark:ring-offset-slate-900' : ''}`}
                            />

                            {/* Day Label */}
                            <span
                              className={`text-[9px] font-bold mt-1.5 ${
                                isToday
                                  ? 'text-brand-600 dark:text-brand-400 font-black'
                                  : hasSales
                                  ? 'text-slate-700 dark:text-slate-300'
                                  : 'text-slate-300 dark:text-slate-600'
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
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400 mt-4">
            <div className="flex items-center gap-4">
              <span>
                Total Month Revenue:{' '}
                <strong className="text-slate-800 dark:text-slate-100 font-bold">
                  {maskFinancial(monthlyChart.reduce((sum, d) => sum + Number(d.sales_revenue || 0), 0))}
                </strong>
              </span>
              <span>
                Total Transactions:{' '}
                <strong className="text-slate-800 dark:text-slate-100 font-bold">
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
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded-lg ${
                  billsAttention.length === 0
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'
                    : 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400'
                }`}>
                  {billsAttention.length === 0 ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <AlertTriangle className="h-4 w-4" />
                  )}
                </div>
                <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 tracking-tight">
                  Bills Needing Attention
                </h3>
              </div>
              {billsAttention.length === 0 ? (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  All Clear
                </span>
              ) : (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300">
                  {billsAttention.length} Pending
                </span>
              )}
            </div>

            {billsAttention.length === 0 ? (
              <div className="py-10 flex flex-col items-center justify-center text-center">
                <div className="p-3 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 mb-2">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  All Bills Settled
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-[220px]">
                  No overdue or immediate upcoming bills requiring attention right now.
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                {billsAttention.map((b) => (
                  <div
                    key={b.id}
                    className="p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800 transition flex items-center justify-between"
                  >
                    <div>
                      <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">{b.name}</h4>
                      <div className="flex items-center gap-2 mt-1 text-xs">
                        <span className="font-semibold text-rose-600 dark:text-rose-400">{b.urgency_label}</span>
                        <span className="text-slate-300 dark:text-slate-600">•</span>
                        <span className="text-slate-500 dark:text-slate-400">
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

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 mt-4">
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

      {/* Accounts Manager & Day Sales Detail Modal */}
      {(() => {
        const todayStr = new Date().toISOString().split('T')[0];
        const isTodaySelected = Boolean(selectedDate && selectedDate === todayStr);

        return (
          <Modal
            isOpen={Boolean(selectedDate)}
            onClose={() => {
              setSelectedDate(null);
              setDaySalesDetail(null);
            }}
            title={isTodaySelected ? 'Accounts Manager' : `Sales on ${selectedDate}`}
            subtitle={
              isTodaySelected
                ? "Live business accounts, today's collections & inter-account transfers"
                : `${daySalesDetail?.transaction_count || 0} Transactions Completed`
            }
            maxWidth={isTodaySelected ? '4xl' : '2xl'}
          >
            {loadingDay ? (
              <div className="py-12 text-center text-slate-400">Loading details...</div>
            ) : daySalesDetail?.sales.length === 0 && !isTodaySelected ? (
              <div className="py-8 text-center text-slate-500">
                No sales recorded on this day.
              </div>
            ) : (
              <div className="space-y-5">
                {/* 1. Accounts Overview & Fund Transfers Banner (For Today's Sales) */}
                {isTodaySelected && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-2xl shadow-sm">
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                        Total Business Funds in Accounts
                      </span>
                      <div className="text-2xl font-black text-white mt-0.5">
                        {maskFinancial(cashFlow?.total_business_funds)}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        Today's Sales Revenue: <strong className="text-emerald-400">{maskFinancial(daySalesDetail?.sales_revenue || stats?.today_sales_revenue)}</strong> ({daySalesDetail?.transaction_count || 0} receipts)
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={handleOpenTransferHistory}
                        className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-white border border-slate-700 transition shadow-xs active:scale-[0.98]"
                      >
                        <History className="h-4 w-4 text-slate-300" />
                        Transfer Log
                      </button>
                      <Button
                        variant="primary"
                        size="sm"
                        icon={<ArrowLeftRight className="h-4 w-4" />}
                        onClick={() => handleOpenTransfer()}
                        className="text-xs font-bold"
                      >
                        Transfer Funds
                      </Button>
                    </div>
                  </div>
                )}

                {/* 2. Business Accounts & Live Balances (Only in Accounts Manager) */}
                {isTodaySelected && (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Wallet className="h-4 w-4 text-brand-600 dark:text-brand-400" />
                        <span className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                          Business Accounts & Balances
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400">
                        Money present in each account from business
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      {(cashFlow?.accounts && cashFlow.accounts.length > 0
                        ? cashFlow.accounts.filter((a) => a.account.toLowerCase() !== 'split')
                        : availableAccounts.map((acc) => ({
                            account: acc,
                            current_balance: 0,
                            total_sales_inflow: 0,
                            today_sales_inflow: 0,
                            net_transfers: 0,
                          }))
                      ).map((acc) => {
                        const isNegative = Number(acc.current_balance) < 0;
                        return (
                          <div
                            key={acc.account}
                            className="p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 hover:border-brand-500/50 transition flex flex-col justify-between space-y-2.5 shadow-2xs"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="w-7 h-7 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0">
                                  {getAccountIcon(acc.account)}
                                </div>
                                <div className="min-w-0">
                                  <div className="font-bold text-xs text-slate-900 dark:text-white truncate">
                                    {acc.account}
                                  </div>
                                  <div className="text-[10px] text-slate-400">
                                    {acc.account.toLowerCase() === 'cash' ? 'Counter Cash' : 'Tender Account'}
                                  </div>
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleOpenTransfer(acc.account)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-950/40 transition shrink-0"
                                title={`Transfer from ${acc.account}`}
                              >
                                <ArrowLeftRight className="h-3.5 w-3.5" />
                              </button>
                            </div>

                            <div>
                              <div className={`text-lg font-black ${isNegative ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>
                                {maskFinancial(acc.current_balance)}
                              </div>

                              <div className="mt-1.5 pt-1.5 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 font-semibold">
                                <span>Today's Sales:</span>
                                <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                                  +{maskFinancial(acc.today_sales_inflow)}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 3. Non-today date revenue banner */}
                {!isTodaySelected && (
                  <div className="flex items-center justify-between p-4 bg-brand-50 dark:bg-brand-950/40 text-brand-900 dark:text-brand-100 rounded-2xl border border-brand-100 dark:border-brand-900/50">
                    <div>
                      <span className="text-xs font-semibold uppercase text-brand-700 dark:text-brand-300">
                        Total Day Sales Revenue
                      </span>
                      <div className="text-2xl font-black text-brand-900 dark:text-brand-100">
                        {maskFinancial(daySalesDetail?.sales_revenue)}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-semibold uppercase text-brand-700 dark:text-brand-300">
                        Total Receipts
                      </span>
                      <div className="text-2xl font-black text-brand-900 dark:text-brand-100">
                        {daySalesDetail?.transaction_count}
                      </div>
                    </div>
                  </div>
                )}

                {/* 4. Account Collections Breakdown */}
                {daySalesDetail?.account_breakdown && daySalesDetail.account_breakdown.length > 0 && (
                  <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/60 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                          {isTodaySelected ? "Today's Collections by Account" : 'Collections by Account'}
                        </span>
                        <span className="text-[11px] text-slate-400 block mt-0.5">
                          Where money was received ({maskFinancial(daySalesDetail.sales_revenue)})
                        </span>
                      </div>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                        {daySalesDetail.transaction_count} {daySalesDetail.transaction_count === 1 ? 'sale' : 'sales'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {(() => {
                        const filteredBreakdown = daySalesDetail.account_breakdown.filter((x) => x.account.toLowerCase() !== 'split');
                        const totalDayCollected = filteredBreakdown.reduce(
                          (sum, x) => sum + Number(x.total_collected || 0),
                          0
                        );
                        return filteredBreakdown.map((ab) => {
                          const pct = totalDayCollected > 0
                            ? Math.round((Number(ab.total_collected || 0) / totalDayCollected) * 100)
                            : 0;
                          return (
                            <div
                              key={ab.account}
                              className="p-3.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs flex items-center justify-between gap-3"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-700/60 shrink-0">
                                  {getAccountIcon(ab.account)}
                                </div>
                                <div className="min-w-0">
                                  <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                                    {ab.account}
                                  </div>
                                  <div className="text-xs text-slate-400 font-medium">
                                    {pct}% of collections
                                  </div>
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <div className="text-base font-black text-slate-900 dark:text-white">
                                  {maskFinancial(ab.total_collected)}
                                </div>
                                {Number(ab.debt_amount || 0) > 0 && (
                                  <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                                    +{maskFinancial(ab.debt_amount)} debt
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                )}

                {/* 5. Receipts List */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-1">
                    <span>{isTodaySelected ? "Today's Receipts" : `Receipts on ${selectedDate}`}</span>
                    <span>{daySalesDetail?.sales.length || 0} Transactions</span>
                  </div>
                  <div className="max-h-[280px] overflow-y-auto space-y-2 pr-1">
                    {daySalesDetail?.sales.map((sale) => (
                      <div
                        key={sale.id}
                        className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition text-sm shadow-2xs"
                      >
                        <div>
                          <div className="font-bold text-slate-900 dark:text-white">{sale.receipt_number}</div>
                          <div className="text-xs text-slate-400 dark:text-slate-500">
                            {sale.customer_name || 'Walk-in Customer'} • {new Date(sale.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-black text-slate-900 dark:text-white">
                            {maskFinancial(sale.total_amount)}
                          </div>
                          <div className="flex items-center justify-end gap-1.5 mt-1">
                            <Badge status={sale.payment_status} />
                            {sale.payments && sale.payments.length > 0 && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-750 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                {Array.from(new Set(sale.payments.map((p) => p.payment_method).filter(Boolean))).filter((m) => m.toLowerCase() !== 'split').join(', ') || 'Cash'}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </Modal>
        );
      })()}

      {/* Financials Unlock PIN / Password Modal */}
      <Modal
        isOpen={showUnlockModal}
        onClose={() => {
          setShowUnlockModal(false);
          setUnlockPin('');
          setUnlockError(null);
        }}
        title="Unlock Dashboard Financials"
        subtitle="Enter your PIN or Admin Password to reveal revenue and profits"
        maxWidth="sm"
      >
        <form onSubmit={handleConfirmUnlock} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
              Enter PIN or Admin Password
            </label>
            <input
              type="password"
              autoFocus
              value={unlockPin}
              onChange={(e) => {
                setUnlockPin(e.target.value);
                setUnlockError(null);
              }}
              placeholder="e.g. 1234 or Admin Password"
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-bold text-slate-800 dark:text-white focus:outline-none focus:border-brand-500 shadow-xs"
              required
            />
          </div>

          {unlockError && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-300 text-xs font-semibold">
              {unlockError}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setShowUnlockModal(false);
                setUnlockPin('');
                setUnlockError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={unlocking}
              icon={<Unlock className="h-4 w-4" />}
            >
              Unlock Financials
            </Button>
          </div>
        </form>
      </Modal>

      {/* Transfer Funds Modal */}
      <Modal
        isOpen={showTransferModal}
        onClose={() => {
          setShowTransferModal(false);
          setTransferError(null);
        }}
        title="Transfer Funds Between Accounts"
        subtitle="Move business funds from one account to another (e.g. Cash to Bank Transfer)"
        maxWidth="md"
      >
        <form onSubmit={handleExecuteTransfer} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                From Account
              </label>
              <select
                value={transferFrom}
                onChange={(e) => {
                  const newFrom = e.target.value;
                  setTransferFrom(newFrom);
                  if (transferTo.toLowerCase() === newFrom.toLowerCase()) {
                    const fallbackTo = availableAccounts.find((a) => a.toLowerCase() !== newFrom.toLowerCase()) || 'Cash';
                    setTransferTo(fallbackTo);
                  }
                }}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-bold text-slate-800 dark:text-white focus:outline-none focus:border-brand-500 shadow-xs"
                required
              >
                {availableAccounts.map((acc) => (
                  <option key={acc} value={acc}>
                    {acc}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                To Account
              </label>
              <select
                value={transferTo}
                onChange={(e) => setTransferTo(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-bold text-slate-800 dark:text-white focus:outline-none focus:border-brand-500 shadow-xs"
                required
              >
                {availableAccounts
                  .filter((acc) => acc.toLowerCase() !== transferFrom.toLowerCase())
                  .map((acc) => (
                    <option key={acc} value={acc}>
                      {acc}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {(() => {
            const fromAccObj = cashFlow?.accounts?.find(
              (a) => a.account.toLowerCase() === transferFrom.toLowerCase()
            );
            const fromBalance = Number(fromAccObj?.current_balance || 0);
            const isExceeding = Number(transferAmount) > fromBalance;
            const isZeroOrNegative = fromBalance <= 0;

            return (
              <>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      Transfer Amount ({currency})
                    </label>
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="text-slate-400">Available:</span>
                      <span
                        className={`font-bold ${
                          isZeroOrNegative
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        {formatCurrency(fromBalance, currency)}
                      </span>
                      {fromBalance > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setTransferAmount(String(fromBalance));
                            setTransferError(null);
                          }}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-brand-50 hover:bg-brand-100 dark:bg-brand-950 dark:hover:bg-brand-900 text-brand-700 dark:text-brand-300 font-black uppercase transition tracking-wider cursor-pointer"
                          title={`Fill maximum available (${formatCurrency(fromBalance, currency)})`}
                        >
                          Max
                        </button>
                      )}
                    </div>
                  </div>
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    max={fromBalance > 0 ? fromBalance : undefined}
                    value={transferAmount}
                    onChange={(e) => {
                      const val = e.target.value.replace(/^0+(?=[1-9])/, '');
                      setTransferAmount(val);
                      if (Number(val) > fromBalance) {
                        setTransferError(
                          `Amount exceeds available balance in ${transferFrom} (${formatCurrency(fromBalance, currency)}).`
                        );
                      } else {
                        setTransferError(null);
                      }
                    }}
                    onFocus={(e) => {
                      requestAnimationFrame(() => e.target.select());
                    }}
                    placeholder="0.00"
                    className={`w-full bg-slate-50 dark:bg-slate-800 border rounded-xl px-3.5 py-2.5 text-sm font-bold text-slate-800 dark:text-white focus:outline-none focus:border-brand-500 shadow-xs ${
                      isExceeding
                        ? 'border-rose-400 dark:border-rose-600 bg-rose-50/30'
                        : 'border-slate-300 dark:border-slate-700'
                    }`}
                    required
                    autoFocus
                  />
                </div>

                {isZeroOrNegative && (
                  <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-300 text-xs font-semibold flex items-center gap-2">
                    <span className="shrink-0 text-sm">⚠️</span>
                    <span>
                      <strong>{transferFrom}</strong> currently has an available balance of {formatCurrency(fromBalance, currency)}. You must record sales in this account or transfer funds into it before transferring out.
                    </span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                    Notes / Description (Optional)
                  </label>
                  <input
                    type="text"
                    value={transferNotes}
                    onChange={(e) => setTransferNotes(e.target.value)}
                    placeholder="e.g. Bank deposit of daily cash register"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-brand-500 shadow-xs"
                  />
                </div>

                {transferError && (
                  <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-300 text-xs font-semibold">
                    {transferError}
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowTransferModal(false);
                      setTransferError(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    loading={transferring}
                    disabled={isExceeding || isZeroOrNegative || !transferAmount || Number(transferAmount) <= 0}
                    icon={<ArrowLeftRight className="h-4 w-4" />}
                  >
                    Confirm Transfer
                  </Button>
                </div>
              </>
            );
          })()}
        </form>
      </Modal>

      {/* Transfer History Modal */}
      <Modal
        isOpen={showTransferHistoryModal}
        onClose={() => setShowTransferHistoryModal(false)}
        title="Inter-Account Transfer History"
        subtitle="Recent fund transfers between business accounts"
        maxWidth="2xl"
      >
        {loadingTransfers ? (
          <div className="py-12 text-center text-slate-400">Loading transfers...</div>
        ) : transfersList.length === 0 ? (
          <div className="py-10 text-center text-slate-500">
            <ArrowLeftRight className="h-10 w-10 mx-auto mb-2 text-slate-300 dark:text-slate-600 stroke-[1.5]" />
            <div className="font-semibold text-slate-700 dark:text-slate-300">No transfers recorded yet</div>
            <div className="text-xs text-slate-400 mt-1">
              Use "Transfer Funds" above to record movements between your accounts.
            </div>
          </div>
        ) : (
          <div className="space-y-3 max-h-[450px] overflow-y-auto pr-1">
            {transfersList.map((t) => (
              <div
                key={t.id}
                className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850 hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-brand-50 dark:bg-brand-950/50 text-brand-600 dark:text-brand-400 shrink-0">
                    <ArrowLeftRight className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                        {t.from_account}
                      </span>
                      <ArrowRight className="h-3 w-3 text-slate-400 shrink-0" />
                      <span className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                        {t.to_account}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                        {t.transfer_number}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {formatDateTime(t.transfer_date)}
                      {t.notes && <span className="ml-2 italic text-slate-500">"{t.notes}"</span>}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-black text-slate-900 dark:text-white text-base">
                    {maskFinancial(t.amount)}
                  </span>
                  <button
                    onClick={() => handleDeleteTransfer(t.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
                    title="Delete Transfer Record"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
};
