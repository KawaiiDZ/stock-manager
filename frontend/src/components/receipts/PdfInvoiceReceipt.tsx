import React from 'react';
import { Sale, BusinessSettings } from '../../types';
import { formatCurrency, formatDateTime } from '../../utils/format';
import { CheckCircle2, AlertCircle, Clock, RotateCcw } from 'lucide-react';

export interface PdfInvoiceReceiptProps {
  id?: string;
  sale: Sale;
  settings?: BusinessSettings | null;
  businessName?: string;
  phone?: string;
  address?: string;
  currency?: string;
  headerText?: string;
  footerText?: string;
  documentTitle?: string;
}

export const PdfInvoiceReceipt: React.FC<PdfInvoiceReceiptProps> = ({
  id = 'printable-pdf-invoice',
  sale,
  settings,
  businessName,
  phone,
  address,
  currency: propCurrency,
  headerText,
  footerText: propFooterText,
  documentTitle,
}) => {
  const currency = propCurrency || settings?.currency || 'Rs.';
  const shopName = businessName || settings?.business_name || 'My Business';
  const shopAddress = address || settings?.address || '';
  const shopPhone = phone || settings?.phone || '';
  const footerText = propFooterText || settings?.invoice_terms || settings?.receipt_footer || 'Thank you for your business!';
  const customHeader = headerText || settings?.receipt_header;
  const invoiceTitle = documentTitle || settings?.invoice_title || 'TAX INVOICE';

  const hasLetterhead = Boolean(settings?.show_letterhead && settings?.receipt_letterhead_path);
  const hideHeaderText = Boolean(hasLetterhead && settings?.hide_header_text_with_letterhead);

  const returnedVal = Number(sale.total_returned_amount || 0);
  const hasReturns = returnedVal > 0;
  const netBillableTotal = Math.max(0, Number(sale.total_amount || 0) - returnedVal);
  const dueAmount = Number(sale.due_amount || 0);

  const getStatusBadge = () => {
    const status = (sale.payment_status || 'PAID').toUpperCase();

    if (status === 'RETURNED') {
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300">
          <RotateCcw className="h-3.5 w-3.5 text-slate-600" />
          FULLY RETURNED
        </span>
      );
    }

    if (status === 'PARTIALLY_RETURNED') {
      if (dueAmount <= 0) {
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-300">
            <RotateCcw className="h-3.5 w-3.5 text-purple-600" />
            PARTIALLY RETURNED (SETTLED)
          </span>
        );
      }
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
          <RotateCcw className="h-3.5 w-3.5 text-amber-600" />
          PARTIALLY RETURNED (DUE)
        </span>
      );
    }

    if (status === 'PAID') {
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          PAID IN FULL
        </span>
      );
    }

    if (status === 'PARTIALLY_PAID' || (dueAmount > 0 && Number(sale.paid_amount || 0) > 0)) {
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
          <Clock className="h-3.5 w-3.5 text-amber-600" />
          PARTIALLY PAID
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">
        <AlertCircle className="h-3.5 w-3.5 text-rose-600" />
        PAYMENT DUE
      </span>
    );
  };

  return (
    <div
      id={id}
      className="bg-white text-slate-800 font-sans text-xs p-8 max-w-[210mm] min-w-[190mm] min-h-[285mm] h-auto mx-auto shadow-sm border border-slate-200 rounded-lg print:border-none print:shadow-none print:p-0 print:m-0 print:max-w-none flex flex-col justify-between"
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

      {/* 2. Top Header & Meta (unless suppressed by pre-printed letterhead) */}
      {!hideHeaderText && (
        <div className="flex justify-between items-start pb-6 border-b border-slate-200 print-avoid-break">
          {/* Company details & logo */}
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

          {/* Invoice / Receipt Meta */}
          <div className="text-right space-y-1.5">
            <div className="text-2xl font-black text-slate-900 tracking-tight uppercase">
              {invoiceTitle}
            </div>
            <div className="text-slate-600 font-medium">
              Invoice #: <span className="font-bold text-slate-900">{sale.receipt_number}</span>
            </div>
            <div className="text-slate-600">
              Date: <span className="font-semibold text-slate-900">{formatDateTime(sale.created_at)}</span>
            </div>
            <div className="pt-1">{getStatusBadge()}</div>
          </div>
        </div>
      )}

      {/* If header text is suppressed, still show the Invoice metadata */}
      {hideHeaderText && (
        <div className="flex justify-between items-center pb-4 mb-4 border-b border-slate-200 print-avoid-break">
          <div>
            <span className="text-lg font-bold text-slate-900 uppercase">{invoiceTitle}</span>
          </div>
          <div className="text-right flex items-center gap-4">
            <span className="text-slate-600 font-medium">
              Invoice #: <span className="font-bold text-slate-900">{sale.receipt_number}</span>
            </span>
            <span className="text-slate-600">
              Date: <span className="font-semibold text-slate-900">{formatDateTime(sale.created_at)}</span>
            </span>
            {getStatusBadge()}
          </div>
        </div>
      )}

      {/* 3. Customer Bill-To Info */}
      <div className="my-5 p-4 bg-slate-50 border border-slate-200/80 rounded-lg flex justify-between items-start print-avoid-break">
        <div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
            Billed To
          </span>
          <p className="text-sm font-bold text-slate-900">{sale.customer_name || 'Walk-in Customer'}</p>
          {(sale.customer_phone || (sale as any).customer?.phone) && (
            <p className="text-slate-600 mt-0.5">Phone: {sale.customer_phone || (sale as any).customer?.phone}</p>
          )}
          {(sale.customer_address || (sale as any).customer?.address) && (
            <p className="text-slate-600 mt-0.5 leading-tight">Address: {sale.customer_address || (sale as any).customer?.address}</p>
          )}
        </div>
        <div className="text-right">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
            Payment Mode
          </span>
          <span className="inline-block px-2.5 py-0.5 bg-white border border-slate-200 text-slate-800 rounded font-semibold text-xs">
            {sale.payments && sale.payments.length > 1
              ? sale.payments.map((p) => p.payment_method).join(' + ') + ' (Split)'
              : sale.payments?.[0]?.payment_method || (sale as any).payment_method || 'Cash'}
          </span>
        </div>
      </div>

      {/* 4. Itemized Line Items Table */}
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
            {sale.items?.map((item, index) => {
              const origQty = Number(item.quantity || 0);
              const retQty = Number(item.returned_quantity || 0);
              const isFullyReturned = retQty >= origQty && origQty > 0;
              const isPartiallyReturned = retQty > 0 && retQty < origQty;
              const remainingQty = isFullyReturned ? 0 : Math.max(0, origQty - retQty);
              const netLineTotal = isFullyReturned
                ? 0
                : (remainingQty * Number(item.unit_price || 0)) - (Number(item.discount_amount || 0) * (remainingQty / (origQty || 1)));

              return (
                <tr
                  key={index}
                  className={`print-avoid-break transition-colors ${
                    isFullyReturned ? 'bg-slate-50/70 text-slate-400' : 'text-slate-800'
                  }`}
                >
                  <td className="py-2.5 px-3 text-left text-slate-400 font-medium">{index + 1}</td>
                  <td className="py-2.5 px-3 text-left">
                    <div className="font-semibold text-slate-900 flex items-center gap-1.5 flex-wrap">
                      <span className={isFullyReturned ? 'line-through text-slate-400' : ''}>
                        {item.product_name}
                      </span>
                      {isFullyReturned && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 border border-rose-200 uppercase tracking-tight">
                          Returned
                        </span>
                      )}
                      {isPartiallyReturned && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 uppercase tracking-tight">
                          {retQty} Ret / {remainingQty} Kept
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-right font-medium whitespace-nowrap">
                    {isFullyReturned ? (
                      <span>
                        <span className="line-through text-slate-400 mr-1">{origQty}</span>
                        <span className="font-bold text-rose-600">0</span>
                      </span>
                    ) : isPartiallyReturned ? (
                      <span>
                        <span className="text-slate-400 mr-1 text-[11px]">({origQty})</span>
                        <span className="font-bold text-slate-900">{remainingQty}</span>
                      </span>
                    ) : (
                      origQty
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right whitespace-nowrap">{formatCurrency(item.unit_price, currency)}</td>
                  <td className="py-2.5 px-3 text-right text-slate-500 whitespace-nowrap">
                    {Number(item.discount_amount || 0) > 0
                      ? `-${formatCurrency(item.discount_amount, currency)}`
                      : '-'}
                  </td>
                  <td className="py-2.5 px-3 text-right font-bold whitespace-nowrap">
                    {isFullyReturned ? (
                      <span>
                        <span className="line-through text-slate-400 mr-1 text-[11px]">
                          {formatCurrency(item.total_price, currency)}
                        </span>
                        <span className="text-slate-400 font-semibold">{formatCurrency(0, currency)}</span>
                      </span>
                    ) : isPartiallyReturned ? (
                      <span>
                        <span className="line-through text-slate-400 mr-1 text-[11px]">
                          {formatCurrency(item.total_price, currency)}
                        </span>
                        <span className="text-slate-900">{formatCurrency(netLineTotal, currency)}</span>
                      </span>
                    ) : (
                      <span className="text-slate-900">{formatCurrency(item.total_price, currency)}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 5. Financial Totals Summary & Notes */}
      <div className="flex justify-between items-start pt-4 border-t border-slate-200 gap-8 print-avoid-break">
        {/* Left Side: Notes & Terms */}
        <div className="max-w-[50%] space-y-2">
          {sale.notes && (
            <div className="p-3 bg-amber-50/60 border border-amber-200/60 rounded-md">
              <span className="font-semibold text-amber-900 block mb-0.5">Sale Note:</span>
              <p className="text-amber-800 leading-snug">{sale.notes}</p>
            </div>
          )}
          <div className="text-slate-500 leading-relaxed text-[11px] whitespace-pre-line">
            <p className="font-semibold text-slate-700 mb-0.5">Terms & Conditions:</p>
            <p>{footerText}</p>
          </div>
        </div>

        {/* Right Side: Totals Summary Box */}
        <div className="w-80 bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-2">
          <div className="flex justify-between text-slate-600">
            <span>Subtotal:</span>
            <span className="font-medium text-slate-900 whitespace-nowrap">{formatCurrency(sale.subtotal, currency)}</span>
          </div>

          {Number(sale.discount_amount || 0) > 0 && (
            <div className="flex justify-between text-emerald-700">
              <span>Discount:</span>
              <span className="font-medium whitespace-nowrap">-{formatCurrency(sale.discount_amount, currency)}</span>
            </div>
          )}

          {Number(sale.tax_amount || 0) > 0 && (
            <div className="flex justify-between text-slate-600">
              <span>Tax ({sale.tax_rate}%):</span>
              <span className="font-medium text-slate-900 whitespace-nowrap">+{formatCurrency(sale.tax_amount, currency)}</span>
            </div>
          )}

          <div className="flex justify-between font-black text-sm text-slate-900 pt-2 border-t border-slate-200">
            <span>Original Total:</span>
            <span className="whitespace-nowrap">{formatCurrency(sale.total_amount, currency)}</span>
          </div>

          {hasReturns && (
            <>
              <div className="flex justify-between text-rose-700 font-semibold text-xs">
                <span>Less Returned Goods:</span>
                <span className="whitespace-nowrap">-{formatCurrency(returnedVal, currency)}</span>
              </div>
              <div className="flex justify-between font-black text-sm text-emerald-800 pt-1.5 border-t border-dashed border-slate-300">
                <span>Net Billable Total:</span>
                <span className="whitespace-nowrap">{formatCurrency(netBillableTotal, currency)}</span>
              </div>
            </>
          )}

          <div className="flex justify-between text-slate-700 pt-1 border-t border-slate-200/60 font-medium">
            <span>Paid Amount:</span>
            <span className="whitespace-nowrap">{formatCurrency(sale.paid_amount, currency)}</span>
          </div>

          {sale.payments && sale.payments.length > 1 && (
            <div className="pt-1 pb-1 space-y-0.5 text-[11px] text-slate-600 border-t border-dashed border-slate-200">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Split Breakdown:</span>
              {sale.payments.map((p, idx) => (
                <div key={idx} className="flex justify-between pl-1">
                  <span>• {p.payment_method}:</span>
                  <span className="font-semibold">{formatCurrency(p.amount, currency)}</span>
                </div>
              ))}
            </div>
          )}

          {dueAmount > 0 ? (
            <div className="flex justify-between font-bold text-rose-700 pt-1 border-t border-rose-200">
              <span>Balance Due:</span>
              <span className="whitespace-nowrap">{formatCurrency(dueAmount, currency)}</span>
            </div>
          ) : (
            <div className="flex justify-between text-emerald-700 font-semibold pt-1 border-t border-emerald-200 text-[11px]">
              <span>Balance:</span>
              <span className="whitespace-nowrap">
                {(sale.payment_status || '').toUpperCase() === 'RETURNED'
                  ? 'Rs. 0.00 (Fully Returned & Settled)'
                  : 'Rs. 0.00 (Cleared)'}
              </span>
            </div>
          )}
        </div>
      </div>
      </div>

      {/* 6. Signature & Verification Section */}
      <div className="pdf-footer-stamp mt-auto pt-6 border-t border-slate-200 flex justify-between items-end text-center text-slate-500 text-[11px] print-avoid-break">
        <div className="w-48">
          <div className="border-b border-dashed border-slate-400 pb-1 mb-1"></div>
          <span>Customer Signature</span>
        </div>
        <div className="w-56">
          <div className="border-b border-dashed border-slate-400 pb-1 mb-1"></div>
          <span className="font-semibold text-slate-700">Authorized Stamp & Signature</span>
        </div>
      </div>
    </div>
  );
};
