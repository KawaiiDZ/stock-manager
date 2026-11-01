import { Sale, Quotation, BusinessSettings } from '../types';
import { formatCurrency, formatDateTime } from './format';

/**
 * Cleans and formats a phone number for WhatsApp deep-linking (international format without + or spaces).
 * Example: '0300-1234567' -> '923001234567'
 */
export function cleanWhatsAppPhone(phone: string | null | undefined, defaultCountryCode = '92'): string {
  if (!phone) return '';
  let cleaned = phone.replace(/[^\d+]/g, '').trim();

  // Strip leading '+'
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  }

  // Strip leading '00'
  if (cleaned.startsWith('00')) {
    cleaned = cleaned.substring(2);
  }

  // Handle local Pakistani numbers starting with '03...' (11 digits: 03001234567)
  if (cleaned.startsWith('0') && cleaned.length === 11) {
    cleaned = defaultCountryCode + cleaned.substring(1);
  } else if (cleaned.startsWith('0')) {
    cleaned = defaultCountryCode + cleaned.substring(1);
  } else if (cleaned.length === 10 && cleaned.startsWith('3')) {
    // 10 digits starting with 3 (e.g. 3001234567)
    cleaned = defaultCountryCode + cleaned;
  }

  return cleaned;
}

/**
 * Formats a Sale / Invoice into a clean, professional WhatsApp text message.
 */
export function formatSaleWhatsAppMessage(sale: Sale, settings: BusinessSettings | null): string {
  const currency = settings?.currency || 'Rs.';
  const bizName = settings?.business_name || 'Our Store';
  const phone = settings?.phone ? `📞 Contact: ${settings.phone}` : '';
  const address = settings?.address ? `📍 Address: ${settings.address}` : '';
  const dateStr = formatDateTime(sale.created_at, settings?.date_format);

  const lines: string[] = [];
  lines.push(`🧾 *RECEIPT / INVOICE*`);
  lines.push(`🏢 *${bizName}*`);
  if (phone) lines.push(phone);
  if (address) lines.push(address);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`*Receipt #:* ${sale.receipt_number}`);
  lines.push(`*Date:* ${dateStr}`);
  lines.push(`*Customer:* ${sale.customer_name || 'Walk-in Customer'}${sale.customer_phone ? ` (${sale.customer_phone})` : ''}`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`*ITEMS PURCHASED:*`);

  (sale.items || []).forEach((item, idx) => {
    const qty = Number(item.quantity || 1);
    const unitPrice = formatCurrency(item.unit_price, currency);
    const totalPrice = formatCurrency(item.total_price, currency);
    lines.push(`${idx + 1}. *${item.product_name}*`);
    lines.push(`   ${qty} x ${unitPrice} = ${totalPrice}`);
    if (item.notes && item.notes.trim() && item.notes.trim() !== item.product_name.trim()) {
      lines.push(`   _Note: ${item.notes.trim()}_`);
    }
  });

  lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`*Subtotal:* ${formatCurrency(sale.subtotal, currency)}`);

  if (Number(sale.discount_amount || 0) > 0) {
    lines.push(`*Discount:* -${formatCurrency(sale.discount_amount, currency)}`);
  }

  if (Number(sale.tax_amount || 0) > 0) {
    lines.push(`*Tax (${sale.tax_rate}%):* ${formatCurrency(sale.tax_amount, currency)}`);
  }

  lines.push(`*Total Amount:* ${formatCurrency(sale.total_amount, currency)}`);

  const paymentMethods = sale.payments && sale.payments.length > 0
    ? Array.from(new Set(sale.payments.map((p) => p.payment_method).filter(Boolean))).join(' + ')
    : 'Cash';

  lines.push(`*Paid Amount:* ${formatCurrency(sale.paid_amount, currency)} (${paymentMethods})`);

  const due = Number(sale.due_amount || 0);
  if (due > 0) {
    lines.push(`*Remaining Due Balance:* ${formatCurrency(due, currency)} ⚠️`);
  } else {
    lines.push(`*Payment Status:* Paid in Full ✅`);
  }

  if (sale.notes && sale.notes.trim()) {
    lines.push(`*Notes:* ${sale.notes.trim()}`);
  }

  lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
  const footer = settings?.receipt_footer || 'Thank you for your business!';
  lines.push(footer);

  return lines.join('\n');
}

/**
 * Formats a Quotation into a clean, professional WhatsApp text message.
 */
