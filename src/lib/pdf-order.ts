import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CartItem, PaymentMethod } from './types';
import { BANK_INFO, CONTACT } from './constants';
import { formatCurrency } from './format';

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
  logoUrl?: string | null;
}

async function loadImageBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}

function fmtDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
  } catch { return dateStr; }
}

function fmtTime(timeStr: string): string {
  try {
    const [h, m] = timeStr.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hr = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${hr}:${String(m).padStart(2, '0')} ${ampm}`;
  } catch { return timeStr; }
}

// Brand colors
const PURPLE: [number, number, number] = [88, 4, 89];
const TEAL: [number, number, number] = [132, 217, 208];
const ORANGE: [number, number, number] = [242, 116, 5];
const PINK: [number, number, number] = [242, 114, 137];
const YELLOW: [number, number, number] = [242, 200, 75];
const TEAL2: [number, number, number] = [73, 179, 191];
const BEIGE: [number, number, number] = [250, 243, 232];
const WHITE: [number, number, number] = [255, 255, 255];
const GRAY: [number, number, number] = [100, 100, 100];
const GRAY_LIGHT: [number, number, number] = [150, 150, 150];
const GRAY_DARK: [number, number, number] = [60, 60, 60];

export async function generateOrderPDF(params: OrderPDFParams): Promise<jsPDF> {
  const doc = new jsPDF();
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const m = 18;
  const cw = pw - m * 2;
  let y = 0;

  // Helper: section with colored left border
  const drawSection = (sx: number, sy: number, sw: number, sh: number, borderColor: [number, number, number]) => {
    doc.setFillColor(WHITE[0], WHITE[1], WHITE[2]);
    doc.setDrawColor(230, 230, 230);
    doc.roundedRect(sx, sy, sw, sh, 1.5, 1.5, 'FD');
    doc.setFillColor(borderColor[0], borderColor[1], borderColor[2]);
    doc.rect(sx, sy + 1.5, 3, sh - 3, 'F');
  };

  // ─── 1. HEADER: purple banner with logo ───
  const headerH = 28;
  doc.setFillColor(PURPLE[0], PURPLE[1], PURPLE[2]);
  doc.rect(0, 0, pw, headerH, 'F');

  // Logo: image if available, text fallback
  const logoData = params.logoUrl ? await loadImageBase64(params.logoUrl) : null;
  if (logoData) {
    doc.addImage(logoData, 'PNG', m, 3, 22, 22);
    // "Pedido confirmado" shifted right
    doc.setFontSize(14);
    doc.setTextColor(WHITE[0], WHITE[1], WHITE[2]);
    doc.text('Pedido confirmado', m + 26, 16);
  } else {
    doc.setFontSize(20);
    doc.setTextColor(TEAL[0], TEAL[1], TEAL[2]);
    doc.text('play time', m, 13);
    doc.setFontSize(9);
    doc.setTextColor(200, 180, 200);
    doc.text('creando momentos.', m, 19);
  }

  if (!logoData) {
    doc.setFontSize(14);
    doc.setTextColor(WHITE[0], WHITE[1], WHITE[2]);
    doc.text('Pedido confirmado', pw - m, 14, { align: 'right' });
  }

  y = headerH + 6;

  // ─── 2. BADGE: order # in orange + date ───
  // Orange badge
  doc.setFillColor(ORANGE[0], ORANGE[1], ORANGE[2]);
  doc.roundedRect(m, y - 3, 32, 8, 2, 2, 'F');
  doc.setFontSize(9);
  doc.setTextColor(WHITE[0], WHITE[1], WHITE[2]);
  doc.text(`#${params.orderNumber}`, m + 16, y + 2, { align: 'center' });

  // Date
  doc.setFontSize(9);
  doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
  doc.text(fmtDate(new Date().toISOString().split('T')[0]), pw - m, y + 2, { align: 'right' });

  y += 12;

  // ─── 3. SECTION: Datos del cliente (teal left border) ───
  const custLines = [params.customer.name, params.customer.phone];
  if (params.customer.email) custLines.push(params.customer.email);
  const custH = 12 + custLines.length * 5;
  drawSection(m, y, cw, custH, TEAL);
  doc.setFontSize(7);
  doc.setTextColor(TEAL[0], TEAL[1], TEAL[2]);
  doc.text('DATOS DEL CLIENTE', m + 7, y + 5);
  doc.setFontSize(9);
  doc.setTextColor(GRAY_DARK[0], GRAY_DARK[1], GRAY_DARK[2]);
  custLines.forEach((l, i) => doc.text(l, m + 7, y + 10 + i * 5));
  y += custH + 4;

  // ─── 4. SECTION: Detalles del evento (orange left border) ───
  const evLines: string[] = [];
  evLines.push(`${fmtDate(params.event.date)}  \u00b7  ${fmtTime(params.event.time)}`);
  evLines.push(`${params.event.area ? params.event.area + ' \u2013 ' : ''}${params.event.address}`);
  if (params.event.birthdayChildName) {
    let cl = `Cumplea\u00f1ero/a: ${params.event.birthdayChildName}`;
    if (params.event.birthdayChildAge) cl += ` (${params.event.birthdayChildAge} a\u00f1os)`;
    evLines.push(cl);
  }
  if (params.event.theme) evLines.push(`Tema: ${params.event.theme}`);
  const evH = 12 + evLines.length * 5;
  drawSection(m, y, cw, evH, ORANGE);
  doc.setFontSize(7);
  doc.setTextColor(ORANGE[0], ORANGE[1], ORANGE[2]);
  doc.text('DETALLES DEL EVENTO', m + 7, y + 5);
  doc.setFontSize(9);
  doc.setTextColor(GRAY_DARK[0], GRAY_DARK[1], GRAY_DARK[2]);
  evLines.forEach((l, i) => doc.text(l, m + 7, y + 10 + i * 5));
  y += evH + 5;

  // ─── 5. TABLE: Productos (teal header, pink left accent) ───
  const isTransportPending = params.transportCost < 0;
  const effectiveTransport = isTransportPending ? 0 : params.transportCost;

  // Pink accent bar
  doc.setFillColor(PINK[0], PINK[1], PINK[2]);
  doc.rect(m, y, 3, 4, 'F');
  doc.setFontSize(7);
  doc.setTextColor(PINK[0], PINK[1], PINK[2]);
  doc.text('PRODUCTOS', m + 7, y + 3);
  y += 6;

  const tableBody = params.items.map((item) => [
    item.name,
    String(item.quantity),
    formatCurrency(item.unitPrice),
    formatCurrency(item.unitPrice * item.quantity),
  ]);
  tableBody.push([
    'Transporte, montaje y desmontaje',
    '1',
    isTransportPending ? 'Por confirmar' : formatCurrency(effectiveTransport),
    isTransportPending ? 'Por confirmar' : formatCurrency(effectiveTransport),
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Producto', 'Cant.', 'P. Unit.', 'Total']],
    body: tableBody,
    margin: { left: m, right: m },
    headStyles: { fillColor: TEAL, textColor: PURPLE, fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { fontSize: 8, textColor: GRAY_DARK },
    alternateRowStyles: { fillColor: BEIGE },
    columnStyles: { 0: { cellWidth: 80 }, 1: { halign: 'center', cellWidth: 18 }, 2: { halign: 'right', cellWidth: 28 }, 3: { halign: 'right', cellWidth: 28 } },
    styles: { cellPadding: 2.5 },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 6;

  // ─── 6. TOTAL BOX: purple bg, white text ───
  const payLabel = params.paymentMethod === 'bank_transfer' ? 'Transferencia Bancaria' : 'Tarjeta de Cr\u00e9dito (+5%)';
  const lines: { label: string; value: string }[] = [
    { label: 'Subtotal', value: formatCurrency(params.subtotal) },
  ];
  if (effectiveTransport > 0) lines.push({ label: 'Transporte', value: formatCurrency(effectiveTransport) });
  if (isTransportPending) lines.push({ label: 'Transporte', value: 'Por confirmar' });
  if (params.surcharge > 0) lines.push({ label: 'Recargo tarjeta (5%)', value: formatCurrency(params.surcharge) });

  const totBoxH = 16 + lines.length * 6 + (params.paymentMethod === 'bank_transfer' ? 14 : 6);
  doc.setFillColor(PURPLE[0], PURPLE[1], PURPLE[2]);
  doc.roundedRect(m, y, cw, totBoxH, 2, 2, 'F');

  let ty = y + 5;
  doc.setFontSize(8);
  for (const line of lines) {
    doc.setTextColor(200, 180, 200);
    doc.text(line.label, m + 5, ty);
    doc.setTextColor(WHITE[0], WHITE[1], WHITE[2]);
    doc.text(line.value, pw - m - 5, ty, { align: 'right' });
    ty += 6;
  }
  // Divider
  doc.setDrawColor(120, 60, 120);
  doc.line(m + 5, ty - 1, pw - m - 5, ty - 1);
  ty += 4;
  // Total
  doc.setFontSize(14);
  doc.setTextColor(WHITE[0], WHITE[1], WHITE[2]);
  doc.text('TOTAL', m + 5, ty);
  const totalStr = isTransportPending ? `${formatCurrency(params.total)}*` : formatCurrency(params.total);
  doc.text(totalStr, pw - m - 5, ty, { align: 'right' });
  ty += 6;
  // Payment method
  doc.setFontSize(8);
  doc.setTextColor(200, 180, 200);
  doc.text(`M\u00e9todo: ${payLabel}`, m + 5, ty);
  ty += 4;
  if (params.paymentMethod === 'bank_transfer') {
    doc.setFontSize(7);
    doc.text(`${BANK_INFO.bank} | ${BANK_INFO.name} | ${BANK_INFO.accountType}: ${BANK_INFO.accountNumber}`, m + 5, ty);
  }

  if (isTransportPending) {
    y += totBoxH + 3;
    doc.setFontSize(7);
    doc.setTextColor(GRAY_LIGHT[0], GRAY_LIGHT[1], GRAY_LIGHT[2]);
    doc.text('*El costo de transporte se confirmar\u00e1 por WhatsApp', m, y);
  }

  // ─── 7. FOOTER: beige bg with color dots + contact ───
  const footerH = 18;
  const footerY = ph - footerH;
  doc.setFillColor(BEIGE[0], BEIGE[1], BEIGE[2]);
  doc.rect(0, footerY, pw, footerH, 'F');

  // Decorative dots
  const dotColors = [ORANGE, PINK, TEAL, YELLOW, TEAL2];
  const dotStartX = pw / 2 - 15;
  dotColors.forEach((c, i) => {
    doc.setFillColor(c[0], c[1], c[2]);
    doc.circle(dotStartX + i * 7, footerY + 5, 1.5, 'F');
  });

  // Contact
  doc.setFontSize(7);
  doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
  doc.text(`PlayTime \u2013 Creando Momentos  |  ${CONTACT.phone}  |  ${CONTACT.email}  |  Instagram: ${CONTACT.instagram}`, pw / 2, footerY + 12, { align: 'center' });

  return doc;
}

export async function downloadOrderPDF(params: OrderPDFParams): Promise<void> {
  const doc = await generateOrderPDF(params);
  doc.save(`PlayTime-Pedido-${params.orderNumber}.pdf`);
}
