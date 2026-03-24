import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CartItem, PaymentMethod } from './types';
import { BANK_INFO, CONTACT } from './constants';

interface OrderPDFParams {
  orderNumber: number;
  customer: { name: string; phone: string; email: string };
  event: { date: string; time: string; area: string; address: string; birthdayChildName: string; birthdayChildAge: number | ''; theme: string };
  items: CartItem[];
  subtotal: number;
  transportCost: number; // -1 = pending
  surcharge: number;
  total: number;
  paymentMethod: PaymentMethod;
}

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export function generateOrderPDF(params: OrderPDFParams): jsPDF {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  let y = 20;

  // ─── HEADER ───
  // Brand colors
  const purple = [88, 4, 89];
  const teal = [73, 179, 191];

  // Logo text
  doc.setFontSize(28);
  doc.setTextColor(teal[0], teal[1], teal[2]);
  doc.text('play', margin, y);
  const playWidth = doc.getTextWidth('play');
  doc.setTextColor(purple[0], purple[1], purple[2]);
  doc.text('time', margin + playWidth, y);

  doc.setFontSize(10);
  doc.setTextColor(purple[0], purple[1], purple[2]);
  doc.text('creando momentos.', margin, y + 6);

  // Order number on the right
  doc.setFontSize(12);
  doc.setTextColor(100, 100, 100);
  doc.text(`Pedido #${params.orderNumber}`, pageWidth - margin, y, { align: 'right' });
  doc.setFontSize(9);
  doc.text(new Date().toLocaleDateString('es-PA', { year: 'numeric', month: 'long', day: 'numeric' }), pageWidth - margin, y + 6, { align: 'right' });

  y += 20;

  // Divider
  doc.setDrawColor(teal[0], teal[1], teal[2]);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 10;

  // ─── CUSTOMER INFO ───
  doc.setFontSize(11);
  doc.setTextColor(purple[0], purple[1], purple[2]);
  doc.text('DATOS DE CONTACTO', margin, y);
  y += 7;
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  doc.text(`Cliente: ${params.customer.name}`, margin, y); y += 5;
  doc.text(`Teléfono: ${params.customer.phone}`, margin, y); y += 5;
  if (params.customer.email) {
    doc.text(`Email: ${params.customer.email}`, margin, y); y += 5;
  }
  y += 5;

  // ─── EVENT INFO ───
  doc.setFontSize(11);
  doc.setTextColor(purple[0], purple[1], purple[2]);
  doc.text('DETALLES DEL EVENTO', margin, y);
  y += 7;
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  doc.text(`Fecha: ${params.event.date}  |  Hora: ${params.event.time}`, margin, y); y += 5;
  doc.text(`Área: ${params.event.area}`, margin, y); y += 5;
  doc.text(`Lugar: ${params.event.address}`, margin, y); y += 5;
  if (params.event.birthdayChildName) {
    let childInfo = `Cumpleañero/a: ${params.event.birthdayChildName}`;
    if (params.event.birthdayChildAge) childInfo += ` (${params.event.birthdayChildAge} años)`;
    if (params.event.theme) childInfo += `  |  Tema: ${params.event.theme}`;
    doc.text(childInfo, margin, y); y += 5;
  }
  y += 8;

  // ─── ITEMS TABLE ───
  const isTransportPending = params.transportCost < 0;
  const effectiveTransport = isTransportPending ? 0 : params.transportCost;

  const tableBody = params.items.map((item) => [
    item.name,
    String(item.quantity),
    formatCurrency(item.unitPrice),
    formatCurrency(item.unitPrice * item.quantity),
  ]);

  // Add transport row
  tableBody.push([
    'Transporte, montaje y desmontaje',
    '1',
    isTransportPending ? 'Por confirmar' : formatCurrency(effectiveTransport),
    isTransportPending ? 'Por confirmar' : formatCurrency(effectiveTransport),
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Producto', 'Cant.', 'Precio Unit.', 'Total']],
    body: tableBody,
    margin: { left: margin, right: margin },
    headStyles: {
      fillColor: [purple[0], purple[1], purple[2]],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
    },
    bodyStyles: {
      fontSize: 9,
      textColor: [60, 60, 60],
    },
    alternateRowStyles: {
      fillColor: [253, 248, 240], // cream
    },
    columnStyles: {
      0: { cellWidth: 80 },
      1: { halign: 'center', cellWidth: 20 },
      2: { halign: 'right', cellWidth: 30 },
      3: { halign: 'right', cellWidth: 30 },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 10;

  // ─── TOTALS ───
  const totalsX = pageWidth - margin - 70;
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text('Subtotal:', totalsX, y);
  doc.text(formatCurrency(params.subtotal), pageWidth - margin, y, { align: 'right' });
  y += 6;

  if (effectiveTransport > 0) {
    doc.text('Transporte:', totalsX, y);
    doc.text(formatCurrency(effectiveTransport), pageWidth - margin, y, { align: 'right' });
    y += 6;
  }

  if (params.surcharge > 0) {
    doc.text('Recargo tarjeta (5%):', totalsX, y);
    doc.setTextColor(242, 116, 5); // orange
    doc.text(formatCurrency(params.surcharge), pageWidth - margin, y, { align: 'right' });
    y += 6;
  }

  // Total line
  doc.setDrawColor(200, 200, 200);
  doc.line(totalsX, y, pageWidth - margin, y);
  y += 7;
  doc.setFontSize(14);
  doc.setTextColor(purple[0], purple[1], purple[2]);
  doc.text('TOTAL:', totalsX, y);
  doc.text(
    isTransportPending ? `${formatCurrency(params.total)}*` : formatCurrency(params.total),
    pageWidth - margin, y, { align: 'right' }
  );
  y += 5;

  if (isTransportPending) {
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text('*El costo de transporte se confirmará por WhatsApp', totalsX, y);
    y += 5;
  }

  // ─── PAYMENT METHOD ───
  y += 8;
  doc.setFontSize(10);
  doc.setTextColor(purple[0], purple[1], purple[2]);
  doc.text('MÉTODO DE PAGO', margin, y);
  y += 6;
  doc.setTextColor(60, 60, 60);
  doc.text(
    params.paymentMethod === 'bank_transfer' ? 'Transferencia Bancaria' : 'Tarjeta de Crédito (+5%)',
    margin, y
  );
  y += 6;

  if (params.paymentMethod === 'bank_transfer') {
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(`Banco: ${BANK_INFO.bank}  |  Titular: ${BANK_INFO.name}`, margin, y); y += 5;
    doc.text(`${BANK_INFO.accountType}: ${BANK_INFO.accountNumber}`, margin, y); y += 5;
  }

  // ─── FOOTER ───
  const footerY = doc.internal.pageSize.getHeight() - 20;
  doc.setDrawColor(teal[0], teal[1], teal[2]);
  doc.setLineWidth(0.3);
  doc.line(margin, footerY - 5, pageWidth - margin, footerY - 5);

  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text(`PlayTime - Creando Momentos  |  ${CONTACT.phone}  |  ${CONTACT.email}  |  Instagram: ${CONTACT.instagram}`, pageWidth / 2, footerY, { align: 'center' });

  return doc;
}

export function downloadOrderPDF(params: OrderPDFParams): void {
  const doc = generateOrderPDF(params);
  doc.save(`PlayTime-Pedido-${params.orderNumber}.pdf`);
}
