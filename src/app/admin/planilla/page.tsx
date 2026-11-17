'use client';

// MOCKUP — Planilla quincenal. Datos fijos, sin base de datos.
// Solo la cuenta de la admin la ve (en el mockup no se valida el acceso).
import { useState } from 'react';
import Link from 'next/link';
import { formatCurrency } from '@/lib/format';
import {
  COLABORADORES,
  HORAS_EJEMPLO,
  QUINCENA_EJEMPLO,
  EJEMPLO_FOTO,
  calcularQuincena,
  tarifaHora,
  round2,
} from '@/lib/planilla';
import { generarComprobantePDF } from '@/lib/pdf-planilla';

const horas = (h: number) => `${h.toLocaleString('es-PA', { maximumFractionDigits: 2 })} h`;

export default function PlanillaPage() {
  const [aprobadas, setAprobadas] = useState<Record<string, boolean>>(
    Object.fromEntries(Object.entries(HORAS_EJEMPLO).map(([k, q]) => [k, q.extraAprobada])),
  );

  const filas = COLABORADORES.map((c) => {
    const q = { ...HORAS_EJEMPLO[c.codigo], extraAprobada: aprobadas[c.codigo] };
    return { c, q, d: calcularQuincena(c, q) };
  });
  const totalPlanilla = round2(filas.reduce((s, f) => s + f.d.total, 0));
  const sumaFoto = EJEMPLO_FOTO.salario + EJEMPLO_FOTO.extras + EJEMPLO_FOTO.ausencias + EJEMPLO_FOTO.domingos;

  const descargar = async (i: number) => {
    const f = filas[i];
    const doc = await generarComprobantePDF({
      colaborador: f.c,
      quincena: f.q,
      desglose: f.d,
      periodo: QUINCENA_EJEMPLO.rotulo,
      logoUrl: '/logo.png',
    });
    doc.save(`Comprobante-${f.c.codigo}-${QUINCENA_EJEMPLO.desde}.pdf`);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 font-body">
      <Link href="/admin" className="text-sm text-purple font-semibold">‹ Admin</Link>
      <div className="flex items-end justify-between mt-2 mb-5 gap-3 flex-wrap">
        <div>
          <h1 className="font-heading text-2xl font-bold text-purple">Planilla</h1>
          <p className="text-sm text-gray-500">Bodega · horario 8:00 a. m. – 5:00 p. m.</p>
        </div>
        <span className="rounded-full bg-white border border-gray-200 px-3 py-1.5 text-sm font-semibold text-gray-700">
          Quincena {QUINCENA_EJEMPLO.rotulo} ▾
        </span>
      </div>

      {/* Teléfono: una tarjeta por colaborador, el total a la vista */}
      <div className="sm:hidden space-y-3">
        {filas.map(({ c, q, d }, i) => (
          <div key={c.codigo} className="rounded-2xl bg-white border border-gray-100 p-4 tabular-nums">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-gray-800 leading-tight">{c.nombre}</p>
                <p className="text-xs text-gray-500 mt-0.5">{formatCurrency(c.sueldoMensual)} al mes · {formatCurrency(tarifaHora(c))} la hora</p>
              </div>
              <p className="font-heading font-bold text-purple text-xl">{formatCurrency(d.total)}</p>
            </div>
            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-gray-500">Salario</dt><dd>{formatCurrency(d.salario)}</dd></div>
              <div className="flex justify-between items-center">
                <dt className="text-gray-500">Horas extra · {horas(q.horasExtra)}</dt>
                <dd>
                  {aprobadas[c.codigo] ? (
                    <span>{formatCurrency(d.extras)} <span className="text-teal-text">✓</span></span>
                  ) : (
                    <button
                      onClick={() => setAprobadas((a) => ({ ...a, [c.codigo]: true }))}
                      className="rounded-lg bg-purple px-2.5 py-1 text-xs font-semibold text-white whitespace-nowrap active:scale-[0.97]"
                    >
                      Aprobar {formatCurrency(round2(tarifaHora(c) * q.horasExtra * 1.25))}
                    </button>
                  )}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Horas ausentadas{q.horasAusente ? ` · ${horas(q.horasAusente)}` : ''}</dt>
                <dd className={d.ausencias ? 'text-orange-text' : 'text-gray-400'}>{d.ausencias ? `-${formatCurrency(-d.ausencias)}` : '—'}</dd>
              </div>
              <div className="flex justify-between"><dt className="text-gray-500">Domingo</dt><dd className={d.domingos ? '' : 'text-gray-400'}>{d.domingos ? formatCurrency(d.domingos) : '—'}</dd></div>
            </dl>
            <button onClick={() => descargar(i)} className="mt-3 w-full rounded-xl bg-purple/10 py-2 text-sm font-semibold text-purple">
              Comprobante PDF
            </button>
          </div>
        ))}
        <div className="flex justify-between rounded-2xl bg-white border border-gray-100 px-4 py-3">
          <span className="font-semibold text-gray-700">Total de la quincena</span>
          <span className="font-heading font-bold text-purple">{formatCurrency(totalPlanilla)}</span>
        </div>
      </div>

      <div className="hidden sm:block rounded-2xl bg-white border border-gray-100 overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm tabular-nums">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">
              <th className="px-4 py-3 font-semibold">Colaborador</th>
              <th className="px-3 py-3 font-semibold text-right">Salario</th>
              <th className="px-3 py-3 font-semibold text-right">Horas extra</th>
              <th className="px-3 py-3 font-semibold text-right">Horas ausentadas</th>
              <th className="px-3 py-3 font-semibold text-right">Domingo</th>
              <th className="px-3 py-3 font-semibold text-right">Total</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filas.map(({ c, q, d }, i) => (
              <tr key={c.codigo} className="align-top">
                <td className="px-4 py-3">
                  <p className="font-semibold text-gray-800">{c.nombre}</p>
                  <p className="text-xs text-gray-500">{formatCurrency(c.sueldoMensual)} al mes · {formatCurrency(tarifaHora(c))} la hora</p>
                </td>
                <td className="px-3 py-3 text-right">{formatCurrency(d.salario)}</td>
                <td className="px-3 py-3 text-right">
                  {aprobadas[c.codigo] ? (
                    <>
                      <p>{formatCurrency(d.extras)}</p>
                      <p className="text-xs text-teal-text">{horas(q.horasExtra)} · aprobadas ✓</p>
                    </>
                  ) : (
                    <>
                      <p className="text-gray-400">{formatCurrency(round2(tarifaHora(c) * q.horasExtra * 1.25))}</p>
                      <button
                        onClick={() => setAprobadas((a) => ({ ...a, [c.codigo]: true }))}
                        className="mt-1 rounded-lg bg-purple px-2.5 py-1 text-xs font-semibold text-white active:scale-[0.97]"
                      >
                        Aprobar {horas(q.horasExtra)}
                      </button>
                    </>
                  )}
                </td>
                <td className="px-3 py-3 text-right">
                  <p className={d.ausencias ? 'text-orange-text' : 'text-gray-400'}>
                    {d.ausencias ? `-${formatCurrency(-d.ausencias)}` : '—'}
                  </p>
                  {q.horasAusente > 0 && <p className="text-xs text-gray-500">{horas(q.horasAusente)}</p>}
                </td>
                <td className="px-3 py-3 text-right">{d.domingos ? formatCurrency(d.domingos) : <span className="text-gray-400">—</span>}</td>
                <td className="px-3 py-3 text-right font-heading font-bold text-purple text-base">{formatCurrency(d.total)}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => descargar(i)} className="text-xs font-semibold text-purple hover:underline whitespace-nowrap">
                    Comprobante PDF
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-200 bg-cream/60">
              <td className="px-4 py-3 font-semibold text-gray-700" colSpan={5}>Total de la quincena</td>
              <td className="px-3 py-3 text-right font-heading font-bold text-purple text-base">{formatCurrency(totalPlanilla)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="mt-4 rounded-xl bg-yellow/25 px-4 py-3 text-sm text-gray-700">
        <b>Nota:</b> en tu foto, Salario $300 + Horas extra $27 − Ausencias $39 + Domingo $30 da{' '}
        <b>{formatCurrency(sumaFoto)}</b>; anotaste {formatCurrency(EJEMPLO_FOTO.totalEscrito)}. Aquí se muestra lo que da la suma.
      </div>
      <p className="mt-2 text-xs text-gray-500">
        Horas de ejemplo; nombres y sueldos reales. Supuesto: 1 h de almuerzo sin pagar (8 h pagadas), lunes a sábado,
        10 min de tolerancia al llegar; la ausencia se descuenta sin el 1.25; las horas extra solo cuentan si las apruebas;
        sin seguro social ni educativo.
      </p>

      <section className="mt-8 rounded-2xl bg-white border border-gray-100 p-4">
        <h2 className="font-heading font-bold text-purple">Ajustes de marcación</h2>
        <div className="mt-3 flex items-center justify-between gap-3 flex-wrap text-sm">
          <div>
            <p className="font-semibold text-gray-800">Ubicación de la bodega</p>
            <p className="text-gray-500">Sin fijar · se marca a menos de 100 m</p>
          </div>
          <button className="rounded-xl bg-purple px-4 py-2 font-heading font-semibold text-white active:scale-[0.97]">
            Usar mi ubicación actual
          </button>
        </div>
      </section>
    </div>
  );
}
