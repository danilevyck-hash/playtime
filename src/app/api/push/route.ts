import { NextRequest, NextResponse } from 'next/server';
import { isValidSession } from '@/lib/admin-auth';
import {
  PushSub,
  getPushSubscriptions,
  addPushSubscription,
  removePushEndpoints,
} from '@/lib/push-subscriptions';

const MAX_SUBSCRIPTIONS = 50;
const MAX_ENDPOINT_LEN = 1024;

// Push subscriptions belong to admin/vendedora devices — require a valid session.
function requireSession(request: NextRequest): boolean {
  return isValidSession(request.headers.get('x-admin-token'));
}

/** Validate an incoming subscription: shape + endpoint must be an https URL. */
function parseSubscription(raw: unknown): PushSub | null {
  const sub = raw as Partial<PushSub> | null;
  if (!sub || typeof sub.endpoint !== 'string' || !sub.keys?.p256dh || !sub.keys?.auth) return null;
  if (sub.endpoint.length > MAX_ENDPOINT_LEN) return null;
  try {
    const u = new URL(sub.endpoint);
    if (u.protocol !== 'https:') return null;
  } catch {
    return null;
  }
  return { endpoint: sub.endpoint, keys: { p256dh: String(sub.keys.p256dh), auth: String(sub.keys.auth) } };
}

export async function POST(request: NextRequest) {
  try {
    if (!requireSession(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const sub = parseSubscription(await request.json());
    if (!sub) {
      return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
    }

    // Cap the number of stored subscriptions (an authenticated device could
    // otherwise register unbounded endpoints).
    const existing = await getPushSubscriptions();
    const already = existing.some((s) => s.endpoint === sub.endpoint);
    if (!already && existing.length >= MAX_SUBSCRIPTIONS) {
      return NextResponse.json({ error: 'Demasiadas suscripciones' }, { status: 429 });
    }

    const ok = await addPushSubscription(sub);
    if (!ok) {
      return NextResponse.json({ error: 'No se pudo guardar la suscripción' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!requireSession(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = (await request.json()) as { endpoint?: unknown };
    if (typeof body?.endpoint !== 'string') {
      return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
    }
    await removePushEndpoints([body.endpoint]);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
