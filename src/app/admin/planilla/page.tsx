'use client';

// Planilla quincenal — SOLO Dirección. Lee /api/planilla (el cálculo es del
// servidor; las horas extra se pagan solas y se revisan aquí), corrige o agrega
// marcas (la original no se borra), baja el comprobante y el reporte,
// administra las fichas y fija la ubicación de la bodega.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatCurrency } from '@/lib/format';
import { quincenaAnterior, quincenaDe, rotuloQuincena, tarifaHora, type DiaEvaluado, type Desglose, type Quincena } from '@/lib/planilla';
import { horaRotulo, type TipoMarca } from '@/lib/marcacion';
import { generarComprobantePDF, generarReportePDF } from '@/lib/pdf-planilla';
import { leerSesion } from '@/lib/sesion-local';

interface Marca {
  id: string;
  minutos: number;
  originalMin: number | null;
  corregidaPor: string | null;
  origen: 'telefono' | 'direccion';
  distancia_m: number | null;
  fotoUrl: string | null;
}
interface Dia extends DiaEvaluado {
  entrada: Marca | null;
  salida: Marca | null;
}
interface Colaborador {
  id: string;
  nombre: string;
  sueldo_mensual: number;
  tienePin: boolean;
  dias: Dia[];
  desglose: Desglose;
}
interface Planilla {
  quincena: Quincena;
  hoy: string;
  colaboradores: Colaborador[];
  bodega: { lat: number; lng: number; radio_m: number; fijado_en: string } | null;
  radioPorDefecto: number;
}

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const horas = (min: number) => `${(min / 60).toLocaleString('es-PA', { maximumFractionDigits: 2 })} h`;
const neg = (n: number) => (n ? formatCurrency(n) : '—');
const aMinutos = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return Number.isInteger(h) && Number.isInteger(m) ? h * 60 + m : null;
};
const aHHMM = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export default function PlanillaPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [desde, setDesde] = useState<string | null>(null);
  const [data, setData] = useState<Planilla | null>(null);
  const [error, setError] = useState('');
  const [abierto, setAbierto] = useState<string | null>(null);
  const [aviso, setAviso] = useState('');

  useEffect(() => {
    const s = leerSesion();
    if (!s || s.role !== 'admin') return router.replace('/admin');
    setToken(s.token);
  }, [router]);

  const cargar = useCallback(async () => {
    if (!token) return;
    const res = await fetch(`/api/planilla${desde ? `?desde=${desde}` : ''}`, { headers: { 'x-admin-token': token } });
    if (res.status === 401 || res.status === 403) return router.replace('/admin');
    if (!res.ok) return setError('No se pudo cargar la planilla.');
    setData(await res.json());
    setError('');
  }, [token, desde, router]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const accion = async (body: Record<string, unknown>): Promise<boolean> => {
    const res = await fetch('/api/planilla', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-token': token }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setAviso(j.error || 'No se pudo guardar');
      setTimeout(() => setAviso(''), 8000);
      return false;
    }
    await cargar();
    return true;
  };

  if (!data) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6 font-body">
        <Link href="/admin" className="text-sm text-purple font-semibold">‹ Admin</Link>
        <p className="mt-4 text-sm text-gray-500">{error || 'Cargando…'}</p>
      </div>
    );
  }

  const q = data.quincena;
  const siguienteQ = quincenaDe(new Date(Date.parse(`${q.hasta}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10));
  const haySiguiente = siguienteQ.desde <= data.hoy;
  const total = Math.round(data.colaboradores.reduce((s, c) => s + c.desglose.total, 0) * 100) / 100;
  const rotulo = rotuloQuincena(q);

  const comprobante = async (c: Colaborador) => {
    const doc = await generarComprobantePDF(c, rotulo, '/logo.png');
    doc.save(`Comprobante-${c.nombre.split(' ')[0]}-${q.desde}.pdf`);
  };
  const reporte = async () => {
    const doc = await generarReportePDF(data.colaboradores, rotulo, '/logo.png');
    doc.save(`Planilla-${q.desde}.pdf`);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 font-body">
      <Link href="/admin" className="text-sm text-purple font-semibold">‹ Admin</Link>
      <div className="flex items-end justify-between mt-2 mb-5 gap-3 flex-wrap">
        <div>
          <h1 className="font-heading text-2xl font-bold text-purple">Planilla</h1>
          <p className="text-sm text-gray-500">Bodega · lunes a sábado, 8:00 a. m. – 5:00 p. m.</p>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-white border border-gray-200 px-2 py-1 text-sm font-semibold text-gray-700">
          <button onClick={() => setDesde(quincenaAnterior(q).desde)} className="px-2 py-0.5 rounded-full hover:bg-gray-100" aria-label="Quincena anterior">‹</button>
          <span className="tabular-nums">Quincena {rotulo}</span>
          <button onClick={() => setDesde(siguienteQ.desde)} disabled={!haySiguiente} className="px-2 py-0.5 rounded-full hover:bg-gray-100 disabled:opacity-30" aria-label="Quincena siguiente">›</button>
        </div>
      </div>

      {aviso && <div className="mb-4 rounded-xl bg-orange/15 px-4 py-3 text-sm font-semibold text-orange-text">{aviso}</div>}

      <div className="space-y-3">
        {data.colaboradores.map((c) => {
          const d = c.desglose;
          const abiertoEste = abierto === c.id;
          return (
            <div key={c.id} className="rounded-2xl bg-white border border-gray-100 p-4 tabular-nums">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-gray-800 leading-tight">{c.nombre}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {formatCurrency(c.sueldo_mensual)} al mes · {formatCurrency(tarifaHora(c.sueldo_mensual))} la hora
                    {!c.tienePin && <span className="text-orange-text"> · sin PIN</span>}
                  </p>
                </div>
                <p className="font-heading font-bold text-purple text-xl">{formatCurrency(d.total)}</p>
              </div>

              <dl className="mt-3 grid sm:grid-cols-2 gap-x-8 gap-y-1.5 text-sm">
                <div className="flex justify-between"><dt className="text-gray-500">Salario de la quincena</dt><dd>{formatCurrency(d.salario)}</dd></div>
                <div className="flex justify-between"><dt className="text-gray-500">Horas extra{d.extraMin ? ` · ${horas(d.extraMin)}` : ''}</dt><dd className={d.extras ? '' : 'text-gray-400'}>{neg(d.extras)}</dd></div>
                <div className="flex justify-between"><dt className="text-gray-500">Domingos y feriados trabajados{d.nDomingos + d.nFeriados ? ` · ${d.nDomingos + d.nFeriados}` : ''}</dt><dd className={d.domingos ? '' : 'text-gray-400'}>{neg(d.domingos)}</dd></div>
                <div className="flex justify-between"><dt className="text-gray-500">Tardanzas{d.tardanzaMin ? ` · ${d.tardanzaMin} min` : ''}</dt><dd className={d.tardanzas ? 'text-orange-text' : 'text-gray-400'}>{neg(d.tardanzas)}</dd></div>
                <div className="flex justify-between"><dt className="text-gray-500">Salida temprana{d.salidaTempranaMin ? ` · ${d.salidaTempranaMin} min` : ''}</dt><dd className={d.salidaTemprana ? 'text-orange-text' : 'text-gray-400'}>{neg(d.salidaTemprana)}</dd></div>
                <div className="flex justify-between"><dt className="text-gray-500">Ausencias{d.ausenciaMin ? ` · ${horas(d.ausenciaMin)}` : ''}</dt><dd className={d.ausencias ? 'text-orange-text' : 'text-gray-400'}>{neg(d.ausencias)}</dd></div>
              </dl>

              {d.diasIncompletos.length > 0 && (
                <p className="mt-3 rounded-xl bg-yellow/25 px-3 py-2 text-xs text-gray-700">
                  {d.diasIncompletos.length === 1 ? 'Un día tiene' : `${d.diasIncompletos.length} días tienen`} una sola marca y no se descuentan: revísalos abajo.
                </p>
              )}

              <div className="mt-3 flex gap-2">
                <button onClick={() => comprobante(c)} className="flex-1 rounded-xl bg-purple/10 py-2 text-sm font-semibold text-purple">Comprobante PDF</button>
                <button onClick={() => setAbierto(abiertoEste ? null : c.id)} className="flex-1 rounded-xl border border-gray-200 py-2 text-sm font-semibold text-gray-700">
                  {abiertoEste ? 'Ocultar días' : 'Ver días'}
                </button>
              </div>

              {abiertoEste && <Dias c={c} hoy={data.hoy} accion={accion} />}
            </div>
          );
        })}

        <div className="flex justify-between items-center rounded-2xl bg-white border border-gray-100 px-4 py-3">
          <span className="font-semibold text-gray-700">Total de la quincena</span>
          <div className="flex items-center gap-3">
            <button onClick={reporte} className="text-xs font-semibold text-purple hover:underline">Reporte PDF</button>
            <span className="font-heading font-bold text-purple text-lg">{formatCurrency(total)}</span>
          </div>
        </div>
      </div>

      <Fichas colaboradores={data.colaboradores} accion={accion} />
      <Bodega bodega={data.bodega} radioPorDefecto={data.radioPorDefecto} accion={accion} />
    </div>
  );
}

// ─── Los días de la quincena de un colaborador: ver, corregir, agregar ───
function Dias({ c, hoy, accion }: { c: Colaborador; hoy: string; accion: (b: Record<string, unknown>) => Promise<boolean> }) {
  const [editando, setEditando] = useState<{ dia: Dia; tipo: TipoMarca } | null>(null);
  const [hora, setHora] = useState('');

  const abrir = (dia: Dia, tipo: TipoMarca) => {
    const m = dia[tipo];
    setHora(m ? aHHMM(m.minutos) : tipo === 'entrada' ? '08:00' : '17:00');
    setEditando({ dia, tipo });
  };
  const guardar = async () => {
    if (!editando) return;
    const minutos = aMinutos(hora);
    if (minutos === null) return;
    const m = editando.dia[editando.tipo];
    const ok = await accion(
      m ? { action: 'corregir', marcacionId: m.id, minutos } : { action: 'agregar', empleadoId: c.id, fecha: editando.dia.fecha, tipo: editando.tipo, minutos },
    );
    if (ok) setEditando(null);
  };

  const Celda = ({ dia, tipo }: { dia: Dia; tipo: TipoMarca }) => {
    const m = dia[tipo];
    const futuro = dia.fecha > hoy;
    return (
      <button onClick={() => !futuro && abrir(dia, tipo)} disabled={futuro} className="text-left disabled:opacity-40" title={m?.corregidaPor ? `Corregida por ${m.corregidaPor}` : undefined}>
        {m ? (
          <span className="flex items-center gap-1.5">
            {m.fotoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.fotoUrl} alt="" className="w-7 h-7 rounded-full object-cover border border-gray-200" />
            )}
            <span>
              {horaRotulo(m.minutos)}
              {m.originalMin !== null && <span className="block text-[11px] text-gray-400 line-through">{horaRotulo(m.originalMin)}</span>}
              {m.origen === 'direccion' && <span className="block text-[11px] text-gray-400">puesta por la Dirección</span>}
            </span>
          </span>
        ) : (
          <span className="text-gray-400">{futuro ? '—' : '+ Agregar'}</span>
        )}
      </button>
    );
  };

  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500">
            <th className="py-1 font-semibold">Día</th>
            <th className="py-1 font-semibold">Entrada</th>
            <th className="py-1 font-semibold">Salida</th>
            <th className="py-1 font-semibold text-right">Novedad</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {c.dias.map((dia) => {
            const vacio = !dia.entrada && !dia.salida;
            const esDomingo = dia.diaSemana === 0;
            if (esDomingo && vacio) return null;
            const novedades: string[] = [];
            if (dia.domingoTrabajado) novedades.push('Domingo · $30');
            if (dia.feriado) novedades.push(dia.feriadoTrabajado ? `Feriado trabajado · $30` : 'Feriado · libre pagado');
            if (dia.tardanzaMin) novedades.push(`Tarde ${dia.tardanzaMin} min`);
            if (dia.salidaTempranaMin) novedades.push(`Salió ${dia.salidaTempranaMin} min antes`);
            if (dia.extraMin) novedades.push(`Extra ${horas(dia.extraMin)}`);
            if (dia.ausenciaMin) novedades.push('Ausencia');
            if (dia.incompleto) novedades.push(dia.entrada ? 'Falta la salida' : 'Falta la entrada');
            return (
              <tr key={dia.fecha} className={dia.incompleto ? 'bg-yellow/15' : ''}>
                <td className="py-1.5 text-gray-700 whitespace-nowrap">
                  {DIAS[dia.diaSemana]} {Number(dia.fecha.slice(8))}
                  {dia.feriado && <span className="block text-[11px] text-purple">{dia.feriado}</span>}
                </td>
                <td className="py-1.5"><Celda dia={dia} tipo="entrada" /></td>
                <td className="py-1.5"><Celda dia={dia} tipo="salida" /></td>
                <td className={`py-1.5 text-right text-xs ${dia.ausenciaMin || dia.incompleto ? 'text-orange-text' : 'text-gray-500'}`}>{novedades.join(' · ') || ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {editando && (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-cream px-3 py-2 text-sm flex-wrap">
          <span className="text-gray-700">
            {editando.dia[editando.tipo] ? 'Corregir' : 'Agregar'} {editando.tipo} del {DIAS[editando.dia.diaSemana]} {Number(editando.dia.fecha.slice(8))}
          </span>
          <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className="rounded-lg border border-gray-200 px-2 py-1" />
          <button onClick={guardar} className="rounded-lg bg-purple px-3 py-1 text-xs font-semibold text-white">Guardar</button>
          <button onClick={() => setEditando(null)} className="text-xs text-gray-500">Cancelar</button>
          <span className="w-full text-[11px] text-gray-500">La marca original no se borra: la corrección queda encima, firmada por la Dirección.</span>
        </div>
      )}
    </div>
  );
}

// ─── Fichas: sueldo y PIN ───
function Fichas({ colaboradores, accion }: { colaboradores: Colaborador[]; accion: (b: Record<string, unknown>) => Promise<boolean> }) {
  const [nuevo, setNuevo] = useState(false);
  const [form, setForm] = useState({ nombre: '', sueldo: '', pin: '' });
  const [pins, setPins] = useState<Record<string, string>>({});
  const [sueldos, setSueldos] = useState<Record<string, string>>({});

  return (
    <section className="mt-8 rounded-2xl bg-white border border-gray-100 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-heading font-bold text-purple">Colaboradores</h2>
        <button onClick={() => setNuevo((v) => !v)} className="text-xs font-semibold text-purple">{nuevo ? 'Cancelar' : '+ Agregar colaborador'}</button>
      </div>
      <ul className="mt-3 divide-y divide-gray-100 text-sm">
        {colaboradores.map((c) => (
          <li key={c.id} className="py-3 grid sm:grid-cols-[1fr_auto_auto] gap-2 items-center">
            <span className="font-semibold text-gray-800">{c.nombre}</span>
            <label className="flex items-center gap-1 text-gray-600">
              Sueldo $
              <input
                type="number"
                min={0}
                step="0.01"
                defaultValue={c.sueldo_mensual}
                onChange={(e) => setSueldos((s) => ({ ...s, [c.id]: e.target.value }))}
                onBlur={() => sueldos[c.id] !== undefined && Number(sueldos[c.id]) !== c.sueldo_mensual && accion({ action: 'empleado', id: c.id, sueldo_mensual: Number(sueldos[c.id]) })}
                className="w-24 rounded-lg border border-gray-200 px-2 py-1 tabular-nums"
              />
              al mes
            </label>
            <span className="flex items-center gap-1">
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                placeholder={c.tienePin ? 'Nuevo PIN' : 'PIN'}
                value={pins[c.id] ?? ''}
                onChange={(e) => setPins((p) => ({ ...p, [c.id]: e.target.value.replace(/\D/g, '') }))}
                className="w-24 rounded-lg border border-gray-200 px-2 py-1"
                aria-label={`PIN de ${c.nombre}`}
              />
              <button
                disabled={(pins[c.id] ?? '').length < 4}
                onClick={async () => (await accion({ action: 'empleado', id: c.id, pin: pins[c.id] })) && setPins((p) => ({ ...p, [c.id]: '' }))}
                className="rounded-lg bg-purple px-2.5 py-1 text-xs font-semibold text-white disabled:bg-gray-300"
              >
                Guardar PIN
              </button>
            </span>
          </li>
        ))}
      </ul>
      {nuevo && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (await accion({ action: 'empleado', nombre: form.nombre, sueldo_mensual: Number(form.sueldo), pin: form.pin || undefined })) {
              setForm({ nombre: '', sueldo: '', pin: '' });
              setNuevo(false);
            }
          }}
          className="mt-3 grid sm:grid-cols-[1fr_auto_auto_auto] gap-2 text-sm"
        >
          <input required placeholder="Nombre completo" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className="rounded-lg border border-gray-200 px-2 py-1" />
          <input required type="number" min={0} step="0.01" placeholder="Sueldo al mes" value={form.sueldo} onChange={(e) => setForm({ ...form, sueldo: e.target.value })} className="w-32 rounded-lg border border-gray-200 px-2 py-1" />
          <input type="password" inputMode="numeric" maxLength={6} placeholder="PIN (4–6)" value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, '') })} className="w-28 rounded-lg border border-gray-200 px-2 py-1" />
          <button type="submit" className="rounded-lg bg-purple px-3 py-1 font-semibold text-white">Guardar colaborador</button>
        </form>
      )}
      <p className="mt-2 text-[11px] text-gray-500">El PIN se guarda cifrado y no se puede ver después; si se olvida, escribe uno nuevo.</p>
    </section>
  );
}

// ─── Ubicación de la bodega ───
function Bodega({ bodega, radioPorDefecto, accion }: { bodega: Planilla['bodega']; radioPorDefecto: number; accion: (b: Record<string, unknown>) => Promise<boolean> }) {
  const [radio, setRadio] = useState(String(bodega?.radio_m ?? radioPorDefecto));
  const [buscando, setBuscando] = useState(false);
  const [err, setErr] = useState('');

  const fijar = () => {
    if (!navigator.geolocation) return setErr('Este dispositivo no da la ubicación.');
    setBuscando(true);
    setErr('');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await accion({ action: 'bodega', lat: pos.coords.latitude, lng: pos.coords.longitude, radio_m: Number(radio) });
        setBuscando(false);
      },
      () => {
        setErr('Permite la ubicación para fijar la bodega.');
        setBuscando(false);
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };

  return (
    <section className="mt-6 rounded-2xl bg-white border border-gray-100 p-4">
      <h2 className="font-heading font-bold text-purple">Ajustes de marcación</h2>
      <div className="mt-3 flex items-center justify-between gap-3 flex-wrap text-sm">
        <div>
          <p className="font-semibold text-gray-800">Ubicación de la bodega</p>
          <p className="text-gray-500">
            {bodega ? `Fijada · se marca a menos de ${bodega.radio_m} m` : 'Sin fijar · nadie puede marcar hasta fijarla'}
          </p>
          <label className="mt-1 flex items-center gap-1 text-gray-600">
            Radio
            <input type="number" min={20} max={2000} value={radio} onChange={(e) => setRadio(e.target.value)} className="w-20 rounded-lg border border-gray-200 px-2 py-0.5 tabular-nums" />
            m
            {bodega && Number(radio) !== bodega.radio_m && (
              <button onClick={() => accion({ action: 'bodega', lat: bodega.lat, lng: bodega.lng, radio_m: Number(radio) })} className="ml-1 text-xs font-semibold text-purple">Guardar radio</button>
            )}
          </label>
        </div>
        <button onClick={fijar} disabled={buscando} className="rounded-xl bg-purple px-4 py-2 font-heading font-semibold text-white active:scale-[0.97] disabled:bg-gray-300">
          {buscando ? 'Buscando…' : 'Usar mi ubicación actual'}
        </button>
      </div>
      {err && <p className="mt-2 text-sm text-orange-text">{err}</p>}
      <p className="mt-2 text-[11px] text-gray-500">Toca «Usar mi ubicación actual» parada en la bodega.</p>
    </section>
  );
}
