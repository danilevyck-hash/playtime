import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency } from './format';
import { tarifaDia, tarifaHora, type Desglose } from './planilla';

const PURPLE: [number, number, number] = [88, 4, 89];
const GRAY: [number, number, number] = [120, 120, 120];
const DARK: [number, number, number] = [50, 50, 50];
const CREAM: [number, number, number] = [250, 243, 232];

const horas = (min: number) => `${(min / 60).toLocaleString('es-PA', { maximumFractionDigits: 2 })} h`;

/** El logo pesa 467 KB a 1896 px: se achica en un canvas antes de entrar al PDF. */
async function logoChico(url: string): Promise<string | null> {
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = Math.round((300 * img.height) / img.width);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

async function encabezado(doc: jsPDF, logoUrl: string, titulo: string): Promise<number> {
  const pw = doc.internal.pageSize.getWidth();
  const m = 20;
  let y = 18;
  const logo = await logoChico(logoUrl);
  if (logo) doc.addImage(logo, 'PNG', pw - m - 30, y - 8, 30, 32.7);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...PURPLE);
  doc.text('Playtime S.A', m, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GRAY);
  doc.text('Bodega · Planilla quincenal', m, y + 6);
  y += 28;
  doc.setDrawColor(...PURPLE);
  doc.setLineWidth(0.8);
  doc.line(m, y, pw - m, y);
  y += 11;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...PURPLE);
  doc.text(titulo, m, y);
  return y;
}

export interface ColaboradorPDF {
  nombre: string;
  sueldo_mensual: number;
  desglose: Desglose;
}

/** Comprobante de pago de UN colaborador, con firma. */
export async function generarComprobantePDF(c: ColaboradorPDF, periodo: string, logoUrl: string): Promise<jsPDF> {
  const d = c.desglose;
  const doc = new jsPDF();
  const pw = doc.internal.pageSize.getWidth();
  const m = 20;
  let y = await encabezado(doc, logoUrl, 'COMPROBANTE DE PAGO');

  y += 10;
  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  doc.text('COLABORADOR', m, y);
  doc.text('PERÍODO', pw / 2 + 10, y);
  doc.setFontSize(11);
  doc.setTextColor(...DARK);
  doc.text(c.nombre, m, y + 6);
  doc.text(periodo, pw / 2 + 10, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GRAY);
  doc.text(
    `Sueldo ${formatCurrency(c.sueldo_mensual)} al mes · día ${formatCurrency(tarifaDia(c.sueldo_mensual))} · hora ${formatCurrency(tarifaHora(c.sueldo_mensual))}`,
    m,
    y + 12,
  );
  doc.text('Horario lunes a sábado, 8:00 a. m. – 5:00 p. m.', pw / 2 + 10, y + 12);

  const filas: [string, string, string][] = [['Salario de la quincena', '', formatCurrency(d.salario)]];
  if (d.extraMin) filas.push([`Horas extra (× 1.25)${d.extras ? '' : ' — sin aprobar'}`, horas(d.extraMin), formatCurrency(d.extras)]);
  if (d.nDomingos) filas.push(['Domingo trabajado ($30 c/u)', String(d.nDomingos), formatCurrency(d.domingos)]);
  if (d.tardanzaMin) filas.push(['Tardanzas', `${d.tardanzaMin} min`, formatCurrency(d.tardanzas)]);
  if (d.salidaTempranaMin) filas.push(['Salida temprana', `${d.salidaTempranaMin} min`, formatCurrency(d.salidaTemprana)]);
  if (d.ausenciaMin) filas.push(['Ausencias', horas(d.ausenciaMin), formatCurrency(d.ausencias)]);

  autoTable(doc, {
    startY: y + 20,
    margin: { left: m, right: m },
    head: [['Concepto', 'Cantidad', 'Monto']],
    body: filas,
    foot: [['Total a pagar', '', formatCurrency(d.total)]],
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 10, cellPadding: 3, textColor: DARK },
    headStyles: { fillColor: PURPLE, textColor: [255, 255, 255], fontStyle: 'bold' },
    footStyles: { fillColor: CREAM, textColor: PURPLE, fontStyle: 'bold', fontSize: 12 },
    columnStyles: { 1: { halign: 'center', cellWidth: 30 }, 2: { halign: 'right', cellWidth: 40 } },
  });

  // @ts-expect-error lastAutoTable lo agrega jspdf-autotable
  let fy = doc.lastAutoTable.finalY + 30;
  doc.setDrawColor(...GRAY);
  doc.setLineWidth(0.3);
  doc.line(m, fy, m + 70, fy);
  doc.line(pw - m - 70, fy, pw - m, fy);
  doc.setFontSize(9);
  doc.setTextColor(...GRAY);
  doc.text('Firma del colaborador', m, fy + 5);
  doc.text('Firma de la Dirección', pw - m - 70, fy + 5);
  if (d.diasIncompletos.length) {
    fy += 18;
    doc.setFontSize(7.5);
    doc.text(`Días con una sola marca (no descontados): ${d.diasIncompletos.join(', ')}.`, m, fy);
  }
  return doc;
}

/** Reporte sencillo de la quincena: una fila por colaborador y el total. */
export async function generarReportePDF(cs: ColaboradorPDF[], periodo: string, logoUrl: string): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: 'landscape' });
  const m = 20;
  const y = await encabezado(doc, logoUrl, `PLANILLA · ${periodo}`);
  const total = cs.reduce((s, c) => s + c.desglose.total, 0);
  autoTable(doc, {
    startY: y + 10,
    margin: { left: m, right: m },
    head: [['Colaborador', 'Salario', 'Horas extra', 'Domingos', 'Tardanzas', 'Salida temprana', 'Ausencias', 'Total']],
    body: cs.map(({ nombre, desglose: d }) => [
      nombre,
      formatCurrency(d.salario),
      d.extraMin ? `${formatCurrency(d.extras)} (${horas(d.extraMin)}${d.extras ? '' : ', sin aprobar'})` : '—',
      d.nDomingos ? `${formatCurrency(d.domingos)} (${d.nDomingos})` : '—',
      d.tardanzaMin ? `${formatCurrency(d.tardanzas)} (${d.tardanzaMin} min)` : '—',
      d.salidaTempranaMin ? `${formatCurrency(d.salidaTemprana)} (${d.salidaTempranaMin} min)` : '—',
      d.ausenciaMin ? `${formatCurrency(d.ausencias)} (${horas(d.ausenciaMin)})` : '—',
      formatCurrency(d.total),
    ]),
    foot: [['Total de la quincena', '', '', '', '', '', '', formatCurrency(Math.round(total * 100) / 100)]],
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 3, textColor: DARK },
    headStyles: { fillColor: PURPLE, textColor: [255, 255, 255], fontStyle: 'bold' },
    footStyles: { fillColor: CREAM, textColor: PURPLE, fontStyle: 'bold' },
    columnStyles: Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((i) => [i, { halign: 'right' as const }])),
  });
  return doc;
}
