import React, { useState, useEffect } from 'react';
import { Calendar } from 'lucide-react';

export type DatePreset = 'all' | 'today' | 'yesterday' | 'this_week' | 'this_month' | 'custom';

interface DateFilterProps {
  onFilterChange: (startDate?: string, endDate?: string, preset?: DatePreset) => void;
  activePreset?: DatePreset;
}

export const formatLocalDate = (d: Date): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const DateFilter: React.FC<DateFilterProps> = ({ onFilterChange, activePreset }) => {
  const [preset, setPreset] = useState<DatePreset>(activePreset || 'all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  useEffect(() => {
    if (activePreset && activePreset !== preset) {
      setPreset(activePreset);
      if (activePreset !== 'custom') {
        setCustomStart('');
        setCustomEnd('');
      }
    }
  }, [activePreset]);

  const applyPreset = (newPreset: DatePreset) => {
    setPreset(newPreset);
    const now = new Date();

    if (newPreset === 'all') {
      onFilterChange(undefined, undefined, 'all');
    } else if (newPreset === 'today') {
      const todayStr = formatLocalDate(now);
      onFilterChange(todayStr, todayStr, 'today');
    } else if (newPreset === 'yesterday') {
      const yest = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      const yestStr = formatLocalDate(yest);
      onFilterChange(yestStr, yestStr, 'yesterday');
    } else if (newPreset === 'this_week') {
      const day = now.getDay(); // 0 is Sun, 1 is Mon
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(now.getFullYear(), now.getMonth(), diff);
      const todayStr = formatLocalDate(now);
      onFilterChange(formatLocalDate(monday), todayStr, 'this_week');
    } else if (newPreset === 'this_month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const todayStr = formatLocalDate(now);
      onFilterChange(formatLocalDate(firstDay), todayStr, 'this_month');
    }
  };

  const handleCustomApply = () => {
    let start = customStart || undefined;
    let end = customEnd || undefined;

    if (start && end && start > end) {
      const temp = start;
      start = end;
      end = temp;
      setCustomStart(start);
      setCustomEnd(end);
    }

    if (start || end) {
      onFilterChange(start, end, 'custom');
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
