'use client';

// Marcación del colaborador (teléfono). Entra con su PIN personal; cada marca
// lleva selfie de la cámara frontal + ubicación. El servidor pone la hora y
// decide si está en la bodega (radio configurable). Dos marcas al día.
import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { horaRotulo, type TipoMarca } from '@/lib/marcacion';
import { leerSesion, cerrarSesion, renovarSesion } from '@/lib/sesion-local';

const ROTULO: Record<TipoMarca, string> = { entrada: 'Entrada', salida: 'Salida' };

interface Hoy {
  nombre: string;
  fecha: string;
  marcas: { tipo: TipoMarca; minutos: number }[];
  siguiente: TipoMarca | null;
  bodegaFijada: boolean;
}

type Resultado = { ok: true; tipo: TipoMarca; minutos: number; distancia_m: number } | { ok: false; error: string; lejos: boolean };

function fechaLarga(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  const s = d.toLocaleDateString('es-PA', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function MarcarPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  const [hoy, setHoy] = useState<Hoy | null>(null);
  const [errorCarga, setErrorCarga] = useState('');
  const [camaraOk, setCamaraOk] = useState<boolean | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [reloj, setReloj] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Sesión recordada (14 días desde el último uso); se renueva al abrir. Sin sesión, a la pantalla de PIN.
  useEffect(() => {
    const s = leerSesion();
    if (s?.role === 'colaborador') {
      setToken(s.token);
      renovarSesion().then((r) => r && setToken(r.token));
    }
    setListo(true);
  }, []);

  // Reloj de pantalla (hora de Panamá); la hora que VALE la pone el servidor.
  useEffect(() => {
    const tick = () => setReloj(new Date().toLocaleTimeString('es-PA', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Panama' }));
    tick();
    const id = setInterval(tick, 10_000);
    return () => clearInterval(id);
  }, []);

  const salir = useCallback(() => {
    cerrarSesion();
    setToken(null);
    setHoy(null);
    router.replace('/admin');
  }, [router]);

  const cargar = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/marcar', { headers: { 'x-admin-token': token } });
      if (res.status === 401) return salir();
      if (!res.ok) throw new Error();
      setHoy(await res.json());
      setErrorCarga('');
    } catch {
      setErrorCarga('No se pudo cargar. Revisa tu conexión.');
    }
  }, [token, salir]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Cámara frontal mientras quede una marca por hacer.
  const siguiente = hoy?.siguiente ?? null;
  useEffect(() => {
    if (!siguiente || !navigator.mediaDevices?.getUserMedia) return;
    let cancelado = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 640 } }, audio: false })
      .then((stream) => {
        if (cancelado) return stream.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCamaraOk(true);
      })
      .catch(() => setCamaraOk(false));
    return () => {
      cancelado = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [siguiente]);

  const tomarSelfie = (): Promise<Blob> =>
    new Promise((resolve, reject) => {
      const v = videoRef.current;
      if (!v || !v.videoWidth) return reject(new Error('La cámara no está lista.'));
      const lado = Math.min(v.videoWidth, v.videoHeight);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 480;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(v, (v.videoWidth - lado) / 2, (v.videoHeight - lado) / 2, lado, lado, 0, 0, 480, 480);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo tomar la selfie.'))), 'image/jpeg', 0.8);
    });

  const ubicacion = (): Promise<GeolocationPosition> =>
    new Promise((resolve, reject) =>
      navigator.geolocation
        ? navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 })
        : reject(new Error('Este teléfono no da la ubicación.')),
    );

  const marcar = async () => {
    if (!token || !hoy?.siguiente || enviando) return;
    setEnviando(true);
    setResultado(null);
    try {
      const [foto, pos] = await Promise.all([tomarSelfie(), ubicacion()]);
      const form = new FormData();
      form.set('tipo', hoy.siguiente);
      form.set('lat', String(pos.coords.latitude));
      form.set('lng', String(pos.coords.longitude));
      form.set('precision', String(Math.round(pos.coords.accuracy)));
      form.set('foto', foto, 'selfie.jpg');
      const res = await fetch('/api/marcar', { method: 'POST', headers: { 'x-admin-token': token }, body: form });
      const data = await res.json();
      if (res.ok) {
        setResultado({ ok: true, ...data });
        await cargar();
      } else {
        setResultado({ ok: false, error: data.error || 'No se pudo marcar.', lejos: res.status === 422 });
      }
    } catch (e) {
      const msg = e instanceof GeolocationPositionError ? 'Permite la ubicación para marcar.' : (e as Error).message || 'No se pudo marcar.';
      setResultado({ ok: false, error: msg, lejos: false });
    } finally {
      setEnviando(false);
    }
  };

  if (!listo) return null;
  if (!token) {
    // Se entra por la pantalla de PIN de /admin, la misma de todos.
    router.replace('/admin');
    return null;
  }

  const puedeMarcar = !!siguiente && camaraOk === true && !!hoy?.bodegaFijada && !enviando;

  return (
    <main className="min-h-screen bg-cream px-5 pt-6 pb-10 max-w-md mx-auto font-body">
      <header className="flex items-center justify-between">
        <Image src="/logo.png" alt="PlayTime" width={56} height={61} className="h-12 w-auto" priority />
        <button onClick={salir} className="text-xs text-gray-500 underline">
          Cerrar sesión
        </button>
      </header>

      <section className="mt-6 text-center">
        <p className="text-sm text-gray-500">{hoy ? fechaLarga(hoy.fecha) : '…'}</p>
        <h1 className="font-heading text-2xl font-bold text-purple mt-1">{hoy ? `Hola, ${hoy.nombre.split(' ')[0]}` : 'Hola'}</h1>
        <p className="font-heading text-5xl font-bold text-gray-800 mt-3 tabular-nums">{reloj}</p>
      </section>

      <section className="mt-7">
        <div className={`mx-auto w-44 h-44 rounded-full overflow-hidden border-4 bg-white flex items-center justify-center ${resultado?.ok ? 'border-teal' : 'border-purple/25'}`}>
          {siguiente ? (
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover -scale-x-100" />
          ) : (
            <span className="text-5xl text-teal-text">✓</span>
          )}
        </div>
        {camaraOk === false && siguiente && (
          <p className="mt-3 text-center text-sm text-orange-text">Permite la cámara para marcar: la selfie es obligatoria.</p>
        )}
      </section>

      {errorCarga && <p className="mt-5 text-center text-sm text-orange-text">{errorCarga}</p>}
      {hoy && !hoy.bodegaFijada && (
        <p className="mt-5 text-center text-sm text-orange-text">La Dirección todavía no fijó la ubicación de la bodega.</p>
      )}

      {resultado && !resultado.ok && (
        <div className="mt-5 rounded-2xl bg-orange/15 px-4 py-3 text-sm font-semibold text-orange-text text-center">{resultado.error}</div>
      )}

      {resultado?.ok ? (
        <div className="mt-6 rounded-3xl bg-white p-5 text-center shadow-sm">
          <p className="font-heading text-xl font-bold text-purple">{ROTULO[resultado.tipo]} marcada</p>
          <p className="text-sm text-gray-500 mt-1">
            {horaRotulo(resultado.minutos)} · a {resultado.distancia_m} m de la bodega · con selfie
          </p>
        </div>
      ) : siguiente ? (
        <>
          <p className="mt-5 text-center text-sm text-gray-600">Al tocar, se toma tu selfie y se revisa que estés en la bodega.</p>
          <button
            onClick={marcar}
            disabled={!puedeMarcar}
            className="mt-4 w-full rounded-2xl bg-purple py-4 font-heading text-lg font-bold text-white shadow-sm active:scale-[0.98] transition-transform disabled:bg-gray-300 disabled:text-gray-500"
          >
            {enviando ? 'Marcando…' : `Marcar ${ROTULO[siguiente].toLowerCase()}`}
          </button>
        </>
      ) : hoy ? (
        <p className="mt-6 text-center font-heading text-lg font-bold text-purple">Listo por hoy</p>
      ) : null}

      <section className="mt-8">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Marcas de hoy</h2>
        <ol className="rounded-2xl bg-white divide-y divide-gray-100">
          {(['entrada', 'salida'] as TipoMarca[]).map((t) => {
            const m = hoy?.marcas.find((x) => x.tipo === t);
            return (
              <li key={t} className="flex items-center justify-between px-4 py-3 text-sm">
                <span className={m ? 'text-gray-800 font-semibold' : 'text-gray-500'}>{ROTULO[t]}</span>
                <span className="tabular-nums text-gray-500">{m ? horaRotulo(m.minutos) : siguiente === t ? 'Siguiente' : '—'}</span>
              </li>
            );
          })}
        </ol>
      </section>
    </main>
  );
}
