// Feriados nacionales de Panamá — UN solo archivo, editable a mano.
// Regla (Daniel, 18-nov-2026): feriado TRABAJADO se paga como el domingo, $30 fijo;
// feriado NO trabajado = día libre pagado (no es ausencia, no descuenta).
// Los móviles salen de la Pascua: Carnaval = lunes y martes 48/47 días antes
// del Domingo de Pascua; Viernes Santo = 2 días antes.
//   2026: Pascua 5-abr → Carnaval 16 y 17-feb, Viernes Santo 3-abr.
//   2027: Pascua 28-mar → Carnaval 8 y 9-feb, Viernes Santo 26-mar.
// ⚠️ No se mueve al lunes el feriado que cae domingo (aquí el domingo ya se paga aparte).
export const FERIADOS: Record<string, string> = {
  // 2026
  '2026-01-01': 'Año Nuevo',
  '2026-01-09': 'Día de los Mártires',
  '2026-02-16': 'Lunes de Carnaval',
  '2026-02-17': 'Martes de Carnaval',
  '2026-04-03': 'Viernes Santo',
  '2026-05-01': 'Día del Trabajo',
  '2026-11-03': 'Separación de Panamá de Colombia',
  '2026-11-04': 'Día de los Símbolos Patrios',
  '2026-11-05': 'Día de Colón',
  '2026-11-10': 'Primer Grito de Independencia',
  '2026-11-28': 'Independencia de Panamá de España',
  '2026-12-08': 'Día de la Madre',
  '2026-12-20': 'Día de Duelo Nacional',
  '2026-12-25': 'Navidad',
  // 2027
  '2027-01-01': 'Año Nuevo',
  '2027-01-09': 'Día de los Mártires',
  '2027-02-08': 'Lunes de Carnaval',
  '2027-02-09': 'Martes de Carnaval',
  '2027-03-26': 'Viernes Santo',
  '2027-05-01': 'Día del Trabajo',
  '2027-11-03': 'Separación de Panamá de Colombia',
  '2027-11-04': 'Día de los Símbolos Patrios',
  '2027-11-05': 'Día de Colón',
  '2027-11-10': 'Primer Grito de Independencia',
  '2027-11-28': 'Independencia de Panamá de España',
  '2027-12-08': 'Día de la Madre',
  '2027-12-20': 'Día de Duelo Nacional',
  '2027-12-25': 'Navidad',
};

/** El nombre del feriado de esa fecha ('YYYY-MM-DD'), o null. */
export const feriadoDe = (fecha: string): string | null => FERIADOS[fecha] ?? null;
