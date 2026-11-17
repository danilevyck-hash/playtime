// Planilla quincenal — MOCKUP con datos fijos (sin base de datos).
// Reglas de la foto de Daniel: día = sueldo ÷ 26, hora = día ÷ 8 (tarifas copiadas de su tabla), extra = hora × horas × 1.25, domingo trabajado = $30 fijos.
// Supuestos mientras Daniel no conteste: ausencia = horas × tarifa (sin 1.25),
// sin seguro social ni educativo, extras solo si las aprueba la admin.

export const round2 = (n: number) => Math.round(n * 100) / 100;

export interface Colaborador {
  codigo: string;
  nombre: string;
  sueldoMensual: number;
  dia: number; // de la foto de Daniel
  hora: number; // de la foto de Daniel
}

export const COLABORADORES: Colaborador[] = [
  { codigo: 'joseph', nombre: 'Joseph Alberto Alain Adames', sueldoMensual: 600, dia: 23.09, hora: 2.88 },
  { codigo: 'cristhian', nombre: 'Cristhian Geovanny Hondoy Diaz', sueldoMensual: 700, dia: 26.94, hora: 3.36 },
];

// Tarifas tal cual la foto (700 ÷ 26 da 26.92, la foto dice 26.94: se usa la foto).
export const tarifaDia = (c: Colaborador) => c.dia;
export const tarifaHora = (c: Colaborador) => c.hora;

export interface Quincena {
  horasExtra: number;
  extraAprobada: boolean;
  horasAusente: number;
  domingos: number;
}

export interface Desglose {
  salario: number;
  extras: number;
  ausencias: number; // negativo
  domingos: number;
  total: number;
}

export const PAGO_DOMINGO = 30;
export const RECARGO_EXTRA = 1.25;

export function calcularQuincena(c: Colaborador, q: Quincena): Desglose {
  const hora = tarifaHora(c);
  const salario = round2(c.sueldoMensual / 2);
  const extras = q.extraAprobada ? round2(hora * q.horasExtra * RECARGO_EXTRA) : 0;
  const ausencias = q.horasAusente ? -round2(hora * q.horasAusente) : 0;
  const domingos = round2(q.domingos * PAGO_DOMINGO);
  return { salario, extras, ausencias, domingos, total: round2(salario + extras + ausencias + domingos) };
}

// Horas de EJEMPLO para la quincena 1–15 nov 2026.
export const QUINCENA_EJEMPLO = { desde: '2026-11-01', hasta: '2026-11-15', rotulo: '1 – 15 nov 2026' };

export const HORAS_EJEMPLO: Record<string, Quincena> = {
  joseph: { horasExtra: 7.5, extraAprobada: true, horasAusente: 13.54, domingos: 1 },
  cristhian: { horasExtra: 4, extraAprobada: false, horasAusente: 0, domingos: 0 },
};

// El ejemplo de la foto de Daniel, tal cual lo escribió (la suma da 318; él anotó 315).
export const EJEMPLO_FOTO = { salario: 300, extras: 27, ausencias: -39, domingos: 30, totalEscrito: 315 };
