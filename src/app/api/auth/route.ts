import { NextRequest, NextResponse } from 'next/server';
import {
  getClientIP,
  isRateLimited,
  clearRateLimit,
  isValidSession,
  createSession,
  verifyPin,
} from '@/lib/admin-auth';

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIP(request.headers);

    if (isRateLimited(ip)) {
      return NextResponse.json(
        { ok: false, error: 'Demasiados intentos. Intenta en 15 minutos.' },
        { status: 429 }
      );
    }

    const { pin } = await request.json();
    if (!pin || typeof pin !== 'string') {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    if (verifyPin(pin)) {
      const token = createSession();
      clearRateLimit(ip);
      return NextResponse.json({ ok: true, token });
    }

    return NextResponse.json({ ok: false }, { status: 401 });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

// Verify session endpoint
export async function GET(request: NextRequest) {
  const token = request.headers.get('x-admin-token');
  const valid = isValidSession(token);
  return NextResponse.json({ ok: valid }, { status: valid ? 200 : 401 });
}
