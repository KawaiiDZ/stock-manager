import {
  Product, Category, CustomField, CustomValueDto,
  Customer, CustomerLedgerEntry,
  Supplier, SupplierLedgerEntry,
  Sale, SalesReturn, ReceiptPrintData, PaymentSplit,
  Purchase, Bill, BillCategory, BillAttention,
  Expense, ExpenseCategory,
  DashboardKPIs, MonthlySalesData, DaySalesDetail,
  BusinessSettings, BackupFile, LoginResponse, IndustryPreset,
  Quotation, QuotationCreate, QuotationConversionCheckResponse, QuotationConvertRequest,
  GoogleDriveFileItem, GoogleBackupStatusResponse, GoogleBackupSettingsUpdate, GoogleBackupActionResponse,
  PrinterInfo,
  User, UserCreate, UserUpdate,
  SyncPushRequest, SyncPushResponse, SyncSnapshotResponse,
  NetworkInfo, DiscoveredHost, HostPingResponse, TestHostResponse,
  ClientHeartbeatRequest, ConnectedClientItem, ConnectedClientsResponse
} from '../types';
import { offlineStorage } from './offlineStorage';

let _isKnownOffline = false;
export function setOfflineMode(isOffline: boolean): void {
  _isKnownOffline = isOffline;
}
export function isOfflineMode(): boolean {
  return _isKnownOffline;
}

export function getRemoteHostUrl(): string {
  return (localStorage.getItem('remote_host_url') || '').replace(/\/+$/, '');
}

export function setRemoteHostUrl(url: string | null): void {
  if (url) {
    localStorage.setItem('remote_host_url', url.trim().replace(/\/+$/, ''));
  } else {
    localStorage.removeItem('remote_host_url');
  }
}

export function getAuthToken(): string | null {
  return localStorage.getItem('auth_token');
}

export function setAuthToken(token: string | null): void {
  if (token) {
    localStorage.setItem('auth_token', token);
  } else {
    localStorage.removeItem('auth_token');
  }
}

export class ApiError extends Error {
  detail: string;
  status: number;

  constructor(detail: string, status: number) {
    super(detail);
    this.name = 'ApiError';
    this.detail = detail;
    this.status = status;
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const remoteHost = getRemoteHostUrl();
  const base = remoteHost ? `${remoteHost}/api` : '/api';
  const token = getAuthToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // AbortController timeout: 2500ms when pointing to remote host, 10000ms for localhost
  const timeoutMs = options.signal ? undefined : (remoteHost ? 2500 : 10000);
  let controller: AbortController | undefined;
  let timeoutId: any;
  if (timeoutMs) {
    controller = new AbortController();
    timeoutId = setTimeout(() => {
      try { controller?.abort(); } catch {}
    }, timeoutMs);
  }

  let response: Response;
  try {
    response = await fetch(`${base}${endpoint}`, {
      ...options,
      signal: options.signal || controller?.signal,
      headers,
    });
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new ApiError('Main Counter connection timed out.', 408);
    }
    throw err;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }

  if (!response.ok) {
    let errorDetail = 'An unexpected error occurred.';
    try {
      const errorJson = await response.json();
      if (errorJson && errorJson.detail) {
        if (typeof errorJson.detail === 'string') {
          errorDetail = errorJson.detail;
        } else if (Array.isArray(errorJson.detail)) {
          errorDetail = errorJson.detail
            .map((item: any) => {
              if (typeof item === 'string') return item;
              if (item && item.msg) {
                const loc = Array.isArray(item.loc) ? item.loc.filter((l: any) => l !== 'body').join(' -> ') : '';
                return loc ? `${loc}: ${item.msg}` : item.msg;
              }
              return JSON.stringify(item);
            })
            .join(' | ');
        } else if (typeof errorJson.detail === 'object') {
          errorDetail = JSON.stringify(errorJson.detail);
        }
      }
    } catch {
      errorDetail = response.statusText || errorDetail;
    }
    throw new ApiError(errorDetail, response.status);
  }

