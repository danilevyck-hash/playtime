/**
 * optimize-images.mjs — convierte los PNG/JPG referenciados de public/images a
 * WebP redimensionado (lado mayor <= 1200px, q82) y MUEVE los originales fuera
 * del build a _originals/ (gitignored). NO borra nada: los originales quedan
 * intactos en _originals/images/<carpeta>/.
 *
 * Solo toca las carpetas referenciadas por el código (constants.ts): products y
 * manualidades. products-new/ (sin referencias) se mueve aparte por bash.
 *
 * Requiere `sips` (dimensiones) y `cwebp` (conversión), ambos en macOS/dev.
 * Idempotente: si el .webp ya existe y el original ya se movió, salta.
 *
 *   node scripts/optimize-images.mjs
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { join, extname, basename } from 'node:path';

const ROOT = process.cwd();
const FOLDERS = ['products', 'manualidades'];
const MAX_SIDE = 1200;
const QUALITY = 82;
const SRC_EXT = new Set(['.png', '.jpg', '.jpeg']);

function dimensions(file) {
  const out = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', file], { encoding: 'utf8' });
  const w = Number(/pixelWidth:\s*(\d+)/.exec(out)?.[1] || 0);
  const h = Number(/pixelHeight:\s*(\d+)/.exec(out)?.[1] || 0);
  return { w, h };
}

let converted = 0, skipped = 0, srcBytes = 0, outBytes = 0;

for (const folder of FOLDERS) {
  const dir = join(ROOT, 'public', 'images', folder);
  if (!existsSync(dir)) { console.warn(`(skip) no existe ${dir}`); continue; }
  const originalsDir = join(ROOT, '_originals', 'images', folder);
  mkdirSync(originalsDir, { recursive: true });

  for (const name of readdirSync(dir)) {
    const ext = extname(name).toLowerCase();
    if (!SRC_EXT.has(ext)) continue;
    const src = join(dir, name);
    const stem = basename(name, ext);
    const webpOut = join(dir, `${stem}.webp`);
    const originalDest = join(originalsDir, name);

    if (existsSync(webpOut) && !existsSync(src)) { skipped++; continue; }

    const { w, h } = dimensions(src);
    const resizeArgs = [];
    if (w >= h && w > MAX_SIDE) resizeArgs.push('-resize', String(MAX_SIDE), '0');
    else if (h > w && h > MAX_SIDE) resizeArgs.push('-resize', '0', String(MAX_SIDE));

    execFileSync('cwebp', ['-quiet', '-q', String(QUALITY), ...resizeArgs, src, '-o', webpOut]);

    srcBytes += statSync(src).size;
    outBytes += statSync(webpOut).size;
    renameSync(src, originalDest); // move original out of the build
    converted++;
  }
}

const mb = (n) => (n / 1048576).toFixed(1);
console.log(`\nConvertidos: ${converted}  ·  saltados (ya hechos): ${skipped}`);
console.log(`Origen: ${mb(srcBytes)} MB  →  WebP: ${mb(outBytes)} MB  (${srcBytes ? Math.round((1 - outBytes / srcBytes) * 100) : 0}% menos)`);
console.log(`Originales movidos a _originals/images/. Referencias .png/.jpg → .webp en constants.ts (aparte).`);
