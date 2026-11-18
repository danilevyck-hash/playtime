export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import {
  getClientIP,
  checkAndCountAttempt,
  clearAttempts,
  getSession,
  createSession,
  verifyPin,
} from '@/lib/admin-auth';

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIP(request.headers);

    if (await checkAndCountAttempt(ip)) {
      return NextResponse.json(
        { ok: false, error: 'Demasiados intentos. Intenta en 15 minutos.' },
        { status: 429 }
      );
    }

    const { pin } = await request.json();
    if (!pin || typeof pin !== 'string') {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const result = await verifyPin(pin);
    if (result.valid) {
      const empleadoId = result.role === 'colaborador' ? result.empleadoId : undefined;
      const token = createSession(result.role, empleadoId);
      await clearAttempts(ip);
      return NextResponse.json({
        ok: true,
        token,
        role: result.role,
        nombre: result.role === 'colaborador' ? result.nombre : undefined,
      });
    }

    return NextResponse.json({ ok: false }, { status: 401 });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

// Verificar y RENOVAR la sesión (cualquier rol): devuelve un token nuevo con
// otros 14 días. Lo llama la app al abrirse (lib/sesion-local.ts).
export async function GET(request: NextRequest) {
  const s = getSession(request.headers.get('x-admin-token'));
  if (!s) return NextResponse.json({ ok: false, role: null }, { status: 401 });
  const token = createSession(s.role, s.empleadoId);
  return NextResponse.json({ ok: true, role: s.role, token: token || undefined });
}
