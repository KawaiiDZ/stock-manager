-- ====================================================================
-- StokFlow Offline-First Cloud Hub Schema for Supabase (PostgreSQL)
-- Fully Idempotent & Conflict-Free Schema Migration
-- ====================================================================

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS account_transfers (
	sync_uuid VARCHAR(36) DEFAULT gen_random_uuid()::text NOT NULL UNIQUE,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
	is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
	id SERIAL NOT NULL, 
	transfer_number VARCHAR(30) NOT NULL, 
	from_account VARCHAR(100) NOT NULL, 
	to_account VARCHAR(100) NOT NULL, 
	amount NUMERIC(12, 2) NOT NULL, 
	transfer_date TIMESTAMP WITHOUT TIME ZONE, 
	notes TEXT, 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	CONSTRAINT check_transfer_amount_positive CHECK (amount > 0)
);

CREATE INDEX IF NOT EXISTS idx_account_transfers_sync_uuid ON account_transfers (sync_uuid);

CREATE INDEX IF NOT EXISTS idx_account_transfers_updated_at ON account_transfers (updated_at);

CREATE TABLE IF NOT EXISTS bill_categories (
	sync_uuid VARCHAR(36) DEFAULT gen_random_uuid()::text NOT NULL UNIQUE,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
	is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
	id SERIAL NOT NULL, 
	name VARCHAR(100) NOT NULL, 
	is_active BOOLEAN NOT NULL, 
	PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_bill_categories_sync_uuid ON bill_categories (sync_uuid);

CREATE INDEX IF NOT EXISTS idx_bill_categories_updated_at ON bill_categories (updated_at);

CREATE TABLE IF NOT EXISTS bill_templates (
	sync_uuid VARCHAR(36) DEFAULT gen_random_uuid()::text NOT NULL UNIQUE,
	is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
	id SERIAL NOT NULL, 
	name VARCHAR(150) NOT NULL, 
	description TEXT, 
	is_active BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	updated_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_bill_templates_sync_uuid ON bill_templates (sync_uuid);

CREATE INDEX IF NOT EXISTS idx_bill_templates_updated_at ON bill_templates (updated_at);

CREATE TABLE IF NOT EXISTS business_settings (
	sync_uuid VARCHAR(36) DEFAULT gen_random_uuid()::text NOT NULL UNIQUE,
	is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
	id SERIAL NOT NULL, 
	business_name VARCHAR(150) NOT NULL, 
	phone VARCHAR(50) NOT NULL, 
	address TEXT NOT NULL, 
	logo_path TEXT, 
	receipt_logo_path TEXT, 
	currency VARCHAR(20) NOT NULL, 
	tax_enabled BOOLEAN NOT NULL, 
	default_tax_rate NUMERIC(5, 2) NOT NULL, 
	receipt_header TEXT NOT NULL, 
	receipt_footer TEXT NOT NULL, 
	receipt_printer_type VARCHAR(20) NOT NULL, 
	industry_preset VARCHAR(50), 
	setup_completed BOOLEAN NOT NULL, 
	show_sku BOOLEAN NOT NULL, 
	show_barcode BOOLEAN NOT NULL, 
	date_format VARCHAR(30) NOT NULL, 
	format_prices_with_commas BOOLEAN NOT NULL, 
	receipt_type VARCHAR(20) NOT NULL, 
	thermal_print_mode VARCHAR(30) NOT NULL, 
	thermal_header_style VARCHAR(30) NOT NULL, 
	thermal_layout VARCHAR(30) NOT NULL, 
	selected_thermal_printer VARCHAR(100) NOT NULL, 
	selected_a4_printer VARCHAR(100) NOT NULL, 
	skip_receipt_preview BOOLEAN NOT NULL, 
	thermal_darkness VARCHAR(20) NOT NULL, 
	thermal_printer_profile VARCHAR(30) NOT NULL, 
	thermal_render_pipeline VARCHAR(30) NOT NULL, 
	thermal_beep_enabled BOOLEAN NOT NULL, 
	thermal_feed_lines INTEGER NOT NULL, 
	thermal_cut_mode VARCHAR(20) NOT NULL, 
	receipt_letterhead_path TEXT, 
	show_letterhead BOOLEAN NOT NULL, 
	hide_header_text_with_letterhead BOOLEAN NOT NULL, 
	invoice_title VARCHAR(100) NOT NULL, 
	enable_quotations BOOLEAN NOT NULL, 
	enable_thermal_quotations BOOLEAN NOT NULL, 
	quotation_receipt_type VARCHAR(20) NOT NULL, 
	enable_bill_templates BOOLEAN NOT NULL, 
	enable_navigation_hub BOOLEAN NOT NULL, 
	theme_mode VARCHAR(20) NOT NULL, 
	color_theme VARCHAR(30) NOT NULL, 
	invoice_terms TEXT NOT NULL, 
	quotation_terms TEXT NOT NULL, 
	enable_barcode_scanner BOOLEAN NOT NULL, 
	enable_barcode_printer BOOLEAN NOT NULL, 
	barcode_label_size VARCHAR(30) NOT NULL, 
	barcode_label_show_business_name BOOLEAN NOT NULL, 
	barcode_label_show_product_name BOOLEAN NOT NULL, 
	barcode_label_show_price BOOLEAN NOT NULL, 
	barcode_label_show_sku BOOLEAN NOT NULL, 
	barcode_label_custom_text TEXT NOT NULL, 
	lock_dashboard_finances BOOLEAN NOT NULL, 
	dashboard_financials_pin_hash VARCHAR(255), 
	config_pin_hash VARCHAR(255) NOT NULL, 
	enable_pos_quick_pay BOOLEAN NOT NULL, 
	payment_accounts TEXT NOT NULL, 
	auto_launch_kiosk BOOLEAN NOT NULL, 
	kiosk_window_mode VARCHAR(30) NOT NULL, 
	kiosk_browser VARCHAR(30) NOT NULL, 
	ui_zoom INTEGER NOT NULL, 
	updated_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_business_settings_sync_uuid ON business_settings (sync_uuid);

CREATE INDEX IF NOT EXISTS idx_business_settings_updated_at ON business_settings (updated_at);

CREATE TABLE IF NOT EXISTS customers (
	sync_uuid VARCHAR(36) DEFAULT gen_random_uuid()::text NOT NULL UNIQUE,
	is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
	id SERIAL NOT NULL, 
	customer_id VARCHAR(20) NOT NULL, 
	name VARCHAR(100) NOT NULL, 
	phone VARCHAR(50), 
	address TEXT, 
	is_active BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	updated_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_customers_sync_uuid ON customers (sync_uuid);

CREATE INDEX IF NOT EXISTS idx_customers_updated_at ON customers (updated_at);

CREATE TABLE IF NOT EXISTS expense_categories (
	sync_uuid VARCHAR(36) DEFAULT gen_random_uuid()::text NOT NULL UNIQUE,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
	is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
	id SERIAL NOT NULL, 
	name VARCHAR(100) NOT NULL, 
	is_active BOOLEAN NOT NULL, 
	PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_expense_categories_sync_uuid ON expense_categories (sync_uuid);

CREATE INDEX IF NOT EXISTS idx_expense_categories_updated_at ON expense_categories (updated_at);

CREATE TABLE IF NOT EXISTS google_backup_settings (
	sync_uuid VARCHAR(36) DEFAULT gen_random_uuid()::text NOT NULL UNIQUE,
	is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
	id SERIAL NOT NULL, 
	is_enabled BOOLEAN NOT NULL, 
	frequency VARCHAR(20) NOT NULL, 
	google_email VARCHAR(255), 
	google_name VARCHAR(255), 
	google_picture TEXT, 
	access_token TEXT, 
	refresh_token TEXT, 
	token_expiry TIMESTAMP WITHOUT TIME ZONE, 
	custom_client_id VARCHAR(255), 
	custom_client_secret VARCHAR(255), 
	last_backup_at TIMESTAMP WITHOUT TIME ZONE, 
	last_backup_status VARCHAR(50) NOT NULL, 
	last_backup_size_bytes INTEGER, 
	last_error_message TEXT, 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	updated_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_google_backup_settings_sync_uuid ON google_backup_settings (sync_uuid);

CREATE INDEX IF NOT EXISTS idx_google_backup_settings_updated_at ON google_backup_settings (updated_at);

CREATE TABLE IF NOT EXISTS processed_sync_commits (
	sync_uuid VARCHAR(36) DEFAULT gen_random_uuid()::text NOT NULL UNIQUE,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
	is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
	id SERIAL NOT NULL, 
	commit_id VARCHAR(64) NOT NULL, 
	client_id VARCHAR(64), 
	action VARCHAR(50) NOT NULL, 
	summary VARCHAR(255), 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_processed_sync_commits_sync_uuid ON processed_sync_commits (sync_uuid);

CREATE INDEX IF NOT EXISTS idx_processed_sync_commits_updated_at ON processed_sync_commits (updated_at);

CREATE TABLE IF NOT EXISTS product_categories (
	sync_uuid VARCHAR(36) DEFAULT gen_random_uuid()::text NOT NULL UNIQUE,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
	is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
	id SERIAL NOT NULL, 
	name VARCHAR(100) NOT NULL, 
	is_active BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_product_categories_sync_uuid ON product_categories (sync_uuid);

CREATE INDEX IF NOT EXISTS idx_product_categories_updated_at ON product_categories (updated_at);

CREATE TABLE IF NOT EXISTS suppliers (
	sync_uuid VARCHAR(36) DEFAULT gen_random_uuid()::text NOT NULL UNIQUE,
	is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
	id SERIAL NOT NULL, 
	supplier_id VARCHAR(20) NOT NULL, 
	name VARCHAR(100) NOT NULL, 
	phone VARCHAR(50), 
	address TEXT, 
	is_active BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	updated_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_suppliers_sync_uuid ON suppliers (sync_uuid);

CREATE INDEX IF NOT EXISTS idx_suppliers_updated_at ON suppliers (updated_at);

CREATE TABLE IF NOT EXISTS users (
	sync_uuid VARCHAR(36) DEFAULT gen_random_uuid()::text NOT NULL UNIQUE,
	is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
	id SERIAL NOT NULL, 
	username VARCHAR(50) NOT NULL, 
	password_hash VARCHAR(255) NOT NULL, 
	full_name VARCHAR(100) NOT NULL, 
	role VARCHAR(30) NOT NULL, 
	is_active BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	updated_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_users_sync_uuid ON users (sync_uuid);

CREATE INDEX IF NOT EXISTS idx_users_updated_at ON users (updated_at);

CREATE TABLE IF NOT EXISTS bills (
	sync_uuid VARCHAR(36) DEFAULT gen_random_uuid()::text NOT NULL UNIQUE,
	is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
	id SERIAL NOT NULL, 
	bill_number VARCHAR(50) NOT NULL, 
	name VARCHAR(150) NOT NULL, 
	category_id INTEGER NOT NULL, 
	amount NUMERIC(12, 2) NOT NULL, 
	paid_amount NUMERIC(12, 2) NOT NULL, 
	due_date DATE NOT NULL, 
	status VARCHAR(20) NOT NULL, 
	notes TEXT, 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	updated_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	CONSTRAINT check_bill_amount_positive CHECK (amount > 0), 
	CONSTRAINT check_bill_paid_amount_non_negative CHECK (paid_amount >= 0), 
	FOREIGN KEY(category_id) REFERENCES bill_categories (id)
);

CREATE INDEX IF NOT EXISTS idx_bills_sync_uuid ON bills (sync_uuid);

CREATE INDEX IF NOT EXISTS idx_bills_updated_at ON bills (updated_at);

CREATE TABLE IF NOT EXISTS customer_payments (
	sync_uuid VARCHAR(36) DEFAULT gen_random_uuid()::text NOT NULL UNIQUE,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
	is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
	id SERIAL NOT NULL, 
	payment_number VARCHAR(30) NOT NULL, 
	customer_id INTEGER NOT NULL, 
	amount NUMERIC(12, 2) NOT NULL, 
	payment_method VARCHAR(100) NOT NULL, 
	notes TEXT, 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	CONSTRAINT check_customer_payment_amount_positive CHECK (amount > 0), 
	FOREIGN KEY(customer_id) REFERENCES customers (id)
);

CREATE INDEX IF NOT EXISTS idx_customer_payments_sync_uuid ON customer_payments (sync_uuid);

CREATE INDEX IF NOT EXISTS idx_customer_payments_updated_at ON customer_payments (updated_at);

CREATE TABLE IF NOT EXISTS expenses (
	sync_uuid VARCHAR(36) DEFAULT gen_random_uuid()::text NOT NULL UNIQUE,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
	is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
	id SERIAL NOT NULL, 
	expense_number VARCHAR(30) NOT NULL, 
	category_id INTEGER NOT NULL, 
	title VARCHAR(150) NOT NULL, 
	amount NUMERIC(12, 2) NOT NULL, 
	payment_method VARCHAR(30) NOT NULL, 
	expense_date DATE NOT NULL, 
	notes TEXT, 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	CONSTRAINT check_expense_amount_positive CHECK (amount > 0), 
	FOREIGN KEY(category_id) REFERENCES expense_categories (id)
);

CREATE INDEX IF NOT EXISTS idx_expenses_sync_uuid ON expenses (sync_uuid);

CREATE INDEX IF NOT EXISTS idx_expenses_updated_at ON expenses (updated_at);

CREATE TABLE IF NOT EXISTS product_custom_fields (
	sync_uuid VARCHAR(36) DEFAULT gen_random_uuid()::text NOT NULL UNIQUE,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
	is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
	id SERIAL NOT NULL, 
	category_id INTEGER, 
	name VARCHAR(50) NOT NULL, 
	field_type VARCHAR(20) NOT NULL, 
	options TEXT, 
	is_required BOOLEAN NOT NULL, 
	show_in_table BOOLEAN NOT NULL, 
	show_in_pos BOOLEAN NOT NULL, 
	show_in_receipt BOOLEAN NOT NULL, 
	display_order INTEGER NOT NULL, 
	is_active BOOLEAN NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(category_id) REFERENCES product_categories (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_product_custom_fields_sync_uuid ON product_custom_fields (sync_uuid);

CREATE INDEX IF NOT EXISTS idx_product_custom_fields_updated_at ON product_custom_fields (updated_at);

CREATE TABLE IF NOT EXISTS products (
	sync_uuid VARCHAR(36) DEFAULT gen_random_uuid()::text NOT NULL UNIQUE,
	is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
	id SERIAL NOT NULL, 
	product_id VARCHAR(20) NOT NULL, 
	name VARCHAR(150) NOT NULL, 
	sku VARCHAR(50), 
	barcode VARCHAR(100), 
	category_id INTEGER, 
	purchase_price NUMERIC(12, 2) NOT NULL, 
	selling_price NUMERIC(12, 2) NOT NULL, 
	current_stock NUMERIC(12, 2) NOT NULL, 
	is_service BOOLEAN NOT NULL, 
	is_active BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	updated_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	CONSTRAINT check_product_purchase_price_non_negative CHECK (purchase_price >= 0), 
	CONSTRAINT check_product_selling_price_non_negative CHECK (selling_price >= 0), 
	CONSTRAINT check_product_current_stock_non_negative CHECK (current_stock >= 0), 
	FOREIGN KEY(category_id) REFERENCES product_categories (id)
);

CREATE INDEX IF NOT EXISTS idx_products_sync_uuid ON products (sync_uuid);

CREATE INDEX IF NOT EXISTS idx_products_updated_at ON products (updated_at);

CREATE TABLE IF NOT EXISTS purchases (
	sync_uuid VARCHAR(36) DEFAULT gen_random_uuid()::text NOT NULL UNIQUE,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
	is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
	id SERIAL NOT NULL, 
	purchase_number VARCHAR(30) NOT NULL, 
	supplier_id INTEGER, 
	subtotal NUMERIC(12, 2) NOT NULL, 
	discount_amount NUMERIC(12, 2) NOT NULL, 
	tax_amount NUMERIC(12, 2) NOT NULL, 
	total_amount NUMERIC(12, 2) NOT NULL, 
	paid_amount NUMERIC(12, 2) NOT NULL, 
	due_amount NUMERIC(12, 2) NOT NULL, 
	payment_status VARCHAR(20) NOT NULL, 
	notes TEXT, 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(supplier_id) REFERENCES suppliers (id)
);

CREATE INDEX IF NOT EXISTS idx_purchases_sync_uuid ON purchases (sync_uuid);

CREATE INDEX IF NOT EXISTS idx_purchases_updated_at ON purchases (updated_at);

CREATE TABLE IF NOT EXISTS sales (
	sync_uuid VARCHAR(36) DEFAULT gen_random_uuid()::text NOT NULL UNIQUE,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
	is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
	id SERIAL NOT NULL, 
	receipt_number VARCHAR(30) NOT NULL, 
	customer_id INTEGER NOT NULL, 
	subtotal NUMERIC(12, 2) NOT NULL, 
	discount_amount NUMERIC(12, 2) NOT NULL, 
	tax_rate NUMERIC(5, 2) NOT NULL, 
	tax_amount NUMERIC(12, 2) NOT NULL, 
	total_amount NUMERIC(12, 2) NOT NULL, 
	paid_amount NUMERIC(12, 2) NOT NULL, 
	due_amount NUMERIC(12, 2) NOT NULL, 
	payment_status VARCHAR(20) NOT NULL, 
	total_cost NUMERIC(12, 2) NOT NULL, 
	gross_profit NUMERIC(12, 2) NOT NULL, 
	notes TEXT, 
	is_external BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(customer_id) REFERENCES customers (id)
);

CREATE INDEX IF NOT EXISTS idx_sales_sync_uuid ON sales (sync_uuid);

CREATE INDEX IF NOT EXISTS idx_sales_updated_at ON sales (updated_at);

CREATE TABLE IF NOT EXISTS supplier_payments (
	sync_uuid VARCHAR(36) DEFAULT gen_random_uuid()::text NOT NULL UNIQUE,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
	is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
	id SERIAL NOT NULL, 
	payment_number VARCHAR(30) NOT NULL, 
	supplier_id INTEGER NOT NULL, 
	amount NUMERIC(12, 2) NOT NULL, 
	payment_method VARCHAR(100) NOT NULL, 
	notes TEXT, 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	CONSTRAINT check_supplier_payment_amount_positive CHECK (amount > 0), 
	FOREIGN KEY(supplier_id) REFERENCES suppliers (id)
);

CREATE INDEX IF NOT EXISTS idx_supplier_payments_sync_uuid ON supplier_payments (sync_uuid);

CREATE INDEX IF NOT EXISTS idx_supplier_payments_updated_at ON supplier_payments (updated_at);

CREATE TABLE IF NOT EXISTS bill_payments (
	sync_uuid VARCHAR(36) DEFAULT gen_random_uuid()::text NOT NULL UNIQUE,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
	is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
	id SERIAL NOT NULL, 
	bill_id INTEGER NOT NULL, 
	amount NUMERIC(12, 2) NOT NULL, 
	payment_method VARCHAR(30) NOT NULL, 
	payment_date TIMESTAMP WITHOUT TIME ZONE, 
	notes TEXT, 
	PRIMARY KEY (id), 
	CONSTRAINT check_bill_payment_amount_positive CHECK (amount > 0), 
	FOREIGN KEY(bill_id) REFERENCES bills (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_bill_payments_sync_uuid ON bill_payments (sync_uuid);

CREATE INDEX IF NOT EXISTS idx_bill_payments_updated_at ON bill_payments (updated_at);

CREATE TABLE IF NOT EXISTS bill_template_items (
	sync_uuid VARCHAR(36) DEFAULT gen_random_uuid()::text NOT NULL UNIQUE,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
	is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
	id SERIAL NOT NULL, 
	template_id INTEGER NOT NULL, 
	display_order INTEGER NOT NULL, 
	slot_name VARCHAR(100) NOT NULL, 
	category_id INTEGER, 
	category_name VARCHAR(100), 
	default_product_id INTEGER, 
	default_quantity NUMERIC(12, 2) NOT NULL, 
	default_unit_price NUMERIC(12, 2), 
	default_description TEXT, 
	is_optional BOOLEAN NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(template_id) REFERENCES bill_templates (id) ON DELETE CASCADE, 
	FOREIGN KEY(category_id) REFERENCES product_categories (id) ON DELETE SET NULL, 
	FOREIGN KEY(default_product_id) REFERENCES products (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_bill_template_items_sync_uuid ON bill_template_items (sync_uuid);

CREATE INDEX IF NOT EXISTS idx_bill_template_items_updated_at ON bill_template_items (updated_at);

CREATE TABLE IF NOT EXISTS inventory_batches (
	sync_uuid VARCHAR(36) DEFAULT gen_random_uuid()::text NOT NULL UNIQUE,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
	is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
	id SERIAL NOT NULL, 
	product_id INTEGER NOT NULL, 
	purchase_id INTEGER, 
	quantity_received NUMERIC(12, 2) NOT NULL, 
	quantity_remaining NUMERIC(12, 2) NOT NULL, 
	unit_cost NUMERIC(12, 2) NOT NULL, 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	CONSTRAINT check_batch_quantity_received_non_negative CHECK (quantity_received >= 0), 
	CONSTRAINT check_batch_quantity_remaining_non_negative CHECK (quantity_remaining >= 0), 
	CONSTRAINT check_batch_unit_cost_non_negative CHECK (unit_cost >= 0), 
	FOREIGN KEY(product_id) REFERENCES products (id), 
	FOREIGN KEY(purchase_id) REFERENCES purchases (id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_batches_sync_uuid ON inventory_batches (sync_uuid);

CREATE INDEX IF NOT EXISTS idx_inventory_batches_updated_at ON inventory_batches (updated_at);

CREATE TABLE IF NOT EXISTS inventory_movements (
	sync_uuid VARCHAR(36) DEFAULT gen_random_uuid()::text NOT NULL UNIQUE,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
	is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
	id SERIAL NOT NULL, 
	product_id INTEGER NOT NULL, 
	movement_type VARCHAR(30) NOT NULL, 
	quantity NUMERIC(12, 2) NOT NULL, 
	unit_cost NUMERIC(12, 2) NOT NULL, 
	reference_type VARCHAR(30) NOT NULL, 
	reference_id VARCHAR(50) NOT NULL, 
	notes TEXT, 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(product_id) REFERENCES products (id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_sync_uuid ON inventory_movements (sync_uuid);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_updated_at ON inventory_movements (updated_at);

CREATE TABLE IF NOT EXISTS product_custom_values (
	sync_uuid VARCHAR(36) DEFAULT gen_random_uuid()::text NOT NULL UNIQUE,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
	is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
	id SERIAL NOT NULL, 
	product_id INTEGER NOT NULL, 
	field_id INTEGER NOT NULL, 
	value TEXT NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(product_id) REFERENCES products (id) ON DELETE CASCADE, 
	FOREIGN KEY(field_id) REFERENCES product_custom_fields (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_product_custom_values_sync_uuid ON product_custom_values (sync_uuid);

CREATE INDEX IF NOT EXISTS idx_product_custom_values_updated_at ON product_custom_values (updated_at);

CREATE TABLE IF NOT EXISTS purchase_items (
	sync_uuid VARCHAR(36) DEFAULT gen_random_uuid()::text NOT NULL UNIQUE,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
	is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
	id SERIAL NOT NULL, 
	purchase_id INTEGER NOT NULL, 
	product_id INTEGER NOT NULL, 
	quantity NUMERIC(12, 2) NOT NULL, 
	unit_cost NUMERIC(12, 2) NOT NULL, 
	selling_price NUMERIC(12, 2), 
	total_cost NUMERIC(12, 2) NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT check_purchase_item_quantity_positive CHECK (quantity > 0), 
	CONSTRAINT check_purchase_item_cost_non_negative CHECK (unit_cost >= 0), 
	FOREIGN KEY(purchase_id) REFERENCES purchases (id) ON DELETE CASCADE, 
	FOREIGN KEY(product_id) REFERENCES products (id)
);

CREATE INDEX IF NOT EXISTS idx_purchase_items_sync_uuid ON purchase_items (sync_uuid);

CREATE INDEX IF NOT EXISTS idx_purchase_items_updated_at ON purchase_items (updated_at);

CREATE TABLE IF NOT EXISTS purchase_payments (
	sync_uuid VARCHAR(36) DEFAULT gen_random_uuid()::text NOT NULL UNIQUE,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
	is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
	id SERIAL NOT NULL, 
	purchase_id INTEGER NOT NULL, 
	amount NUMERIC(12, 2) NOT NULL, 
	payment_method VARCHAR(30) NOT NULL, 
	supplier_payment_id INTEGER, 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	CONSTRAINT check_purchase_payment_amount_positive CHECK (amount > 0), 
	FOREIGN KEY(purchase_id) REFERENCES purchases (id) ON DELETE CASCADE, 
	FOREIGN KEY(supplier_payment_id) REFERENCES supplier_payments (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_purchase_payments_sync_uuid ON purchase_payments (sync_uuid);

CREATE INDEX IF NOT EXISTS idx_purchase_payments_updated_at ON purchase_payments (updated_at);

CREATE TABLE IF NOT EXISTS purchase_returns (
	sync_uuid VARCHAR(36) DEFAULT gen_random_uuid()::text NOT NULL UNIQUE,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
	is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
	id SERIAL NOT NULL, 
	return_number VARCHAR(30) NOT NULL, 
	purchase_id INTEGER, 
	supplier_id INTEGER NOT NULL, 
	total_return_amount NUMERIC(12, 2) NOT NULL, 
	reason TEXT, 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(purchase_id) REFERENCES purchases (id), 
	FOREIGN KEY(supplier_id) REFERENCES suppliers (id)
);

CREATE INDEX IF NOT EXISTS idx_purchase_returns_sync_uuid ON purchase_returns (sync_uuid);

CREATE INDEX IF NOT EXISTS idx_purchase_returns_updated_at ON purchase_returns (updated_at);

CREATE TABLE IF NOT EXISTS quotations (
	sync_uuid VARCHAR(36) DEFAULT gen_random_uuid()::text NOT NULL UNIQUE,
	is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
	id SERIAL NOT NULL, 
	quotation_number VARCHAR(30) NOT NULL, 
	customer_id INTEGER, 
	customer_name VARCHAR(150) NOT NULL, 
	customer_phone VARCHAR(50) NOT NULL, 
	customer_address TEXT, 
	subtotal NUMERIC(12, 2) NOT NULL, 
	discount_amount NUMERIC(12, 2) NOT NULL, 
	tax_rate NUMERIC(5, 2) NOT NULL, 
	tax_amount NUMERIC(12, 2) NOT NULL, 
	total_amount NUMERIC(12, 2) NOT NULL, 
	status VARCHAR(20) NOT NULL, 
	sale_id INTEGER, 
	converted_at TIMESTAMP WITHOUT TIME ZONE, 
	rejection_reason TEXT, 
	valid_until TIMESTAMP WITHOUT TIME ZONE, 
	notes TEXT, 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	updated_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	CONSTRAINT check_quotation_subtotal_non_negative CHECK (subtotal >= 0), 
	CONSTRAINT check_quotation_discount_non_negative CHECK (discount_amount >= 0), 
	CONSTRAINT check_quotation_tax_rate_non_negative CHECK (tax_rate >= 0), 
	CONSTRAINT check_quotation_tax_amount_non_negative CHECK (tax_amount >= 0), 
	CONSTRAINT check_quotation_total_non_negative CHECK (total_amount >= 0), 
	FOREIGN KEY(customer_id) REFERENCES customers (id), 
	FOREIGN KEY(sale_id) REFERENCES sales (id)
);

CREATE INDEX IF NOT EXISTS idx_quotations_sync_uuid ON quotations (sync_uuid);

CREATE INDEX IF NOT EXISTS idx_quotations_updated_at ON quotations (updated_at);

CREATE TABLE IF NOT EXISTS sale_items (
	sync_uuid VARCHAR(36) DEFAULT gen_random_uuid()::text NOT NULL UNIQUE,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
	is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
	id SERIAL NOT NULL, 
	sale_id INTEGER NOT NULL, 
	product_id INTEGER, 
	product_name VARCHAR(150) NOT NULL, 
	quantity NUMERIC(12, 2) NOT NULL, 
	unit_price NUMERIC(12, 2) NOT NULL, 
	discount_amount NUMERIC(12, 2) NOT NULL, 
	total_price NUMERIC(12, 2) NOT NULL, 
	unit_cost NUMERIC(12, 2) NOT NULL, 
	total_cost NUMERIC(12, 2) NOT NULL, 
	gross_profit NUMERIC(12, 2) NOT NULL, 
	is_external BOOLEAN NOT NULL, 
	notes TEXT, 
	PRIMARY KEY (id), 
	CONSTRAINT check_sale_item_quantity_positive CHECK (quantity > 0), 
	CONSTRAINT check_sale_item_price_non_negative CHECK (unit_price >= 0), 
	FOREIGN KEY(sale_id) REFERENCES sales (id) ON DELETE CASCADE, 
	FOREIGN KEY(product_id) REFERENCES products (id)
);

CREATE INDEX IF NOT EXISTS idx_sale_items_sync_uuid ON sale_items (sync_uuid);

CREATE INDEX IF NOT EXISTS idx_sale_items_updated_at ON sale_items (updated_at);

CREATE TABLE IF NOT EXISTS sale_payments (
	sync_uuid VARCHAR(36) DEFAULT gen_random_uuid()::text NOT NULL UNIQUE,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
	is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
	id SERIAL NOT NULL, 
	sale_id INTEGER NOT NULL, 
	amount NUMERIC(12, 2) NOT NULL, 
	payment_method VARCHAR(100) NOT NULL, 
	customer_payment_id INTEGER, 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	CONSTRAINT check_sale_payment_amount_positive CHECK (amount > 0), 
	FOREIGN KEY(sale_id) REFERENCES sales (id) ON DELETE CASCADE, 
	FOREIGN KEY(customer_payment_id) REFERENCES customer_payments (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_sale_payments_sync_uuid ON sale_payments (sync_uuid);

CREATE INDEX IF NOT EXISTS idx_sale_payments_updated_at ON sale_payments (updated_at);

CREATE TABLE IF NOT EXISTS sales_returns (
	sync_uuid VARCHAR(36) DEFAULT gen_random_uuid()::text NOT NULL UNIQUE,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
	is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
	id SERIAL NOT NULL, 
	return_number VARCHAR(30) NOT NULL, 
	sale_id INTEGER, 
	customer_id INTEGER NOT NULL, 
	total_return_amount NUMERIC(12, 2) NOT NULL, 
	cash_refund_amount NUMERIC(12, 2) NOT NULL, 
	balance_credit_amount NUMERIC(12, 2) NOT NULL, 
	reason TEXT, 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(sale_id) REFERENCES sales (id), 
	FOREIGN KEY(customer_id) REFERENCES customers (id)
);

CREATE INDEX IF NOT EXISTS idx_sales_returns_sync_uuid ON sales_returns (sync_uuid);

CREATE INDEX IF NOT EXISTS idx_sales_returns_updated_at ON sales_returns (updated_at);

CREATE TABLE IF NOT EXISTS purchase_return_items (
	sync_uuid VARCHAR(36) DEFAULT gen_random_uuid()::text NOT NULL UNIQUE,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
	is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
	id SERIAL NOT NULL, 
	purchase_return_id INTEGER NOT NULL, 
	product_id INTEGER NOT NULL, 
	quantity NUMERIC(12, 2) NOT NULL, 
	unit_cost NUMERIC(12, 2) NOT NULL, 
	total_amount NUMERIC(12, 2) NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT check_purchase_return_quantity_positive CHECK (quantity > 0), 
	CONSTRAINT check_purchase_return_cost_non_negative CHECK (unit_cost >= 0), 
	FOREIGN KEY(purchase_return_id) REFERENCES purchase_returns (id) ON DELETE CASCADE, 
	FOREIGN KEY(product_id) REFERENCES products (id)
);

CREATE INDEX IF NOT EXISTS idx_purchase_return_items_sync_uuid ON purchase_return_items (sync_uuid);

CREATE INDEX IF NOT EXISTS idx_purchase_return_items_updated_at ON purchase_return_items (updated_at);

CREATE TABLE IF NOT EXISTS quotation_items (
	sync_uuid VARCHAR(36) DEFAULT gen_random_uuid()::text NOT NULL UNIQUE,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
	is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
	id SERIAL NOT NULL, 
	quotation_id INTEGER NOT NULL, 
	product_id INTEGER, 
	product_name VARCHAR(150) NOT NULL, 
	quantity NUMERIC(12, 2) NOT NULL, 
	unit_price NUMERIC(12, 2) NOT NULL, 
	discount_amount NUMERIC(12, 2) NOT NULL, 
	total_price NUMERIC(12, 2) NOT NULL, 
	is_external BOOLEAN NOT NULL, 
	notes TEXT, 
	PRIMARY KEY (id), 
	CONSTRAINT check_quotation_item_qty_positive CHECK (quantity > 0), 
	CONSTRAINT check_quotation_item_unit_price_non_negative CHECK (unit_price >= 0), 
	CONSTRAINT check_quotation_item_discount_non_negative CHECK (discount_amount >= 0), 
	CONSTRAINT check_quotation_item_total_non_negative CHECK (total_price >= 0), 
	FOREIGN KEY(quotation_id) REFERENCES quotations (id) ON DELETE CASCADE, 
	FOREIGN KEY(product_id) REFERENCES products (id)
);

CREATE INDEX IF NOT EXISTS idx_quotation_items_sync_uuid ON quotation_items (sync_uuid);

CREATE INDEX IF NOT EXISTS idx_quotation_items_updated_at ON quotation_items (updated_at);

CREATE TABLE IF NOT EXISTS sale_item_batches (
	sync_uuid VARCHAR(36) DEFAULT gen_random_uuid()::text NOT NULL UNIQUE,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
	is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
	id SERIAL NOT NULL, 
	sale_item_id INTEGER NOT NULL, 
	inventory_batch_id INTEGER NOT NULL, 
	quantity NUMERIC(12, 2) NOT NULL, 
	unit_cost NUMERIC(12, 2) NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT check_sale_batch_quantity_positive CHECK (quantity > 0), 
	FOREIGN KEY(sale_item_id) REFERENCES sale_items (id) ON DELETE CASCADE, 
	FOREIGN KEY(inventory_batch_id) REFERENCES inventory_batches (id)
);

CREATE INDEX IF NOT EXISTS idx_sale_item_batches_sync_uuid ON sale_item_batches (sync_uuid);

CREATE INDEX IF NOT EXISTS idx_sale_item_batches_updated_at ON sale_item_batches (updated_at);

CREATE TABLE IF NOT EXISTS sales_return_items (
	sync_uuid VARCHAR(36) DEFAULT gen_random_uuid()::text NOT NULL UNIQUE,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
	is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
	id SERIAL NOT NULL, 
	sales_return_id INTEGER NOT NULL, 
	product_id INTEGER, 
	product_name VARCHAR(150), 
	quantity NUMERIC(12, 2) NOT NULL, 
	unit_price NUMERIC(12, 2) NOT NULL, 
	total_amount NUMERIC(12, 2) NOT NULL, 
	is_external BOOLEAN NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT check_sales_return_quantity_positive CHECK (quantity > 0), 
	FOREIGN KEY(sales_return_id) REFERENCES sales_returns (id) ON DELETE CASCADE, 
	FOREIGN KEY(product_id) REFERENCES products (id)
);

CREATE INDEX IF NOT EXISTS idx_sales_return_items_sync_uuid ON sales_return_items (sync_uuid);

CREATE INDEX IF NOT EXISTS idx_sales_return_items_updated_at ON sales_return_items (updated_at);


-- ====================================================================
-- 2. Idempotent Atomic Batch Reconciliation Function (RPC)
-- ====================================================================
CREATE OR REPLACE FUNCTION reconcile_sync_batch(p_commits JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_commit JSONB;
    v_commit_id TEXT;
    v_action TEXT;
    v_data JSONB;
    v_processed_count INT := 0;
    v_skipped_count INT := 0;
    v_ack_ids JSONB := '[]'::JSONB;
BEGIN
    FOR v_commit IN SELECT * FROM jsonb_array_elements(p_commits)
    LOOP
        v_commit_id := v_commit->>'commit_id';
        v_action := v_commit->>'action';
        v_data := v_commit->'data';

        -- Check idempotency: skip if already processed
        IF EXISTS (SELECT 1 FROM processed_sync_commits WHERE commit_id = v_commit_id) THEN
            v_skipped_count := v_skipped_count + 1;
            v_ack_ids := v_ack_ids || to_jsonb(v_commit_id);
            CONTINUE;
        END IF;

        -- Record commit as processed
        INSERT INTO processed_sync_commits (commit_id, action, client_id, summary, created_at)
        VALUES (
            v_commit_id,
            v_action,
            v_commit->>'client_id',
            v_commit->>'summary',
            NOW()
        );

        v_processed_count := v_processed_count + 1;
        v_ack_ids := v_ack_ids || to_jsonb(v_commit_id);
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'processed_count', v_processed_count,
        'skipped_count', v_skipped_count,
        'acknowledged_commit_ids', v_ack_ids
    );
END;
$$;


-- ====================================================================
-- 3. Grant API Permissions to Supabase Roles
-- ====================================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;
