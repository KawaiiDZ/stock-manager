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
  layout?: 'classic' | 'modern' | 'tabular' | 'compact' | 'elegant';
  showBarcode?: boolean;
  id?: string;
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
  layout: propLayout,
  showBarcode = true,
  id = 'printable-thermal-receipt',
}) => {
  const currency = propCurrency || settings?.currency || 'Rs.';
  const shopName = businessName || settings?.business_name || 'My Local Business';
  const shopAddress = address || settings?.address || '';
  const shopPhone = phone || settings?.phone || '';
  const footerText = propFooterText || settings?.receipt_footer || 'Thank you for your business!';
  const customHeader = headerText || settings?.receipt_header;
  const headerStyle = propHeaderStyle || settings?.thermal_header_style || 'logo_text';
  const activeLayout = (propLayout || settings?.thermal_layout || 'classic') as
    | 'classic'
    | 'modern'
    | 'tabular'
    | 'compact'
    | 'elegant';

  const is58mm = (paperWidth || printerType) === '58mm';
  const divBorder =
    activeLayout === 'compact'
      ? 'border-b border-black border-solid'
      : 'border-b-2 border-black border-solid';

  return (
    <div
      id={id}
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
      <div className={`text-center pb-2 ${divBorder} space-y-1 receipt-header receipt-section`}>
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

        {activeLayout === 'elegant' && (
          <div className="w-16 mx-auto border-b border-black border-solid pb-0.5 mb-1" />
        )}

        <h2
          className={`${
            activeLayout === 'compact'
              ? 'text-xs font-black'
              : is58mm
              ? 'text-sm font-black'
              : 'text-base font-black'
          } tracking-wider ${
            activeLayout === 'modern' ? 'uppercase font-black' : ''
          } leading-snug break-words text-black`}
        >
          {activeLayout === 'modern' ? shopName.toUpperCase() : shopName}
        </h2>

        {activeLayout === 'elegant' && (
          <p className="text-[10px] italic text-slate-600 font-serif">~ Boutique Guest Receipt ~</p>
        )}
        {activeLayout === 'modern' && (
          <span className="inline-block text-[9.5px] font-bold uppercase tracking-widest px-2 py-0.5 bg-black text-white rounded-xs">
            Official Retail Receipt
          </span>
        )}
        {activeLayout === 'tabular' && (
          <p className="text-[10px] font-bold text-slate-600">Tax / Retail Sale Voucher</p>
        )}

        {shopAddress && activeLayout !== 'compact' && (
          <p className="leading-tight text-black font-bold break-words">{shopAddress}</p>
        )}
        {shopPhone && activeLayout !== 'compact' && (
          <p className="leading-tight text-black font-bold">Phone: {shopPhone}</p>
        )}
        {customHeader &&
          customHeader.trim().toLowerCase() !== shopName.trim().toLowerCase() &&
          activeLayout !== 'compact' && (
            <p className="leading-tight text-black font-bold mt-1 italic break-words">{customHeader}</p>
          )}
      </div>

      {/* Sale Info */}
      <div className={`py-2 ${divBorder} space-y-0.5 text-[10.5px] receipt-section`}>
        {activeLayout === 'compact' ? (
          <div className="flex justify-between font-bold text-[10px]">
            <span>#{sale.receipt_number}</span>
            <span>{formatDateTime(sale.created_at)}</span>
            <span className="truncate max-w-[35%]">{sale.customer_name || 'Walk-in'}</span>
          </div>
        ) : activeLayout === 'elegant' ? (
          <div className="text-center space-y-0.5">
            <div className="font-bold">Order Ref: <span className="font-black">{sale.receipt_number}</span></div>
            <div className="text-[10px] text-slate-600">{formatDateTime(sale.created_at)}</div>
            <div className="text-[10px] font-semibold">Honored Guest: {sale.customer_name || 'Counter Walk-in'}</div>
          </div>
        ) : activeLayout === 'modern' ? (
          <div className="space-y-1">
            <div className="flex justify-between font-black border-b border-black/20 pb-0.5">
              <span>#{sale.receipt_number}</span>
              <span>{formatDateTime(sale.created_at)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-black font-bold">Customer:</span>
              <span className="font-bold truncate max-w-[60%]">{sale.customer_name || 'Counter Walk-in'}</span>
            </div>
            {(sale.payments?.[0]?.payment_method || (sale as any).payment_method) && (
              <div className="flex justify-between text-[10px]">
                <span className="text-black font-bold">Tender Method:</span>
                <span className="font-black uppercase px-1 bg-slate-100 border border-slate-300 rounded-xs">
                  {sale.payments?.[0]?.payment_method || (sale as any).payment_method}
                </span>
              </div>
            )}
          </div>
        ) : activeLayout === 'tabular' ? (
          <div className="space-y-0.5">
            <div className="flex justify-between">
              <span className="font-bold">Voucher: <span className="font-black">{sale.receipt_number}</span></span>
              <span className="font-bold">{formatDateTime(sale.created_at)}</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="font-bold">Client: {sale.customer_name || 'Walk-in'}</span>
              <span className="font-bold uppercase">Pay: {sale.payments?.[0]?.payment_method || (sale as any).payment_method || 'CASH'}</span>
            </div>
          </div>
        ) : (
          /* classic */
          <>
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
          </>
        )}
      </div>

      {/* Items Section */}
      <div className={`py-2 ${divBorder} receipt-items receipt-section`}>
        {activeLayout === 'tabular' ? (
          /* Tabular Multi-Column Table */
          <div className="w-full">
            <table className="w-full text-[10px] border-collapse">
              <thead>
                <tr className="border-b-2 border-black font-black uppercase">
                  <th className="text-left pb-1">ITEM</th>
                  <th className="text-right pb-1 w-8">QTY</th>
                  <th className="text-right pb-1 w-14">PRICE</th>
                  <th className="text-right pb-1 w-16">TOTAL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {sale.items?.map((item, idx) => {
                  const origQty = Number(item.quantity || 0);
                  const retQty = Number(item.returned_quantity || 0);
                  const isFullyReturned = retQty >= origQty && origQty > 0;
                  const isPartiallyReturned = retQty > 0 && retQty < origQty;
                  const remQty = isFullyReturned ? 0 : Math.max(0, origQty - retQty);
                  const lineTotal = isFullyReturned
                    ? 0
                    : isPartiallyReturned
                    ? remQty * Number(item.unit_price || 0) - Number(item.discount_amount || 0)
                    : Number(item.total_price || 0);

                  return (
                    <React.Fragment key={idx}>
                      <tr className={`align-top ${isFullyReturned ? 'line-through text-slate-400' : ''}`}>
                        <td className="py-1 pr-1 font-bold text-black break-words leading-tight">
                          {item.product_name}
                          {isFullyReturned && ' [RET]'}
                          {isPartiallyReturned && ` [${retQty}R]`}
                        </td>
                        <td className="py-1 text-right font-mono font-bold whitespace-nowrap">
                          {isPartiallyReturned ? remQty : origQty}
                        </td>
                        <td className="py-1 text-right font-mono whitespace-nowrap">
                          {formatCurrency(item.unit_price, currency)}
                        </td>
                        <td className="py-1 text-right font-mono font-black whitespace-nowrap">
                          {formatCurrency(lineTotal, currency)}
                        </td>
                      </tr>
                      {Number(item.discount_amount || 0) > 0 && !isFullyReturned && (
                        <tr>
                          <td colSpan={4} className="pb-1 text-[9px] text-slate-500 font-mono italic">
                            (Disc: -{formatCurrency(item.discount_amount, currency)})
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : activeLayout === 'compact' ? (
          /* Compact Express Single-Line Items */
          <div className="space-y-1">
            {sale.items?.map((item, idx) => {
              const origQty = Number(item.quantity || 0);
              const retQty = Number(item.returned_quantity || 0);
              const isFullyReturned = retQty >= origQty && origQty > 0;
              const isPartiallyReturned = retQty > 0 && retQty < origQty;
              const remQty = isFullyReturned ? 0 : Math.max(0, origQty - retQty);
              const lineTotal = isFullyReturned
                ? 0
                : isPartiallyReturned
                ? remQty * Number(item.unit_price || 0) - Number(item.discount_amount || 0)
                : Number(item.total_price || 0);

              return (
                <div key={idx} className="flex justify-between items-baseline text-[10.5px]">
                  <span className="font-bold truncate max-w-[68%]">
                    {item.product_name} <span className="font-mono text-[9.5px]">({isPartiallyReturned ? remQty : origQty}x)</span>
                  </span>
                  <span className="font-black font-mono">
                    {formatCurrency(lineTotal, currency)}
                  </span>
                </div>
              );
            })}
          </div>
        ) : activeLayout === 'elegant' ? (
          /* Elegant Boutique Dot-Leader Items */
          <div className="space-y-2">
            {sale.items?.map((item, idx) => {
              const origQty = Number(item.quantity || 0);
              const retQty = Number(item.returned_quantity || 0);
              const isFullyReturned = retQty >= origQty && origQty > 0;
              const isPartiallyReturned = retQty > 0 && retQty < origQty;
              const remQty = isFullyReturned ? 0 : Math.max(0, origQty - retQty);
              const lineTotal = isFullyReturned
                ? 0
                : isPartiallyReturned
                ? remQty * Number(item.unit_price || 0) - Number(item.discount_amount || 0)
                : Number(item.total_price || 0);

              return (
                <div key={idx} className="space-y-0.5">
                  <div className="font-bold text-black text-left">{item.product_name}</div>
                  <div className="flex items-center text-[10px]">
                    <span className="shrink-0 text-slate-700">
                      {isPartiallyReturned ? remQty : origQty} × {formatCurrency(item.unit_price, currency)}
                    </span>
                    <span className="flex-1 mx-1.5 border-b border-solid border-black/40 h-1"></span>
                    <span className="shrink-0 font-black font-mono">{formatCurrency(lineTotal, currency)}</span>
                  </div>
                  {Number(item.discount_amount || 0) > 0 && !isFullyReturned && (
                    <div className="text-[9.5px] italic text-slate-500 pl-2">
                      * Courtesy Savings: -{formatCurrency(item.discount_amount, currency)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* classic and modern */
          <div>
            <div className={`flex justify-between font-black border-b-2 border-black border-solid ${activeLayout === 'modern' ? 'uppercase' : ''} pb-1 mb-1.5 text-[10.5px] tracking-wide`}>
              <span>{activeLayout === 'modern' ? 'ITEM / DESCRIPTION' : 'Description'}</span>
              <span className="text-right">{activeLayout === 'modern' ? 'TOTAL' : 'Amount'}</span>
            </div>
            <div className="space-y-2">
              {sale.items?.map((item, idx) => {
                const origQty = Number(item.quantity || 0);
                const retQty = Number(item.returned_quantity || 0);
                const isFullyReturned = retQty >= origQty && origQty > 0;
                const isPartiallyReturned = retQty > 0 && retQty < origQty;
                const remQty = isFullyReturned ? 0 : Math.max(0, origQty - retQty);
                const lineTotal = isFullyReturned
                  ? 0
                  : isPartiallyReturned
                  ? remQty * Number(item.unit_price || 0) - Number(item.discount_amount || 0)
                  : Number(item.total_price || 0);

                return (
                  <div key={idx} className={`leading-snug sale-item ${isFullyReturned ? 'line-through text-black' : ''}`}>
                    <div className={`font-bold text-black break-words ${activeLayout === 'modern' ? 'uppercase font-black' : ''}`}>
                      {item.product_name}
                      {isFullyReturned && ' (RETURNED)'}
                      {isPartiallyReturned && ` (${retQty} RET)`}
                    </div>

                    <div className="flex justify-between items-baseline mt-0.5">
                      <span className="text-black font-bold">
                        {isFullyReturned
                          ? `0 (${origQty} ret) × ${formatCurrency(item.unit_price, currency)}`
                          : isPartiallyReturned
                          ? `${remQty} kept (${origQty} orig) × ${formatCurrency(item.unit_price, currency)}`
                          : activeLayout === 'modern'
                          ? `${origQty} pcs @ ${formatCurrency(item.unit_price, currency)}`
                          : `${origQty} × ${formatCurrency(item.unit_price, currency)}`}
                      </span>
                      <span className="font-black font-mono text-black text-right ml-2 shrink-0">
                        {formatCurrency(lineTotal, currency)}
                      </span>
                    </div>

                    {Number(item.discount_amount || 0) > 0 && !isFullyReturned && (
                      <div className="text-[10px] text-black font-bold pl-2 font-mono">
                        {activeLayout === 'modern' ? '↳ Promo Disc:' : '  -> Disc:'} -{formatCurrency(item.discount_amount, currency)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Item count line */}
        {activeLayout !== 'compact' && (
          <div
            className={`flex justify-between text-[10.5px] text-black font-bold pt-1.5 mt-2 ${
              activeLayout === 'modern'
                ? 'border-t-2 border-black border-solid'
                : activeLayout === 'elegant'
                ? 'border-t border-black border-solid'
                : 'border-t-2 border-b-2 border-black border-solid py-1'
            }`}
          >
            <span>{activeLayout === 'modern' ? 'Items / Units:' : activeLayout === 'elegant' ? 'Total Selections:' : 'Lines / Units:'}</span>
            <span className="font-mono">
              {sale.items?.length || 0} lines / {(sale.items || []).reduce((acc, it) => acc + Number(it.quantity || 0), 0)} pcs
            </span>
          </div>
        )}
      </div>

      {/* Totals Section */}
      <div className={`py-2 ${divBorder} space-y-1 receipt-totals receipt-section`}>
        <div className="flex justify-between font-bold">
          <span>Subtotal:</span>
          <span className="font-mono">{formatCurrency(sale.subtotal, currency)}</span>
        </div>
        {Number(sale.discount_amount || 0) > 0 && (
          <div className="flex justify-between font-bold">
            <span>{activeLayout === 'elegant' ? 'Courtesy Discount:' : 'Order Discount:'}</span>
            <span className="font-mono">-{formatCurrency(sale.discount_amount, currency)}</span>
          </div>
        )}
        {Number(sale.tax_amount || 0) > 0 && (
          <div className="flex justify-between font-bold">
            <span>Tax ({sale.tax_rate}%):</span>
            <span className="font-mono">+{formatCurrency(sale.tax_amount, currency)}</span>
          </div>
        )}

        {/* High-Impact Framed Total for Modern Layout */}
        {activeLayout === 'modern' ? (
          <div className="border-2 border-black border-solid p-2 rounded-xs my-2 text-center bg-white shadow-2xs">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-600">Total Due</div>
            <div className="text-base font-black font-mono tracking-tight text-black">{formatCurrency(sale.total_amount, currency)}</div>
          </div>
        ) : activeLayout === 'compact' ? (
          <div className="text-center font-black text-sm my-1 py-1 border-y-2 border-black border-solid font-mono">
            &gt;&gt;&gt; TOTAL: {formatCurrency(sale.total_amount, currency)} &lt;&lt;&lt;
          </div>
        ) : activeLayout === 'elegant' ? (
          <div className="border-y-2 border-black border-solid py-2 my-1 text-center">
            <div className="text-[9.5px] font-bold uppercase tracking-widest text-slate-500">Net Amount Payable</div>
            <div className="text-base font-black font-mono text-black">{formatCurrency(sale.total_amount, currency)}</div>
          </div>
        ) : activeLayout === 'tabular' ? (
          <div className="flex justify-between font-black text-sm border-t-2 border-b-2 border-black border-solid py-1.5 my-1">
            <span>TOTAL AMOUNT:</span>
            <span className="font-mono">{formatCurrency(sale.total_amount, currency)}</span>
          </div>
        ) : (
          /* classic */
          <div className="flex justify-between font-black text-sm border-t-2 border-b-2 border-black border-solid py-1.5 my-1 tracking-tight">
            <span>TOTAL:</span>
            <span className="font-mono">{formatCurrency(sale.total_amount, currency)}</span>
          </div>
        )}

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
      <div className={`py-2 ${divBorder} space-y-1 receipt-section`}>
        <div className="flex justify-between font-bold">
          <span>{activeLayout === 'modern' ? 'Paid:' : activeLayout === 'elegant' ? 'Tendered via ' + (sale.payments?.[0]?.payment_method || 'Cash') + ':' : 'Paid Amount:'}</span>
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
                height: activeLayout === 'compact' ? 26 : is58mm ? 32 : 40,
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
        {activeLayout === 'elegant' && (
          <p className="text-[10px] italic text-slate-500 mt-1 font-serif">
            "Thank you for visiting us! We look forward to seeing you again."
          </p>
        )}
      </div>

      {/* Paper Cutter Feed Spacing */}
      <div className="h-4 print:h-6" />
    </div>
  );
};

