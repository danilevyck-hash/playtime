import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { isValidSession } from '@/lib/admin-auth';

const BUCKET = 'playtime-images';
const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'heic', 'heif']);

export async function POST(request: NextRequest) {
  // Auth check: session token only (raw x-admin-pin fallback removed)
  if (!isValidSession(request.headers.get('x-admin-token'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const productId = formData.get('productId') as string | null;
  const folder = formData.get('folder') as string || 'products';

  if (!file || !productId) {
    return NextResponse.json({ error: 'Missing file or productId' }, { status: 400 });
  }

  const ext = (file.name.split('.').pop() || 'png').toLowerCase();

  // Validate by extension (HEIC/HEIF from iPhone included). iOS often reports an
  // empty MIME type for HEIC, so we only reject when a type is present AND not an image.
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return NextResponse.json({ error: 'Formato no permitido. Usa JPG, PNG, WEBP, HEIC o GIF.' }, { status: 400 });
  }
  if (file.type && !file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'Solo se permiten archivos de imagen' }, { status: 400 });
  }

  const MAX_SIZE = 5 * 1024 * 1024; // 5MB
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'El archivo excede el límite de 5MB' }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  // Sanitize path components to prevent traversal
  const safeFolder = folder.replace(/[^a-zA-Z0-9_-]/g, '');
  const safeProductId = productId.replace(/[^a-zA-Z0-9_-]/g, '');
  const imageIndex = Number(formData.get('imageIndex') || '0');
  const suffix = imageIndex === 1 ? '_2' : imageIndex === 2 ? '_3' : '';
  const filePath = `${safeFolder}/${safeProductId}${suffix}.${ext}`;

  // Upload to Supabase Storage (upsert = overwrite if exists)
  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(filePath, buffer, {
      contentType: file.type || `image/${ext === 'heic' || ext === 'heif' ? ext : 'jpeg'}`,
      upsert: true,
    });

  if (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Get public URL
  const { data: urlData } = supabaseAdmin.storage
    .from(BUCKET)
    .getPublicUrl(filePath);

  return NextResponse.json({
    path: urlData.publicUrl,
    filename: `${productId}.${ext}`,
  });
}