export function formatQuotationWhatsAppMessage(quotation: Quotation, settings: BusinessSettings | null): string {
  const currency = settings?.currency || 'Rs.';
  const bizName = settings?.business_name || 'Our Store';
  const phone = settings?.phone ? `📞 Contact: ${settings.phone}` : '';
  const address = settings?.address ? `📍 Address: ${settings.address}` : '';
  const dateStr = formatDateTime(quotation.created_at, settings?.date_format);

  const lines: string[] = [];
  lines.push(`📋 *PRICE QUOTATION / ESTIMATE*`);
  lines.push(`🏢 *${bizName}*`);
  if (phone) lines.push(phone);
  if (address) lines.push(address);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`*Quotation #:* ${quotation.quotation_number}`);
  lines.push(`*Date:* ${dateStr}`);
  lines.push(`*Customer:* ${quotation.customer_name}${quotation.customer_phone ? ` (${quotation.customer_phone})` : ''}`);
  if (quotation.customer_address) {
    lines.push(`*Customer Address:* ${quotation.customer_address}`);
  }
  lines.push(`*Status:* ${quotation.status}`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`*QUOTED ITEMS:*`);

  (quotation.items || []).forEach((item, idx) => {
    const qty = Number(item.quantity || 1);
    const unitPrice = formatCurrency(item.unit_price, currency);
    const totalPrice = formatCurrency(item.total_price, currency);
    lines.push(`${idx + 1}. *${item.product_name}*`);
    lines.push(`   ${qty} x ${unitPrice} = ${totalPrice}`);
    if (item.notes && item.notes.trim()) {
      lines.push(`   _Note: ${item.notes.trim()}_`);
    }
  });

  lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`*Subtotal:* ${formatCurrency(quotation.subtotal, currency)}`);

  if (Number(quotation.discount_amount || 0) > 0) {
    lines.push(`*Discount:* -${formatCurrency(quotation.discount_amount, currency)}`);
  }

  if (Number(quotation.tax_amount || 0) > 0) {
    lines.push(`*Tax (${quotation.tax_rate}%):* ${formatCurrency(quotation.tax_amount, currency)}`);
  }

  lines.push(`*Net Quoted Total:* ${formatCurrency(quotation.total_amount, currency)}`);

  if (quotation.valid_until) {
    const validStr = formatDateTime(quotation.valid_until, settings?.date_format);
    lines.push(`⏳ *Valid Until:* ${validStr}`);
  }

  if (quotation.notes && quotation.notes.trim()) {
    lines.push(`📝 *Notes:* ${quotation.notes.trim()}`);
  }

  lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
  const footer = settings?.receipt_footer || 'Thank you for considering our services. We look forward to working with you!';
  lines.push(footer);

  return lines.join('\n');
}

/**
 * Builds the appropriate WhatsApp link depending on the client preference.
 */
export function getWhatsAppShareUrl(
  phone: string,
  message: string,
  client: 'desktop' | 'web' | 'universal' = 'web'
): string {
  const cleanPhone = cleanWhatsAppPhone(phone);
  const encodedMsg = encodeURIComponent(message);

  if (client === 'desktop') {
    // Protocol scheme to open native WhatsApp Desktop application on Windows / Mac
    return `whatsapp://send?phone=${cleanPhone}&text=${encodedMsg}`;
  }

  if (client === 'web') {
    // Direct WhatsApp Web interface in browser
    return `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodedMsg}`;
  }

  // Universal wa.me redirect gateway
  return `https://wa.me/${cleanPhone}?text=${encodedMsg}`;
}

/**
 * Dispatches the WhatsApp chat to the requested client (Desktop app or Web).
 */
export function openWhatsAppChat(
  phone: string,
  message: string,
  client: 'desktop' | 'web' = 'desktop'
): void {
  const url = getWhatsAppShareUrl(phone, message, client);

  if (client === 'desktop') {
    // Trigger desktop protocol scheme
    const link = document.createElement('a');
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } else {
    // Open WhatsApp Web in a new tab
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

/**
 * Automatically prefers Desktop WhatsApp and falls back to WhatsApp Web if Desktop is not installed/handled.
 */
export function openWhatsAppSmart(phone: string, message: string): void {
  const cleanPhone = cleanWhatsAppPhone(phone);
  const encodedMsg = encodeURIComponent(message);
  const desktopUrl = `whatsapp://send?phone=${cleanPhone}&text=${encodedMsg}`;
  const webUrl = `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodedMsg}`;

  let appOpened = false;
  const handleBlur = () => {
    appOpened = true;
    window.removeEventListener('blur', handleBlur);
  };
  window.addEventListener('blur', handleBlur);

  // 1. Attempt desktop protocol launch
  const link = document.createElement('a');
  link.href = desktopUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // 2. Fallback to WhatsApp Web if window never blurred within 1.8s
  setTimeout(() => {
    window.removeEventListener('blur', handleBlur);
    if (!appOpened && document.hasFocus()) {
      window.open(webUrl, '_blank', 'noopener,noreferrer');
    }
  }, 1800);
}
