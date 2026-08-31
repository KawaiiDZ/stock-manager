from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from backend.app.models.business import BusinessSettings
from backend.app.models.product import ProductCustomField, ProductCustomValue
from backend.app.schemas.product import CustomFieldCreate
from backend.app.schemas.business import PresetTemplateResponse, ApplyPresetRequest, BusinessSettingsResponse

PRESETS_DATA: List[Dict[str, Any]] = [
    {
        "key": "mobile_electronics",
        "title": "Mobile Phones & Electronics",
        "icon": "Smartphone",
        "description": "Ideal for mobile shops, gadget stores, and electronics retailers tracking Brand, Model, IMEI, Condition, and Warranty.",
        "fields": [
            {
                "name": "Brand",
                "field_type": "select",
                "options": "Apple, Samsung, Xiaomi, Vivo, Oppo, Infinix, Realme, Tecno, OnePlus, Google, Huawei, Other",
                "is_required": True,
                "show_in_table": True,
                "show_in_pos": True,
                "show_in_receipt": True,
                "display_order": 1
            },
            {
                "name": "Model / Specs",
                "field_type": "text",
                "options": None,
                "is_required": True,
                "show_in_table": True,
                "show_in_pos": True,
                "show_in_receipt": True,
                "display_order": 2
            },
            {
                "name": "Color",
                "field_type": "text",
                "options": None,
                "is_required": False,
                "show_in_table": True,
                "show_in_pos": True,
                "show_in_receipt": False,
                "display_order": 3
            },
            {
                "name": "IMEI / Serial",
                "field_type": "text",
                "options": None,
                "is_required": False,
                "show_in_table": True,
                "show_in_pos": True,
                "show_in_receipt": True,
                "display_order": 4
            },
            {
                "name": "Condition / PTA",
                "field_type": "select",
                "options": "PTA Approved, Non-PTA, JV Sim Locked, Box Pack New, Used 10/10, Used Refurbished",
                "is_required": False,
                "show_in_table": True,
                "show_in_pos": True,
                "show_in_receipt": True,
                "display_order": 5
            },
            {
                "name": "Warranty",
                "field_type": "select",
                "options": "Official 1 Year, 1 Month Shop Warranty, 7 Days Checking, No Warranty",
                "is_required": False,
                "show_in_table": False,
                "show_in_pos": True,
                "show_in_receipt": True,
                "display_order": 6
            }
        ]
    },
    {
        "key": "clothing_apparel",
        "title": "Clothing, Shoes & Apparel",
        "icon": "Shirt",
        "description": "Designed for garments, boutiques, fabric shops, and footwear retailers tracking Sizes, Colors, Gender, and Fabrics.",
        "fields": [
            {
                "name": "Size",
                "field_type": "select",
                "options": "XS, S, M, L, XL, XXL, 3XL, 36, 38, 40, 42, 44, 46, Free Size",
                "is_required": True,
                "show_in_table": True,
                "show_in_pos": True,
                "show_in_receipt": True,
                "display_order": 1
            },
            {
                "name": "Color",
                "field_type": "text",
                "options": None,
                "is_required": True,
                "show_in_table": True,
                "show_in_pos": True,
                "show_in_receipt": True,
                "display_order": 2
            },
            {
                "name": "Gender / Fit",
                "field_type": "select",
                "options": "Men, Women, Boys, Girls, Unisex, Kids",
                "is_required": False,
                "show_in_table": True,
                "show_in_pos": True,
                "show_in_receipt": False,
                "display_order": 3
            },
            {
                "name": "Fabric / Material",
                "field_type": "text",
                "options": None,
                "is_required": False,
                "show_in_table": True,
                "show_in_pos": True,
                "show_in_receipt": False,
                "display_order": 4
            },
            {
                "name": "Season / Collection",
                "field_type": "select",
                "options": "Summer, Winter, Mid-Summer, Eid Special, Formal, Casual, Party Wear",
                "is_required": False,
                "show_in_table": False,
                "show_in_pos": False,
                "show_in_receipt": False,
                "display_order": 5
            }
        ]
    },
    {
        "key": "pharmacy_medical",
        "title": "Pharmacy & Medical Store",
        "icon": "Pill",
        "description": "Essential for pharmacies, medical clinics, and healthcare shops tracking Generics, Dosage, Batch #, and Expiry Dates.",
        "fields": [
            {
                "name": "Generic / Formula",
                "field_type": "text",
                "options": None,
                "is_required": False,
                "show_in_table": True,
                "show_in_pos": True,
                "show_in_receipt": False,
                "display_order": 1
            },
            {
                "name": "Dosage / Strength",
                "field_type": "text",
                "options": None,
                "is_required": False,
                "show_in_table": True,
                "show_in_pos": True,
                "show_in_receipt": True,
                "display_order": 2
            },
            {
                "name": "Batch Number",
                "field_type": "text",
                "options": None,
                "is_required": False,
                "show_in_table": True,
                "show_in_pos": True,
                "show_in_receipt": True,
                "display_order": 3
            },
            {
                "name": "Expiry Date",
                "field_type": "date",
                "options": None,
                "is_required": False,
                "show_in_table": True,
                "show_in_pos": True,
                "show_in_receipt": True,
                "display_order": 4
            },
            {
                "name": "Manufacturer",
                "field_type": "text",
                "options": None,
                "is_required": False,
                "show_in_table": False,
                "show_in_pos": True,
                "show_in_receipt": False,
                "display_order": 5
            }
        ]
    },
    {
        "key": "grocery_supermarket",
        "title": "Grocery & Supermarket",
        "icon": "ShoppingCart",
        "description": "For general stores, kiryana shops, minimarts, and FMCG wholesalers tracking Units, Pack Sizes, and Shelf Locations.",
        "fields": [
            {
                "name": "Unit of Measure",
                "field_type": "select",
                "options": "Kg, Gram, Liter, Ml, Piece, Packet, Carton, Dozen, Box, Bag",
                "is_required": True,
                "show_in_table": True,
                "show_in_pos": True,
                "show_in_receipt": True,
                "display_order": 1
            },
            {
                "name": "Pack / Weight",
                "field_type": "text",
                "options": None,
                "is_required": False,
                "show_in_table": True,
                "show_in_pos": True,
                "show_in_receipt": False,
                "display_order": 2
            },
            {
                "name": "Expiry Date",
                "field_type": "date",
                "options": None,
                "is_required": False,
                "show_in_table": True,
                "show_in_pos": False,
                "show_in_receipt": False,
                "display_order": 3
            },
            {
                "name": "Rack / Aisle",
                "field_type": "text",
                "options": None,
                "is_required": False,
                "show_in_table": False,
                "show_in_pos": False,
                "show_in_receipt": False,
                "display_order": 4
            }
        ]
    },
    {
        "key": "autoparts_hardware",
        "title": "Auto Parts & Hardware Store",
        "icon": "Wrench",
        "description": "For auto spare parts, mechanics, and hardware tools suppliers tracking Part Numbers, Vehicle Makes, and Quality Grades.",
        "fields": [
            {
                "name": "Part / OEM #",
                "field_type": "text",
                "options": None,
                "is_required": False,
                "show_in_table": True,
                "show_in_pos": True,
                "show_in_receipt": True,
                "display_order": 1
            },
            {
                "name": "Vehicle Compatibility",
                "field_type": "text",
                "options": None,
                "is_required": False,
                "show_in_table": True,
                "show_in_pos": True,
                "show_in_receipt": True,
                "display_order": 2
            },
            {
                "name": "Origin / Quality",
                "field_type": "select",
                "options": "Genuine OEM, Japanese, High Copy, Thailand, Local A-Grade, Used Kabli",
                "is_required": False,
                "show_in_table": True,
                "show_in_pos": True,
                "show_in_receipt": False,
                "display_order": 3
            },
            {
                "name": "Bin / Shelf Location",
                "field_type": "text",
                "options": None,
                "is_required": False,
                "show_in_table": False,
                "show_in_pos": False,
                "show_in_receipt": False,
                "display_order": 4
            }
        ]
    },
    {
        "key": "custom_general",
        "title": "Custom / General Retail",
        "icon": "Store",
        "description": "Start with a clean slate and configure custom columns that precisely match your business requirements.",
        "fields": [
            {
                "name": "Brand",
                "field_type": "text",
                "options": None,
                "is_required": False,
                "show_in_table": True,
                "show_in_pos": True,
                "show_in_receipt": False,
                "display_order": 1
            }
        ]
    }
]

