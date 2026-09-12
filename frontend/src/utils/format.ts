export const STANDARD_DATE_FORMATS = [
  { id: 'YYYY-MM-DD', label: 'YYYY-MM-DD (e.g. 2026-09-09)' },
  { id: 'DD/MM/YYYY', label: 'DD/MM/YYYY (e.g. 09/09/2026)' },
  { id: 'MM/DD/YYYY', label: 'MM/DD/YYYY (e.g. 09/09/2026)' },
  { id: 'DD-MM-YYYY', label: 'DD-MM-YYYY (e.g. 09-09-2026)' },
  { id: 'DD MMM YYYY', label: 'DD MMM YYYY (e.g. 09 Sep 2026)' },
  { id: 'MMMM DD, YYYY', label: 'MMMM DD, YYYY (e.g. September 09, 2026)' },
  { id: 'DD.MM.YYYY', label: 'DD.MM.YYYY (e.g. 09.09.2026)' },
];

export const getGlobalDateFormat = (): string => {
  try {
    return localStorage.getItem('stock_manager_date_format') || 'YYYY-MM-DD';
  } catch {
    return 'YYYY-MM-DD';
  }
};

export const getGlobalFormatWithCommas = (): boolean => {
  try {
    const val = localStorage.getItem('stock_manager_format_commas');
    return val === null ? true : val === 'true';
  } catch {
    return true;
  }
};

export const getGlobalCurrency = (): string => {
  try {
    return localStorage.getItem('stock_manager_currency') || 'Rs.';
  } catch {
    return 'Rs.';
  }
};

export const setGlobalCurrency = (currency: string) => {
  try {
    if (currency && currency.trim()) {
      localStorage.setItem('stock_manager_currency', currency.trim());
    }
  } catch {
    // Ignore localStorage failures
  }
};

export const setGlobalFormattingPreferences = (prefs: {
  dateFormat?: string;
  formatPricesWithCommas?: boolean;
  currency?: string;
}) => {
  try {
    if (prefs.dateFormat) {
      localStorage.setItem('stock_manager_date_format', prefs.dateFormat);
    }
    if (prefs.formatPricesWithCommas !== undefined) {
      localStorage.setItem('stock_manager_format_commas', String(prefs.formatPricesWithCommas));
    }
    if (prefs.currency && prefs.currency.trim()) {
      localStorage.setItem('stock_manager_currency', prefs.currency.trim());
    }
  } catch {
    // Ignore localStorage failures
  }
};

export const formatMoney = (
  val: number | string | undefined | null,
  useCommas?: boolean
): string => {
  if (val === undefined || val === null || val === '') return '0.00';
  const num = typeof val === 'number' ? val : parseFloat(String(val));
  if (isNaN(num)) return '0.00';

  const withCommas = useCommas !== undefined ? useCommas : getGlobalFormatWithCommas();
  if (withCommas) {
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return num.toFixed(2);
};

export const formatCurrency = (
  val: number | string | undefined | null,
  currency?: string,
  useCommas?: boolean
): string => {
  const curr = currency !== undefined && currency !== null && currency !== '' ? currency : getGlobalCurrency();
  return `${curr} ${formatMoney(val, useCommas)}`;
};

export const formatQty = (val: number | string | undefined | null): string => {
  if (val === undefined || val === null || val === '') return '0';
  const num = typeof val === 'number' ? val : parseFloat(String(val));
  return isNaN(num) ? '0' : String(num);
};

export const formatDate = (
  dateInput: string | number | Date | null | undefined,
  customFormat?: string
): string => {
  if (!dateInput) return '-';
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(date.getTime())) return String(dateInput);

  const fmt = customFormat || getGlobalDateFormat();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const monthNamesShort = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  const monthNamesFull = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const mmm = monthNamesShort[date.getMonth()];
  const mmmm = monthNamesFull[date.getMonth()];

  switch (fmt) {
    case 'DD/MM/YYYY':
      return `${dd}/${mm}/${yyyy}`;
    case 'MM/DD/YYYY':
      return `${mm}/${dd}/${yyyy}`;
    case 'DD-MM-YYYY':
      return `${dd}-${mm}-${yyyy}`;
    case 'DD MMM YYYY':
      return `${dd} ${mmm} ${yyyy}`;
    case 'MMMM DD, YYYY':
      return `${mmmm} ${dd}, ${yyyy}`;
    case 'DD.MM.YYYY':
      return `${dd}.${mm}.${yyyy}`;
    case 'YYYY-MM-DD':
    default:
      return `${yyyy}-${mm}-${dd}`;
  }
};

export const formatDateTime = (
  dateInput: string | number | Date | null | undefined,
  customFormat?: string
): string => {
  if (!dateInput) return '-';
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(date.getTime())) return String(dateInput);
  const dateStr = formatDate(date, customFormat);
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${dateStr} ${timeStr}`;
};
