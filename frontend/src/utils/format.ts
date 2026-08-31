export const formatMoney = (val: number | string | undefined | null): string => {
  if (val === undefined || val === null || val === '') return '0.00';
  const num = typeof val === 'number' ? val : parseFloat(String(val));
  return isNaN(num) ? '0.00' : num.toFixed(2);
};

export const formatCurrency = (
  val: number | string | undefined | null,
  currency = 'Rs.'
): string => {
  return `${currency} ${formatMoney(val)}`;
};

export const formatQty = (val: number | string | undefined | null): string => {
  if (val === undefined || val === null || val === '') return '0';
  const num = typeof val === 'number' ? val : parseFloat(String(val));
  return isNaN(num) ? '0' : String(num);
};
