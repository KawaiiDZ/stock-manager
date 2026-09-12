import React from 'react';
import { Sale, BusinessSettings } from '../../types';
import { formatCurrency, formatMoney, formatDateTime } from '../../utils/format';

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
}) => {
  const currency = propCurrency || settings?.currency || 'Rs.';
  const shopName = businessName || settings?.business_name || 'My Local Business';
  const shopAddress = address || settings?.address || '';
  const shopPhone = phone || settings?.phone || '';
  const footerText = propFooterText || settings?.receipt_footer || 'Thank you for your business!';
  const customHeader = headerText || settings?.receipt_header;

  const is58mm = (paperWidth || printerType) === '58mm';

  return (
    <div
      id="printable-thermal-receipt"
      className={`bg-white text-black font-mono text-xs p-4 mx-auto print:m-0 print:p-1 ${
        is58mm ? 'w-[58mm] max-w-[58mm] text-[10px]' : 'w-[80mm] max-w-[80mm]'
      }`}
      style={{
        boxSizing: 'border-box',
        lineHeight: '1.3',
      }}
    >
      {/* Header */}
      <div className="text-center pb-2 border-b border-dashed border-black space-y-1">
        <div className="flex justify-center pb-1">
          <img
            src={settings?.receipt_logo_path || settings?.logo_path || '/stokflow-receipt.png'}
            alt="Logo"
            className="h-8 w-auto max-w-[140px] object-contain filter grayscale contrast-200"
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
        </div>
        <h2 className="text-base font-black tracking-wider uppercase">{shopName}</h2>
        {shopAddress && <p className="text-[11px] text-slate-700">{shopAddress}</p>}
        {shopPhone && <p className="text-[11px] text-slate-700">Phone: {shopPhone}</p>}
        {customHeader && <p className="text-[11px] text-slate-700 mt-1">{customHeader}</p>}
      </div>

      {/* Sale Info */}
      <div className="py-2 border-b border-dashed border-black space-y-0.5 text-[11px]">
        <div className="flex justify-between">
          <span>Receipt #:</span>
          <span className="font-bold">{sale.receipt_number}</span>
        </div>
        <div className="flex justify-between">
          <span>Date:</span>
          <span>{formatDateTime(sale.created_at)}</span>
        </div>
        <div className="flex justify-between">
          <span>Customer:</span>
          <span className="font-semibold">{sale.customer_name || 'Counter Walk-in'}</span>
        </div>
      </div>

      {/* Items Table */}
      <div className="py-2 border-b border-dashed border-black">
        <div className="flex justify-between font-bold border-b border-black pb-1 mb-1">
          <span>Item</span>
          <span className="text-right">Qty × Price = Total</span>
        </div>
        <div className="space-y-1.5">
          {sale.items?.map((item, idx) => {
            const origQty = Number(item.quantity || 0);
            const retQty = Number(item.returned_quantity || 0);
            const isFullyReturned = retQty >= origQty && origQty > 0;
            const isPartiallyReturned = retQty > 0 && retQty < origQty;
            const remainingQty = isFullyReturned ? 0 : Math.max(0, origQty - retQty);

            return (
              <div key={idx} className={isFullyReturned ? 'text-slate-500 line-through' : ''}>
                <div className="font-semibold leading-tight flex justify-between">
                  <span>
                    {item.product_name}
                    {isFullyReturned && ' [RETURNED]'}
                    {isPartiallyReturned && ` [${retQty} RET]`}
                  </span>
                </div>
                <div className="flex justify-between text-[11px] text-slate-700">
                  <span>
                    {isFullyReturned
                      ? `0 (${origQty} ret) × ${formatCurrency(item.unit_price, currency)}`
                      : isPartiallyReturned
                      ? `${remainingQty} kept (${origQty} orig) × ${formatCurrency(item.unit_price, currency)}`
                      : `${origQty} × ${formatCurrency(item.unit_price, currency)}`}
                    {Number(item.discount_amount || 0) > 0 && ` (-${formatCurrency(item.discount_amount, currency)})`}
                  </span>
                  <span className="font-semibold">
                    {isFullyReturned
                      ? formatCurrency(0, currency)
                      : isPartiallyReturned
                      ? formatCurrency(remainingQty * Number(item.unit_price || 0), currency)
                      : formatCurrency(item.total_price, currency)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Totals */}
      <div className="py-2 border-b border-dashed border-black space-y-1">
        <div className="flex justify-between">
          <span>Subtotal:</span>
          <span>{formatCurrency(sale.subtotal, currency)}</span>
        </div>
        {Number(sale.discount_amount || 0) > 0 && (
          <div className="flex justify-between">
            <span>Discount:</span>
            <span>-{formatCurrency(sale.discount_amount, currency)}</span>
          </div>
        )}
        {Number(sale.tax_amount || 0) > 0 && (
          <div className="flex justify-between">
            <span>Tax ({sale.tax_rate}%):</span>
            <span>+{formatCurrency(sale.tax_amount, currency)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-sm border-t border-black pt-1 mt-1">
          <span>ORIGINAL TOTAL:</span>
          <span>{formatCurrency(sale.total_amount, currency)}</span>
        </div>
        {Number(sale.total_returned_amount || 0) > 0 && (
          <>
            <div className="flex justify-between text-[11px] text-rose-800 font-semibold">
              <span>Less Returned Items:</span>
              <span>-{formatCurrency(sale.total_returned_amount, currency)}</span>
            </div>
            <div className="flex justify-between font-bold border-t border-dotted border-black pt-0.5">
              <span>ADJUSTED TOTAL:</span>
              <span>{formatCurrency(Math.max(0, Number(sale.total_amount || 0) - Number(sale.total_returned_amount || 0)), currency)}</span>
            </div>
          </>
        )}
      </div>

      {/* Payment details */}
      <div className="py-2 border-b border-dashed border-black space-y-1 text-[11px]">
        <div className="flex justify-between font-semibold">
          <span>Paid:</span>
          <span>{formatCurrency(sale.paid_amount, currency)}</span>
        </div>
        {Number(sale.due_amount || 0) > 0 ? (
          <div className="flex justify-between font-bold text-rose-800">
            <span>Remaining Due:</span>
            <span>{formatCurrency(sale.due_amount, currency)}</span>
          </div>
        ) : (
          <div className="flex justify-between font-bold text-emerald-800">
            <span>Status:</span>
            <span>
              {(sale.payment_status || '').toUpperCase() === 'RETURNED'
                ? 'FULLY RETURNED'
                : (sale.payment_status || '').toUpperCase() === 'PARTIALLY_RETURNED'
                ? 'PARTIALLY RETURNED (SETTLED)'
                : 'FULLY PAID'}
            </span>
          </div>
        )}
      </div>

      {/* Footer message */}
      <div className="text-center pt-3 text-[11px]">
        <p className="font-medium">{footerText}</p>
        <p className="text-[9px] text-slate-500 mt-1">Powered by Stock Manager</p>
      </div>
    </div>
  );
};
