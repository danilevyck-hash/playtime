import { CONTACT } from './constants';
import { formatCurrency } from './format';

export function buildWhatsAppOrderMessage(params: {
  orderNumber: string | number;
  customerName: string;
  customerPhone: string;
  pdfUrl?: string;
  eventDate?: string;
  eventTime?: string;
  showTime?: string;
  items?: { name: string; quantity: number; unitPrice: number }[];
  total?: number;
}): string {
  const lines = [
    `🎉 *Nuevo Pedido #${params.orderNumber}*`,
    '',
    `*Cliente:* ${params.customerName}`,
    `*Teléfono:* ${params.customerPhone}`,
  ];

  if (params.eventDate) {
    lines.push(`*Fecha del evento:* ${params.eventDate}`);
  }
  if (params.eventTime) {
    lines.push(`*Hora de inicio:* ${params.eventTime}`);
  }
  if (params.showTime && params.showTime.trim()) {
    lines.push(`*Hora del show:* ${params.showTime}`);
  }

  // Always include products + total so the order survives even if the PDF upload failed.
  if (params.items && params.items.length > 0) {
    lines.push('', '*Productos:*');
    for (const it of params.items) {
      lines.push(`• ${it.quantity}x ${it.name} — ${formatCurrency((Number(it.unitPrice) || 0) * (Number(it.quantity) || 0))}`);
    }
  }
  if (typeof params.total === 'number') {
    lines.push('', `*Total:* ${formatCurrency(params.total)}`);
  }

  if (params.pdfUrl) {
    lines.push('', `📄 *PDF del pedido:* ${params.pdfUrl}`);
  }

  return lines.filter(Boolean).join('\n');
}

export function getWhatsAppUrl(message: string): string {
  return `https://api.whatsapp.com/send?phone=${CONTACT.whatsapp}&text=${encodeURIComponent(message)}`;
}
