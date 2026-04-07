import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';

interface PushSubscriptionJSON {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

async function getSubscriptions(): Promise<PushSubscriptionJSON[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from('pt_settings')
    .select('value')
    .eq('key', 'push_subscriptions')
    .single();
  return data?.value || [];
}

async function saveSubscriptions(subs: PushSubscriptionJSON[]) {
  if (!supabaseAdmin) return;
  await supabaseAdmin
    .from('pt_settings')
    .upsert({ key: 'push_subscriptions', value: subs }, { onConflict: 'key' });
}

export async function POST(request: NextRequest) {
  try {
    const sub: PushSubscriptionJSON = await request.json();
    if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
      return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
    }

    const subs = await getSubscriptions();
    // Avoid duplicates
    const exists = subs.some((s) => s.endpoint === sub.endpoint);
    if (!exists) {
      subs.push(sub);
      await saveSubscriptions(subs);
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const sub: PushSubscriptionJSON = await request.json();
    const subs = await getSubscriptions();
    const filtered = subs.filter((s) => s.endpoint !== sub.endpoint);
    await saveSubscriptions(filtered);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
