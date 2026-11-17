import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distanciaM, rotuloDistancia, RADIO_BODEGA_M } from '../src/lib/geo.ts';

// Punto de referencia: Ciudad de Panamá. Un grado de latitud ≈ 111,2 km.
const BODEGA = { lat: 8.98, lng: -79.52 };

test('el mismo punto está a 0 m', () => {
  assert.equal(distanciaM(BODEGA, BODEGA), 0);
});

test('100 m al norte queda adentro del radio; 2,3 km queda afuera', () => {
  const cerca = distanciaM(BODEGA, { lat: BODEGA.lat + 0.0009, lng: BODEGA.lng }); // ≈ 100 m
  assert.ok(cerca > 95 && cerca < 105, `cerca=${cerca}`);
  assert.ok(cerca <= RADIO_BODEGA_M);
  const lejos = distanciaM(BODEGA, { lat: BODEGA.lat, lng: BODEGA.lng + 0.021 }); // ≈ 2,3 km
  assert.ok(lejos > 2200 && lejos < 2400, `lejos=${lejos}`);
  assert.ok(lejos > RADIO_BODEGA_M);
});

test('la distancia es simétrica y el rótulo habla en metros o kilómetros', () => {
  const a = { lat: 9.0, lng: -79.5 };
  const b = { lat: 9.01, lng: -79.51 };
  assert.equal(Math.round(distanciaM(a, b)), Math.round(distanciaM(b, a)));
  assert.equal(rotuloDistancia(40.4), '40 m');
  assert.equal(rotuloDistancia(2300), '2.3 km');
});
