import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CartItem, PaymentMethod } from './types';
import { BANK_INFO, CONTACT } from './constants';
import { formatCurrency } from './format';
import { CHALET_FONT_BASE64 } from './chalet-font';

interface OrderPDFParams {
  orderNumber: string | number;
  customer: { name: string; phone: string; email: string };
  event: { date: string; time: string; area: string; address: string; birthdayChildName: string; birthdayChildAge: number | ''; theme: string };
  items: CartItem[];
  subtotal: number;
  discount?: number;
  discountType?: 'fixed' | 'percent';
  transportCost: number; // -1 = pending
  surcharge: number;
  total: number;
  paymentMethod: PaymentMethod;
  logoUrl?: string | null;
  deposits?: { amount: number; date: string }[];
}

/** Max image size: 2MB */
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

async function loadImageBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`Logo fetch failed: ${res.status} ${res.statusText}`);
      return null;
    }
    const blob = await res.blob();
    if (blob.size > MAX_IMAGE_BYTES) {
      console.warn(`Logo too large (${(blob.size / 1024).toFixed(0)}KB), skipping`);
      return null;
    }
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => {
        console.warn('FileReader error loading logo');
        resolve(null);
      };
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.warn('Logo load error:', e);
    return null;
  }
}

function fmtDate(dateStr: string): string {
  try {
    const parts = dateStr.split('-').map(Number);
    return `${String(parts[2]).padStart(2, '0')}/${String(parts[1]).padStart(2, '0')}/${parts[0]}`;
  } catch { return dateStr; }
}

