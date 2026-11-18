export const dynamic = 'force-dynamic';

// Marcación del colaborador: 2 marcas al día (entrada, salida) con foto y
// ubicación. La HORA la pone el servidor; la DISTANCIA a la bodega la calcula
// el servidor contra pt_marcacion_ajustes. Solo la ENTRADA exige estar dentro
// del radio (Daniel, 18-nov-2026): la salida se marca desde donde esté, y
// guarda igual ubicación y distancia para que la Dirección las vea.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { requireRole } from '@/lib/admin-auth';
import { distanciaM, rotuloDistancia } from '@/lib/geo';
import { panamaParts } from '@/lib/timezone';
import { BUCKET_MARCACIONES, TIPOS_MARCA as TIPOS, type TipoMarca as Tipo, horaEfectiva, siguienteMarca as siguiente } from '@/lib/marcacion';

const MAX_FOTO = 2 * 1024 * 1024;

async function marcasDeHoy(empleadoId: string, fecha: string) {
  const { data, error } = await supabaseAdmin!
    .from('pt_marcaciones')
    .select('id, tipo, marcada_en, hora_corregida')
    .eq('empleado_id', empleadoId)
    .eq('fecha', fecha);
  if (error) throw error;
  return (data ?? []).map((m) => ({ tipo: m.tipo as Tipo, minutos: panamaParts(horaEfectiva(m)).minutos }));
}

export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'colaborador');
  if (!auth.authorized || !auth.empleadoId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  try {
    const { fecha } = panamaParts(new Date());
    const [{ data: emp }, marcas, { data: ajustes }] = await Promise.all([
      supabaseAdmin.from('pt_empleados').select('nombre, activo').eq('id', auth.empleadoId).maybeSingle(),
      marcasDeHoy(auth.empleadoId, fecha),
      supabaseAdmin.from('pt_marcacion_ajustes').select('id').eq('id', 1).maybeSingle(),
    ]);
    if (!emp?.activo) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ nombre: emp.nombre, fecha, marcas, siguiente: siguiente(marcas), bodegaFijada: !!ajustes });
  } catch (e) {
    console.error('[marcar] GET', e);
    return NextResponse.json({ error: 'No se pudo leer' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'colaborador');
  if (!auth.authorized || !auth.empleadoId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });

  try {
    const form = await request.formData();
    const tipo = String(form.get('tipo') ?? '') as Tipo;
    const lat = Number(form.get('lat'));
    const lng = Number(form.get('lng'));
    const precision = Number(form.get('precision') || 0);
    const foto = form.get('foto');
    if (!TIPOS.includes(tipo)) return NextResponse.json({ error: 'Marca no válida' }, { status: 400 });
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return NextResponse.json({ error: 'Sin ubicación. Permite la ubicación y vuelve a intentar.' }, { status: 400 });
    }
    if (!(foto instanceof Blob) || foto.size === 0) return NextResponse.json({ error: 'Falta la selfie.' }, { status: 400 });
    if (foto.size > MAX_FOTO) return NextResponse.json({ error: 'La foto es muy grande.' }, { status: 400 });
    const bytes = Buffer.from(await foto.arrayBuffer());
    if (!(bytes[0] === 0xff && bytes[1] === 0xd8)) return NextResponse.json({ error: 'La selfie no es una foto válida.' }, { status: 400 });

    const { data: ajustes } = await supabaseAdmin.from('pt_marcacion_ajustes').select('lat, lng, radio_m').eq('id', 1).maybeSingle();
    if (!ajustes) return NextResponse.json({ error: 'La Dirección todavía no fijó la ubicación de la bodega.' }, { status: 409 });

    const distancia = distanciaM({ lat, lng }, ajustes);
    if (tipo === 'entrada' && distancia > ajustes.radio_m) {
      return NextResponse.json(
        { error: `Estás a ${rotuloDistancia(distancia)} de la bodega. Acércate para marcar.`, distancia_m: Math.round(distancia) },
        { status: 422 },
      );
    }

    const ahora = new Date();
    const { fecha, minutos } = panamaParts(ahora);
    const marcas = await marcasDeHoy(auth.empleadoId, fecha);
    if (siguiente(marcas) !== tipo) {
      return NextResponse.json({ error: tipo === 'salida' ? 'Primero marca la entrada.' : 'Ya marcaste hoy.' }, { status: 409 });
    }

    const fotoPath = `${auth.empleadoId}/${fecha}/${tipo}.jpg`;
    const { error: upErr } = await supabaseAdmin.storage
      .from(BUCKET_MARCACIONES)
      .upload(fotoPath, bytes, { contentType: 'image/jpeg', upsert: true });
    if (upErr) {
      console.error('[marcar] foto', upErr);
      return NextResponse.json({ error: 'No se pudo guardar la selfie. Intenta de nuevo.' }, { status: 500 });
    }

    const { error } = await supabaseAdmin.from('pt_marcaciones').insert({
      empleado_id: auth.empleadoId,
      fecha,
      tipo,
      marcada_en: ahora.toISOString(),
      lat,
      lng,
      precision_m: Number.isFinite(precision) ? Math.round(precision) : null,
      distancia_m: Math.round(distancia),
      foto_path: fotoPath,
      origen: 'telefono',
    });
    if (error) {
      // 23505 = ya existe esa marca hoy (dos toques seguidos)
      if ((error as { code?: string }).code === '23505') return NextResponse.json({ error: 'Ya marcaste.' }, { status: 409 });
      console.error('[marcar] insert', error);
      return NextResponse.json({ error: 'No se pudo guardar la marca.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, tipo, minutos, distancia_m: Math.round(distancia) });
  } catch (e) {
    console.error('[marcar] POST', e);
    return NextResponse.json({ error: 'No se pudo marcar.' }, { status: 500 });
  }
}
