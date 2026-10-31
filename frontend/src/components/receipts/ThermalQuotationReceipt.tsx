import React from 'react';
import { Quotation, BusinessSettings } from '../../types';
import { formatCurrency, formatDateTime } from '../../utils/format';
import { generateBarcodeSvg } from '../../utils/barcode';

export interface ThermalQuotationReceiptProps {
  quotation: Quotation;
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

export const ThermalQuotationReceipt: React.FC<ThermalQuotationReceiptProps> = ({
  quotation,
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
  id = 'printable-thermal-quotation',
}) => {
  const currency = propCurrency || settings?.currency || 'Rs.';
  const shopName = businessName || settings?.business_name || 'My Local Business';
  const shopAddress = address || settings?.address || '';
  const shopPhone = phone || settings?.phone || '';
  const footerText =
    propFooterText ||
    settings?.quotation_terms ||
    '1. This quotation is an estimate and valid for 15 days from issue date.\n2. Stock is subject to physical availability upon confirmation.\n3. This document does not constitute a tax invoice until approved.';
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

  const status = (quotation.status || 'PENDING').toUpperCase();
  const statusLabel =
    status === 'APPROVED'
      ? 'APPROVED & CONVERTED'
      : status === 'SUPERSEDED'
      ? 'SUPERSEDED / REVISED'
      : status === 'REJECTED'
      ? 'DISAPPROVED'
      : 'ACTIVE QUOTATION';

  const items = quotation.items || [];
  const totalUnits = items.reduce((acc, it) => acc + Number(it.quantity || 0), 0);

  return (
    <div
      id={id}
      className={`bg-white text-black font-sans antialiased transition-all mx-auto print:m-0 print:p-0 print:w-full print:max-w-none ${
        is58mm ? 'w-[58mm] max-w-[58mm] text-[10.5px] p-2.5 shadow-sm' : 'w-[80mm] max-w-[80mm] text-xs p-3.5 sm:p-4 shadow-sm'
      }`}
      style={{
        boxSizing: 'border-box',
        lineHeight: '1.35',
        backgroundColor: '#ffffff',
        color: '#000000',
        fontWeight: 500,
        fontVariantNumeric: 'tabular-nums',
        overflow: 'visible',
      }}
    >
      {/* 1. Header & Store Info */}
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

        {/* Layout Subtitle */}
        {(() => {
          const rawSub = customHeader !== undefined ? customHeader : (settings?.receipt_header ?? '');
          const cleanSub = (rawSub || '').trim();
          const hasCustomSub = cleanSub && cleanSub.toLowerCase() !== shopName.trim().toLowerCase();

          if (activeLayout === 'elegant' && hasCustomSub) {
            const formattedSub = cleanSub.startsWith('~') ? cleanSub : `~ ${cleanSub} ~`;
            return <p className="text-[10px] italic text-slate-600 font-serif">{formattedSub}</p>;
          }
          if (activeLayout === 'modern' && hasCustomSub) {
            return (
              <span className="inline-block text-[9.5px] font-bold uppercase tracking-widest px-2 py-0.5 bg-black text-white rounded-xs">
                {cleanSub}
              </span>
            );
          }
          if (activeLayout === 'tabular' && hasCustomSub) {
            return <p className="text-[10px] font-bold text-slate-600">{cleanSub}</p>;
          }
          if (hasCustomSub && activeLayout !== 'compact') {
            return <p className="leading-tight text-black font-bold mt-1 italic break-words">{cleanSub}</p>;
          }
          return null;
        })()}

        {shopAddress && activeLayout !== 'compact' && (
          <p className="leading-tight text-black font-bold break-words">{shopAddress}</p>
        )}
        {shopPhone && activeLayout !== 'compact' && (
          <p className="leading-tight text-black font-bold">Phone: {shopPhone}</p>
        )}

        {/* Big Bold Quotation Title & Estimate Notice Banner */}
        <div className="pt-1.5 pb-0.5">
          <div className="border border-black font-black uppercase text-[11px] sm:text-xs py-0.5 px-1 bg-black text-white tracking-wider">
            COMMERCIAL QUOTATION
          </div>
          <div className="text-[9px] font-bold text-black uppercase tracking-wider mt-0.5">
            ESTIMATE ONLY • NOT A TAX INVOICE
          </div>
        </div>
      </div>

      {/* 2. Quotation Info & Customer Section */}
      <div className={`py-2 ${divBorder} space-y-0.5 text-[10.5px] receipt-section`}>
        {activeLayout === 'compact' ? (
          <>
            <div className="flex justify-between font-bold text-[10px]">
              <span>Quote #{quotation.quotation_number}</span>
              <span>{formatDateTime(quotation.created_at)}</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="truncate max-w-[60%]">{quotation.customer_name || 'Walk-in Customer'}</span>
              <span className="font-bold uppercase">[{statusLabel}]</span>
            </div>
          </>
        ) : activeLayout === 'elegant' ? (
          <div className="text-center space-y-0.5">
            <div className="font-bold">Quote Ref: <span className="font-black">{quotation.quotation_number}</span></div>
            <div className="text-[10px] text-slate-600">Issued: {formatDateTime(quotation.created_at)}</div>
            {quotation.valid_until && (
              <div className="text-[10px] text-slate-600">Valid Until: {formatDateTime(quotation.valid_until)}</div>
            )}
            <div className="text-[10px] font-semibold">Honored Client: {quotation.customer_name || 'Counter Walk-in'}</div>
            {quotation.customer_phone && (
              <div className="text-[10px] text-slate-600">Phone: {quotation.customer_phone}</div>
            )}
            <div className="text-[9.5px] font-bold uppercase tracking-wide">Status: {statusLabel}</div>
          </div>
        ) : activeLayout === 'modern' ? (
          <div className="space-y-1">
            <div className="flex justify-between font-black border-b border-black/20 pb-0.5">
              <span>Quote #{quotation.quotation_number}</span>
              <span>{formatDateTime(quotation.created_at)}</span>
            </div>
            {quotation.valid_until && (
              <div className="flex justify-between text-[10px]">
                <span className="font-bold">Valid Until:</span>
                <span className="font-black">{formatDateTime(quotation.valid_until)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-black font-bold">Client:</span>
              <span className="font-bold truncate max-w-[60%]">{quotation.customer_name || 'Counter Walk-in'}</span>
            </div>
            {quotation.customer_phone && (
              <div className="flex justify-between text-[10px]">
                <span className="text-black font-bold">Phone:</span>
                <span>{quotation.customer_phone}</span>
              </div>
            )}
            <div className="flex justify-between text-[10px]">
              <span className="text-black font-bold">Offer Status:</span>
              <span className="font-black uppercase px-1 bg-slate-100 border border-slate-300 rounded-xs">
                {statusLabel}
              </span>
            </div>
          </div>
        ) : activeLayout === 'tabular' ? (
          <div className="space-y-0.5">
            <div className="flex justify-between">
              <span className="font-bold">Quote: <span className="font-black">{quotation.quotation_number}</span></span>
              <span className="font-bold">{formatDateTime(quotation.created_at)}</span>
            </div>
            {quotation.valid_until && (
              <div className="flex justify-between text-[10px]">
                <span>Valid Until:</span>
                <span className="font-bold">{formatDateTime(quotation.valid_until)}</span>
              </div>
            )}
            <div className="flex justify-between text-[10px]">
              <span className="font-bold">Client: {quotation.customer_name || 'Walk-in'}</span>
              <span className="font-bold uppercase">Status: {statusLabel}</span>
            </div>
            {quotation.customer_phone && (
              <div className="text-[10px] text-slate-700">Phone: {quotation.customer_phone}</div>
            )}
          </div>
        ) : (
          /* classic */
          <>
            <div className="flex justify-between">
              <span className="text-black font-bold">Quote #:</span>
              <span className="font-black">{quotation.quotation_number}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-black font-bold">Date:</span>
              <span className="font-bold">{formatDateTime(quotation.created_at)}</span>
            </div>
            {quotation.valid_until && (
              <div className="flex justify-between text-[10px]">
                <span className="text-black font-bold">Valid Until:</span>
                <span className="font-bold">{formatDateTime(quotation.valid_until)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-black font-bold">Customer:</span>
              <span className="font-bold text-right truncate max-w-[65%]">{quotation.customer_name || 'Counter Walk-in'}</span>
            </div>
            {quotation.customer_phone && (
              <div className="flex justify-between text-[10px]">
                <span className="text-black font-bold">Phone:</span>
                <span>{quotation.customer_phone}</span>
              </div>
            )}
            <div className="flex justify-between text-[10px]">
              <span className="text-black font-bold">Status:</span>
              <span className="font-black uppercase">{statusLabel}</span>
            </div>
          </>
        )}
      </div>

      {/* 3. Items Section */}
      <div className={`py-2 ${divBorder} receipt-items receipt-section`}>
        {activeLayout === 'tabular' ? (
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
                {items.map((item, idx) => {
                  const qty = Number(item.quantity || 0);
                  const uPrice = Number(item.unit_price || 0);
                  const lineTotal = Number(item.total_price || 0);

                  return (
                    <React.Fragment key={idx}>
                      <tr className="align-top">
                        <td className="py-1 pr-1 font-bold text-black break-words leading-tight">
                          {item.product_name}
                        </td>
                        <td className="py-1 text-right tabular-nums font-semibold">{qty}</td>
                        <td className="py-1 text-right tabular-nums">{formatCurrency(uPrice, currency)}</td>
                        <td className="py-1 text-right tabular-nums font-bold">{formatCurrency(lineTotal, currency)}</td>
                      </tr>
                      {item.notes && (
                        <tr>
                          <td colSpan={4} className="text-[9px] text-slate-600 pl-1 pb-1 italic">
                            ↳ Note: {item.notes}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div>
            {/* Column Headers for Non-Tabular */}
            {activeLayout !== 'compact' && activeLayout !== 'elegant' && (
              <div className="flex justify-between text-[10.5px] font-black uppercase tracking-wider pb-1 mb-1.5 border-b border-black">
                <span>Description</span>
                <span>Amount</span>
              </div>
            )}

            <div className="space-y-2">
              {items.map((item, idx) => {
                const qty = Number(item.quantity || 0);
                const uPrice = Number(item.unit_price || 0);
                const discAmt = Number(item.discount_amount || 0);
                const lineTotal = Number(item.total_price || 0);

                return (
                  <div key={idx} className="receipt-item">
                    <div className="font-bold text-black break-words leading-tight">
                      {item.product_name}
                    </div>

                    {item.notes && (
                      <div className="text-[9.5px] text-slate-600 pl-1 italic">
                        {item.notes}
                      </div>
                    )}

                    <div className="flex justify-between items-baseline mt-0.5">
                      <span className="text-black font-bold">
                        {activeLayout === 'modern'
                          ? `${qty} pcs @ ${formatCurrency(uPrice, currency)}`
                          : `${qty} × ${formatCurrency(uPrice, currency)}`}
                      </span>
                      <span className="font-black tabular-nums text-black text-right ml-2 shrink-0">
                        {formatCurrency(lineTotal, currency)}
                      </span>
                    </div>

                    {discAmt > 0 && (
                      <div className="text-[10px] text-black font-bold pl-2 tabular-nums">
                        {activeLayout === 'modern' ? '↳ Line Disc:' : '  -> Disc:'} -{formatCurrency(discAmt, currency)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Item & Unit Count Line */}
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
            <span>{activeLayout === 'modern' ? 'Estimated Items / Units:' : activeLayout === 'elegant' ? 'Total Selections:' : 'Lines / Units:'}</span>
            <span className="tabular-nums">
              {items.length} lines / {totalUnits} pcs
            </span>
          </div>
        )}
      </div>

      {/* 4. Totals & Grand Estimate Section */}
      <div className={`py-2 ${divBorder} space-y-1 receipt-totals receipt-section`}>
        <div className="flex justify-between font-bold">
          <span>Subtotal:</span>
          <span className="tabular-nums font-semibold">{formatCurrency(quotation.subtotal, currency)}</span>
        </div>
        {Number(quotation.discount_amount || 0) > 0 && (
          <div className="flex justify-between font-bold">
            <span>{activeLayout === 'elegant' ? 'Courtesy Discount:' : 'Discount:'}</span>
            <span className="tabular-nums font-semibold">-{formatCurrency(quotation.discount_amount, currency)}</span>
          </div>
        )}
        {Number(quotation.tax_amount || 0) > 0 && (
          <div className="flex justify-between font-bold">
            <span>Tax ({quotation.tax_rate}%):</span>
            <span className="tabular-nums font-semibold">+{formatCurrency(quotation.tax_amount, currency)}</span>
          </div>
        )}

        {/* High-Impact Framed Total for Modern Layout */}
        {activeLayout === 'modern' ? (
          <div className="border-2 border-black border-solid p-2 rounded-xs my-2 text-center bg-white shadow-2xs">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-600">Estimated Total</div>
            <div className="text-base font-black tabular-nums tracking-tight text-black">{formatCurrency(quotation.total_amount, currency)}</div>
          </div>
        ) : activeLayout === 'compact' ? (
          <div className="text-center font-black text-sm my-1 py-1 border-y-2 border-black border-solid tabular-nums">
            &gt;&gt;&gt; ESTIMATE: {formatCurrency(quotation.total_amount, currency)} &lt;&lt;&lt;
          </div>
        ) : activeLayout === 'elegant' ? (
          <div className="border-y-2 border-black border-solid py-2 my-1 text-center">
            <div className="text-[9.5px] font-bold uppercase tracking-widest text-slate-500">Estimated Total Payable Upon Order</div>
            <div className="text-base font-black tabular-nums text-black">{formatCurrency(quotation.total_amount, currency)}</div>
          </div>
        ) : activeLayout === 'tabular' ? (
          <div className="flex justify-between font-black text-sm border-t-2 border-b-2 border-black border-solid py-1.5 my-1">
            <span>ESTIMATED TOTAL:</span>
            <span className="tabular-nums font-bold">{formatCurrency(quotation.total_amount, currency)}</span>
          </div>
        ) : (
          /* classic */
          <div className="flex justify-between font-black text-sm border-t-2 border-b-2 border-black border-solid py-1.5 my-1 tracking-tight">
            <span>ESTIMATED TOTAL:</span>
            <span className="tabular-nums font-bold">{formatCurrency(quotation.total_amount, currency)}</span>
          </div>
        )}

        <div className="text-[9.5px] font-bold text-center text-slate-700 italic pt-0.5">
          * Price quotation valid upon confirmation. No payment collected.
        </div>
      </div>

      {/* 5. Notes & Agreement Remarks (if present) */}
      {(quotation.notes || quotation.rejection_reason) && (
        <div className={`py-1.5 ${divBorder} text-[10px] space-y-1 receipt-section`}>
          {quotation.notes && (
            <div>
              <span className="font-bold">Remarks: </span>
              <span className="text-slate-800">{quotation.notes}</span>
            </div>
          )}
          {quotation.rejection_reason && (
            <div className="text-rose-900 font-medium">
              <span className="font-bold">Disapproval / Superseded Notice: </span>
              <span>{quotation.rejection_reason}</span>
            </div>
          )}
        </div>
      )}

      {/* 6. Code-128 Barcode for Quick Counter Lookup */}
      {showBarcode !== false && quotation.quotation_number && (
        <div className="py-2.5 flex flex-col items-center justify-center receipt-barcode receipt-section">
          <div
            dangerouslySetInnerHTML={{
              __html: generateBarcodeSvg(quotation.quotation_number, {
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

      {/* 7. Quotation Terms & Conditions Footer */}
      {footerText && footerText.trim() ? (
        <div className="text-center pt-2 receipt-footer receipt-section">
          <p className="font-bold text-[9.5px] uppercase tracking-wider text-slate-700 mb-1">
            Terms & Conditions
          </p>
          <div className="text-[9px] text-slate-700 font-medium whitespace-pre-line leading-relaxed text-left pl-1">
            {footerText}
          </div>
        </div>
      ) : null}

      {/* Paper Cutter Feed Spacing */}
      <div className="h-4 print:h-6" />
    </div>
  );
};
