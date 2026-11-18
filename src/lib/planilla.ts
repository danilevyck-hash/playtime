// Planilla quincenal de la bodega — cálculo PURO (sin base, sin fechas de hoy
// escondidas: todo entra por parámetro). Lo leen la ruta /api/planilla, la
// pantalla y las pruebas (tests/planilla.test.mjs).
//
// Reglas (dueña de Playtime, nov-2026):
//   · Quincena 1–15 y 16–fin. Salario de la quincena = mensual ÷ 2.
//   · Día = mensual ÷ 26; hora = día ÷ 8. Se calcula sin redondear y se
//     redondea SOLO el monto final de cada línea, a centavos.
//   · Lunes a sábado 8:00–17:00, 1 h de almuerzo que no se marca (8 h pagadas).
//   · Tardanza: 10 min de tolerancia; pasada, se descuentan TODOS los minutos
//     tarde × tarifa por hora (sin 1.25). Salida temprana y ausencia igual.
//   · Horas extra = minutos después de las 17:00 × tarifa × 1.25. Se pagan
//     solas según el reloj (nadie aprueba) y se revisan en el reporte.
//   · Domingo trabajado = $30 fijos, sin otra cuenta ese día. El FERIADO
//     (lib/feriados.ts) va igual: trabajado $30, no trabajado = libre pagado.
//   · Sin seguro social ni educativo.
//   · Un día del que el sistema no puede saber (falta una de las dos marcas)
//     no se descuenta: se marca «incompleto» para que la Dirección lo corrija.

export const round2 = (n: number) => Math.round(n * 100) / 100;

export const REGLAS = {
  entradaMin: 8 * 60, // 8:00
  salidaMin: 17 * 60, // 17:00
  toleranciaMin: 10,
  minutosPagadosDia: 8 * 60,
  recargoExtra: 1.25,
  pagoDomingo: 30,
  diasPagadosMes: 26,
} as const;

export interface Empleado {
  id: string;
  nombre: string;
  sueldo_mensual: number;
}

export const tarifaDia = (sueldoMensual: number) => sueldoMensual / REGLAS.diasPagadosMes;
export const tarifaHora = (sueldoMensual: number) => tarifaDia(sueldoMensual) / 8;

/** Las dos marcas de un día, en minutos de Panamá desde la medianoche (ya con la corrección encima). */
export interface MarcasDia {
  fecha: string; // 'YYYY-MM-DD'
  diaSemana: number; // 0 = domingo
  feriado?: string | null; // nombre del feriado, si lo es
  entradaMin: number | null;
  salidaMin: number | null;
}

export interface DiaEvaluado extends MarcasDia {
  tardanzaMin: number;
  salidaTempranaMin: number;
  ausenciaMin: number;
  extraMin: number;
  domingoTrabajado: boolean;
  feriadoTrabajado: boolean;
  /** Falta una de las dos marcas: no se descuenta nada más que la tardanza, pero hay que revisarlo. */
  incompleto: boolean;
}

/** `hoy` = fecha de Panamá. Hoy y los días que no llegaron no cuentan como ausencia. */
export function evaluarDia(d: MarcasDia, hoy: string): DiaEvaluado {
  const base: DiaEvaluado = {
    ...d,
    tardanzaMin: 0,
    salidaTempranaMin: 0,
    ausenciaMin: 0,
    extraMin: 0,
    domingoTrabajado: false,
    feriadoTrabajado: false,
    incompleto: false,
  };
  const marco = d.entradaMin !== null || d.salidaMin !== null;
  if (d.diaSemana === 0) return { ...base, domingoTrabajado: marco };
  if (d.feriado) return { ...base, feriadoTrabajado: marco };
  if (!marco) return { ...base, ausenciaMin: d.fecha < hoy ? REGLAS.minutosPagadosDia : 0 };

  const tarde = d.entradaMin !== null ? Math.max(0, d.entradaMin - REGLAS.entradaMin) : 0;
  const tardanzaMin = tarde > REGLAS.toleranciaMin ? tarde : 0;
  if (d.entradaMin === null || d.salidaMin === null) {
    // Hoy con solo la entrada todavía no está incompleto: la salida viene después.
    return { ...base, tardanzaMin, incompleto: d.fecha < hoy };
  }
  return {
    ...base,
    tardanzaMin,
    salidaTempranaMin: Math.max(0, REGLAS.salidaMin - d.salidaMin),
    extraMin: Math.max(0, d.salidaMin - REGLAS.salidaMin),
  };
}

