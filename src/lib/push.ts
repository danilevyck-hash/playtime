/**
 * Web Push notification utility.
 * WARNING: This file uses the `web-push` Node.js package and must ONLY be
 * imported from server-side code (API routes). Never import from client components.
 */
import webpush from 'web-push';
import { supabase, supabaseAdmin } from '@/lib/supabase';

webpush.setVapidDetails(
  'mailto:playtimekidspty@gmail.com',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export async function sendPushNotification(title: string, body: string, url?: string) {
  if (!supabase || !supabaseAdmin) return;

  const { data } = await supabase
    .from('pt_settings')
    .select('value')
    .eq('key', 'push_subscriptions')
    .single();

  const subscriptions: webpush.PushSubscription[] = data?.value || [];
  if (subscriptions.length === 0) return;

  const expired: number[] = [];

  await Promise.allSettled(
    subscriptions.map(async (sub, i) => {
      try {
        await webpush.sendNotification(sub, JSON.stringify({ title, body, url: url || '/admin' }));
      } catch (err: unknown) {
        const error = err as { statusCode?: number };
        if (error.statusCode === 410 || error.statusCode === 404) {
          expired.push(i);
        } else {
          console.error('Push send error:', err);
        }
      }
    })
  );

  // Remove expired subscriptions
  if (expired.length > 0) {
    const remaining = subscriptions.filter((_, i) => !expired.includes(i));
    await supabaseAdmin
      .from('pt_settings')
      .upsert({ key: 'push_subscriptions', value: remaining }, { onConflict: 'key' });
  }
}
