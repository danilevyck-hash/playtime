/**
 * cleanup-old-order-pdfs.mjs — borra los PDFs de pedido con ruta ADIVINABLE del
 * bucket público `playtime-images` (prefijo `pedidos/`). Los nuevos pedidos usan
 * capability URL (`...-<token32hex>.pdf`) y se CONSERVAN; solo se borran los viejos
 * `PlayTime-Pedido-{N}.pdf` y `PlayTime-Pedido-{YYMMDD}-{4dig}.pdf`.
 *
 * ⚠️ Esto NO cierra la fuga de fondo: anon todavía puede LISTAR el bucket, así que
 *    los PDFs NUEVOS (con token) también son enumerables. El fix real es una policy
 *    que niegue `list`/SELECT a anon sobre storage.objects de `playtime-images`
 *    (o mover los PDFs a un bucket privado). Este script solo limpia el pasivo viejo.
 *
 * Uso (desde la raíz del repo):
 *   SUPABASE_URL=https://xxxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<service_role> \
 *   node scripts/cleanup-old-order-pdfs.mjs            # DRY-RUN: solo lista qué borraría
 *
 *   ... node scripts/cleanup-old-order-pdfs.mjs --apply  # BORRA de verdad
 *
 * Usa la service role key (server-side, bypassa RLS). NUNCA hardcodear la key aquí.
 */
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'playtime-images';
const PREFIX = 'pedidos';
const APPLY = process.argv.includes('--apply');

if (!URL || !KEY) {
  console.error('Falta SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en el entorno.');
  process.exit(1);
}

const sb = createClient(URL, KEY);

// "Nuevo y seguro" = termina en -<32 hex>.pdf (capability URL). Todo lo demás
// bajo pedidos/ que sea un PDF se considera viejo/adivinable → a borrar.
const isNewTokenFormat = (name) => /-[0-9a-f]{32}\.pdf$/i.test(name);
const isOrderPdf = (name) => /\.pdf$/i.test(name);

async function listAll() {
  const out = [];
  const PAGE = 100;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await sb.storage.from(BUCKET).list(PREFIX, {
      limit: PAGE,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

async function main() {
  const files = await listAll();
  const pdfs = files.filter((f) => isOrderPdf(f.name));
  const toDelete = pdfs.filter((f) => !isNewTokenFormat(f.name));
  const keep = pdfs.filter((f) => isNewTokenFormat(f.name));

  const totalBytes = toDelete.reduce((s, f) => s + (f.metadata?.size || 0), 0);
  console.log(`Bucket: ${BUCKET}/${PREFIX}`);
  console.log(`PDFs totales: ${pdfs.length}`);
  console.log(`  - a CONSERVAR (token / capability URL): ${keep.length}`);
  console.log(`  - a BORRAR (ruta adivinable): ${toDelete.length}  (~${(totalBytes / 1048576).toFixed(1)} MB)`);
  console.log('');
  toDelete.slice(0, 10).forEach((f) => console.log(`   • ${PREFIX}/${f.name}`));
  if (toDelete.length > 10) console.log(`   … y ${toDelete.length - 10} más`);

  if (!APPLY) {
    console.log('\nDRY-RUN. No se borró nada. Corré con --apply para ejecutar.');
    return;
  }
  if (toDelete.length === 0) {
    console.log('\nNada que borrar.');
    return;
  }

  console.log('\n--apply: borrando…');
  const paths = toDelete.map((f) => `${PREFIX}/${f.name}`);
  let removed = 0;
  for (let i = 0; i < paths.length; i += 100) {
    const batch = paths.slice(i, i + 100);
    const { error } = await sb.storage.from(BUCKET).remove(batch);
    if (error) {
      console.error('Error borrando batch:', error.message);
      process.exit(1);
    }
    removed += batch.length;
    console.log(`  borrados ${removed}/${paths.length}`);
  }
  console.log(`\nListo. ${removed} PDFs viejos eliminados. (Recordá cerrar el list de anon — ese es el fix real.)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
