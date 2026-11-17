// node --test tests/  (Node ≥ 23 lee el .ts directo, sin compilar)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  REGLAS, evaluarDia, calcularQuincena, totalizar, tarifaHora, quincenaDe, quincenaAnterior, fechasDe, rotuloQuincena,
} from '../src/lib/planilla.ts';
import { panamaParts, panamaToDate } from '../src/lib/timezone.ts';

const HOY = '2026-11-20';
const dia = (fecha, entrada, salida, diaSemana = 1) => ({ fecha, diaSemana, entradaMin: entrada, salidaMin: salida });
const h = (hh, mm = 0) => hh * 60 + mm;

test('el ejemplo de la dueña: 300 + 27 − 39 + 30 = 318', () => {
  assert.equal(totalizar({ salario: 300, extras: 27, domingos: 30, tardanzas: 0, salidaTemprana: 0, ausencias: -39 }), 318);
});

test('tarifas: $600 → hora 2.88; $700 → hora 3.37 (700 ÷ 26 ÷ 8 = 3.365…, sin redondear adentro)', () => {
  assert.equal(Math.round(tarifaHora(600) * 100) / 100, 2.88);
  assert.equal(Math.round(tarifaHora(700) * 100) / 100, 3.37);
  assert.equal(tarifaHora(600), 600 / 26 / 8);
  assert.equal(tarifaHora(700), 700 / 26 / 8);
});

test('tardanza dentro de la tolerancia no descuenta; pasada, descuenta TODOS los minutos', () => {
  assert.equal(evaluarDia(dia('2026-11-16', h(8, 10), h(17)), HOY).tardanzaMin, 0);
  assert.equal(evaluarDia(dia('2026-11-16', h(8, 11), h(17)), HOY).tardanzaMin, 11);
  assert.equal(evaluarDia(dia('2026-11-16', h(7, 50), h(17)), HOY).tardanzaMin, 0);
  // 15 min × (600/26/8)/60 = 0.72
  const d = calcularQuincena(600, [evaluarDia(dia('2026-11-16', h(8, 15), h(17)), HOY)]);
  assert.equal(d.tardanzas, -0.72);
});

test('extra = minutos después de las 17:00 × tarifa × 1.25, se paga sola (nadie aprueba)', () => {
  const dias = [evaluarDia(dia('2026-11-16', h(8), h(19)), HOY)]; // 120 min extra
  assert.equal(dias[0].extraMin, 120);
  const d = calcularQuincena(600, dias);
  assert.equal(d.extras, 7.21); // 2 h × 2.8846 × 1.25
  assert.equal(d.total, 307.21);
  assert.equal(calcularQuincena(600, [evaluarDia(dia('2026-11-16', h(8), h(16, 59)), HOY)]).extras, 0);
});

test('domingo trabajado = $30 fijo, sin tardanza ni extra', () => {
  const dom = evaluarDia(dia('2026-11-15', h(10), h(20), 0), HOY);
  assert.equal(dom.domingoTrabajado, true);
  assert.equal(dom.extraMin, 0);
  assert.equal(dom.tardanzaMin, 0);
  assert.equal(calcularQuincena(700, [dom]).domingos, 30);
  assert.equal(evaluarDia(dia('2026-11-15', null, null, 0), HOY).domingoTrabajado, false);
});

test('ausencia = 8 h; salida temprana por minutos; hoy y el futuro no son ausencia', () => {
  assert.equal(evaluarDia(dia('2026-11-16', null, null), HOY).ausenciaMin, REGLAS.minutosPagadosDia);
  assert.equal(evaluarDia(dia(HOY, null, null), HOY).ausenciaMin, 0);
  assert.equal(evaluarDia(dia('2026-11-25', null, null), HOY).ausenciaMin, 0);
  assert.equal(evaluarDia(dia('2026-11-16', h(8), h(16, 30)), HOY).salidaTempranaMin, 30);
  const d = calcularQuincena(600, [evaluarDia(dia('2026-11-16', null, null), HOY)]);
  assert.equal(d.ausencias, -23.08);
});

test('un día con una sola marca queda incompleto y no se descuenta de más', () => {
  const d = evaluarDia(dia('2026-11-16', h(8, 20), null), HOY);
  assert.equal(d.incompleto, true);
  assert.equal(d.tardanzaMin, 20);
  assert.equal(d.ausenciaMin, 0);
  assert.equal(evaluarDia(dia(HOY, h(8), null), HOY).incompleto, false);
  assert.deepEqual(calcularQuincena(600, [d]).diasIncompletos, ['2026-11-16']);
});

test('quincena completa: salario + domingo − ausencia − tardanza', () => {
  const dias = [
    evaluarDia(dia('2026-11-16', h(8, 30), h(17)), HOY), // 30 min tarde → 1.44
    evaluarDia(dia('2026-11-17', null, null), HOY), // ausencia → 23.08
    evaluarDia(dia('2026-11-22', h(9), h(13), 0), HOY), // domingo → 30
  ];
  const d = calcularQuincena(600, dias);
  assert.equal(d.salario, 300);
  assert.equal(d.total, 300 + 30 - 23.08 - 1.44);
});

test('quincenas: 1–15 y 16–fin; la anterior; el rótulo', () => {
  assert.deepEqual(quincenaDe('2026-11-03'), { desde: '2026-11-01', hasta: '2026-11-15' });
  assert.deepEqual(quincenaDe('2026-11-20'), { desde: '2026-11-16', hasta: '2026-11-30' });
  assert.deepEqual(quincenaDe('2028-02-29'), { desde: '2028-02-16', hasta: '2028-02-29' });
  assert.deepEqual(quincenaAnterior({ desde: '2026-11-16', hasta: '2026-11-30' }), { desde: '2026-11-01', hasta: '2026-11-15' });
  assert.deepEqual(quincenaAnterior({ desde: '2026-11-01', hasta: '2026-11-15' }), { desde: '2026-10-16', hasta: '2026-10-31' });
  assert.deepEqual(quincenaAnterior({ desde: '2027-01-01', hasta: '2027-01-15' }), { desde: '2026-12-16', hasta: '2026-12-31' });
  assert.equal(fechasDe({ desde: '2026-11-16', hasta: '2026-11-30' }).length, 15);
  assert.equal(rotuloQuincena({ desde: '2026-11-01', hasta: '2026-11-15' }), '1 – 15 nov 2026');
});

test('hora de Panamá: UTC−5 fijo, minutos enteros, el día cambia a medianoche de Panamá', () => {
  const p = panamaParts(new Date('2026-11-17T13:10:59Z')); // 8:10:59 a. m. Panamá
  assert.deepEqual(p, { fecha: '2026-11-17', minutos: 490, diaSemana: 2 });
  assert.equal(panamaParts(new Date('2026-11-18T03:30:00Z')).fecha, '2026-11-17'); // 10:30 p. m. del 17
  assert.equal(panamaToDate('2026-11-17', 490).toISOString(), '2026-11-17T13:10:00.000Z');
});