  // If 204 No Content
  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

export const api = {
  // Auth
  login: (data: { username: string; password: string }) =>
    request<LoginResponse>('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  verifyPin: (pin: string) =>
    request<{ valid: boolean; message: string }>('/auth/verify-pin', { method: 'POST', body: JSON.stringify({ pin }) }),
  verifyDashboardPin: (pin: string) =>
    request<{ valid: boolean; message: string }>('/auth/verify-dashboard-pin', { method: 'POST', body: JSON.stringify({ pin }) }),
  changePassword: (data: { current_password: string; new_password: string }) =>
    request<{ success: boolean; message: string }>('/auth/change-password', { method: 'POST', body: JSON.stringify(data) }),
  changePin: (data: { current_pin: string; new_pin: string }) =>
    request<{ success: boolean; message: string }>('/auth/change-pin', { method: 'POST', body: JSON.stringify(data) }),

  // Business Settings & Presets
  getSettings: async () => {
    if (_isKnownOffline && getRemoteHostUrl()) {
      const cached = await offlineStorage.getSettings();
      if (cached) return cached;
    }
    try {
      const settings = await request<BusinessSettings>('/settings');
      if (settings) {
        offlineStorage.saveSettings(settings).catch(() => {});
      }
      return settings;
    } catch (err) {
      const cached = await offlineStorage.getSettings();
      if (cached) return cached;
      throw err;
    }
  },
  updateSettings: async (data: Partial<BusinessSettings>) => {
    const res = await request<BusinessSettings>('/settings', { method: 'PUT', body: JSON.stringify(data) });
    if (res) {
      offlineStorage.saveSettings(res).catch(() => {});
    }
    return res;
  },
  getPresets: () => request<IndustryPreset[]>('/settings/presets'),
  applyPreset: async (data: {
    preset_key: string;
    business_name?: string;
    phone?: string;
    address?: string;
    currency?: string;
    custom_fields?: Partial<CustomField>[];
  }) => {
    const res = await request<BusinessSettings>('/settings/apply-preset', { method: 'POST', body: JSON.stringify(data) });
    if (res) {
      offlineStorage.saveSettings(res).catch(() => {});
    }
    return res;
  },

  // Products
  getProducts: async (params?: { search?: string; category_id?: number; is_active?: boolean; skip?: number; limit?: number }) => {
    if (_isKnownOffline && getRemoteHostUrl()) {
      return await offlineStorage.getProducts(params);
    }
    const sp = new URLSearchParams();
    if (params?.search) sp.append('search', params.search);
    if (params?.category_id) sp.append('category_id', String(params.category_id));
    if (params?.is_active !== undefined) sp.append('is_active', String(params.is_active));
    if (params?.skip) sp.append('skip', String(params.skip));
    if (params?.limit) sp.append('limit', String(params.limit));
    try {
      return await request<Product[]>(`/products?${sp.toString()}`);
    } catch (err) {
      const cached = await offlineStorage.getProducts(params);
      if (Array.isArray(cached)) return cached;
      throw err;
    }
  },
  getProduct: async (id: number) => {
    if (_isKnownOffline && getRemoteHostUrl()) {
      const cached = await offlineStorage.getProduct(id);
      if (cached) return cached;
    }
    try {
      return await request<Product>(`/products/${id}`);
    } catch (err) {
      const cached = await offlineStorage.getProduct(id);
      if (cached) return cached;
      throw err;
    }
  },
  getProductByBarcode: async (barcode: string) => {
    if (_isKnownOffline && getRemoteHostUrl()) {
      const cached = await offlineStorage.getProductByBarcode(barcode);
      if (cached) return cached;
    }
    try {
      return await request<Product | null>(`/products/barcode/${encodeURIComponent(barcode.trim())}`);
    } catch (err) {
      const cached = await offlineStorage.getProductByBarcode(barcode);
      if (cached) return cached;
      throw err;
    }
  },
  generateBarcode: () => request<{ barcode: string }>('/products/generate-barcode'),
  createProduct: (data: {
    name: string;
    sku?: string;
    barcode?: string;
    category_id?: number;
    purchase_price: number;
    selling_price: number;
    opening_stock?: number;
    custom_fields?: CustomValueDto[];
  }) => request<Product>('/products', { method: 'POST', body: JSON.stringify(data) }),
  bulkCreateProducts: (products: Array<{
    name: string;
    sku?: string;
    barcode?: string;
    category_id?: number;
    purchase_price: number;
    selling_price: number;
    opening_stock?: number;
    custom_fields?: CustomValueDto[];
  }>) => request<{ success: boolean; count: number; products: Product[]; message: string }>('/products/bulk', {
    method: 'POST',
    body: JSON.stringify(products),
  }),
  updateProduct: (id: number, data: Partial<Product> & { custom_fields?: CustomValueDto[] }) =>
    request<Product>(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  adjustProductStock: (id: number, data: { new_stock: number; reason?: string }) =>
    request<Product>(`/products/${id}/adjust-stock`, { method: 'POST', body: JSON.stringify(data) }),
  deactivateProduct: (id: number) => request<Product>(`/products/${id}`, { method: 'DELETE' }),
  restoreProduct: (id: number) => request<Product>(`/products/${id}/restore`, { method: 'POST' }),
  deleteProductPermanent: (id: number) =>
    request<{ message: string }>(`/products/${id}/permanent`, { method: 'DELETE' }),

  // Categories
  getCategories: async (activeOnly = true) => {
    if (_isKnownOffline && getRemoteHostUrl()) {
      return await offlineStorage.getCategories(activeOnly);
    }
    try {
      return await request<Category[]>(`/categories?active_only=${activeOnly}`);
    } catch (err) {
      const cached = await offlineStorage.getCategories(activeOnly);
      if (Array.isArray(cached)) return cached;
      throw err;
    }
  },
  createCategory: (data: { name: string }) => request<Category>('/categories', { method: 'POST', body: JSON.stringify(data) }),
  updateCategory: (id: number, data: { name: string }) => request<Category>(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCategory: (id: number) => request<{ message: string }>(`/categories/${id}`, { method: 'DELETE' }),

  // Custom Fields
  getCustomFields: async (params?: { category_id?: number; active_only?: boolean } | boolean) => {
    const activeOnly = typeof params === 'boolean' ? params : (params?.active_only !== undefined ? params.active_only : true);
    const catId = typeof params === 'object' && params?.category_id !== undefined ? params.category_id : undefined;
    if (_isKnownOffline && getRemoteHostUrl()) {
      return await offlineStorage.getCustomFields(catId, activeOnly);
    }
    let url = `/custom-fields?active_only=${activeOnly}`;
    if (catId !== undefined) {
      url += `&category_id=${catId}`;
    }
    try {
      return await request<CustomField[]>(url);
    } catch (err) {
      const cached = await offlineStorage.getCustomFields(catId, activeOnly);
      if (Array.isArray(cached)) return cached;
      throw err;
    }
  },
  createCustomField: (data: Partial<CustomField>) =>
    request<CustomField>('/custom-fields', { method: 'POST', body: JSON.stringify(data) }),
  updateCustomField: (id: number, data: Partial<CustomField>) =>
    request<CustomField>(`/custom-fields/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCustomField: (id: number) => request<{ message: string }>(`/custom-fields/${id}`, { method: 'DELETE' }),
  reorderCustomFields: (fieldIds: number[]) =>
    request<CustomField[]>('/custom-fields/reorder/batch', {
      method: 'PUT',
      body: JSON.stringify({ field_ids: fieldIds }),
    }),

  // Stock Movements & Batches
  getMovements: (params?: { product_id?: number; movement_type?: string; skip?: number; limit?: number }) => {
    const sp = new URLSearchParams();
    if (params?.product_id) sp.append('product_id', String(params.product_id));
    if (params?.movement_type) sp.append('movement_type', params.movement_type);
    if (params?.skip) sp.append('skip', String(params.skip));
    if (params?.limit) sp.append('limit', String(params.limit));
    return request<any[]>(`/inventory/movements?${sp.toString()}`);
  },

  // Customers
  getCustomers: async (params?: { search?: string; is_active?: boolean }) => {
    if (_isKnownOffline && getRemoteHostUrl()) {
      return await offlineStorage.getCustomers(params);
    }
    const sp = new URLSearchParams();
    if (params?.search) sp.append('search', params.search);
    if (params?.is_active !== undefined) sp.append('is_active', String(params.is_active));
    try {
      return await request<Customer[]>(`/customers?${sp.toString()}`);
    } catch (err) {
      const cached = await offlineStorage.getCustomers(params);
      if (Array.isArray(cached)) return cached;
      throw err;
    }
  },
  createCustomer: (data: { name: string; phone?: string; address?: string }) =>
    request<Customer>('/customers', { method: 'POST', body: JSON.stringify(data) }),
  updateCustomer: (id: number, data: { name?: string; phone?: string; address?: string }) =>
    request<Customer>(`/customers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deactivateCustomer: (id: number) => request<Customer>(`/customers/${id}`, { method: 'DELETE' }),
  restoreCustomer: (id: number) => request<Customer>(`/customers/${id}/restore`, { method: 'POST' }),
  getCustomerLedger: (id: number) => request<CustomerLedgerEntry[]>(`/customers/${id}/ledger`),
  recordCustomerPayment: (id: number, data: { amount: number; payment_method?: string; notes?: string }) =>
    request<any>(`/customers/${id}/payments`, { method: 'POST', body: JSON.stringify(data) }),

  // Sales
  getSales: (params?: { search?: string; customer_id?: number; payment_status?: string; start_date?: string; end_date?: string }) => {
    const sp = new URLSearchParams();
    if (params?.search) sp.append('search', params.search);
    if (params?.customer_id) sp.append('customer_id', String(params.customer_id));
    if (params?.payment_status) sp.append('payment_status', params.payment_status);
    if (params?.start_date) sp.append('start_date', params.start_date);
    if (params?.end_date) sp.append('end_date', params.end_date);
    return request<Sale[]>(`/sales?${sp.toString()}`);
  },
  getSale: (id: number) => request<Sale>(`/sales/${id}`),
  createSale: (data: {
    customer_id?: number;
    customer_name?: string;
    customer_phone?: string;
    items: Array<{ product_id: number; quantity: number; unit_price: number; discount_amount?: number }>;
    discount_amount?: number;
    tax_rate?: number;
    paid_amount?: number;
    payment_method?: string;
    payment_splits?: PaymentSplit[];
    notes?: string;
  }) => request<Sale>('/sales', { method: 'POST', body: JSON.stringify(data) }),
  recordSalePayment: (id: number, amount: number, paymentMethod = 'Cash') =>
    request<Sale>(`/sales/${id}/payments?amount=${amount}&payment_method=${paymentMethod}`, { method: 'POST' }),
  getReceiptPrintData: (receiptNumber: string) => request<ReceiptPrintData>(`/sales/receipt/${receiptNumber}/print`),

  // Sales Returns
  getSalesReturns: (customerId?: number) => {
    const sp = new URLSearchParams();
    if (customerId) sp.append('customer_id', String(customerId));
    const qs = sp.toString();
    return request<SalesReturn[]>(qs ? `/returns/sales?${qs}` : '/returns/sales');
  },
  createSalesReturn: (data: {
    sale_id?: number;
    customer_id: number;
    items: Array<{ product_id: number; quantity: number; unit_price: number }>;
    reason?: string;
  }) => request<SalesReturn>('/returns/sale', { method: 'POST', body: JSON.stringify(data) }),

  // Suppliers
  getSuppliers: (params?: { search?: string; is_active?: boolean }) => {
    const sp = new URLSearchParams();
    if (params?.search) sp.append('search', params.search);
    if (params?.is_active !== undefined) sp.append('is_active', String(params.is_active));
    return request<Supplier[]>(`/suppliers?${sp.toString()}`);
  },
  createSupplier: (data: { name: string; phone?: string; address?: string }) =>
    request<Supplier>('/suppliers', { method: 'POST', body: JSON.stringify(data) }),
  updateSupplier: (id: number, data: { name?: string; phone?: string; address?: string }) =>
    request<Supplier>(`/suppliers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deactivateSupplier: (id: number) => request<Supplier>(`/suppliers/${id}`, { method: 'DELETE' }),
  restoreSupplier: (id: number) => request<Supplier>(`/suppliers/${id}/restore`, { method: 'POST' }),
  getSupplierLedger: (id: number) => request<SupplierLedgerEntry[]>(`/suppliers/${id}/ledger`),
  recordSupplierPayment: (id: number, data: { amount: number; payment_method?: string; notes?: string }) =>
    request<any>(`/suppliers/${id}/payments`, { method: 'POST', body: JSON.stringify(data) }),

  // Purchases
  getPurchases: (params?: { search?: string; supplier_id?: number }) => {
    const sp = new URLSearchParams();
    if (params?.search) sp.append('search', params.search);
    if (params?.supplier_id) sp.append('supplier_id', String(params.supplier_id));
    return request<Purchase[]>(`/purchases?${sp.toString()}`);
  },
  createPurchaseReturn: (data: any) => request<any>('/returns/purchase', { method: 'POST', body: JSON.stringify(data) }),
  getPurchaseReturns: () => request<any[]>('/returns/purchases'),
  createPurchase: (data: any) => request<Purchase>('/purchases', { method: 'POST', body: JSON.stringify(data) }),
  addPurchasePayment: (id: number, amount: number, paymentMethod = 'Cash') =>
    request<Purchase>(`/purchases/${id}/payments?amount=${amount}&payment_method=${encodeURIComponent(paymentMethod)}`, { method: 'POST' }),

  // Bills & Expenses
  getBillCategories: (activeOnly = true) => request<BillCategory[]>(`/bill-categories?active_only=${activeOnly}`),
  createBillCategory: (data: { name: string }) => request<BillCategory>('/bill-categories', { method: 'POST', body: JSON.stringify(data) }),
  getBills: (params?: { category_id?: number; status?: string }) => {
    const sp = new URLSearchParams();
    if (params?.category_id) sp.append('category_id', String(params.category_id));
    if (params?.status) sp.append('status', params.status);
    return request<Bill[]>(`/bills?${sp.toString()}`);
  },
  createBill: (data: any) => request<Bill>('/bills', { method: 'POST', body: JSON.stringify(data) }),
  updateBill: (id: number, data: any) => request<Bill>(`/bills/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  recordBillPayment: (id: number, data: any) => request<any>(`/bills/${id}/payments`, { method: 'POST', body: JSON.stringify(data) }),
  getBillsAttention: async () => {
    if (_isKnownOffline && getRemoteHostUrl()) return [];
    try {
      return await request<BillAttention[]>('/bills/attention');
    } catch {
      return [];
    }
  },

  getExpenseCategories: (activeOnly = true) => request<ExpenseCategory[]>(`/expense-categories?active_only=${activeOnly}`),
  createExpenseCategory: (data: { name: string }) => request<ExpenseCategory>('/expense-categories', { method: 'POST', body: JSON.stringify(data) }),
  getExpenses: (params?: { category_id?: number; start_date?: string; end_date?: string }) => {
    const sp = new URLSearchParams();
    if (params?.category_id) sp.append('category_id', String(params.category_id));
    if (params?.start_date) sp.append('start_date', params.start_date);
    if (params?.end_date) sp.append('end_date', params.end_date);
    return request<Expense[]>(`/expenses?${sp.toString()}`);
  },
  createExpense: (data: any) => request<Expense>('/expenses', { method: 'POST', body: JSON.stringify(data) }),
  deleteExpense: (id: number) => request<any>(`/expenses/${id}`, { method: 'DELETE' }),

  // Dashboard
  getDashboardKPIs: async () => {
    if (_isKnownOffline && getRemoteHostUrl()) {
      return await offlineStorage.getOfflineDashboardKPIs();
    }
    try {
      return await request<DashboardKPIs>('/dashboard/stats');
    } catch (err) {
      if (getRemoteHostUrl()) {
        return await offlineStorage.getOfflineDashboardKPIs();
      }
      throw err;
    }
  },
  getDashboardStats: async () => {
    return api.getDashboardKPIs();
  },
  getMonthlySalesChart: async (year?: number, month?: number) => {
    if (_isKnownOffline && getRemoteHostUrl()) {
      return { daily_sales: [] } as any;
    }
    const sp = new URLSearchParams();
    if (year) sp.append('year', String(year));
    if (month) sp.append('month', String(month));
    try {
      return await request<MonthlySalesData>(`/dashboard/monthly-sales?${sp.toString()}`);
    } catch (err) {
      if (getRemoteHostUrl()) {
        return { daily_sales: [] } as any;
      }
      throw err;
    }
  },
  getMonthlySales: async (year?: number, month?: number) => {
    return api.getMonthlySalesChart(year, month);
  },
  getDaySalesDetail: (date: string) => request<DaySalesDetail>(`/dashboard/day-sales/${date}`),

  // Reports
  getSalesReport: (start?: string, end?: string) => request<any[]>(`/reports/sales?${start ? `start_date=${start}&` : ''}${end ? `end_date=${end}` : ''}`),
  getSalesDetailReport: (start?: string, end?: string) => request<any[]>(`/reports/sales-detail?${start ? `start_date=${start}&` : ''}${end ? `end_date=${end}` : ''}`),
  getPurchasesReport: (start?: string, end?: string) => request<any[]>(`/reports/purchases?${start ? `start_date=${start}&` : ''}${end ? `end_date=${end}` : ''}`),
  getInventoryReport: () => request<any[]>('/reports/inventory-valuation'),
  getStockMovementsReport: (productId?: number, start?: string, end?: string) => request<any[]>(`/reports/stock-movements?${productId ? `product_id=${productId}&` : ''}${start ? `start_date=${start}&` : ''}${end ? `end_date=${end}` : ''}`),
  getCustomersReport: () => request<any[]>('/reports/customer-dues'),
  getSuppliersReport: () => request<any[]>('/reports/supplier-dues'),
  getBillsReport: () => request<any[]>('/reports/bills'),
  getExpensesReport: (start?: string, end?: string) => request<any[]>(`/reports/expenses?${start ? `start_date=${start}&` : ''}${end ? `end_date=${end}` : ''}`),

  // Backup & Restore
  createBackup: () => request<{ success: boolean; message: string; filename: string }>('/backup/create', { method: 'POST' }),
  listBackups: () => request<BackupFile[]>('/backup/list'),
  getBackups: () => request<BackupFile[]>('/backup/list'),
  restoreBackup: (filename: string, confirm_pin?: string) =>
    request<{ success: boolean; message: string }>('/backup/restore', { method: 'POST', body: JSON.stringify({ filename, confirm_pin }) }),
  downloadBackupUrl: (filename: string) => `/api/backup/download/${encodeURIComponent(filename)}`,
  uploadBackup: async (file: File): Promise<BackupFile> => {
    const formData = new FormData();
    formData.append('file', file);
    const token = localStorage.getItem('access_token');
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch('/api/backup/upload', {
      method: 'POST',
      headers,
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to upload backup' }));
      throw new ApiError(err.detail || 'Failed to upload backup', res.status);
    }
    return res.json();
  },

  // Google Drive Cloud Backup (WhatsApp-Style)
  getGoogleBackupStatus: () => request<GoogleBackupStatusResponse>('/backup/google/status'),
  getGoogleAuthUrl: (redirectUri?: string) =>
    request<{ auth_url: string }>(`/backup/google/auth-url${redirectUri ? `?redirect_uri=${encodeURIComponent(redirectUri)}` : ''}`),
  updateGoogleBackupSettings: (data: GoogleBackupSettingsUpdate) =>
    request<GoogleBackupStatusResponse>('/backup/google/settings', { method: 'POST', body: JSON.stringify(data) }),
  disconnectGoogleBackup: () =>
    request<{ success: boolean; message: string }>('/backup/google/disconnect', { method: 'POST' }),
  triggerGoogleBackup: () =>
    request<GoogleBackupActionResponse>('/backup/google/trigger', { method: 'POST' }),
  restoreGoogleBackup: (fileId: string, confirm_pin?: string) =>
    request<{ success: boolean; message: string }>(`/backup/google/restore/${encodeURIComponent(fileId)}`, {
      method: 'POST',
      body: JSON.stringify({ confirm_pin }),
    }),


  // Data & Inventory Reset
  resetData: (data: { confirm_pin: string; wipe_mode?: 'sales_only' | 'inventory_only' | 'all_data' }) =>
    request<{ success: boolean; wipe_mode: string; deleted_products_count: number; message: string }>('/settings/reset-data', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Quotations
  getQuotations: (status?: string, search?: string) =>
    request<Quotation[]>(`/quotations?${status ? `status=${encodeURIComponent(status)}&` : ''}${search ? `search=${encodeURIComponent(search)}&` : ''}`),
  createQuotation: (data: QuotationCreate) =>
    request<Quotation>('/quotations', { method: 'POST', body: JSON.stringify(data) }),
  reviseQuotation: (id: number, data: QuotationCreate) =>
    request<Quotation>(`/quotations/${id}/revise`, { method: 'POST', body: JSON.stringify(data) }),
  getQuotation: (id: number) =>
    request<Quotation>(`/quotations/${id}`),
  checkQuotationConversion: (id: number) =>
    request<QuotationConversionCheckResponse>(`/quotations/${id}/check-conversion`),
  convertQuotationToSale: (id: number, data: QuotationConvertRequest) =>
    request<Sale>(`/quotations/${id}/convert`, { method: 'POST', body: JSON.stringify(data) }),
  rejectQuotation: (id: number, reason?: string) =>
    request<Quotation>(`/quotations/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
  deleteQuotation: (id: number) =>
    request<void>(`/quotations/${id}`, { method: 'DELETE' }),

  // Thermal Hardware & Printing
  getSystemPrinters: () => request<PrinterInfo[]>('/printing/printers'),
  printThermalDirect: (data: {
    sale_id?: number;
    printer_name?: string;
    paper_width?: string;
    header_style?: string;
    layout?: string;
    show_barcode?: boolean;
    kick_drawer?: boolean;
    is_sample?: boolean;
    darkness?: string;
    printer_profile?: string;
    cut_mode?: string;
    feed_lines?: number;
    raster_image?: string;
  }) =>
    request<{ success: boolean; printer: string; bytes_sent: number; message: string; is_online?: boolean; warning?: string }>('/printing/receipt', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  printThermalRaster: (data: {
    image_data: string;
    printer_name?: string;
    paper_width?: string;
    darkness?: string;
    printer_profile?: string;
    cut_mode?: string;
    feed_lines?: number;
    kick_drawer?: boolean;
    sale_id?: number;
  }) =>
    request<{ success: boolean; printer: string; bytes_sent: number; message: string; is_online?: boolean; warning?: string }>('/printing/raster', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  printThermalDiagnostic: (data?: {
    printer_name?: string;
    paper_width?: string;
    printer_profile?: string;
    darkness?: string;
    cut_mode?: string;
    feed_lines?: number;
  }) =>
    request<{ success: boolean; printer: string; bytes_sent: number; message: string; is_online?: boolean; warning?: string }>('/printing/diagnostic', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }),
  clearPrinterQueue: (printerName?: string) =>
    request<{ success: boolean; message: string }>('/printing/clear-queue', {
      method: 'POST',
      body: JSON.stringify({ printer_name: printerName }),
    }),

  // User Management
  users: {
    getAll: () => request<User[]>('/users'),
    create: (data: UserCreate) =>
      request<User>('/users', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: number, data: UserUpdate) =>
      request<User>(`/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id: number) =>
      request<{ success: boolean; message: string }>(`/users/${id}`, {
        method: 'DELETE',
      }),
  },

  // Git-like Additive Offline Sync
  sync: {
    push: (payload: SyncPushRequest) =>
      request<SyncPushResponse>('/sync/push', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    getStatus: () =>
      request<{ status: string; processed_commits_count: number }>('/sync/status'),
    getSnapshot: () =>
      request<SyncSnapshotResponse>('/sync/snapshot'),
  },

  // Local Network Discovery
  network: {
    getInfo: () => request<NetworkInfo>('/network/info'),
    ping: async (overrideUrl?: string): Promise<HostPingResponse> => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      try {
        const url = overrideUrl ? `${overrideUrl.replace(/\/+$/, '')}/api/network/ping` : `${getRemoteHostUrl() || ''}/api/network/ping`;
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error('Host unreachable');
        return res.json();
      } finally {
        clearTimeout(timeoutId);
      }
    },
    heartbeat: async (data: ClientHeartbeatRequest, overrideUrl?: string): Promise<{ success: boolean; status: string }> => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1500);
      try {
        const url = overrideUrl ? `${overrideUrl.replace(/\/+$/, '')}/api/network/heartbeat` : `${getRemoteHostUrl() || ''}/api/network/heartbeat`;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        const token = getAuthToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(data),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error('Heartbeat failed');
        return res.json();
      } finally {
        clearTimeout(timeoutId);
      }
    },
    getClients: () => request<ConnectedClientsResponse>('/network/clients'),
    discover: (subnetFallback: boolean = true) =>
      request<{ discovered_count: number; hosts: DiscoveredHost[] }>(
        `/network/discover${subnetFallback ? '?subnet_fallback=true' : ''}`,
        { method: 'POST' }
      ),
    testHost: (url: string) =>
      request<TestHostResponse>('/network/test-host', {
        method: 'POST',
        body: JSON.stringify({ url }),
      }),
  },
};
