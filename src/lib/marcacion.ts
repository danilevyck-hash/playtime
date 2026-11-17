// Lo que comparten /api/marcar y /api/planilla (puro: sin base).
export const BUCKET_MARCACIONES = 'marcaciones';
export const TIPOS_MARCA = ['entrada', 'salida'] as const;
export type TipoMarca = (typeof TIPOS_MARCA)[number];

export interface MarcacionRow {
  id: string;
  empleado_id: string;
  fecha: string;
  tipo: TipoMarca;
  marcada_en: string;
  hora_corregida: string | null;
  corregida_por: string | null;
  corregida_en: string | null;
  distancia_m: number | null;
  foto_path: string | null;
  origen: 'telefono' | 'direccion';
}

/** La hora que vale: la corrección de la Dirección va encima; la original nunca se borra. */
export function horaEfectiva(m: { marcada_en: string; hora_corregida: string | null }): Date {
  return new Date(m.hora_corregida ?? m.marcada_en);
}

export function siguienteMarca(marcas: { tipo: TipoMarca }[]): TipoMarca | null {
  if (!marcas.some((m) => m.tipo === 'entrada')) return 'entrada';
  if (!marcas.some((m) => m.tipo === 'salida')) return 'salida';
  return null;
}

/** 490 → '8:10 a. m.' */
export function horaRotulo(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`;
}