function fmtDateLong(dateStr: string): string {
  try {
    const parts = dateStr.split('-').map(Number);
    const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    return `${parts[2]} de ${MESES[parts[1] - 1]} de ${parts[0]}`;
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

function addDays(dateStr: string, days: number): string {
  const parts = dateStr.split('-').map(Number);
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  d.setUTCDate(d.getUTCDate() + days);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
}

/** Round to 2 decimal places */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Brand colors
const PURPLE: [number, number, number] = [88, 4, 89];
const TEAL: [number, number, number] = [132, 217, 208];
const PURPLE_LIGHT: [number, number, number] = [245, 240, 245];
const WHITE: [number, number, number] = [255, 255, 255];
const GRAY: [number, number, number] = [120, 120, 120];
const GRAY_DARK: [number, number, number] = [50, 50, 50];
const GRAY_LIGHT: [number, number, number] = [180, 180, 180];
const CREAM: [number, number, number] = [250, 248, 244];

export async function generateOrderPDF(params: OrderPDFParams): Promise<jsPDF> {
  const doc = new jsPDF();

  // Register Chalet brand font
  doc.addFileToVFS('Chalet.ttf', CHALET_FONT_BASE64);
  doc.addFont('Chalet.ttf', 'Chalet', 'normal');
  doc.addFont('Chalet.ttf', 'Chalet', 'bold');

  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const m = 20; // margin
  const cw = pw - m * 2;
  let y = 0;

  // ─── 1. HEADER: Company info left, logo right ───
  y = 18;

  // Company info (left)
  doc.setFontSize(16);
  doc.setFont('Chalet', 'bold');
  doc.setTextColor(PURPLE[0], PURPLE[1], PURPLE[2]);
  doc.text('Playtime S.A', m, y);

  doc.setFontSize(9);
  doc.setFont('Chalet', 'normal');
  doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
  doc.text(CONTACT.phone, m, y + 6);
  doc.text(CONTACT.email, m, y + 11);
  doc.text(`Instagram: ${CONTACT.instagram}`, m, y + 16);

  // Logo (right)
  const logoData = params.logoUrl ? await loadImageBase64(params.logoUrl) : null;
  if (logoData) {
    try {
      doc.addImage(logoData, 'PNG', pw - m - 30, y - 8, 30, 30);
    } catch { /* fallback: no logo */ }
  }

  y += 24;

  // Purple separator line
  doc.setDrawColor(PURPLE[0], PURPLE[1], PURPLE[2]);
  doc.setLineWidth(0.8);
  doc.line(m, y, pw - m, y);

  y += 10;

  // ─── 2. TITLE: COTIZACIÓN ───
  doc.setFontSize(22);
  doc.setFont('Chalet', 'bold');
  doc.setTextColor(PURPLE[0], PURPLE[1], PURPLE[2]);
  doc.text('COTIZACIÓN', m, y);

  y += 10;

  // ─── 3. TWO-COLUMN: Client info (left) + Document info (right) ───
  const colMid = pw / 2;
  const todayStr = new Date().toISOString().split('T')[0];

  // Left column: Cliente
  doc.setFontSize(8);
  doc.setFont('Chalet', 'bold');
  doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
  doc.text('CLIENTE', m, y);

  doc.setFontSize(11);
  doc.setFont('Chalet', 'bold');
  doc.setTextColor(GRAY_DARK[0], GRAY_DARK[1], GRAY_DARK[2]);
  const nameLines = doc.splitTextToSize(params.customer.name, colMid - m - 10) as string[];
  nameLines.forEach((line: string, i: number) => {
    doc.text(line, m, y + 5 + i * 5);
  });

  let cy = y + 5 + nameLines.length * 5;
  doc.setFontSize(9);
  doc.setFont('Chalet', 'normal');
  doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
  doc.text(params.customer.phone, m, cy);
  cy += 4;
  if (params.customer.email) {
    doc.text(params.customer.email, m, cy);
    cy += 4;
  }

  // Right column: Document metadata
  const rightX = colMid + 10;
  const valX = pw - m;
  let ry = y;

  const metaRows: [string, string][] = [
    ['N.º DE COTIZACIÓN', String(params.orderNumber)],
    ['FECHA', fmtDate(todayStr)],
    ['CONDICIONES', 'Pago en 30 días'],
    ['FECHA DE VENCIMIENTO', addDays(todayStr, 30)],
  ];

  doc.setFontSize(8);
  for (const [label, value] of metaRows) {
    doc.setFont('Chalet', 'bold');
    doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
    doc.text(label, rightX, ry);
    doc.setFont('Chalet', 'normal');
    doc.setTextColor(GRAY_DARK[0], GRAY_DARK[1], GRAY_DARK[2]);
    doc.text(value, valX, ry, { align: 'right' });
    ry += 6;
  }

  y = Math.max(cy, ry) + 8;

  // ─── 4. EVENT DETAILS ───
  doc.setFillColor(CREAM[0], CREAM[1], CREAM[2]);
  const evLines: string[] = [];
  evLines.push(`${fmtDateLong(params.event.date)}  ·  ${fmtTime(params.event.time)}`);
  const addressText = `${params.event.area ? params.event.area + ' – ' : ''}${params.event.address}`;
  const addressWrapped = doc.splitTextToSize(addressText, cw - 14) as string[];
  evLines.push(...addressWrapped);
  if (params.event.birthdayChildName) {
    let cl = `Cumpleañero/a: ${params.event.birthdayChildName}`;
    if (params.event.birthdayChildAge) cl += ` (${params.event.birthdayChildAge} años)`;
    evLines.push(cl);
  }
  if (params.event.theme) evLines.push(`Tema: ${params.event.theme}`);

  const evH = 10 + evLines.length * 6;
  doc.roundedRect(m, y, cw, evH, 1.5, 1.5, 'F');

  doc.setFontSize(8);
  doc.setFont('Chalet', 'bold');
  doc.setTextColor(PURPLE[0], PURPLE[1], PURPLE[2]);
  doc.text('DETALLES DEL EVENTO', m + 6, y + 5);

  doc.setFontSize(9);
  doc.setFont('Chalet', 'normal');
  doc.setTextColor(GRAY_DARK[0], GRAY_DARK[1], GRAY_DARK[2]);
  evLines.forEach((l, i) => doc.text(l, m + 6, y + 10 + i * 6));

  y += evH + 8;

  // ─── 5. ITEMS TABLE (no transport row) ───
  const isTransportPending = params.transportCost < 0;
  const effectiveTransport = isTransportPending ? 0 : params.transportCost;

  const tableBody = params.items.map((item) => [
    item.name,
    String(item.quantity),
    formatCurrency(item.unitPrice),
    formatCurrency(round2(item.unitPrice * item.quantity)),
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Producto', 'Cant.', 'P. Unitario', 'Total']],
    body: tableBody,
    margin: { left: m, right: m },
    headStyles: {
      fillColor: PURPLE,
      textColor: WHITE,
      fontStyle: 'bold',
      fontSize: 9,
    },
    bodyStyles: {
      fontSize: 9,
      textColor: GRAY_DARK,
    },
    alternateRowStyles: { fillColor: PURPLE_LIGHT },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { halign: 'center', cellWidth: 20 },
      2: { halign: 'right', cellWidth: 28 },
      3: { halign: 'right', cellWidth: 28 },
    },
    styles: { cellPadding: 3, lineColor: [230, 230, 230], lineWidth: 0.2, font: 'Chalet' },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 8;

  // ─── 6. TOTALS (right-aligned, clean) ───
  const discountAmount = params.discount || 0;
  const totLines: { label: string; value: string; bold?: boolean; color?: [number, number, number] }[] = [
    { label: 'Subtotal', value: formatCurrency(params.subtotal) },
  ];
  if (discountAmount > 0) {
    const discLabel = params.discountType === 'percent' && params.discount ? `Descuento (${params.discount}%)` : 'Descuento';
    totLines.push({ label: discLabel, value: `-${formatCurrency(discountAmount)}`, color: TEAL });
  }
  if (effectiveTransport > 0) {
    totLines.push({ label: 'Transporte', value: formatCurrency(effectiveTransport) });
  }
  if (isTransportPending) {
    totLines.push({ label: 'Transporte', value: 'Por confirmar' });
  }
  if (params.surcharge > 0) {
    totLines.push({ label: 'Recargo tarjeta (5%)', value: formatCurrency(params.surcharge) });
  }

  const totX = pw - m; // right edge
  const totLabelX = pw - m - 80; // label column

  doc.setFontSize(10);
  for (const line of totLines) {
    doc.setFont('Chalet', 'normal');
    doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
    doc.text(line.label, totLabelX, y);
    if (line.color) {
      doc.setTextColor(line.color[0], line.color[1], line.color[2]);
    } else {
      doc.setTextColor(GRAY_DARK[0], GRAY_DARK[1], GRAY_DARK[2]);
    }
    doc.text(line.value, totX, y, { align: 'right' });
    y += 7;
  }

  // Divider line
  y += 1;
  doc.setDrawColor(PURPLE[0], PURPLE[1], PURPLE[2]);
  doc.setLineWidth(0.5);
  doc.line(totLabelX, y, totX, y);
  y += 7;

  // TOTAL
  const totalStr = isTransportPending ? `${formatCurrency(params.total)}*` : formatCurrency(params.total);
  doc.setFontSize(14);
  doc.setFont('Chalet', 'bold');
  doc.setTextColor(PURPLE[0], PURPLE[1], PURPLE[2]);
  doc.text('TOTAL', totLabelX, y);
  doc.text(totalStr, totX, y, { align: 'right' });
  y += 5;

  // Payment method
  const payLabel = params.paymentMethod === 'bank_transfer' ? 'Transferencia Bancaria' : 'Tarjeta de Crédito (+5%)';
  doc.setFontSize(8);
  doc.setFont('Chalet', 'normal');
  doc.setTextColor(GRAY_LIGHT[0], GRAY_LIGHT[1], GRAY_LIGHT[2]);
  doc.text(`Método de pago: ${payLabel}`, totLabelX, y);
  y += 6;

  if (isTransportPending) {
    doc.setFontSize(8);
    doc.setTextColor(GRAY_LIGHT[0], GRAY_LIGHT[1], GRAY_LIGHT[2]);
    doc.text('*El costo de transporte se confirmará por WhatsApp', totLabelX, y);
    y += 6;
  }

  y += 4;

  // ─── 7. DEPOSITS (only if there are deposits) ───
  const deps = params.deposits || [];
  const totalDeposits = deps.reduce((s, d) => s + d.amount, 0);
  if (totalDeposits > 0) {
    const saldo = Math.max(0, params.total - totalDeposits);

    doc.setFillColor(CREAM[0], CREAM[1], CREAM[2]);
    const depH = 10 + deps.length * 5 + 10;
    doc.roundedRect(m, y, cw, depH, 1.5, 1.5, 'F');

    doc.setFontSize(8);
    doc.setFont('Chalet', 'bold');
    doc.setTextColor(PURPLE[0], PURPLE[1], PURPLE[2]);
    doc.text('PAGOS RECIBIDOS', m + 6, y + 5);

    doc.setFontSize(9);
    doc.setFont('Chalet', 'normal');
    let dy = y + 11;
    for (const dep of deps) {
      doc.setTextColor(GRAY_DARK[0], GRAY_DARK[1], GRAY_DARK[2]);
      doc.text(dep.date, m + 6, dy);
      doc.text(formatCurrency(dep.amount), pw - m - 6, dy, { align: 'right' });
      dy += 5;
    }

    // Divider + saldo
    dy += 1;
    doc.setDrawColor(200, 200, 200);
    doc.line(m + 6, dy - 2, pw - m - 6, dy - 2);
    doc.setFont('Chalet', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(GRAY_DARK[0], GRAY_DARK[1], GRAY_DARK[2]);
    doc.text('Saldo pendiente', m + 6, dy + 2);
    doc.setTextColor(PURPLE[0], PURPLE[1], PURPLE[2]);
    doc.text(formatCurrency(saldo), pw - m - 6, dy + 2, { align: 'right' });

    y += depH + 6;
  }

  // ─── 8. BANK INFO (only if bank transfer) ───
  if (params.paymentMethod === 'bank_transfer') {
    doc.setFontSize(8);
    doc.setFont('Chalet', 'bold');
    doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
    doc.text('DATOS BANCARIOS', m, y);
    y += 5;
    doc.setFont('Chalet', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(GRAY_DARK[0], GRAY_DARK[1], GRAY_DARK[2]);
    doc.text(`${BANK_INFO.bank}  ·  ${BANK_INFO.name}  ·  ${BANK_INFO.accountType}: ${BANK_INFO.accountNumber}`, m, y);
    y += 8;
  }

  // ─── 9. FOOTER ───
  const footerY = ph - 14;
  doc.setDrawColor(230, 230, 230);
  doc.setLineWidth(0.3);
  doc.line(m, footerY - 4, pw - m, footerY - 4);

  doc.setFontSize(8);
  doc.setFont('Chalet', 'normal');
  doc.setTextColor(GRAY_LIGHT[0], GRAY_LIGHT[1], GRAY_LIGHT[2]);
  doc.text(`PlayTime – Creando Momentos  |  ${CONTACT.phone}  |  ${CONTACT.email}  |  Instagram: ${CONTACT.instagram}`, pw / 2, footerY, { align: 'center' });

  return doc;
}

export async function downloadOrderPDF(params: OrderPDFParams): Promise<void> {
  const doc = await generateOrderPDF(params);
  doc.save(`PlayTime-Cotizacion-${params.orderNumber}.pdf`);
}
