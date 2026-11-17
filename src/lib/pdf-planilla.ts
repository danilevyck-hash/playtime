import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency } from './format';
import { Colaborador, Desglose, Quincena, tarifaHora, tarifaDia } from './planilla';

const PURPLE: [number, number, number] = [88, 4, 89];
const GRAY: [number, number, number] = [120, 120, 120];
const DARK: [number, number, number] = [50, 50, 50];
const CREAM: [number, number, number] = [250, 243, 232];

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

export async function generarComprobantePDF(p: {
  colaborador: Colaborador;
  quincena: Quincena;
  desglose: Desglose;
  periodo: string;
  logoUrl: string;
}): Promise<jsPDF> {
  const { colaborador: c, quincena: q, desglose: d } = p;
  const doc = new jsPDF();
  const pw = doc.internal.pageSize.getWidth();
  const m = 20;
  let y = 18;

  const logo = await logoChico(p.logoUrl);
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
  doc.text('COMPROBANTE DE PAGO', m, y);

  y += 10;
  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  doc.text('COLABORADOR', m, y);
  doc.text('PERÍODO', pw / 2 + 10, y);
  doc.setFontSize(11);
  doc.setTextColor(...DARK);
  doc.text(c.nombre, m, y + 6);
  doc.text(p.periodo, pw / 2 + 10, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GRAY);
  doc.text(
    `Sueldo ${formatCurrency(c.sueldoMensual)} al mes · día ${formatCurrency(tarifaDia(c))} · hora ${formatCurrency(tarifaHora(c))}`,
    m,
    y + 12,
  );
  doc.text('Horario 8:00 a. m. – 5:00 p. m.', pw / 2 + 10, y + 12);

  const horas = (h: number) => `${h.toLocaleString('es-PA', { maximumFractionDigits: 2 })} h`;
  const filas: [string, string, string][] = [
    ['Salario de la quincena', '', formatCurrency(d.salario)],
    ['Horas extra (× 1.25)', horas(q.horasExtra), formatCurrency(d.extras)],
    ['Horas ausentadas', horas(q.horasAusente), `-${formatCurrency(Math.abs(d.ausencias))}`],
    ['Domingo trabajado ($30 c/u)', String(q.domingos), formatCurrency(d.domingos)],
  ];

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
  doc.text('Firma de la administración', pw - m - 70, fy + 5);
  fy += 18;
  doc.setFontSize(7.5);
  doc.text('Ejemplo para revisar: horas de ejemplo; nombres y sueldos reales.', m, fy);

  return doc;
}
