# Offline Inventory, Sales, Billing & Business Management Application (v1.0.0)

A desktop-first, offline-first business management application designed for local retail shops and small businesses.

Built with **React**, **FastAPI**, **SQLAlchemy**, and **SQLite**.

---

## Key Features

- **Dynamic Business Presets & Custom Table Schema**:
  - 6 pre-configured industry presets: *Mobile & Electronics, Clothing & Apparel, Pharmacy & Medical, Grocery & Supermarket, Auto Parts & Hardware, Custom Retail*
  - Interactive onboarding Setup Wizard (`SetupWizardModal`)
  - Visual Schema Builder in Settings to add custom attributes (text, dropdown options, date, number)
  - Configurable visibility toggles: *Main Table Column, POS Live Search Indexing, Thermal Receipt Item, Mandatory field*
- **Fast Bulk Product Entry**:
  - Spreadsheet grid with dynamic columns matching active custom attributes
- **High-Speed POS / New Sale**:
  - Multi-attribute live product search (name, barcode, SKU, brand, model, color, IMEI, etc.) & USB barcode scanner detection
  - Instant price override for individual sales without changing catalog defaults
  - Item-level & sale-level discounts and tax calculation
  - Walk-in customer default (`C-000001`) with credit/partial payment support
  - 1-Click thermal receipt printing (58mm, 80mm ESC/POS, and Standard A4 layout)
- **FIFO Inventory & Costing**:
  - Strict FIFO (First-In, First-Out) stock batch consumption
  - Accurate gross profit calculation (`Sale Revenue - FIFO COGS`)
  - Stock validation prevents negative stock or selling unavailable quantities
  - Complete inventory movement audit logging & physical stock adjustment modal
- **Customer & Supplier Ledgers**:
  - Independent debit/credit ledgers with running balances
  - Standalone payments without requiring new orders
  - Customer return cashback limits (never refunds more than actual cash paid)
  - Supplier returns with automatic batch deductions
- **Bills & Expenses**:
  - Utility & recurring bill reminders (overdue, due today, due soon)
  - Partial bill installments
  - Categorized general shop expenses
- **Interactive Dashboard & 9 Reports**:
  - Live Daily KPIs: Today's Sales Revenue, Today's Gross Profit, Customer Dues, Supplier Payables
  - Monthly interactive sales bar chart with clickable day drill-down modal
  - 9 Tabbed Reports with date filter presets (Today, Yesterday, This Week, This Month, Custom)
- **Local Backup & Recovery + Reset Zone**:
  - 1-Click snapshot backup to `Backups/`
  - Automated pre-restore safety rollback checkpoint
  - Integrity validation on restore
  - PIN-protected Inventory Wipe & Factory Reset tools in Settings

---

## How to Run

### Quick Start (macOS / Linux)
```bash
./start_app.sh
```
Or:
```bash
python3 run_app.py
```

### Quick Start (Windows)
Double-click `start_app.bat` or run:
```bat
python run_app.py
```

The application will start the local server and automatically open your default browser at:
👉 `http://127.0.0.1:8000`

---

## Default Login Credentials

- **Username**: `admin`
- **Password**: `admin123`
- **Configuration PIN**: `1234`

---

## Running Automated Tests

Run the complete test suite with:
```bash
source venv/bin/activate
PYTHONPATH=. pytest backend/tests/ -v
```

---

## Architecture

```text
React UI (Single Page Application)
   ↓
FastAPI API Layer
   ↓
Service Layer (FIFO Costing, Ledgers, Schema Presets, Validations)
   ↓
SQLAlchemy ORM
   ↓
Local SQLite Database (data/stock_manager.db)
```
