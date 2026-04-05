import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { isValidSession } from '@/lib/admin-auth';

export async function POST(req: NextRequest) {
  const token = req.headers.get('x-admin-token') || '';
  if (!isValidSession(token)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  revalidatePath('/', 'layout');

  return NextResponse.json({ revalidated: true });
}
