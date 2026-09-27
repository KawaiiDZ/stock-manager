import React, { useState, useEffect, useId } from 'react';
import { Product, BusinessSettings } from '../../types';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Printer, Copy, Check, Sliders, Eye } from 'lucide-react';
import { generateBarcodeSvg, STANDARD_LABEL_SIZES, parseLabelDimensions } from '../../utils/barcode';
import { printElement } from '../../utils/print';
import { formatCurrency } from '../../utils/format';

export interface BarcodePrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: BusinessSettings | null;
  products: Product[];
  initialCopies?: number;
  // If set to true, renders in "Test Label Mode" for printer verification
  isTestMode?: boolean;
}

export const BarcodePrintModal: React.FC<BarcodePrintModalProps> = ({
  isOpen,
  onClose,
  settings,
  products,
  initialCopies = 1,
  isTestMode = false,
}) => {
  const printContainerId = useId().replace(/:/g, '_') + '_barcode_print_area';

  const defaultSizeKey = settings?.barcode_label_size || '50x25mm';
  const [selectedSizeKey, setSelectedSizeKey] = useState<string>(defaultSizeKey);
  const [customWidthMm, setCustomWidthMm] = useState<number>(50);
  const [customHeightMm, setCustomHeightMm] = useState<number>(25);

  const [copies, setCopies] = useState<number>(Math.max(1, initialCopies));
  const [showBusinessName, setShowBusinessName] = useState<boolean>(
    settings?.barcode_label_show_business_name ?? true
  );
  const [showProductName, setShowProductName] = useState<boolean>(
    settings?.barcode_label_show_product_name ?? true
  );
  const [showPrice, setShowPrice] = useState<boolean>(
    settings?.barcode_label_show_price ?? true
  );
  const [showSku, setShowSku] = useState<boolean>(
    settings?.barcode_label_show_sku ?? true
  );
  const [customText, setCustomText] = useState<string>(
    settings?.barcode_label_custom_text || ''
  );
  const [printing, setPrinting] = useState<boolean>(false);

  // Sync settings when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedSizeKey(settings?.barcode_label_size || '50x25mm');
      setShowBusinessName(settings?.barcode_label_show_business_name ?? true);
      setShowProductName(settings?.barcode_label_show_product_name ?? true);
      setShowPrice(settings?.barcode_label_show_price ?? true);
      setShowSku(settings?.barcode_label_show_sku ?? true);
      setCustomText(settings?.barcode_label_custom_text || '');
      setCopies(Math.max(1, initialCopies));
    }
  }, [isOpen, settings, initialCopies]);

  // Determine current active dimensions
  const activePreset = STANDARD_LABEL_SIZES.find((s) => s.key === selectedSizeKey);
  const labelWidthMm = selectedSizeKey === 'custom' ? customWidthMm : (activePreset?.widthMm || 50);
  const labelHeightMm = selectedSizeKey === 'custom' ? customHeightMm : (activePreset?.heightMm || 25);

  const businessName = settings?.business_name || 'My Shop';
  const currency = settings?.currency || 'Rs.';

  // Dummy fallback test product if in test mode or empty products
  const previewProduct: Product = isTestMode || products.length === 0
    ? {
        id: 0,
        product_id: 'PRD-TEST',
        name: 'StockFlow Thermal Test',
        purchase_price: 0,
        selling_price: 1500,
        current_stock: 10,
        sku: 'TEST-SKU-01',
        barcode: 'STOCKFLOW-TEST',
        is_active: true,
        category_name: 'General',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
    : products[0];

  const handlePrint = async () => {
    setPrinting(true);
    try {
      await printElement(printContainerId, {
        isLabel: true,
        labelWidth: `${labelWidthMm}mm`,
        labelHeight: `${labelHeightMm}mm`,
        title: isTestMode ? 'StockFlow-Test-Label' : `Barcode-Labels-${previewProduct.name}`,
      });
    } catch (err) {
      console.error('Failed to print barcode labels:', err);
    } finally {
      setPrinting(false);
    }
  };

  if (!isOpen) return null;

  // Build items array to print (each product repeated by `copies` count)
  const itemsToPrint: Array<{ product: Product; copyIdx: number }> = [];
  const targetProducts = isTestMode ? [previewProduct] : products;

  targetProducts.forEach((p) => {
    for (let c = 1; c <= copies; c++) {
      itemsToPrint.push({ product: p, copyIdx: c });
    }
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isTestMode ? 'Print Test Barcode Label' : `Print Barcode Labels (${products.length} product${products.length > 1 ? 's' : ''})`}
      subtitle={`Configure roll dimensions and label copies for thermal printing`}
      maxWidth="2xl"
    >
      <div className="space-y-6">
        {/* Top: Live Preview & Configuration Controls */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
          {/* Left Column: Live Scaled Label Preview */}
          <div className="md:col-span-6 flex flex-col items-center justify-center p-5 rounded-2xl bg-slate-100 border border-slate-200">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
              <Eye className="h-3.5 w-3.5 text-emerald-600" />
              <span>Live Label Preview ({labelWidthMm}×{labelHeightMm}mm)</span>
            </div>

            {/* Scaled Preview Box representing physical sticker */}
            <div
              style={{
                width: `${Math.min(260, labelWidthMm * 4.5)}px`,
                aspectRatio: `${labelWidthMm} / ${labelHeightMm}`,
              }}
              className="bg-white rounded-lg border-2 border-dashed border-slate-300 shadow-md p-2 flex flex-col items-center justify-between text-center overflow-hidden transition-all duration-200 select-none"
            >
              {/* Top Business Name */}
              {showBusinessName && (
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-900 truncate w-full px-1">
                  {businessName}
                </div>
              )}

              {/* Product Name */}
              {showProductName && !isTestMode && (
                <div className="text-[11px] font-bold text-slate-800 truncate w-full px-1 leading-tight">
                  {previewProduct.name}
                </div>
              )}

              {isTestMode && (
                <div className="text-[11px] font-bold text-emerald-700 truncate w-full px-1 leading-tight">
                  Thank you for using StockFlow
                </div>
              )}

              {/* SVG Barcode */}
              <div
                className="w-full flex justify-center my-0.5 overflow-hidden"
                dangerouslySetInnerHTML={{
                  __html: generateBarcodeSvg(
                    previewProduct.barcode || previewProduct.sku || previewProduct.product_id,
                    {
                      height: Math.max(22, labelHeightMm * 1.1),
                      barWidth: 1.5,
                      includeText: true,
                      fontSize: 9,
                    }
                  ),
                }}
              />

              {/* Bottom Metadata: Price, SKU, Custom Text */}
              <div className="w-full flex items-center justify-between px-1 text-[10px] font-bold text-slate-900 leading-tight">
                {showSku && previewProduct.sku ? (
                  <span className="text-slate-500 text-[9px] truncate max-w-[45%]">
                    {previewProduct.sku}
                  </span>
                ) : <span />}

                {showPrice && (
                  <span className="text-slate-900 font-black">
                    {formatCurrency(previewProduct.selling_price, currency)}
                  </span>
                )}
              </div>

              {/* Custom Small Text / Tagline */}
              {customText.trim() && (
                <div className="text-[8px] font-medium text-slate-500 truncate w-full leading-none mt-0.5">
                  {customText.trim()}
                </div>
              )}
            </div>

            <div className="text-[11px] text-slate-400 mt-3 text-center">
              Target Printer: Any 203/300 DPI Thermal Label Printer (Zebra, Xprinter, TSC, Dymo)
            </div>
          </div>

          {/* Right Column: Print Settings & Sizing */}
          <div className="md:col-span-6 space-y-4">
            {/* Label Size Dropdown */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Roll Label Size *
              </label>
              <select
                value={selectedSizeKey}
                onChange={(e) => setSelectedSizeKey(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-emerald-500 shadow-sm"
              >
                {STANDARD_LABEL_SIZES.map((preset) => (
                  <option key={preset.key} value={preset.key}>
                    {preset.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Custom mm inputs if selectedSizeKey === 'custom' */}
            {selectedSizeKey === 'custom' && (
              <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Width (mm)</label>
                  <input
                    type="number"
                    min="20"
                    max="150"
                    value={customWidthMm}
                    onChange={(e) => setCustomWidthMm(Number(e.target.value))}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 font-bold"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Height (mm)</label>
                  <input
                    type="number"
                    min="15"
                    max="150"
                    value={customHeightMm}
                    onChange={(e) => setCustomHeightMm(Number(e.target.value))}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 font-bold"
                  />
                </div>
              </div>
            )}

            {/* Copies Counter */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Number of Copies {products.length > 1 ? 'per product' : ''}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={copies}
                  onChange={(e) => setCopies(Math.max(1, Number(e.target.value)))}
                  className="w-28 bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-800 focus:outline-none focus:border-emerald-500 shadow-sm"
                />
                <span className="text-xs text-slate-500 font-medium">
                  Total labels to print: <strong className="text-emerald-700">{itemsToPrint.length}</strong>
                </span>
              </div>
            </div>

            {/* Content Toggles */}
            <div className="pt-2 border-t border-slate-100 space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                Label Content Options
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-slate-700">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showBusinessName}
                    onChange={(e) => setShowBusinessName(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Business Name</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showProductName}
                    onChange={(e) => setShowProductName(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Product Name</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showPrice}
                    onChange={(e) => setShowPrice(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Price ({currency})</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showSku}
                    onChange={(e) => setShowSku(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>SKU / Code</span>
                </label>
              </div>
            </div>

            {/* Custom Tagline input */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                Custom Small Text / Notice
              </label>
              <input
                type="text"
                placeholder="e.g. Non-refundable if tag removed"
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 shadow-sm focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-200">
          <div className="text-xs text-slate-500">
            {itemsToPrint.length} label sticker{itemsToPrint.length !== 1 ? 's' : ''} will be sent to the printer.
          </div>
          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={onClose} disabled={printing}>
              Cancel
            </Button>
            <Button
              variant="primary"
              icon={<Printer className="h-4 w-4" />}
              onClick={handlePrint}
              loading={printing}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5"
            >
              {isTestMode ? 'Print Test Label' : `Print ${itemsToPrint.length} Label${itemsToPrint.length !== 1 ? 's' : ''}`}
            </Button>
          </div>
        </div>
      </div>

      {/* Hidden Isolated Print Canvas for the Print Engine */}
      <div style={{ display: 'none' }}>
        <div id={printContainerId} className="barcode-label-sheet">
          {itemsToPrint.map((item, idx) => {
            const prod = item.product;
            const codeToRender = prod.barcode || prod.sku || prod.product_id;
            return (
              <div
                key={`${prod.id}-${item.copyIdx}-${idx}`}
                className="barcode-label-item"
                style={{
                  width: `${labelWidthMm}mm`,
                  height: `${labelHeightMm}mm`,
                  padding: '1mm 1.5mm',
                  boxSizing: 'border-box',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  textAlign: 'center',
                  pageBreakAfter: idx === itemsToPrint.length - 1 ? 'avoid' : 'always',
                  breakAfter: idx === itemsToPrint.length - 1 ? 'avoid' : 'page',
                  pageBreakInside: 'avoid',
                  breakInside: 'avoid',
                  overflow: 'hidden',
                  background: '#ffffff',
                  color: '#000000',
                }}
              >
                {/* Business Name */}
                {showBusinessName && (
                  <div
                    style={{
                      fontSize: '8pt',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      width: '100%',
                      lineHeight: '1.1',
                    }}
                  >
                    {businessName}
                  </div>
                )}

                {/* Product Name */}
                {showProductName && !isTestMode && (
                  <div
                    style={{
                      fontSize: '8.5pt',
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      width: '100%',
                      lineHeight: '1.1',
                    }}
                  >
                    {prod.name}
                  </div>
                )}

                {isTestMode && (
                  <div
                    style={{
                      fontSize: '8.5pt',
                      fontWeight: 700,
                      color: '#000000',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      width: '100%',
                      lineHeight: '1.1',
                    }}
                  >
                    Thank you for using StockFlow
                  </div>
                )}

                {/* SVG Barcode */}
                <div
                  style={{
                    width: '100%',
                    display: 'flex',
                    justifyContent: 'center',
                    margin: '1px 0',
                    overflow: 'hidden',
                  }}
                  dangerouslySetInnerHTML={{
                    __html: generateBarcodeSvg(codeToRender, {
                      height: Math.max(22, labelHeightMm * 1.15),
                      barWidth: 1.5,
                      includeText: true,
                      fontSize: 9,
                    }),
                  }}
                />

                {/* Price and SKU line */}
                <div
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '8pt',
                    fontWeight: 700,
                    lineHeight: '1.1',
                  }}
                >
                  {showSku && prod.sku ? (
                    <span style={{ fontSize: '7pt', color: '#444444', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '45%' }}>
                      {prod.sku}
                    </span>
                  ) : <span />}

                  {showPrice && (
                    <span style={{ fontWeight: 900, fontSize: '8.5pt' }}>
                      {formatCurrency(prod.selling_price, currency)}
                    </span>
                  )}
                </div>

                {/* Custom Small Text */}
                {customText.trim() && (
                  <div
                    style={{
                      fontSize: '6.5pt',
                      color: '#555555',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      width: '100%',
                      lineHeight: '1',
                      marginTop: '1px',
                    }}
                  >
                    {customText.trim()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
};
