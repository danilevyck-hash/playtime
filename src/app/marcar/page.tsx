'use client';

// MOCKUP — marcación desde el teléfono. Datos fijos, sin base de datos.
// ?estado=listo | cerca | lejos | hecha  (para capturar cada momento)
import { Suspense } from 'react';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';

type Estado = 'listo' | 'cerca' | 'lejos' | 'hecha';

const MARCAS = ['Entrada', 'Salida al almuerzo', 'Regreso del almuerzo', 'Salida'] as const;

function Pin({ ok }: { ok: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={`w-5 h-5 ${ok ? 'text-teal-text' : 'text-orange-text'}`} fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21s-7-6.2-7-11.5A7 7 0 0119 9.5C19 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  );
}

function Selfie({ tomada }: { tomada: boolean }) {
  return (
    <div className={`mx-auto w-40 h-40 rounded-full flex items-center justify-center overflow-hidden border-4 ${tomada ? 'border-teal bg-teal/20' : 'border-dashed border-purple/25 bg-white'}`}>
      {tomada ? (
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-purple/20 mx-auto" />
          <div className="w-24 h-10 rounded-t-full bg-purple/20 mx-auto mt-1" />
        </div>
      ) : (
        <svg viewBox="0 0 24 24" className="w-12 h-12 text-purple/40" fill="none" stroke="currentColor" strokeWidth={1.6}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 8a2 2 0 012-2h2l1.5-2h7L17 6h2a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
          <circle cx="12" cy="13" r="3.5" />
        </svg>
      )}
    </div>
  );
}

function Pantalla() {
  const estado = (useSearchParams().get('estado') as Estado) || 'listo';
  const hecha = estado === 'hecha';
  const hechas = hecha ? 1 : 0;

  return (
    <main className="min-h-screen bg-cream px-5 pt-6 pb-10 max-w-md mx-auto font-body">
      <header className="flex items-center justify-between">
        <Image src="/logo.png" alt="PlayTime" width={56} height={61} className="h-12 w-auto" priority />
        <p className="text-xs text-gray-500">Ejemplo</p>
      </header>

      <section className="mt-6 text-center">
        <p className="text-sm text-gray-500">Martes 17 de noviembre</p>
        <h1 className="font-heading text-2xl font-bold text-purple mt-1">Hola, Joseph</h1>
        <p className="font-heading text-5xl font-bold text-gray-800 mt-3 tabular-nums">{hecha ? '7:56' : '7:55'}<span className="text-xl text-gray-400"> a. m.</span></p>
      </section>

      <section className="mt-7">
        <Selfie tomada={estado !== 'listo'} />
      </section>

      {estado === 'listo' && (
        <p className="mt-5 text-center text-sm text-gray-600">Al tocar, se toma tu selfie y se revisa que estés en la bodega.</p>
      )}

      {(estado === 'cerca' || estado === 'lejos') && (
        <div className={`mt-5 flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold ${estado === 'cerca' ? 'bg-teal/25 text-teal-text' : 'bg-orange/15 text-orange-text'}`}>
          <Pin ok={estado === 'cerca'} />
          {estado === 'cerca' ? 'Estás a 40 m de la bodega ✓' : 'Estás a 2,3 km — acércate para marcar'}
        </div>
      )}

      {hecha ? (
        <div className="mt-6 rounded-3xl bg-white p-5 text-center shadow-sm">
          <div className="w-12 h-12 rounded-full bg-teal/30 flex items-center justify-center mx-auto text-teal-text text-2xl">✓</div>
          <p className="font-heading text-xl font-bold text-purple mt-2">Entrada marcada</p>
          <p className="text-sm text-gray-500 mt-1">7:56 a. m. · a 40 m de la bodega · con selfie</p>
        </div>
      ) : (
        <button
          disabled={estado === 'lejos'}
          className="mt-6 w-full rounded-2xl bg-purple py-4 font-heading text-lg font-bold text-white shadow-sm active:scale-[0.98] transition-transform disabled:bg-gray-300 disabled:text-gray-500"
        >
          {estado === 'listo' ? 'Marcar entrada' : 'Confirmar entrada'}
        </button>
      )}

      <section className="mt-8">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Marcas de hoy</h2>
        <ol className="rounded-2xl bg-white divide-y divide-gray-100">
          {MARCAS.map((m, i) => (
            <li key={m} className="flex items-center justify-between px-4 py-3 text-sm">
              <span className={i < hechas ? 'text-gray-800 font-semibold' : 'text-gray-500'}>{m}</span>
              <span className="tabular-nums text-gray-500">{i < hechas ? '7:56 a. m.' : i === hechas ? 'Siguiente' : '—'}</span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}

export default function MarcarPage() {
  return (
    <Suspense>
      <Pantalla />
    </Suspense>
  );
}
