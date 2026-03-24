import { CartItem } from './types';
import { formatCurrency } from './format';

const WHATSAPP_PHONE = '50766712588';

export function buildWhatsAppOrderMessage(params: {
  orderNumber: number;
  customerName: string;
  customerPhone: string;
  eventDate: string;
  eventTime: string;
  eventAddress: string;
  items: CartItem[];
  subtotal: number;
  surcharge: number;
  total: number;
  paymentMethod: string;
}): string {
  const itemLines = params.items
    .map((item) => `  • ${item.name} x${item.quantity} — ${formatCurrency(item.unitPrice * item.quantity)}`)
    .join('\n');

  const paymentLabel = params.paymentMethod === 'bank_transfer'
    ? 'Transferencia Bancaria'
    : 'Tarjeta de Crédito (+5%)';

  return [
    `🎉 *Nuevo Pedido #${params.orderNumber}*`,
    '',
    `*Cliente:* ${params.customerName}`,
    `*Teléfono:* ${params.customerPhone}`,
    `*Fecha:* ${params.eventDate}`,
    `*Hora:* ${params.eventTime}`,
    `*Dirección:* ${params.eventAddress}`,
    '',
    `*Artículos:*`,
    itemLines,
    '',
    `*Subtotal:* ${formatCurrency(params.subtotal)}`,
    params.surcharge > 0 ? `*Recargo (5%):* ${formatCurrency(params.surcharge)}` : '',
    `*Total:* ${formatCurrency(params.total)}`,
    `*Método de Pago:* ${paymentLabel}`,
  ].filter(Boolean).join('\n');
}

export function getWhatsAppUrl(message: string): string {
  return `https://api.whatsapp.com/send?phone=${WHATSAPP_PHONE}&text=${encodeURIComponent(message)}`;
}
