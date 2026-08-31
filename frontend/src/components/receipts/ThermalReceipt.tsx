import React from 'react';
import { Sale, BusinessSettings } from '../../types';
import { formatCurrency, formatMoney } from '../../utils/format';

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
      className={`bg-white text-black font-mono text-xs p-4 mx-auto ${
        is58mm ? 'w-[58mm] max-w-[58mm] text-[10px]' : 'w-[80mm] max-w-[80mm]'
      }`}
      style={{
        boxSizing: 'border-box',
        lineHeight: '1.3',
      }}
    >
      {/* Header */}
      <div className="text-center pb-2 border-b border-dashed border-black">
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
          <span>
            {new Date(sale.created_at).toLocaleDateString('en-GB', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })}{' '}
            {new Date(sale.created_at).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
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
          {sale.items?.map((item, idx) => (
            <div key={idx}>
              <div className="font-semibold leading-tight">{item.product_name}</div>
              <div className="flex justify-between text-[11px] text-slate-700">
                <span>
                  {item.quantity} × {formatCurrency(item.unit_price, currency)}
                  {Number(item.discount_amount || 0) > 0 && ` (-${formatCurrency(item.discount_amount, currency)})`}
                </span>
                <span className="font-semibold">
                  {formatCurrency(item.total_price, currency)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Totals */}
      <div className="py-2 border-b border-dashed border-black space-y-1">
        <div className="flex justify-between">
          <span>Subtotal:</span>
          <span>
            {formatCurrency(sale.subtotal, currency)}
          </span>
        </div>
        {Number(sale.discount_amount || 0) > 0 && (
          <div className="flex justify-between">
            <span>Discount:</span>
            <span>
              -{formatCurrency(sale.discount_amount, currency)}
            </span>
          </div>
        )}
        {Number(sale.tax_amount || 0) > 0 && (
          <div className="flex justify-between">
            <span>Tax ({sale.tax_rate}%):</span>
            <span>
              +{formatCurrency(sale.tax_amount, currency)}
            </span>
          </div>
        )}
        <div className="flex justify-between font-bold text-sm border-t border-black pt-1 mt-1">
          <span>TOTAL:</span>
          <span>
            {formatCurrency(sale.total_amount, currency)}
          </span>
        </div>
      </div>

      {/* Payment details */}
      <div className="py-2 border-b border-dashed border-black space-y-1 text-[11px]">
        <div className="flex justify-between font-semibold">
          <span>Paid:</span>
          <span>
            {formatCurrency(sale.paid_amount, currency)}
          </span>
        </div>
        {Number(sale.due_amount || 0) > 0 ? (
          <div className="flex justify-between font-bold text-rose-800">
            <span>Remaining Due:</span>
            <span>
              {formatCurrency(sale.due_amount, currency)}
            </span>
          </div>
        ) : (
          <div className="flex justify-between font-bold text-emerald-800">
            <span>Status:</span>
            <span>FULLY PAID</span>
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
