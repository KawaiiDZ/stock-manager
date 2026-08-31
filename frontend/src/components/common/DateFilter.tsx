import React, { useState } from 'react';
import { Calendar } from 'lucide-react';

export type DatePreset = 'all' | 'today' | 'yesterday' | 'this_week' | 'this_month' | 'custom';

interface DateFilterProps {
  onFilterChange: (startDate?: string, endDate?: string, preset?: DatePreset) => void;
}

export const DateFilter: React.FC<DateFilterProps> = ({ onFilterChange }) => {
  const [preset, setPreset] = useState<DatePreset>('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const formatDate = (d: Date) => d.toISOString().split('T')[0];

  const applyPreset = (newPreset: DatePreset) => {
    setPreset(newPreset);
    const today = new Date();

    if (newPreset === 'all') {
      onFilterChange(undefined, undefined, 'all');
    } else if (newPreset === 'today') {
      const todayStr = formatDate(today);
      onFilterChange(todayStr, todayStr, 'today');
    } else if (newPreset === 'yesterday') {
      const yest = new Date(today);
      yest.setDate(today.getDate() - 1);
      const yestStr = formatDate(yest);
      onFilterChange(yestStr, yestStr, 'yesterday');
    } else if (newPreset === 'this_week') {
      const day = today.getDay();
      const diff = today.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(today.setDate(diff));
      onFilterChange(formatDate(monday), formatDate(new Date()), 'this_week');
    } else if (newPreset === 'this_month') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      onFilterChange(formatDate(firstDay), formatDate(new Date()), 'this_month');
    }
  };

  const handleCustomApply = () => {
    if (customStart && customEnd) {
      onFilterChange(customStart, customEnd, 'custom');
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm">
      <div className="flex items-center gap-1 px-2 text-slate-400">
        <Calendar className="h-4 w-4" />
      </div>
      {(
        [
          ['all', 'All Time'],
          ['today', 'Today'],
          ['yesterday', 'Yesterday'],
          ['this_week', 'This Week'],
          ['this_month', 'This Month'],
          ['custom', 'Custom'],
        ] as [DatePreset, string][]
      ).map(([key, label]) => (
        <button
          key={key}
          onClick={() => applyPreset(key)}
          className={`px-3 py-1.5 rounded-xl font-medium transition ${
            preset === key
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          {label}
        </button>
      ))}

      {preset === 'custom' && (
        <div className="flex items-center gap-2 ml-2 pl-2 border-l border-slate-200">
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700 focus:outline-none focus:border-emerald-500"
          />
          <span className="text-slate-400 text-xs">to</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700 focus:outline-none focus:border-emerald-500"
          />
          <button
            onClick={handleCustomApply}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold"
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
};
