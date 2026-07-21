const currencyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

export function formatCurrency(amount: number): string {
  return currencyFmt.format(amount);
}

