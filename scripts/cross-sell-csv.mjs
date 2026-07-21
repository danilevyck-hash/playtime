import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Repo root = one level up from scripts/ (works wherever the repo is cloned).
const ROOT = join(__dirname, '..');
config({ path: join(ROOT, '.env.vercel.tmp') });
config({ path: join(ROOT, '.env.local') });
config({ path: join(ROOT, '.env') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(url, key);

const rules = JSON.parse(readFileSync('/tmp/cross-sell-rules.json', 'utf-8'));

const { data: products, error } = await supabase
  .from('pt_products')
  .select('id, name, category, price, active')
  .eq('active', true);

if (error) {
  console.error(error);
  process.exit(1);
}

const byId = new Map(products.map(p => [p.id, p]));

const csv = ['Producto base,Categoría,Precio,Sugerido 1,Sugerido 2,Sugerido 3,Sugerido 4,Sugerido 5'];

const sortedIds = Object.keys(rules).sort((a, b) => {
  const pa = byId.get(a);
  const pb = byId.get(b);
  if (!pa || !pb) return 0;
  if (pa.category !== pb.category) return pa.category.localeCompare(pb.category);
  return pa.name.localeCompare(pb.name);
});

const escape = (s) => {
  if (s == null) return '';
  const str = String(s);
  return str.includes(',') || str.includes('"') || str.includes('\n')
    ? `"${str.replace(/"/g, '""')}"`
    : str;
};

for (const id of sortedIds) {
  const p = byId.get(id);
  if (!p) continue;
  const suggIds = rules[id] || [];
  const suggNames = suggIds.map(sid => {
    const s = byId.get(sid);
    return s ? `${s.name} ($${s.price})` : sid;
  });
  while (suggNames.length < 5) suggNames.push('');
  csv.push([
    escape(p.name),
    escape(p.category),
    escape(`$${p.price}`),
    ...suggNames.map(escape),
  ].join(','));
}

writeFileSync('/tmp/playtime-cross-sell.csv', csv.join('\n'), 'utf-8');
console.log(`✓ CSV generado: /tmp/playtime-cross-sell.csv`);
console.log(`  ${sortedIds.length} productos, ${csv.length - 1} filas`);
