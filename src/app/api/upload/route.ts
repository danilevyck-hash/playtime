import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { isValidSession } from '@/lib/admin-auth';

const BUCKET = 'playtime-images';
// SVG removed: it can carry inline <script> and would be served from our origin.
const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif']);

// HEIF/HEIC 'ftyp' brands emitted by iPhones.
const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1', 'heim', 'heis', 'hevm', 'hevs']);

/** Sniff the real image type from magic bytes — don't trust the extension/MIME. */
function sniffImage(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true; // JPEG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true; // PNG
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return true; // GIF8
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return true; // WEBP
  if (buf.toString('ascii', 4, 8) === 'ftyp' && HEIF_BRANDS.has(buf.toString('ascii', 8, 12))) return true; // HEIC/HEIF
  return false;
}

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

  // Magic-byte check: the extension/MIME are attacker-controlled, so confirm the
  // bytes are actually one of the allowed image formats.
  if (!sniffImage(buffer)) {
    return NextResponse.json({ error: 'El archivo no es una imagen válida' }, { status: 400 });
  }

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
    return NextResponse.json({ error: 'No se pudo subir la imagen' }, { status: 500 });
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
