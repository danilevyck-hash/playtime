/**
 * Push subscriptions store. Reads/writes with the SERVICE-ROLE client only.
 *
 * Subscriptions live in the dedicated `pt_push_subscriptions` table (deny-all
 * RLS). Until that migration is applied, every operation falls back to the
 * legacy `pt_settings` blob so push keeps working — but always through the
 * service-role client, never the anon client (the old code read them with anon,
 * and pt_settings is world-readable, which leaked the push keys).
 */
import { supabaseAdmin } from '@/lib/supabase';

export interface PushSub {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

const TABLE = 'pt_push_subscriptions';
const LEGACY_KEY = 'push_subscriptions';

/** Postgres "relation does not exist" → the new table isn't migrated yet. */
function isMissingTable(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  return !!e && (e.code === '42P01' || /does not exist/i.test(e.message || ''));
}

async function getLegacy(): Promise<PushSub[]> {
  if (!supabaseAdmin) return [];
  const { data } = await supabaseAdmin
    .from('pt_settings')
    .select('value')
    .eq('key', LEGACY_KEY)
    .single();
  return (data?.value as PushSub[]) || [];
}

export async function getPushSubscriptions(): Promise<PushSub[]> {
  if (!supabaseAdmin) return [];
  const { data, error } = await supabaseAdmin.from(TABLE).select('endpoint, p256dh, auth');
  if (!error && data) {
    return data.map((r) => ({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } }));
  }
  if (error && !isMissingTable(error)) {
    console.error('[push] getPushSubscriptions error:', error);
    return [];
  }
  return getLegacy();
}

export async function addPushSubscription(sub: PushSub): Promise<boolean> {
  if (!supabaseAdmin) return false;
  const { error } = await supabaseAdmin
    .from(TABLE)
    .upsert(
      { endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      { onConflict: 'endpoint' },
    );
  if (!error) return true;
  if (!isMissingTable(error)) {
    console.error('[push] addPushSubscription error:', error);
    return false;
  }
  // Legacy fallback: append to the pt_settings blob with dedup + error check.
  const current = await getLegacy();
  if (current.some((s) => s.endpoint === sub.endpoint)) return true;
  const { error: wErr } = await supabaseAdmin
    .from('pt_settings')
    .upsert({ key: LEGACY_KEY, value: [...current, sub] }, { onConflict: 'key' });
  if (wErr) {
    console.error('[push] legacy add error:', wErr);
    return false;
  }
  return true;
}

export async function removePushEndpoints(endpoints: string[]): Promise<void> {
  if (!supabaseAdmin || endpoints.length === 0) return;
  const { error } = await supabaseAdmin.from(TABLE).delete().in('endpoint', endpoints);
  if (!error) return;
  if (!isMissingTable(error)) {
    console.error('[push] removePushEndpoints error:', error);
    return;
  }
  // Legacy fallback.
  const current = await getLegacy();
  const remaining = current.filter((s) => !endpoints.includes(s.endpoint));
  const { error: wErr } = await supabaseAdmin
    .from('pt_settings')
    .upsert({ key: LEGACY_KEY, value: remaining }, { onConflict: 'key' });
  if (wErr) console.error('[push] legacy remove error:', wErr);
}