export interface Desglose {
  salario: number;
  extras: number;
  extraMin: number;
  domingos: number; // domingos Y feriados trabajados, $30 c/u
  nDomingos: number;
  nFeriados: number;
  tardanzas: number; // negativo
  tardanzaMin: number;
  salidaTemprana: number; // negativo
  salidaTempranaMin: number;
  ausencias: number; // negativo
  ausenciaMin: number;
  diasIncompletos: string[];
  total: number;
}

const suma = (ds: DiaEvaluado[], k: keyof DiaEvaluado) => ds.reduce((s, d) => s + (d[k] as number), 0);

export function calcularQuincena(sueldoMensual: number, dias: DiaEvaluado[]): Desglose {
  const hora = tarifaHora(sueldoMensual);
  const porMin = hora / 60;
  const extraMin = suma(dias, 'extraMin');
  const tardanzaMin = suma(dias, 'tardanzaMin');
  const salidaTempranaMin = suma(dias, 'salidaTempranaMin');
  const ausenciaMin = suma(dias, 'ausenciaMin');
  const nDomingos = dias.filter((d) => d.domingoTrabajado).length;
  const nFeriados = dias.filter((d) => d.feriadoTrabajado).length;

  const lineas = {
    salario: round2(sueldoMensual / 2),
    extras: round2(extraMin * porMin * REGLAS.recargoExtra),
    domingos: round2((nDomingos + nFeriados) * REGLAS.pagoDomingo),
    tardanzas: -round2(tardanzaMin * porMin),
    salidaTemprana: -round2(salidaTempranaMin * porMin),
    ausencias: -round2(ausenciaMin * porMin),
  };
  return {
    ...lineas,
    extraMin,
    nDomingos,
    nFeriados,
    tardanzaMin,
    salidaTempranaMin,
    ausenciaMin,
    diasIncompletos: dias.filter((d) => d.incompleto).map((d) => d.fecha),
    total: totalizar(lineas),
  };
}

/** Total = suma de las líneas YA redondeadas (300 + 27 + 30 − 39 = 318). */
export function totalizar(l: { salario: number; extras: number; domingos: number; tardanzas: number; salidaTemprana: number; ausencias: number }): number {
  return round2(l.salario + l.extras + l.domingos + l.tardanzas + l.salidaTemprana + l.ausencias);
}

// ─── Quincenas ───

export interface Quincena {
  desde: string;
  hasta: string;
}

/** La quincena que contiene una fecha: 1–15 o 16–fin de mes. */
export function quincenaDe(fecha: string): Quincena {
  const [y, m, d] = fecha.split('-').map(Number);
  const mes = `${y}-${String(m).padStart(2, '0')}`;
  if (d <= 15) return { desde: `${mes}-01`, hasta: `${mes}-15` };
  const fin = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { desde: `${mes}-16`, hasta: `${mes}-${fin}` };
}

/** La quincena anterior a una (para el selector). */
export function quincenaAnterior(q: Quincena): Quincena {
  const [y, m, d] = q.desde.split('-').map(Number);
  if (d === 16) return quincenaDe(`${y}-${String(m).padStart(2, '0')}-01`);
  const prev = new Date(Date.UTC(y, m - 1, 0)); // último día del mes anterior
  return quincenaDe(prev.toISOString().slice(0, 10));
}

/** Todas las fechas de la quincena con su día de la semana. */
export function fechasDe(q: Quincena): { fecha: string; diaSemana: number }[] {
  const out: { fecha: string; diaSemana: number }[] = [];
  for (let t = Date.parse(`${q.desde}T00:00:00Z`); ; t += 86_400_000) {
    const dt = new Date(t);
    const fecha = dt.toISOString().slice(0, 10);
    if (fecha > q.hasta) break;
    out.push({ fecha, diaSemana: dt.getUTCDay() });
  }
  return out;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** '2026-11-01'…'2026-11-15' → '1 – 15 nov 2026'. */
export function rotuloQuincena(q: Quincena): string {
  const [y, m, d1] = q.desde.split('-').map(Number);
  const d2 = Number(q.hasta.slice(8));
  return `${d1} – ${d2} ${MESES[m - 1]} ${y}`;
}
