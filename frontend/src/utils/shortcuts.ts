/**
 * Central Keyboard Shortcuts System for StokFlow Stock Manager
 * 
 * Provides global navigation keybindings and platform-aware badge labels.
 * Designed to never interfere with text inputs or browser default operations.
 */

export const isMac =
  typeof window !== 'undefined' &&
  /Mac|iPod|iPhone|iPad/.test(window.navigator?.platform || window.navigator?.userAgent || '');

/**
 * Returns true if the user is actively typing in a form input,
 * textarea, select element, or editable block.
 */
export const isInputFocused = (): boolean => {
  if (typeof document === 'undefined') return false;
  const active = document.activeElement;
  if (!active) return false;
  const tag = active.tagName.toLowerCase();
  return (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    (active as HTMLElement).isContentEditable
  );
};

export interface ShortcutDefinition {
  id: string;
  tab: string;
  title: string;
  code: string; // Internal key identifier
  displayKey: string; // Formatted badge string e.g. "Alt + 1"
  description: string;
}

export const SHORTCUT_REGISTRY: Record<string, ShortcutDefinition> = {
  pos: {
    id: 'pos',
    tab: 'new_sale',
    title: 'Point of Sale (POS)',
    code: '1',
    displayKey: 'Alt + 1',
    description: 'Instant barcode checkout & cash register',
  },
  sales_history: {
    id: 'sales_history',
    tab: 'sales_history',
    title: 'Sales History',
    code: '2',
    displayKey: 'Alt + 2',
    description: 'Invoices, transaction receipts & sales ledger',
  },
  products: {
    id: 'products',
    tab: 'products',
    title: 'Products & Stock',
    code: '3',
    displayKey: 'Alt + 3',
    description: 'Inventory catalog, pricing, SKUs & low-stock warnings',
  },
  stock_movements: {
    id: 'stock_movements',
    tab: 'stock_movements',
    title: 'Stock Movements',
    code: '4',
    displayKey: 'Alt + 4',
    description: 'Audit log of stock additions, adjustments & transfers',
  },
  purchases: {
    id: 'purchases',
    tab: 'purchases',
    title: 'Purchases & Restock',
    code: '5',
    displayKey: 'Alt + 5',
    description: 'Vendor restock orders, purchase bills & supplier intake',
  },
  customers: {
    id: 'customers',
    tab: 'customers',
    title: 'Customers & CRM',
    code: '6',
    displayKey: 'Alt + 6',
    description: 'Customer profiles, credit balances & receivables',
  },
  suppliers: {
    id: 'suppliers',
    tab: 'suppliers',
    title: 'Suppliers Directory',
    code: '7',
    displayKey: 'Alt + 7',
    description: 'Vendor contact information & accounts payable ledger',
  },
  expenses: {
    id: 'expenses',
    tab: 'expenses',
    title: 'Expenses & Bills',
    code: '8',
    displayKey: 'Alt + 8',
    description: 'Daily operational expenses & urgent utility bills',
  },
  reports: {
    id: 'reports',
    tab: 'reports',
    title: 'Reports & Analytics',
    code: '9',
    displayKey: 'Alt + 9',
    description: 'P&L financials, revenue trends & product performance',
  },
  dashboard: {
    id: 'dashboard',
    tab: 'dashboard',
    title: 'Executive Dashboard',
    code: '0',
    displayKey: 'Alt + 0',
    description: 'Live business overview & key performance metrics',
  },
  hub: {
    id: 'hub',
    tab: 'hub',
    title: 'Navigation Hub',
    code: 'h',
    displayKey: 'Alt + H',
    description: 'Department directory & quick action launchpad',
  },
  quotations: {
    id: 'quotations',
    tab: 'quotations',
    title: 'Quotations & Estimates',
    code: 'q',
    displayKey: 'Alt + Q',
    description: 'Client proposals, estimates & 1-click sales conversion',
  },
  settings: {
    id: 'settings',
    tab: 'settings',
    title: 'Business Settings',
    code: ',',
    displayKey: 'Alt + ,',
    description: 'Printers, hardware, taxes, schema & database backups',
  },
};

