export interface BusinessSettings {
  id: number;
  business_name: string;
  phone: string;
  address: string;
  logo_path?: string | null;
  currency: string;
  tax_enabled: boolean;
  default_tax_rate: number;
  receipt_header: string;
  receipt_footer: string;
  receipt_printer_type: '58mm' | '80mm' | 'standard';
  industry_preset?: string | null;
  setup_completed?: boolean;
}

export interface CustomField {
  id: number;
  name: string;
  field_type: 'text' | 'select' | 'number' | 'date' | 'boolean' | string;
  options?: string | null;
  is_required: boolean;
  show_in_table?: boolean;
  show_in_pos?: boolean;
  show_in_receipt?: boolean;
  display_order: number;
  is_active: boolean;
}

export interface IndustryPreset {
  key: string;
  title: string;
  icon: string;
  description: string;
  fields: Array<{
    name: string;
    field_type: string;
    options?: string | null;
    is_required: boolean;
    show_in_table: boolean;
    show_in_pos: boolean;
    show_in_receipt: boolean;
    display_order: number;
  }>;
}

export interface CustomValueDto {
  field_id: number;
  field_name?: string;
  value: string;
}

export interface Category {
  id: number;
  name: string;
  is_active: boolean;
}

export interface Product {
  id: number;
  product_id: string;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  category_id?: number | null;
  category_name?: string | null;
  purchase_price: number;
  selling_price: number;
  current_stock: number;
  is_active: boolean;
  custom_fields?: CustomValueDto[];
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: number;
  customer_id: string;
  name: string;
  phone?: string | null;
  address?: string | null;
  is_active: boolean;
  current_due: number;
  total_sales: number;
  total_paid: number;
  total_returns: number;
  created_at: string;
  updated_at: string;
}

export interface CustomerLedgerEntry {
  date: string;
  type: string;
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface Supplier {
  id: number;
  supplier_id: string;
  name: string;
  phone?: string | null;
  address?: string | null;
  is_active: boolean;
  current_due: number;
  total_purchases: number;
  total_paid: number;
  total_returns: number;
  created_at: string;
  updated_at: string;
}

export interface SupplierLedgerEntry {
  date: string;
  type: string;
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface SaleItemBatch {
  id: number;
  inventory_batch_id: number;
  quantity: number;
  unit_cost: number;
}

export interface SaleItem {
  id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  total_price: number;
  unit_cost: number;
  total_cost: number;
  gross_profit: number;
  batches?: SaleItemBatch[];
}

export interface SalePayment {
  id: number;
  amount: number;
  payment_method: string;
  created_at: string;
}

export interface Sale {
  id: number;
  receipt_number: string;
  customer_id: number;
  customer_name?: string;
  subtotal: number;
  discount_amount: number;
  tax_rate: number;
  tax_amount: number;
  total_amount: number;
  paid_amount: number;
  due_amount: number;
  payment_status: 'PAID' | 'PARTIALLY_PAID' | 'UNPAID';
  total_cost: number;
  gross_profit: number;
  notes?: string | null;
  created_at: string;
  items: SaleItem[];
  payments: SalePayment[];
}

export interface SalesReturnItem {
  id: number;
  product_id: number;
  product_name?: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
}

export interface SalesReturn {
  id: number;
  return_number: string;
  sale_id?: number | null;
  sale_receipt_number?: string | null;
  customer_id: number;
  customer_name?: string;
  total_return_amount: number;
  cash_refund_amount: number;
  balance_credit_amount: number;
  reason?: string | null;
  created_at: string;
  items: SalesReturnItem[];
}

export interface ReceiptPrintData {
  business_name: string;
  phone: string;
  address: string;
  currency: string;
  receipt_header: string;
  receipt_footer: string;
  receipt_printer_type: string;
  receipt_number: string;
  created_at: string;
  customer_name: string;
  customer_phone?: string | null;
  items: SaleItem[];
  subtotal: number;
  discount_amount: number;
  tax_rate: number;
  tax_amount: number;
  total_amount: number;
  paid_amount: number;
  due_amount: number;
  payment_status: string;
}

export interface PurchaseItem {
  id: number;
  product_id: number;
  product_name?: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
}

export interface PurchasePayment {
  id: number;
  amount: number;
  payment_method: string;
  created_at: string;
}

export interface Purchase {
  id: number;
  purchase_number: string;
  supplier_id: number;
  supplier_name?: string;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  paid_amount: number;
  due_amount: number;
  payment_status: 'PAID' | 'PARTIALLY_PAID' | 'UNPAID';
  notes?: string | null;
  created_at: string;
  items: PurchaseItem[];
  payments: PurchasePayment[];
}

export interface PurchaseReturnItem {
  id: number;
  product_id: number;
  product_name?: string;
  quantity: number;
  unit_cost: number;
  total_amount: number;
}

export interface PurchaseReturn {
  id: number;
  return_number: string;
  purchase_id?: number | null;
  purchase_number?: string | null;
  supplier_id: number;
  supplier_name?: string;
  total_return_amount: number;
  reason?: string | null;
  created_at: string;
  items: PurchaseReturnItem[];
}

export interface BillCategory {
  id: number;
  name: string;
  is_active: boolean;
}

export interface BillPayment {
  id: number;
  bill_id: number;
  amount: number;
  payment_method: string;
  payment_date: string;
  notes?: string | null;
}

export interface Bill {
  id: number;
  bill_number: string;
  name: string;
  category_id: number;
  category_name?: string;
  amount: number;
  paid_amount: number;
  due_amount: number;
  due_date: string;
  status: 'TO_PAY' | 'PARTIALLY_PAID' | 'PAID' | 'PENDING';
  notes?: string | null;
  created_at: string;
  updated_at: string;
  payments: BillPayment[];
}

export interface ExpenseCategory {
  id: number;
  name: string;
  is_active: boolean;
}

export interface Expense {
  id: number;
  expense_number: string;
  category_id: number;
  category_name?: string;
  title: string;
  amount: number;
  payment_method: string;
  expense_date: string;
  notes?: string | null;
  created_at: string;
}

export interface DashboardKPIs {
  today_sales_revenue: number;
  today_gross_profit: number;
  customer_outstanding: number;
  supplier_outstanding: number;
  bills_needing_attention_count: number;
}

export type DashboardStats = DashboardKPIs;

export interface BillAttention {
  id: number;
  bill_number: string;
  name: string;
  amount: number;
  paid_amount: number;
  due_amount: number;
  due_date: string;
  status: string;
  urgency_label: string;
}

export type BillAttentionItem = BillAttention;

export interface MonthlySalesDataPoint {
  date: string;
  day: number;
  sales_revenue: number;
  transaction_count: number;
}

export interface MonthlySalesData {
  year: number;
  month: number;
  days_in_month: number;
  total_monthly_revenue: number;
  daily_sales: MonthlySalesDataPoint[];
}

export interface DaySalesDetail {
  date: string;
  sales_revenue: number;
  transaction_count: number;
  sales: Sale[];
}

export interface InventoryMovement {
  id: number;
  product_id: number;
  product_name?: string;
  movement_type: string;
  quantity: number;
  unit_cost: number;
  reference_type: string;
  reference_id: string;
  notes?: string | null;
  created_at: string;
}

export interface BackupFile {
  filename: string;
  size_bytes: number;
  size_formatted: string;
  created_at: string;
}

export interface LoginResponse {
  success: boolean;
  username: string;
  full_name: string;
  token: string;
}
