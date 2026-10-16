from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Boolean, Numeric, DateTime
from backend.app.core.database import Base

class BusinessSettings(Base):
    __tablename__ = "business_settings"

    id = Column(Integer, primary_key=True, index=True)
    business_name = Column(String(150), nullable=False, default="My Shop")
    phone = Column(String(50), nullable=False, default="")
    address = Column(Text, nullable=False, default="")
    logo_path = Column(Text, nullable=True)
    receipt_logo_path = Column(Text, nullable=True)
    currency = Column(String(20), nullable=False, default="Rs.")
    tax_enabled = Column(Boolean, nullable=False, default=False)
    default_tax_rate = Column(Numeric(5, 2), nullable=False, default=0.00)
    receipt_header = Column(Text, nullable=False, default="")
    receipt_footer = Column(Text, nullable=False, default="Thank you for your business!")
    receipt_printer_type = Column(String(20), nullable=False, default="80mm")  # 58mm, 80mm, standard
    industry_preset = Column(String(50), nullable=True, default="general")  # mobile, clothing, pharmacy, grocery, autoparts, general, custom
    setup_completed = Column(Boolean, nullable=False, default=False)
    show_sku = Column(Boolean, nullable=False, default=True)
    show_barcode = Column(Boolean, nullable=False, default=True)
    date_format = Column(String(30), nullable=False, default="YYYY-MM-DD")
    format_prices_with_commas = Column(Boolean, nullable=False, default=True)
    receipt_type = Column(String(20), nullable=False, default="thermal")  # thermal, pdf
    thermal_print_mode = Column(String(30), nullable=False, default="browser")  # browser, direct_escpos
    thermal_header_style = Column(String(30), nullable=False, default="logo_text")  # logo_text, text_only
    thermal_layout = Column(String(30), nullable=False, default="classic")  # classic, modern, tabular, compact, elegant
    selected_thermal_printer = Column(String(100), nullable=False, default="")
    selected_a4_printer = Column(String(100), nullable=False, default="")
    skip_receipt_preview = Column(Boolean, nullable=False, default=False)
    thermal_darkness = Column(String(20), nullable=False, default="normal")  # normal (standard POS), high, maximum
    thermal_printer_profile = Column(String(30), nullable=False, default="standard_escpos")  # standard_escpos, xprinter_enhanced, star_line, generic_plain
    thermal_render_pipeline = Column(String(30), nullable=False, default="native_text")  # native_text (instant 0ms hardware text), raster_canvas (GS v 0)
    thermal_beep_enabled = Column(Boolean, nullable=False, default=True)  # Hardware buzzer and terminal confirmation sound
    thermal_feed_lines = Column(Integer, nullable=False, default=4)  # lines to feed before cut
    thermal_cut_mode = Column(String(20), nullable=False, default="partial")  # partial, full, tear_only
    receipt_letterhead_path = Column(Text, nullable=True)
    show_letterhead = Column(Boolean, nullable=False, default=False)
    hide_header_text_with_letterhead = Column(Boolean, nullable=False, default=False)
    invoice_title = Column(String(100), nullable=False, default="TAX INVOICE")
    enable_quotations = Column(Boolean, nullable=False, default=True)
    enable_navigation_hub = Column(Boolean, nullable=False, default=True)
    theme_mode = Column(String(20), nullable=False, default="light")  # light, dark, system
    color_theme = Column(String(30), nullable=False, default="emerald")  # emerald, indigo, sky, rose, slate
    invoice_terms = Column(Text, nullable=False, default="1. Goods once sold will be accepted for return within 7 days in original condition.\n2. Warranty claims require presenting this invoice.\n3. Thank you for your business!")
    quotation_terms = Column(Text, nullable=False, default="1. This quotation is an estimate and valid for 15 days from issue date.\n2. Stock is subject to physical availability upon confirmation.\n3. This document does not constitute a tax invoice until approved.")
    # Barcode & Scanner Configuration
    enable_barcode_scanner = Column(Boolean, nullable=False, default=True)
    enable_barcode_printer = Column(Boolean, nullable=False, default=True)
    barcode_label_size = Column(String(30), nullable=False, default="50x25mm")
    barcode_label_show_business_name = Column(Boolean, nullable=False, default=True)
    barcode_label_show_product_name = Column(Boolean, nullable=False, default=True)
    barcode_label_show_price = Column(Boolean, nullable=False, default=True)
    barcode_label_show_sku = Column(Boolean, nullable=False, default=True)
    barcode_label_custom_text = Column(Text, nullable=False, default="")
    lock_dashboard_finances = Column(Boolean, nullable=False, default=False)
    dashboard_financials_pin_hash = Column(String(255), nullable=True)
    config_pin_hash = Column(String(255), nullable=False)
    enable_pos_quick_pay = Column(Boolean, nullable=False, default=True)
    payment_accounts = Column(Text, nullable=False, default='["Cash", "Bank Transfer", "Easypaisa", "Jazzcash"]')
    # Kiosk & Fullscreen POS Launch Configuration
    auto_launch_kiosk = Column(Boolean, nullable=False, default=False)
    kiosk_window_mode = Column(String(30), nullable=False, default="fullscreen")  # fullscreen, kiosk, maximized
    kiosk_browser = Column(String(30), nullable=False, default="auto")  # auto, chrome, msedge, system
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
