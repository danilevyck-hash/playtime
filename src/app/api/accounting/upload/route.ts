export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireRole } from '@/lib/admin-auth';

const BUCKET = 'vouchers';
const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'pdf']);
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: NextRequest) {
  // Auth: admin role only (token-based, no PIN fallback)
  const auth = requireRole(request, 'admin');
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  if (!file) {
    return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 });
  }

  const isImage = file.type.startsWith('image/');
  const isPdf = file.type === 'application/pdf';
  if (!isImage && !isPdf) {
    return NextResponse.json({ error: 'Solo se permiten imágenes o PDF' }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'El archivo excede el límite de 10MB' }, { status: 400 });
  }

  const ext = (file.name.split('.').pop() || (isPdf ? 'pdf' : 'png')).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return NextResponse.json({ error: 'Extensión no permitida' }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  // Unique-ish filename without Date.now in module scope concerns (route runtime is fine)
  const rand = Math.random().toString(36).slice(2, 10);
  const stamp = Date.now();
  const filePath = `voucher-${stamp}-${rand}.${ext}`;

  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(filePath, buffer, {
      contentType: file.type,
      upsert: true,
    });

  if (error) {
    console.error('Voucher upload error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Private bucket: return the storage path (persisted in DB) + a short-lived
  // signed URL for immediate preview. URLs are never stored — they expire.
  const { data: signed } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(filePath, 60 * 60); // 1 hour

  return NextResponse.json({ path: filePath, url: signed?.signedUrl || null });
}
