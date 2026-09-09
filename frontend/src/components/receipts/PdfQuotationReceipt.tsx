import React from 'react';
import { Quotation, BusinessSettings } from '../../types';
import { formatCurrency, formatDateTime } from '../../utils/format';
import { FileText, CheckCircle2, AlertCircle, Clock } from 'lucide-react';

export interface PdfQuotationReceiptProps {
  quotation: Quotation;
  settings?: BusinessSettings | null;
  businessName?: string;
  phone?: string;
  address?: string;
  currency?: string;
  headerText?: string;
  footerText?: string;
}

export const PdfQuotationReceipt: React.FC<PdfQuotationReceiptProps> = ({
  quotation,
  settings,
  businessName,
  phone,
  address,
  currency: propCurrency,
  headerText,
  footerText: propFooterText,
}) => {
  const currency = propCurrency || settings?.currency || 'Rs.';
  const shopName = businessName || settings?.business_name || 'My Business';
  const shopAddress = address || settings?.address || '';
  const shopPhone = phone || settings?.phone || '';
  const footerText =
    propFooterText ||
    settings?.quotation_terms ||
    '1. This quotation is an estimate and valid for 15 days from issue date.\n2. Stock is subject to availability at the time of final confirmation.\n3. This document does not constitute a tax invoice and no stock has been deducted.';
  const customHeader = headerText || settings?.receipt_header;

  const hasLetterhead = Boolean(settings?.show_letterhead && settings?.receipt_letterhead_path);
  const hideHeaderText = Boolean(hasLetterhead && settings?.hide_header_text_with_letterhead);

  const getStatusBadge = () => {
    const status = (quotation.status || 'PENDING').toUpperCase();
    if (status === 'APPROVED') {
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          APPROVED & CONVERTED
        </span>
      );
    }
    if (status === 'REJECTED') {
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">
          <AlertCircle className="h-3.5 w-3.5 text-rose-600" />
          DISAPPROVED
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
        <Clock className="h-3.5 w-3.5 text-amber-600" />
        ACTIVE QUOTATION
      </span>
    );
  };

  return (
    <div
      id="printable-pdf-receipt"
      className="bg-white text-slate-800 font-sans text-xs p-8 max-w-[210mm] min-w-[190mm] min-h-[285mm] mx-auto shadow-sm border border-slate-200 rounded-lg print:border-none print:shadow-none print:p-0 print:m-0 print:max-w-none flex flex-col justify-between"
      style={{ boxSizing: 'border-box' }}
    >
      <div className="pdf-content-body flex-1">
        {/* 1. Custom Letterhead Banner (if enabled) */}
      {hasLetterhead && settings?.receipt_letterhead_path && (
        <div className="mb-4 text-center border-b border-slate-200 pb-3 print-avoid-break">
          <img
            src={settings.receipt_letterhead_path}
            alt="Business Letterhead"
            className="w-full max-h-36 object-contain mx-auto"
          />
        </div>
      )}

      {/* 2. Header & Meta */}
      {!hideHeaderText && (
        <div className="flex justify-between items-start pb-6 border-b border-slate-200 print-avoid-break">
          <div className="flex gap-4 items-start max-w-[60%]">
            {!hasLetterhead && (
              <img
                src={settings?.receipt_logo_path || settings?.logo_path || '/stokflow-receipt.png'}
                alt="Logo"
                className="h-16 w-auto max-w-[120px] object-contain"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            )}
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight uppercase">
                {shopName}
              </h1>
              {shopAddress && <p className="text-slate-600 mt-0.5 leading-relaxed">{shopAddress}</p>}
              {shopPhone && <p className="text-slate-600 font-medium">Phone: {shopPhone}</p>}
              {customHeader && <p className="text-slate-500 italic mt-1">{customHeader}</p>}
            </div>
          </div>

          <div className="text-right space-y-1.5">
            <div className="text-2xl font-black text-indigo-950 tracking-tight uppercase flex items-center justify-end gap-2">
              <FileText className="h-6 w-6 text-indigo-600" />
              QUOTATION
            </div>
            <div className="text-slate-600 font-medium">
              Quote #: <span className="font-bold text-slate-900">{quotation.quotation_number}</span>
            </div>
            <div className="text-slate-600">
              Date: <span className="font-semibold text-slate-900">{formatDateTime(quotation.created_at)}</span>
            </div>
            {quotation.valid_until && (
              <div className="text-slate-600 text-[11px]">
                Valid Until: <span className="font-semibold text-slate-900">{formatDateTime(quotation.valid_until)}</span>
              </div>
            )}
            <div className="pt-1">{getStatusBadge()}</div>
          </div>
        </div>
      )}

      {hideHeaderText && (
        <div className="flex justify-between items-center pb-4 mb-4 border-b border-slate-200 print-avoid-break">
          <div>
            <span className="text-lg font-bold text-indigo-950 uppercase flex items-center gap-2">
              <FileText className="h-5 w-5 text-indigo-600" /> QUOTATION / ESTIMATE
            </span>
          </div>
          <div className="text-right flex items-center gap-4">
            <span className="text-slate-600 font-medium">
              Quote #: <span className="font-bold text-slate-900">{quotation.quotation_number}</span>
            </span>
            <span className="text-slate-600">
              Date: <span className="font-semibold text-slate-900">{formatDateTime(quotation.created_at)}</span>
            </span>
            {getStatusBadge()}
          </div>
        </div>
      )}

      {/* 3. Customer Info */}
      <div className="my-5 p-4 bg-indigo-50/40 border border-indigo-100 rounded-lg flex justify-between items-start print-avoid-break">
        <div>
          <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider block mb-1">
            Quotation Prepared For
          </span>
          <p className="text-sm font-bold text-slate-900">{quotation.customer_name}</p>
          {quotation.customer_phone && (
            <p className="text-slate-600 mt-0.5">Phone: {quotation.customer_phone}</p>
          )}
          {quotation.customer_address && (
            <p className="text-slate-600 mt-0.5 leading-tight">Address: {quotation.customer_address}</p>
          )}
        </div>
        <div className="text-right">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
            Offer Status
          </span>
          <span className="inline-block px-2.5 py-0.5 bg-white border border-slate-200 text-slate-800 rounded font-semibold text-xs">
            Non-Binding Estimate
          </span>
        </div>
      </div>

      {/* 4. Line Items */}
      <div className="my-6">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-slate-100 text-slate-700 uppercase font-bold text-[10px] tracking-wider border-y border-slate-200">
              <th className="py-2.5 px-3 text-left w-10">#</th>
              <th className="py-2.5 px-3 text-left">Item Description</th>
              <th className="py-2.5 px-3 text-right w-24">Qty</th>
              <th className="py-2.5 px-3 text-right w-28">Unit Price</th>
              <th className="py-2.5 px-3 text-right w-24">Discount</th>
              <th className="py-2.5 px-3 text-right w-32">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {quotation.items?.map((item, index) => {
              const qty = Number(item.quantity || 0);
              const unitPrice = Number(item.unit_price || 0);
              const disc = Number(item.discount_amount || 0);
              const total = Math.max(0, qty * unitPrice - disc);
              return (
                <tr key={index} className="print-avoid-break text-slate-800">
                  <td className="py-2.5 px-3 text-left text-slate-400 font-medium">{index + 1}</td>
                  <td className="py-2.5 px-3 text-left font-semibold text-slate-900">
                    {item.product_name}
                    {item.notes && (
                      <span className="block text-[10px] font-normal text-slate-500">{item.notes}</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right font-medium">{qty}</td>
                  <td className="py-2.5 px-3 text-right text-slate-600">{formatCurrency(unitPrice, currency)}</td>
                  <td className="py-2.5 px-3 text-right text-emerald-700 font-medium">
                    {disc > 0 ? `-${formatCurrency(disc, currency)}` : '—'}
                  </td>
                  <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                    {formatCurrency(total, currency)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 5. Summary & Terms */}
      <div className="flex justify-between items-start gap-8 pt-4 border-t border-slate-200 print-avoid-break">
        <div className="flex-1 space-y-3">
          {quotation.notes && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
              <span className="font-semibold text-slate-700 block mb-0.5">Quotation Notes:</span>
              <p className="text-slate-600 leading-snug">{quotation.notes}</p>
            </div>
          )}
          <div className="text-slate-500 leading-relaxed text-[11px] whitespace-pre-line">
            <p className="font-bold text-slate-700 mb-0.5">Standard Terms & Validity:</p>
            <p>{footerText}</p>
          </div>
        </div>

        <div className="w-80 bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-2">
          <div className="flex justify-between text-slate-600">
            <span>Subtotal:</span>
            <span className="font-medium text-slate-900">{formatCurrency(quotation.subtotal, currency)}</span>
          </div>
          {Number(quotation.discount_amount || 0) > 0 && (
            <div className="flex justify-between text-emerald-700">
              <span>Discount:</span>
              <span className="font-medium">-{formatCurrency(quotation.discount_amount, currency)}</span>
            </div>
          )}
          {Number(quotation.tax_amount || 0) > 0 && (
            <div className="flex justify-between text-slate-600">
              <span>Tax ({quotation.tax_rate}%):</span>
              <span className="font-medium text-slate-900">+{formatCurrency(quotation.tax_amount, currency)}</span>
            </div>
          )}
          <div className="flex justify-between font-black text-base text-indigo-950 pt-2 border-t border-slate-200">
            <span>Estimated Total:</span>
            <span className="text-indigo-600">{formatCurrency(quotation.total_amount, currency)}</span>
          </div>
        </div>
      </div>
      </div>

      {/* 6. Signature Section */}
      <div className="pdf-footer-stamp mt-auto pt-6 border-t border-slate-200 flex justify-between items-end text-center text-slate-500 text-[11px] print-avoid-break">
        <div className="w-48">
          <div className="border-b border-dashed border-slate-400 pb-1 mb-1"></div>
          <span>Customer Acceptance</span>
        </div>
        <div className="w-56">
          <div className="border-b border-dashed border-slate-400 pb-1 mb-1"></div>
          <span className="font-semibold text-slate-700">Authorized Stamp & Signature</span>
        </div>
      </div>
    </div>
  );
};
