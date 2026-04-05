import { CONTACT } from './constants';

export function buildWhatsAppOrderMessage(params: {
  orderNumber: string | number;
  customerName: string;
  customerPhone: string;
  pdfUrl?: string;
}): string {
  const lines = [
    `🎉 *Nuevo Pedido #${params.orderNumber}*`,
    '',
    `*Cliente:* ${params.customerName}`,
    `*Teléfono:* ${params.customerPhone}`,
  ];

  if (params.pdfUrl) {
    lines.push('', `📄 *PDF del pedido:* ${params.pdfUrl}`);
  }

  return lines.filter(Boolean).join('\n');
}

export function getWhatsAppUrl(message: string): string {
  return `https://api.whatsapp.com/send?phone=${CONTACT.whatsapp}&text=${encodeURIComponent(message)}`;
}
