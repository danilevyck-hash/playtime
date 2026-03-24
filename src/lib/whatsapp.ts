import { CartItem } from './types';
import { formatCurrency } from './format';

const WHATSAPP_PHONE = '50764332724';

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
  transportCost?: number; // -1 = por confirmar
}): string {
  const itemLines = params.items
    .map((item) => `  • ${item.name} x${item.quantity} — ${formatCurrency(item.unitPrice * item.quantity)}`)
    .join('\n');

  const paymentLabel = params.paymentMethod === 'bank_transfer'
    ? 'Transferencia Bancaria'
    : 'Tarjeta de Crédito (+5%)';

  const transportLine = params.transportCost !== undefined
    ? params.transportCost < 0
      ? `*Transporte, montaje y desmontaje:* Por confirmar`
      : params.transportCost > 0
        ? `*Transporte, montaje y desmontaje:* ${formatCurrency(params.transportCost)}`
        : ''
    : '';

  return [
    `🎉 *Nuevo Pedido #${params.orderNumber}*`,
    '',
    `*Cliente:* ${params.customerName}`,
    `*Teléfono:* ${params.customerPhone}`,
    `*Fecha:* ${params.eventDate}`,
    `*Hora:* ${params.eventTime}`,
    `*Ubicación:* ${params.eventAddress}`,
    '',
    `*Artículos:*`,
    itemLines,
    '',
    `*Subtotal:* ${formatCurrency(params.subtotal)}`,
    transportLine,
    params.surcharge > 0 ? `*Recargo tarjeta (5%):* ${formatCurrency(params.surcharge)}` : '',
    `*Total:* ${formatCurrency(params.total)}`,
    `*Método de Pago:* ${paymentLabel}`,
  ].filter(Boolean).join('\n');
}

export function getWhatsAppUrl(message: string): string {
  return `https://api.whatsapp.com/send?phone=${WHATSAPP_PHONE}&text=${encodeURIComponent(message)}`;
}
