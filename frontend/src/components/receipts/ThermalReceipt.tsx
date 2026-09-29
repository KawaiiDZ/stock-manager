import React from 'react';
import { Sale, BusinessSettings } from '../../types';
import { formatCurrency, formatDateTime } from '../../utils/format';
import { generateBarcodeSvg } from '../../utils/barcode';

export interface ThermalReceiptProps {
  sale: Sale;
  settings?: BusinessSettings | null;
  businessName?: string;
  phone?: string;
  address?: string;
  currency?: string;
  headerText?: string;
  footerText?: string;
  printerType?: '58mm' | '80mm' | 'standard';
  paperWidth?: '58mm' | '80mm';
  headerStyle?: 'logo_text' | 'text_only';
  showBarcode?: boolean;
}

export const ThermalReceipt: React.FC<ThermalReceiptProps> = ({
  sale,
  settings,
  businessName,
  phone,
  address,
  currency: propCurrency,
  headerText,
  footerText: propFooterText,
  printerType,
  paperWidth,
  headerStyle: propHeaderStyle,
  showBarcode = true,
}) => {
  const currency = propCurrency || settings?.currency || 'Rs.';
  const shopName = businessName || settings?.business_name || 'My Local Business';
  const shopAddress = address || settings?.address || '';
  const shopPhone = phone || settings?.phone || '';
  const footerText = propFooterText || settings?.receipt_footer || 'Thank you for your business!';
  const customHeader = headerText || settings?.receipt_header;
  const headerStyle = propHeaderStyle || settings?.thermal_header_style || 'logo_text';

  const is58mm = (paperWidth || printerType) === '58mm';

  return (
    <div
      id="printable-thermal-receipt"
      className={`bg-white text-black font-mono transition-all mx-auto print:m-0 print:p-0 print:w-full print:max-w-none ${
        is58mm ? 'w-[58mm] max-w-[58mm] text-[10.5px] p-2.5 shadow-sm' : 'w-[80mm] max-w-[80mm] text-xs p-3.5 sm:p-4 shadow-sm'
      }`}
      style={{
        boxSizing: 'border-box',
        lineHeight: '1.35',
        backgroundColor: '#ffffff',
        color: '#000000',
        fontWeight: 500,
        overflow: 'visible',
      }}
    >
      {/* Header */}
      <div className="text-center pb-2 border-b-2 border-black space-y-1 receipt-header receipt-section">
        {headerStyle !== 'text_only' && (
          <div className="flex justify-center pb-1">
            <img
              src={settings?.receipt_logo_path || settings?.logo_path || '/stokflow-receipt.png'}
              alt="Logo"
              className={`h-8 w-auto ${is58mm ? 'max-w-[110px]' : 'max-w-[150px]'} object-contain bg-white`}
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          </div>
        )}
        <h2 className={`${is58mm ? 'text-sm font-black' : 'text-base font-black'} tracking-wider uppercase leading-snug break-words text-black`}>
          {shopName}
        </h2>
        {shopAddress && <p className="leading-tight text-black font-bold break-words">{shopAddress}</p>}
        {shopPhone && <p className="leading-tight text-black font-bold">Phone: {shopPhone}</p>}
        {customHeader && customHeader.trim().toLowerCase() !== shopName.trim().toLowerCase() && (
          <p className="leading-tight text-black font-bold mt-1 italic break-words">{customHeader}</p>
        )}
      </div>

      {/* Sale Info */}
      <div className="py-2 border-b-2 border-black space-y-0.5 text-[10.5px] receipt-section">
        <div className="flex justify-between">
          <span className="text-black font-bold">Receipt #:</span>
          <span className="font-black">{sale.receipt_number}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-black font-bold">Date:</span>
          <span className="font-bold">{formatDateTime(sale.created_at)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-black font-bold">Customer:</span>
          <span className="font-bold text-right truncate max-w-[65%]">{sale.customer_name || 'Counter Walk-in'}</span>
        </div>
        {(sale.payments?.[0]?.payment_method || (sale as any).payment_method) && (
          <div className="flex justify-between">
            <span className="text-black font-bold">Payment:</span>
            <span className="font-bold uppercase">
              {sale.payments?.[0]?.payment_method || (sale as any).payment_method}
            </span>
          </div>
        )}
      </div>

      {/* Items Table */}
      <div className="py-2 border-b-2 border-black receipt-items receipt-section">
        <div className="flex justify-between font-black border-b-2 border-black pb-1 mb-1.5 uppercase text-[10.5px] tracking-wide">
          <span>Description</span>
          <span className="text-right">Amount</span>
        </div>
        <div className="space-y-2">
          {sale.items?.map((item, idx) => {
            const origQty = Number(item.quantity || 0);
            const retQty = Number(item.returned_quantity || 0);
            const isFullyReturned = retQty >= origQty && origQty > 0;
            const isPartiallyReturned = retQty > 0 && retQty < origQty;
            const remainingQty = isFullyReturned ? 0 : Math.max(0, origQty - retQty);
            const lineTotal = isFullyReturned
              ? 0
              : isPartiallyReturned
              ? remainingQty * Number(item.unit_price || 0) - Number(item.discount_amount || 0)
              : Number(item.total_price || 0);

            return (
              <div key={idx} className={`leading-snug sale-item ${isFullyReturned ? 'line-through text-black' : ''}`}>
                {/* Line 1: Item Name */}
                <div className="font-bold text-black break-words">
                  {item.product_name}
                  {isFullyReturned && ' (RETURNED)'}
                  {isPartiallyReturned && ` (${retQty} RET)`}
                </div>

                {/* Line 2: Qty × Unit Price left, Line Total right */}
                <div className="flex justify-between items-baseline mt-0.5">
                  <span className="text-black font-bold">
                    {isFullyReturned
                      ? `0 (${origQty} ret) × ${formatCurrency(item.unit_price, currency)}`
                      : isPartiallyReturned
                      ? `${remainingQty} kept (${origQty} orig) × ${formatCurrency(item.unit_price, currency)}`
                      : `${origQty} × ${formatCurrency(item.unit_price, currency)}`}
                  </span>
                  <span className="font-black font-mono text-black text-right ml-2 shrink-0">
                    {formatCurrency(lineTotal, currency)}
                  </span>
                </div>

                {/* Indented item discount if any */}
                {Number(item.discount_amount || 0) > 0 && !isFullyReturned && (
                  <div className="text-[10px] text-black font-bold pl-2">
                    ↳ Item Disc: -{formatCurrency(item.discount_amount, currency)}
                  </div>
                )}

                {/* Indented returned units if partially returned */}
                {isPartiallyReturned && (
                  <div className="text-[10px] text-black font-bold pl-2">
                    ↳ Returned {retQty} × {formatCurrency(item.unit_price, currency)} (-{formatCurrency(retQty * Number(item.unit_price || 0), currency)})
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Total items & quantity summary */}
        <div className="flex justify-between text-[10.5px] text-black font-bold pt-1.5 mt-2 border-t-2 border-black">
          <span>Items / Units:</span>
          <span>
            {sale.items?.length || 0} lines / {(sale.items || []).reduce((acc, it) => acc + Number(it.quantity || 0), 0)} pcs
          </span>
        </div>
      </div>

      {/* Totals */}
      <div className="py-2 border-b-2 border-black space-y-1 receipt-totals receipt-section">
        <div className="flex justify-between font-bold">
          <span>Subtotal:</span>
          <span className="font-mono">{formatCurrency(sale.subtotal, currency)}</span>
        </div>
        {Number(sale.discount_amount || 0) > 0 && (
          <div className="flex justify-between font-bold">
            <span>Order Discount:</span>
            <span className="font-mono">-{formatCurrency(sale.discount_amount, currency)}</span>
          </div>
        )}
        {Number(sale.tax_amount || 0) > 0 && (
          <div className="flex justify-between font-bold">
            <span>Tax ({sale.tax_rate}%):</span>
            <span className="font-mono">+{formatCurrency(sale.tax_amount, currency)}</span>
          </div>
        )}
        <div className="flex justify-between font-black text-sm border-t-2 border-b-2 border-black py-1 mt-1">
          <span>TOTAL:</span>
          <span className="font-mono">{formatCurrency(sale.total_amount, currency)}</span>
        </div>
        {Number(sale.total_returned_amount || 0) > 0 && (
          <>
            <div className="flex justify-between font-bold">
              <span>Less Returned Items:</span>
              <span className="font-mono">-{formatCurrency(sale.total_returned_amount, currency)}</span>
            </div>
            <div className="flex justify-between font-black border-t-2 border-black pt-1">
              <span>NET PAYABLE:</span>
              <span className="font-mono">{formatCurrency(Math.max(0, Number(sale.total_amount || 0) - Number(sale.total_returned_amount || 0)), currency)}</span>
            </div>
          </>
        )}
      </div>

      {/* Payment details */}
      <div className="py-2 border-b-2 border-black space-y-1 receipt-section">
        <div className="flex justify-between font-bold">
          <span>Paid:</span>
          <span className="font-mono">{formatCurrency(sale.paid_amount, currency)}</span>
        </div>
        {Number(sale.due_amount || 0) > 0 ? (
          <div className="flex justify-between font-black">
            <span>Remaining Due:</span>
            <span className="font-mono">{formatCurrency(sale.due_amount, currency)}</span>
          </div>
        ) : (
          <div className="flex justify-between font-bold">
            <span>Status:</span>
            <span>
              {(sale.payment_status || '').toUpperCase() === 'RETURNED'
                ? 'FULLY RETURNED'
                : (sale.payment_status || '').toUpperCase() === 'PARTIALLY_RETURNED'
                ? 'PARTIALLY RETURNED (SETTLED)'
                : 'PAID IN FULL'}
            </span>
          </div>
        )}
        {Number(sale.paid_amount || 0) > Number(sale.total_amount || 0) && (
          <div className="flex justify-between text-black font-bold">
            <span>Change:</span>
            <span className="font-mono">
              {formatCurrency(Number(sale.paid_amount || 0) - Number(sale.total_amount || 0), currency)}
            </span>
          </div>
        )}
      </div>

      {/* Code-128 Barcode for quick scanner lookup */}
      {showBarcode !== false && sale.receipt_number && (
        <div className="py-2.5 flex flex-col items-center justify-center receipt-barcode receipt-section">
          <div
            dangerouslySetInnerHTML={{
              __html: generateBarcodeSvg(sale.receipt_number, {
                height: is58mm ? 32 : 40,
                barWidth: is58mm ? 1.7 : 2.2,
                quietZone: 8,
                includeText: true,
                fontSize: is58mm ? 10 : 11,
              }),
            }}
            className="flex justify-center w-full overflow-hidden"
          />
        </div>
      )}

      {/* Footer message */}
      <div className="text-center pt-2 receipt-footer receipt-section">
        <p className="font-bold leading-tight text-black">{footerText}</p>
      </div>

      {/* Paper Cutter Feed Spacing */}
      <div className="h-4 print:h-6" />
    </div>
  );
};

