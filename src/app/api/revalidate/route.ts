import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { isValidSession } from '@/lib/admin-auth';

export async function POST(req: NextRequest) {
  // Token-only — the raw x-admin-pin fallback was removed.
  if (!isValidSession(req.headers.get('x-admin-token'))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  revalidatePath('/', 'layout');

  return NextResponse.json({ revalidated: true });
}
