export const dynamic = 'force-dynamic';

// Planilla quincenal — SOLO Dirección (rol `admin`). GET arma la quincena con el
// cálculo puro de lib/planilla.ts (las horas extra se pagan solas según el
// reloj: nadie aprueba); POST recibe una acción: corregir o agregar una marca
// (la original no se borra), ficha del colaborador (sueldo, PIN con hash) y la
// ubicación de la bodega.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { requireRole, hashPin } from '@/lib/admin-auth';
import { panamaParts, panamaToDate } from '@/lib/timezone';
import { BUCKET_MARCACIONES, TIPOS_MARCA, horaEfectiva, type MarcacionRow } from '@/lib/marcacion';
import { calcularQuincena, evaluarDia, fechasDe, quincenaDe, type Empleado, type MarcasDia } from '@/lib/planilla';
import { RADIO_BODEGA_M } from '@/lib/geo';

const FIRMA = 'Dirección';
const FOTO_TTL_S = 60 * 60;

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'admin');
  if (!auth.authorized) return bad(auth.error, auth.status);
  if (!supabaseAdmin) return bad('Supabase not configured', 500);
  const db = supabaseAdmin;

  try {
    const hoy = panamaParts(new Date()).fecha;
    const desdeParam = request.nextUrl.searchParams.get('desde');
    const q = quincenaDe(desdeParam && /^\d{4}-\d{2}-\d{2}$/.test(desdeParam) ? desdeParam : hoy);

    const [{ data: empleados, error: e1 }, { data: marcas, error: e2 }, { data: ajustes }] = await Promise.all([
      db.from('pt_empleados').select('id, nombre, sueldo_mensual, activo, pin_hash').order('nombre'),
      db.from('pt_marcaciones').select('*').gte('fecha', q.desde).lte('fecha', q.hasta).order('marcada_en'),
      db.from('pt_marcacion_ajustes').select('lat, lng, radio_m, fijado_en').eq('id', 1).maybeSingle(),
    ]);
    if (e1 || e2) throw e1 ?? e2;

    const filas = marcas as MarcacionRow[];
    const paths = filas.map((m) => m.foto_path).filter((p): p is string => !!p);
    const fotos = new Map<string, string>();
    if (paths.length) {
      const { data: firmadas } = await db.storage.from(BUCKET_MARCACIONES).createSignedUrls(paths, FOTO_TTL_S);
      for (const f of firmadas ?? []) if (f.path && f.signedUrl) fotos.set(f.path, f.signedUrl);
    }

    const fechas = fechasDe(q);

    const colaboradores = (empleados ?? [])
      .filter((e) => e.activo)
      .map((e) => {
        const mias = filas.filter((m) => m.empleado_id === e.id);
        const dias = fechas.map(({ fecha, diaSemana }) => {
          const del = (tipo: string) => mias.find((m) => m.fecha === fecha && m.tipo === tipo) ?? null;
          const en = del('entrada');
          const sa = del('salida');
          const marcasDia: MarcasDia = {
            fecha,
            diaSemana,
            entradaMin: en ? panamaParts(horaEfectiva(en)).minutos : null,
            salidaMin: sa ? panamaParts(horaEfectiva(sa)).minutos : null,
          };
          const detalle = (m: MarcacionRow | null) =>
            m && {
              id: m.id,
              minutos: panamaParts(horaEfectiva(m)).minutos,
              originalMin: m.hora_corregida ? panamaParts(new Date(m.marcada_en)).minutos : null,
              corregidaPor: m.corregida_por,
              origen: m.origen,
              distancia_m: m.distancia_m,
              fotoUrl: m.foto_path ? fotos.get(m.foto_path) ?? null : null,
            };
          return { ...evaluarDia(marcasDia, hoy), entrada: detalle(en), salida: detalle(sa) };
        });
        const empleado: Empleado = { id: e.id, nombre: e.nombre, sueldo_mensual: Number(e.sueldo_mensual) };
        return { ...empleado, tienePin: !!e.pin_hash, dias, desglose: calcularQuincena(empleado.sueldo_mensual, dias) };
      });

    return NextResponse.json({ quincena: q, hoy, colaboradores, bodega: ajustes ?? null, radioPorDefecto: RADIO_BODEGA_M });
  } catch (e) {
    console.error('[planilla] GET', e);
    return bad('No se pudo armar la planilla', 500);
  }
}

