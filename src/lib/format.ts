export function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export function formatPhone(phone: string): string {
  return phone.replace(/(\d{4})(\d{4})/, '$1-$2');
}