def get_available_presets() -> List[PresetTemplateResponse]:
    result = []
    for p in PRESETS_DATA:
        result.append(PresetTemplateResponse(
            key=p["key"],
            title=p["title"],
            icon=p["icon"],
            description=p["description"],
            fields=[CustomFieldCreate(**f) for f in p["fields"]]
        ))
    return result

def apply_preset(db: Session, request: ApplyPresetRequest) -> BusinessSettingsResponse:
    # 1. Update business settings
    settings = db.query(BusinessSettings).filter(BusinessSettings.id == 1).first()
    if not settings:
        settings = BusinessSettings(
            id=1,
            business_name=request.business_name or "My Business",
            currency=request.currency or "Rs.",
            config_pin_hash="1234"
        )
        db.add(settings)

    if request.business_name:
        settings.business_name = request.business_name.strip()
    if request.phone is not None:
        settings.phone = request.phone.strip()
    if request.address is not None:
        settings.address = request.address.strip()
    if request.currency:
        settings.currency = request.currency.strip()

    settings.industry_preset = request.preset_key
    settings.setup_completed = True

    # 2. Determine fields to apply
    fields_to_apply: List[CustomFieldCreate] = []
    if request.custom_fields is not None:
        fields_to_apply = request.custom_fields
    else:
        # Pick from preset definition
        match = next((p for p in PRESETS_DATA if p["key"] == request.preset_key), None)
        if match:
            fields_to_apply = [CustomFieldCreate(**f) for f in match["fields"]]

    # 3. Synchronize custom fields
    # Deactivate existing fields or update existing ones by name
    existing_fields = db.query(ProductCustomField).all()
    existing_map = {f.name.lower().strip(): f for f in existing_fields}

    for order_idx, f_data in enumerate(fields_to_apply):
        key = f_data.name.lower().strip()
        if key in existing_map:
            # Update existing field definition
            target = existing_map[key]
            target.name = f_data.name.strip()
            target.field_type = f_data.field_type
            target.options = f_data.options
            target.is_required = f_data.is_required
            target.show_in_table = f_data.show_in_table
            target.show_in_pos = f_data.show_in_pos
            target.show_in_receipt = f_data.show_in_receipt
            target.display_order = order_idx + 1
            target.is_active = True
        else:
            # Create new custom field
            new_cf = ProductCustomField(
                name=f_data.name.strip(),
                field_type=f_data.field_type,
                options=f_data.options,
                is_required=f_data.is_required,
                show_in_table=f_data.show_in_table,
                show_in_pos=f_data.show_in_pos,
                show_in_receipt=f_data.show_in_receipt,
                display_order=order_idx + 1,
                is_active=True
            )
            db.add(new_cf)

    db.commit()
    db.refresh(settings)

    return BusinessSettingsResponse(
        id=settings.id,
        business_name=settings.business_name,
        phone=settings.phone,
        address=settings.address,
        logo_path=settings.logo_path,
        currency=settings.currency,
        tax_enabled=settings.tax_enabled,
        default_tax_rate=settings.default_tax_rate,
        receipt_header=settings.receipt_header,
        receipt_footer=settings.receipt_footer,
        receipt_printer_type=settings.receipt_printer_type,
        industry_preset=settings.industry_preset,
        setup_completed=settings.setup_completed
    )