export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'admin');
  if (!auth.authorized) return bad(auth.error, auth.status);
  if (!supabaseAdmin) return bad('Supabase not configured', 500);
  const db = supabaseAdmin;

  try {
    const body = await request.json();
    const ahora = new Date().toISOString();

    switch (body.action) {
      case 'corregir': {
        // La corrección va ENCIMA: marcada_en no se toca, se escribe hora_corregida con firma.
        const { marcacionId, minutos } = body;
        if (typeof marcacionId !== 'string' || !Number.isInteger(minutos) || minutos < 0 || minutos >= 1440) return bad('Hora no válida');
        const { data: m } = await db.from('pt_marcaciones').select('fecha').eq('id', marcacionId).maybeSingle();
        if (!m) return bad('No existe esa marca', 404);
        const { error } = await db
          .from('pt_marcaciones')
          .update({ hora_corregida: panamaToDate(m.fecha, minutos).toISOString(), corregida_por: FIRMA, corregida_en: ahora })
          .eq('id', marcacionId);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      case 'agregar': {
        // Marca que faltó (se le olvidó marcar): la pone la Dirección, firmada, sin foto ni ubicación.
        const { empleadoId, fecha, tipo, minutos } = body;
        if (typeof empleadoId !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha ?? '') || !TIPOS_MARCA.includes(tipo)) return bad('Datos incompletos');
        if (!Number.isInteger(minutos) || minutos < 0 || minutos >= 1440) return bad('Hora no válida');
        if (fecha > panamaParts(new Date()).fecha) return bad('No se puede marcar un día que no llegó');
        const { error } = await db.from('pt_marcaciones').insert({
          empleado_id: empleadoId,
          fecha,
          tipo,
          marcada_en: panamaToDate(fecha, minutos).toISOString(),
          origen: 'direccion',
          corregida_por: FIRMA,
          corregida_en: ahora,
        });
        if (error) {
          if ((error as { code?: string }).code === '23505') return bad('Ese día ya tiene esa marca; corrígela en vez de agregarla', 409);
          throw error;
        }
        return NextResponse.json({ ok: true });
      }

      case 'empleado': {
        // Ficha: nombre, sueldo, PIN (se guarda con hash; nunca se devuelve ni se loguea), activo.
        const { id, nombre, sueldo_mensual, pin, activo } = body;
        const fila: Record<string, unknown> = {};
        if (nombre !== undefined) {
          if (typeof nombre !== 'string' || !nombre.trim()) return bad('Falta el nombre');
          fila.nombre = nombre.trim();
        }
        if (sueldo_mensual !== undefined) {
          const s = Number(sueldo_mensual);
          if (!Number.isFinite(s) || s < 0 || s > 20000) return bad('Sueldo no válido');
          fila.sueldo_mensual = s;
        }
        if (pin !== undefined && pin !== '') {
          if (typeof pin !== 'string' || !/^\d{4,6}$/.test(pin)) return bad('El PIN son 4 a 6 números');
          fila.pin_hash = hashPin(pin);
        }
        if (typeof activo === 'boolean') fila.activo = activo;
        if (!Object.keys(fila).length) return bad('Nada que guardar');

        if (typeof id === 'string') {
          const { error } = await db.from('pt_empleados').update(fila).eq('id', id);
          if (error) throw error;
          return NextResponse.json({ ok: true, id });
        }
        if (!fila.nombre || fila.sueldo_mensual === undefined) return bad('Nombre y sueldo son obligatorios');
        const { data, error } = await db.from('pt_empleados').insert(fila).select('id').single();
        if (error) throw error;
        return NextResponse.json({ ok: true, id: data.id });
      }

      case 'bodega': {
        // «Usar mi ubicación actual», parada en la bodega. Una sola fila (id = 1).
        const lat = Number(body.lat);
        const lng = Number(body.lng);
        const radio_m = body.radio_m === undefined ? RADIO_BODEGA_M : Number(body.radio_m);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return bad('Ubicación no válida');
        if (!Number.isInteger(radio_m) || radio_m < 20 || radio_m > 2000) return bad('El radio va de 20 a 2000 m');
        const { error } = await db.from('pt_marcacion_ajustes').upsert({ id: 1, lat, lng, radio_m, fijado_en: ahora }, { onConflict: 'id' });
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      default:
        return bad('Acción desconocida');
    }
  } catch (e) {
    console.error('[planilla] POST', e);
    return bad('No se pudo guardar', 500);
  }
}
