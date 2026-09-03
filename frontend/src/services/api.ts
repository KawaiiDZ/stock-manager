import {
  Product, Category, CustomField, CustomValueDto,
  Customer, CustomerLedgerEntry,
  Supplier, SupplierLedgerEntry,
  Sale, SalesReturn, ReceiptPrintData,
  Purchase, Bill, BillCategory, BillAttention,
  Expense, ExpenseCategory,
  DashboardKPIs, MonthlySalesData, DaySalesDetail,
  BusinessSettings, BackupFile, LoginResponse, IndustryPreset
} from '../types';

const API_BASE = '/api';

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
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorDetail = 'An unexpected error occurred.';
    try {
      const errorJson = await response.json();
      if (errorJson && errorJson.detail) {
        errorDetail = errorJson.detail;
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
  changePassword: (data: { current_password: string; new_password: string }) =>
    request<{ success: boolean; message: string }>('/auth/change-password', { method: 'POST', body: JSON.stringify(data) }),
  changePin: (data: { current_pin: string; new_pin: string }) =>
    request<{ success: boolean; message: string }>('/auth/change-pin', { method: 'POST', body: JSON.stringify(data) }),

  // Business Settings & Presets
  getSettings: () => request<BusinessSettings>('/settings'),
  updateSettings: (data: Partial<BusinessSettings>) =>
    request<BusinessSettings>('/settings', { method: 'PUT', body: JSON.stringify(data) }),
  getPresets: () => request<IndustryPreset[]>('/settings/presets'),
  applyPreset: (data: {
    preset_key: string;
    business_name?: string;
    phone?: string;
    address?: string;
    currency?: string;
    custom_fields?: Partial<CustomField>[];
  }) => request<BusinessSettings>('/settings/apply-preset', { method: 'POST', body: JSON.stringify(data) }),

  // Products
  getProducts: (params?: { search?: string; category_id?: number; is_active?: boolean; skip?: number; limit?: number }) => {
    const sp = new URLSearchParams();
    if (params?.search) sp.append('search', params.search);
    if (params?.category_id) sp.append('category_id', String(params.category_id));
    if (params?.is_active !== undefined) sp.append('is_active', String(params.is_active));
    if (params?.skip) sp.append('skip', String(params.skip));
    if (params?.limit) sp.append('limit', String(params.limit));
    return request<Product[]>(`/products?${sp.toString()}`);
  },
  getProduct: (id: number) => request<Product>(`/products/${id}`),
  getProductByBarcode: (barcode: string) => request<Product | null>(`/products/barcode/${barcode}`),
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
  getCategories: (activeOnly = true) => request<Category[]>(`/categories?active_only=${activeOnly}`),
  createCategory: (data: { name: string }) => request<Category>('/categories', { method: 'POST', body: JSON.stringify(data) }),
  updateCategory: (id: number, data: { name: string }) => request<Category>(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCategory: (id: number) => request<{ message: string }>(`/categories/${id}`, { method: 'DELETE' }),

  // Custom Fields
  getCustomFields: (params?: { category_id?: number; active_only?: boolean } | boolean) => {
    const activeOnly = typeof params === 'boolean' ? params : (params?.active_only !== undefined ? params.active_only : true);
    const catId = typeof params === 'object' && params?.category_id !== undefined ? params.category_id : undefined;
    let url = `/custom-fields?active_only=${activeOnly}`;
    if (catId !== undefined) {
      url += `&category_id=${catId}`;
    }
    return request<CustomField[]>(url);
  },
  createCustomField: (data: Partial<CustomField>) =>
    request<CustomField>('/custom-fields', { method: 'POST', body: JSON.stringify(data) }),
  updateCustomField: (id: number, data: Partial<CustomField>) =>
    request<CustomField>(`/custom-fields/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCustomField: (id: number) => request<{ message: string }>(`/custom-fields/${id}`, { method: 'DELETE' }),

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
  getCustomers: (params?: { search?: string; is_active?: boolean }) => {
    const sp = new URLSearchParams();
    if (params?.search) sp.append('search', params.search);
    if (params?.is_active !== undefined) sp.append('is_active', String(params.is_active));
    return request<Customer[]>(`/customers?${sp.toString()}`);
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
  getBillsAttention: () => request<BillAttention[]>('/bills/attention'),

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
  getDashboardKPIs: () => request<DashboardKPIs>('/dashboard/stats'),
  getDashboardStats: () => request<DashboardKPIs>('/dashboard/stats'),
  getMonthlySalesChart: (year?: number, month?: number) => {
    const sp = new URLSearchParams();
    if (year) sp.append('year', String(year));
    if (month) sp.append('month', String(month));
    return request<MonthlySalesData>(`/dashboard/monthly-sales?${sp.toString()}`);
  },
  getMonthlySales: (year?: number, month?: number) => {
    const sp = new URLSearchParams();
    if (year) sp.append('year', String(year));
    if (month) sp.append('month', String(month));
    return request<MonthlySalesData>(`/dashboard/monthly-sales?${sp.toString()}`);
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
  createBackup: () => request<{ success: boolean; message: string; filename: string }>('/backup', { method: 'POST' }),
  listBackups: () => request<BackupFile[]>('/backup/list'),
  getBackups: () => request<BackupFile[]>('/backup/list'),
  restoreBackup: (filename: string) => request<{ success: boolean; message: string }>('/backup/restore', { method: 'POST', body: JSON.stringify({ filename }) }),

  // Data & Inventory Reset
  resetData: (data: { confirm_pin: string; wipe_mode?: 'inventory_only' | 'all_data' }) =>
    request<{ success: boolean; wipe_mode: string; deleted_products_count: number; message: string }>('/settings/reset-data', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};
