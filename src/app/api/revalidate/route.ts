import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { isValidSession } from '@/lib/admin-auth';

export async function POST(req: NextRequest) {
  const token = req.headers.get('x-admin-token') || '';
  const pin = req.headers.get('x-admin-pin') || '';
  if (!isValidSession(token) && pin !== process.env.ADMIN_PIN) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  revalidatePath('/', 'layout');

  return NextResponse.json({ revalidated: true });
}