/**
 * Handles global keyboard event and triggers tab navigation.
 * Returns true if a shortcut was handled and prevented default.
 */
export const dispatchGlobalShortcut = (
  e: KeyboardEvent,
  onNavigate: (tab: string) => void
): boolean => {
  // F2 always triggers New Sale anywhere in the software (even inside inputs)
  if (e.key === 'F2') {
    e.preventDefault();
    onNavigate('new_sale');
    return true;
  }

  // All application shortcuts use Alt (Option on macOS) or dedicated function keys
  if (!e.altKey || e.ctrlKey || e.metaKey) {
    return false;
  }

  const code = e.code;
  const key = e.key.toLowerCase();

  // Match primarily by e.code (universal across Mac, Windows, Linux and keyboard layouts)
  switch (code) {
    case 'Digit1':
    case 'KeyS':
      e.preventDefault();
      onNavigate('new_sale');
      return true;

    case 'Digit2':
      e.preventDefault();
      onNavigate('sales_history');
      return true;

    case 'Digit3':
    case 'KeyP':
      e.preventDefault();
      onNavigate('products');
      return true;

    case 'Digit4':
      e.preventDefault();
      onNavigate('stock_movements');
      return true;

    case 'Digit5':
    case 'KeyU':
      e.preventDefault();
      onNavigate('purchases');
      return true;

    case 'Digit6':
    case 'KeyC':
      e.preventDefault();
      onNavigate('customers');
      return true;

    case 'Digit7':
    case 'KeyV':
      e.preventDefault();
      onNavigate('suppliers');
      return true;

    case 'Digit8':
    case 'KeyE':
      e.preventDefault();
      onNavigate('expenses');
      return true;

    case 'Digit9':
    case 'KeyR':
      e.preventDefault();
      onNavigate('reports');
      return true;

    case 'Digit0':
    case 'KeyD':
      e.preventDefault();
      onNavigate('dashboard');
      return true;

    case 'KeyH':
      e.preventDefault();
      onNavigate('hub');
      return true;

    case 'KeyQ':
      e.preventDefault();
      onNavigate('quotations');
      return true;

    case 'Comma':
    case 'KeyT':
      e.preventDefault();
      onNavigate('settings');
      return true;
  }

  // Fallback check on key character (supporting Windows/Linux literal keys & Mac Option-generated symbols)
  switch (key) {
    case '1':
    case 's':
    case '¡':
    case 'ß':
      e.preventDefault();
      onNavigate('new_sale');
      return true;

    case '2':
    case '™':
      e.preventDefault();
      onNavigate('sales_history');
      return true;

    case '3':
    case 'p':
    case '£':
    case 'π':
      e.preventDefault();
      onNavigate('products');
      return true;

    case '4':
    case '¢':
      e.preventDefault();
      onNavigate('stock_movements');
      return true;

    case '5':
    case 'u':
    case '∞':
      e.preventDefault();
      onNavigate('purchases');
      return true;

    case '6':
    case 'c':
    case '§':
      e.preventDefault();
      onNavigate('customers');
      return true;

    case '7':
    case 'v':
    case '¶':
      e.preventDefault();
      onNavigate('suppliers');
      return true;

    case '8':
    case 'e':
    case '•':
      e.preventDefault();
      onNavigate('expenses');
      return true;

    case '9':
    case 'r':
    case 'ª':
      e.preventDefault();
      onNavigate('reports');
      return true;

    case '0':
    case 'd':
    case 'º':
      e.preventDefault();
      onNavigate('dashboard');
      return true;

    case 'h':
    case '˙':
      e.preventDefault();
      onNavigate('hub');
      return true;

    case 'q':
    case 'œ':
      e.preventDefault();
      onNavigate('quotations');
      return true;

    case ',':
    case 't':
    case '≤':
      e.preventDefault();
      onNavigate('settings');
      return true;

    default:
      return false;
  }
};
