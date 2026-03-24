import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

export async function POST(request: NextRequest) {
  const pin = request.headers.get('x-admin-pin');
  if (pin !== '2588') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const productId = formData.get('productId') as string | null;
  const folder = formData.get('folder') as string || 'products';

  if (!file || !productId) {
    return NextResponse.json({ error: 'Missing file or productId' }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  const ext = file.name.split('.').pop() || 'png';
  const filename = `${productId}.${ext}`;
  const dir = path.join(process.cwd(), 'public', 'images', folder);

  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), buffer);

  return NextResponse.json({
    path: `/images/${folder}/${filename}`,
    filename,
  });
}
