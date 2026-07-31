export const dynamic = "force-dynamic";

import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase-server';
import { isValidSession, getClientIP } from '@/lib/admin-auth';
import { EVENT_AREAS, isPaymentMethod } from '@/lib/types';
import { buildCartId, baseProductId } from '@/lib/cart-id';
import { round2, computeOrderTotals } from '@/lib/order-math';
import { canonicalStatus, type OrderStatus } from '@/lib/order-status';
import { panamaToday } from '@/lib/timezone';
import { sendOrderNotification } from '@/lib/email';
import { sendPushNotification } from '@/lib/push';
import { generateOrderPDF } from '@/lib/pdf-order';
import { sendTelegramNotification } from '@/lib/telegram';

// Private bucket for order PDFs (created by the order-pdfs migration). Uploads
// use the service-role client; a signed URL is returned for the WhatsApp link.
const ORDER_PDF_BUCKET = 'order-pdfs';
const ORDER_PDF_SIGNED_TTL = 60 * 60 * 24 * 7; // 7 days
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Server-validated transport areas: pt_settings('event_areas') with EVENT_AREAS fallback.
 *  Transport is ALWAYS derived from this list by area name, never trusted from the client. */
async function fetchOrderEventAreas(db: SupabaseClient): Promise<{ name: string; price: number }[]> {
  try {
    const { data } = await db.from('pt_settings').select('value').eq('key', 'event_areas').single();
    if (Array.isArray(data?.value) && data.value.length > 0) return data.value as { name: string; price: number }[];
  } catch {}
  return EVENT_AREAS;
}

function isAdminAuthorized(request: NextRequest): boolean {
  // Token-only (works for both admin and vendedora). The raw x-admin-pin header
  // fallback was removed — the signed token is the single source of truth.
  return isValidSession(request.headers.get('x-admin-token'));
}

// In-memory rate limit for public order creation (per IP). Same best-effort,
// per-instance approach as the auth limiter — a determined attacker across cold
// starts isn't fully stopped, but casual spam of fake orders is.
const orderAttempts = new Map<string, { count: number; resetAt: number }>();
const ORDER_MAX = 5;
const ORDER_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
function isOrderRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = orderAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    orderAttempts.set(ip, { count: 1, resetAt: now + ORDER_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > ORDER_MAX;
}

// ─── Status transition matrix (validated server-side, mirrors UI) ───
// Canonicalization lives in @/lib/order-status; this is just the allowed moves.
const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pendiente: ['confirmado', 'rechazado'],
  confirmado: ['realizado', 'rechazado', 'pendiente'], // pendiente = deshacer un confirmado por error
  realizado: ['confirmado'], // deshacer un realizado por error
  rechazado: ['pendiente'], // reactivar
};

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIP(request.headers);
    if (isOrderRateLimited(ip)) {
      return NextResponse.json({ error: 'Demasiados pedidos seguidos. Espera unos minutos e intenta de nuevo.' }, { status: 429 });
    }

    const body = await request.json();
    const { customer, event, paymentMethod, items } = body;

    // Validate required fields
    if (!customer?.name || typeof customer.name !== 'string' || customer.name.trim().length === 0 || customer.name.length > 100) {
      return NextResponse.json({ error: 'Datos inválidos', details: 'Nombre de cliente requerido (máx 100 caracteres)' }, { status: 400 });
    }
    if (!customer?.phone || typeof customer.phone !== 'string' || customer.phone.replace(/\D/g, '').length < 7) {
      return NextResponse.json({ error: 'Datos inválidos', details: 'Teléfono requerido (mín 7 dígitos)' }, { status: 400 });
    }
    if (customer.phone.replace(/\D/g, '').length > 15) {
      return NextResponse.json({ error: 'Datos inválidos', details: 'Teléfono demasiado largo' }, { status: 400 });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Datos inválidos', details: 'Se requiere al menos un producto' }, { status: 400 });
    }
    if (!event?.date || !/^\d{4}-\d{2}-\d{2}$/.test(event.date)) {
      return NextResponse.json({ error: 'Datos inválidos', details: 'Fecha de evento inválida (YYYY-MM-DD)' }, { status: 400 });
    }
    // Validate it's a real date (not 2024-13-45)
    const [year, month, day] = event.date.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    if (dateObj.getFullYear() !== year || dateObj.getMonth() !== month - 1 || dateObj.getDate() !== day) {
      return NextResponse.json({ error: 'Datos inválidos', details: 'La fecha no es válida' }, { status: 400 });
    }
    // Reject past dates (Panama timezone UTC-5)
    const todayStr = panamaToday();
    if (event.date < todayStr) {
      return NextResponse.json({ error: 'Datos inválidos', details: 'La fecha del evento no puede ser en el pasado' }, { status: 400 });
    }
    if (!isPaymentMethod(paymentMethod)) {
      return NextResponse.json({ error: 'Datos inválidos', details: 'Método de pago debe ser bank_transfer o credit_card' }, { status: 400 });
    }
    // Email is OPTIONAL, but if provided it must be a sane string — it's used as
    // the Resend `to`, so an unvalidated value turns checkout into an email relay.
    let customerEmail: string | null = null;
    if (customer.email !== undefined && customer.email !== null && customer.email !== '') {
      if (typeof customer.email !== 'string' || customer.email.length > 254 || !EMAIL_RE.test(customer.email)) {
        return NextResponse.json({ error: 'Datos inválidos', details: 'Correo electrónico inválido' }, { status: 400 });
      }
      customerEmail = customer.email;
    }

    // Validate each item
    for (const item of items) {
      if (!item.name || typeof item.name !== 'string') {
        return NextResponse.json({ error: 'Datos inválidos', details: 'Cada producto debe tener nombre' }, { status: 400 });
      }
      if (typeof item.quantity !== 'number' || item.quantity < 1 || item.quantity > 999) {
        return NextResponse.json({ error: 'Datos inválidos', details: `Cantidad inválida para ${item.name}` }, { status: 400 });
      }
      if (typeof item.unitPrice !== 'number' || item.unitPrice < 0) {
        return NextResponse.json({ error: 'Datos inválidos', details: `Precio inválido para ${item.name}` }, { status: 400 });
      }
    }

    // Public order creation MUST use the service-role client (anon RLS policies on
    // pt_orders are dropped to stop a PII leak). No silent anon fallback: 500 if
    // the key is missing, so a misconfig fails loudly instead of writing nothing.
    const db = supabaseAdmin;
    if (!db) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    // Validate prices against the REAL catalog (pt_products + pt_product_variants) so a
    // crafted POST cannot set arbitrary prices. Cart ids are `productId` or
    // `productId--variantId`; a variant price (when set) overrides the base price. We
    // OVERRIDE each unitPrice with the DB price — never trust the client's number.
    const baseIds = Array.from(new Set(items.map((i: { productId: string }) => baseProductId(String(i.productId)))));
    const [{ data: dbProducts }, { data: dbVariants }] = await Promise.all([
      db.from('pt_products').select('id, price').in('id', baseIds),
      db.from('pt_product_variants').select('product_id, id, price').in('product_id', baseIds),
    ]);
    const priceByProduct = new Map<string, number>();
    for (const p of dbProducts || []) priceByProduct.set(p.id, Math.max(0, Number(p.price) || 0));
    const priceByVariant = new Map<string, number>();
    for (const v of dbVariants || []) {
      if (v.price != null) priceByVariant.set(buildCartId(v.product_id, v.id), Math.max(0, Number(v.price) || 0));
    }
    for (const item of items) {
      const cartId = String(item.productId);
      const baseId = baseProductId(cartId);
      if (!priceByProduct.has(baseId)) {
        // The public catalog is DB-first, so every cart product must exist in pt_products.
        return NextResponse.json({ error: 'Datos inválidos', details: `Producto no encontrado: ${item.name}` }, { status: 400 });
      }
      item.unitPrice = priceByVariant.get(cartId) ?? priceByProduct.get(baseId)!;
    }

    // Items subtotal from the SERVER-resolved prices (never trust client totals)
    const serverSubtotal = round2(items.reduce((s: number, i: { unitPrice: number; quantity: number }) => s + i.unitPrice * i.quantity, 0));

    // Transport comes from the server-validated area list (NEVER the client). An
    // unknown area or 'Otra área' = pending → no transport in the quote, and we store
    // transport_cost_confirmed = null so the admin shows it as pending and confirms
    // later. For a known area we store its price so DB = email = PDF = what was quoted.
    const eventAreas = await fetchOrderEventAreas(db);
    const matchedArea = event.area ? eventAreas.find(a => a.name === event.area) : undefined;
    const transportPending = event.area === 'Otra área' || !matchedArea;
    const serverTransport = transportPending ? 0 : Math.max(0, round2(Number(matchedArea?.price) || 0));
    // Single totals formula (no discount at creation — admin applies it later).
    const totals = computeOrderTotals({ itemsTotal: serverSubtotal, transport: serverTransport, paymentMethod });
    const serverSurcharge = totals.surcharge;
    const serverTotal = totals.total;

    // Persist order + items ATOMICALLY via the create_order RPC (one transaction →
    // no "order without items"). Idempotent by idempotency_key: a double-submit/retry
    // with the same key returns the existing order instead of duplicating.
    const idemRaw = typeof body.idempotencyKey === 'string' ? body.idempotencyKey.trim() : '';
    const idempotencyKey = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idemRaw) ? idemRaw : null;

    const orderPayload = {
      customer_name: customer.name.trim(),
      customer_phone: customer.phone,
      customer_email: customerEmail,
      event_date: event.date,
      event_time: event.time,
      event_area: event.area || null,
      event_address: event.address,
      birthday_child_name: event.birthdayChildName || null,
      birthday_child_age: event.birthdayChildAge || null,
      payment_method: paymentMethod,
      subtotal: serverSubtotal,
      transport_cost_confirmed: transportPending ? null : serverTransport,
      surcharge: serverSurcharge,
      total: serverTotal,
      notes: event.theme ? `Tema: ${event.theme}` : null,
      idempotency_key: idempotencyKey,
    };
    const itemsPayload = items.map((item: { productId: string; name: string; category: string; quantity: number; unitPrice: number }) => ({
      product_id: item.productId,
      product_name: item.name,
      category: item.category,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      line_total: round2(item.quantity * item.unitPrice),
    }));

    const { data: created, error: createError } = await db.rpc('create_order', {
      p_order: orderPayload,
      p_items: itemsPayload,
    });
    if (createError || !created?.id) {
      console.error('create_order RPC error:', createError);
      return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
    }
    const order = { id: created.id as number, order_number: created.order_number as number };
    // Idempotent hit: the order already existed → don't re-send email/push.
    if (created.deduped === true) {
      return NextResponse.json({ orderNumber: order.order_number, orderId: order.id });
    }

    // Notifications must be AWAITED: on serverless the function is frozen/killed once
    // the response is returned, so fire-and-forget silently drops the email/push.
    // Failures are logged but never fail the order (it already exists).
    try {
      await sendOrderNotification({
        orderNumber: order.order_number,
        customerName: customer.name.trim(),
        customerPhone: customer.phone,
        customerEmail: customerEmail || undefined,
        eventDate: event.date,
        eventTime: event.time || '',
        eventArea: event.area || undefined,
        eventAddress: event.address || '',
        birthdayChildName: event.birthdayChildName || undefined,
        theme: event.theme || undefined,
        items: items.map((i: { name: string; quantity: number; unitPrice: number }) => ({
          name: i.name,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
        })),
        subtotal: serverSubtotal,
        transportCost: serverTransport,
        transportPending,
        surcharge: serverSurcharge,
        total: serverTotal,
        paymentMethod: paymentMethod as 'bank_transfer' | 'credit_card',
      });
    } catch (err) {
      console.error('Email notification error:', err);
    }

    try {
      await sendPushNotification(
        `Nuevo Pedido #${order.order_number}`,
        `${customer.name.trim()} — $${serverTotal.toFixed(2)}`,
        '/admin'
      );
    } catch (err) {
      console.error('Push notification error:', err);
    }

    try {
      await sendTelegramNotification({
        orderNumber: order.order_number,
        orderId: order.id,
        customerName: customer.name.trim(),
        total: serverTotal,
        eventDate: event.date,
        eventTime: event.time || undefined,
        transportCost: serverTransport,
        transportPending,
        paymentMethod: paymentMethod as 'bank_transfer' | 'credit_card',
      });
    } catch (err) {
      console.error('Telegram notification error:', err);
    }

    // Generate the order PDF SERVER-SIDE and upload it to a PRIVATE bucket with
    // the service-role client (the browser no longer uploads with the anon key).
    // Best-effort: any failure (e.g. the order-pdfs bucket not created yet) is
    // logged and skipped — the order already exists and must never be blocked.
    let pdfUrl: string | null = null;
    try {
      const doc = await generateOrderPDF({
        orderNumber: order.order_number,
        customer: { name: customer.name.trim(), phone: customer.phone, email: customerEmail || '' },
        event: {
          date: event.date,
          time: event.time || '',
          area: event.area || '',
          address: event.address || '',
          birthdayChildName: event.birthdayChildName || '',
          birthdayChildAge: event.birthdayChildAge || '',
          theme: event.theme || '',
        },
        items,
        subtotal: serverSubtotal,
        transportCost: transportPending ? -1 : serverTransport,
        surcharge: serverSurcharge,
        total: serverTotal,
        paymentMethod: paymentMethod as 'bank_transfer' | 'credit_card',
        logoUrl: `${request.nextUrl.origin}/logo-white.png`,
      });
      const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
      // Random token so the filename isn't guessable even inside the private
      // bucket. A 7-day signed URL goes into the WhatsApp message.
      const token = randomUUID().replace(/-/g, '');
      const path = `PlayTime-Pedido-${order.order_number}-${token}.pdf`;
      const { error: upErr } = await db.storage.from(ORDER_PDF_BUCKET).upload(path, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      });
      if (upErr) {
        console.error('Order PDF upload error (non-critical):', upErr);
      } else {
        const { data: signed } = await db.storage.from(ORDER_PDF_BUCKET).createSignedUrl(path, ORDER_PDF_SIGNED_TTL);
        pdfUrl = signed?.signedUrl || null;
      }
    } catch (e) {
      console.error('Order PDF generate/upload error (non-critical):', e);
    }

    // Return the SERVER-authoritative totals so the client uses these for the
    // WhatsApp message / confirmation, not the locally-computed cart numbers.
    return NextResponse.json({
      orderNumber: order.order_number,
      orderId: order.id,
      pdfUrl,
      subtotal: serverSubtotal,
      transport: serverTransport,
      transportPending,
      surcharge: serverSurcharge,
      total: serverTotal,
    });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    if (!isAdminAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const db = supabaseAdmin;
    if (!db) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }
    const body = await request.json();
    const { orderId, internalNote, status, editFields, paymentMethod, transportCostConfirmed, discount, discountType, editItems, addItem, removeItem, restore, addDeposit, removeDeposit } = body;

    if (!orderId || typeof orderId !== 'number') {
      return NextResponse.json({ error: 'orderId requerido' }, { status: 400 });
    }

    if (internalNote !== undefined) {
      const { error: noteError } = await db
        .from('pt_orders')
        .update({ internal_note: internalNote })
        .eq('id', orderId);
      if (noteError) {
        // Fallback for DBs without an internal_note column: append to notes.
        const { data: existing, error: readErr } = await db.from('pt_orders').select('notes').eq('id', orderId).single();
        if (readErr) {
          console.error('internalNote fallback read error:', readErr);
          return NextResponse.json({ error: 'No se pudo guardar la nota' }, { status: 500 });
        }
        const currentNotes = existing?.notes || '';
        const separator = currentNotes ? '\n' : '';
        const { error: writeErr } = await db.from('pt_orders').update({ notes: `${currentNotes}${separator}\uD83D\uDCDD Nota interna: ${internalNote}` }).eq('id', orderId);
        if (writeErr) {
          console.error('internalNote fallback write error:', writeErr);
          return NextResponse.json({ error: 'No se pudo guardar la nota' }, { status: 500 });
        }
      }
      return NextResponse.json({ ok: true });
    }

    if (restore !== undefined) {
      // Un-archive: clear the soft-delete marker.
      const { error } = await db.from('pt_orders').update({ deleted_at: null }).eq('id', orderId);
      if (error) {
        console.error('restore error:', error);
        return NextResponse.json({ error: 'No se pudo restaurar el pedido' }, { status: 500 });
      }
      return NextResponse.json({ ok: true });
    }

    if (status !== undefined) {
      const validStatuses = ['pendiente', 'confirmado', 'realizado', 'rechazado'];
      if (!validStatuses.includes(status)) {
        return NextResponse.json({ error: 'Estado inválido' }, { status: 400 });
      }
      // Validate the transition against the matrix (server-side, not just UI).
      // If the read fails we must NOT proceed: a null row canonicalizes to
      // 'pendiente', which would wrongly allow reopening a closed order.
      const { data: cur, error: readErr } = await db.from('pt_orders').select('status, confirmed').eq('id', orderId).single();
      if (readErr || !cur) {
        console.error('status read error:', readErr);
        return NextResponse.json({ error: 'No se pudo verificar el estado actual del pedido' }, { status: 500 });
      }
      const current = canonicalStatus(cur);
      if (status !== current && !STATUS_TRANSITIONS[current].includes(status as OrderStatus)) {
        return NextResponse.json({ error: `Transición no permitida: ${current} → ${status}` }, { status: 400 });
      }
      const isConfirmed = status === 'confirmado' || status === 'realizado';
      const { error: statusError } = await db.from('pt_orders').update({ status, confirmed: isConfirmed }).eq('id', orderId);
      if (statusError) {
        // Fallback for DBs without a status column: at least persist `confirmed`.
        const { error: fbErr } = await db.from('pt_orders').update({ confirmed: isConfirmed }).eq('id', orderId);
        if (fbErr) {
          console.error('status update error:', statusError, '· fallback error:', fbErr);
          return NextResponse.json({ error: 'No se pudo actualizar el estado' }, { status: 500 });
        }
      }
      return NextResponse.json({ ok: true });
    }

    if (editFields !== undefined) {
      const mapped: Record<string, unknown> = {};
      if (editFields.customer_name !== undefined) {
        const name = String(editFields.customer_name).trim();
        if (!name || name.length > 100) return NextResponse.json({ error: 'Nombre inválido' }, { status: 400 });
        mapped.customer_name = name;
      }
      if (editFields.customer_phone !== undefined) {
        const digits = String(editFields.customer_phone).replace(/\D/g, '');
        if (digits.length < 7 || digits.length > 15) return NextResponse.json({ error: 'Teléfono inválido (7-15 dígitos)' }, { status: 400 });
        mapped.customer_phone = editFields.customer_phone;
      }
      if (editFields.customer_email !== undefined) {
        const email = editFields.customer_email ? String(editFields.customer_email) : '';
        if (email && (email.length > 254 || !EMAIL_RE.test(email))) {
          return NextResponse.json({ error: 'Correo electrónico inválido' }, { status: 400 });
        }
        mapped.customer_email = email || null;
      }
      if (editFields.event_date !== undefined) {
        const d = String(editFields.event_date);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
          return NextResponse.json({ error: 'Fecha inválida (YYYY-MM-DD)' }, { status: 400 });
        }
        const [y, mo, da] = d.split('-').map(Number);
        const dt = new Date(y, mo - 1, da);
        if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== da) {
          return NextResponse.json({ error: 'La fecha no es válida' }, { status: 400 });
        }
        mapped.event_date = d;
      }
      if (editFields.event_time !== undefined) mapped.event_time = String(editFields.event_time).slice(0, 20);
      if (editFields.event_area !== undefined) mapped.event_area = editFields.event_area ? String(editFields.event_area).slice(0, 100) : null;
      if (editFields.event_address !== undefined) mapped.event_address = String(editFields.event_address).slice(0, 300);
      if (editFields.birthday_child_name !== undefined) mapped.birthday_child_name = editFields.birthday_child_name ? String(editFields.birthday_child_name).slice(0, 100) : null;
      if (editFields.birthday_child_age !== undefined) {
        if (editFields.birthday_child_age === '' || editFields.birthday_child_age === null) {
          mapped.birthday_child_age = null;
        } else {
          const age = Number(editFields.birthday_child_age);
          if (!Number.isFinite(age) || age < 0 || age > 99) {
            return NextResponse.json({ error: 'Edad inválida (0-99)' }, { status: 400 });
          }
          mapped.birthday_child_age = Math.trunc(age);
        }
      }
      if (editFields.notes !== undefined) mapped.notes = editFields.notes ? String(editFields.notes).slice(0, 2000) : null;
      if (Object.keys(mapped).length > 0) {
        const { error } = await db.from('pt_orders').update(mapped).eq('id', orderId);
        if (error) {
          console.error('Edit error:', error);
          return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
        }
      }
      return NextResponse.json({ ok: true });
    }

    // Depósitos atómicos vía RPC (SELECT FOR UPDATE en SQL → sin last-write-wins).
    // El RPC recalcula deposit_amount server-side y devuelve el array real → la UI
    // refresca desde la respuesta (no asume que agregó/borró).
    if (addDeposit !== undefined) {
      const amt = Number(addDeposit?.amount);
      if (isNaN(amt) || amt <= 0) {
        return NextResponse.json({ error: 'El monto del depósito debe ser mayor a 0' }, { status: 400 });
      }
      if (amt > 9999999) {
        return NextResponse.json({ error: 'Monto demasiado grande' }, { status: 400 });
      }
      const rawDate = typeof addDeposit?.date === 'string' ? addDeposit.date : '';
      const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : panamaToday();
      const { data, error } = await db.rpc('add_deposit', { p_order_id: orderId, p_amount: amt, p_date: date });
      if (error || !data) {
        console.error('add_deposit RPC error:', error);
        return NextResponse.json({ error: 'No se pudo guardar el depósito' }, { status: 500 });
      }
      const r = data as { deposits: unknown[]; deposit_amount: number };
      return NextResponse.json({ ok: true, deposits: r.deposits, deposit_amount: r.deposit_amount });
    }

    if (removeDeposit !== undefined) {
      const depId = String(removeDeposit);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(depId)) {
        return NextResponse.json({ error: 'ID de depósito inválido' }, { status: 400 });
      }
      // Si el id no existe el RPC es no-op (devuelve el array sin cambios) — la UI
      // se actualiza desde `deposits` real y detecta que no borró nada.
      const { data, error } = await db.rpc('remove_deposit', { p_order_id: orderId, p_deposit_id: depId });
      if (error || !data) {
        console.error('remove_deposit RPC error:', error);
        return NextResponse.json({ error: 'No se pudo eliminar el depósito' }, { status: 500 });
      }
      const r = data as { deposits: unknown[]; deposit_amount: number };
      return NextResponse.json({ ok: true, deposits: r.deposits, deposit_amount: r.deposit_amount });
    }

    // Atomic recalc helper: every mutating branch calls recalc_order_totals(p_order_id)
    // (compute + UPDATE in one RPC) instead of refetch + recalc-in-JS + update.
    type RecalcResult = { subtotal: number; surcharge: number; total: number };

    if (transportCostConfirmed !== undefined) {
      const val = Number(transportCostConfirmed);
      if (isNaN(val) || val < 0) {
        return NextResponse.json({ error: 'Costo de transporte debe ser >= 0' }, { status: 400 });
      }
      const { error: tErr } = await db.from('pt_orders').update({ transport_cost_confirmed: val }).eq('id', orderId);
      if (tErr) {
        console.error('transport update error:', tErr);
        return NextResponse.json({ error: 'No se pudo actualizar el transporte' }, { status: 500 });
      }
      const { data: totals, error: rErr } = await db.rpc('recalc_order_totals', { p_order_id: orderId });
      if (rErr || !totals) {
        console.error('transport recalc RPC error:', rErr);
        return NextResponse.json({ error: 'No se pudo recalcular el total' }, { status: 500 });
      }
      const t = totals as RecalcResult;
      return NextResponse.json({ ok: true, subtotal: t.subtotal, surcharge: t.surcharge, total: t.total });
    }

    if (discount !== undefined) {
      const val = Number(discount);
      const dtype = discountType === 'percent' ? 'percent' : 'fixed';
      if (isNaN(val) || val < 0) {
        return NextResponse.json({ error: 'Descuento debe ser >= 0' }, { status: 400 });
      }
      if (dtype === 'percent' && val > 100) {
        return NextResponse.json({ error: 'Porcentaje debe ser <= 100' }, { status: 400 });
      }
      if (dtype === 'fixed' && val > 9999999) {
        return NextResponse.json({ error: 'Descuento demasiado grande' }, { status: 400 });
      }
      const { error: discError } = await db.from('pt_orders').update({ discount: val, discount_type: dtype }).eq('id', orderId);
      if (discError) {
        // Fallback for DBs without a discount_type column.
        const { error: fbErr } = await db.from('pt_orders').update({ discount: val }).eq('id', orderId);
        if (fbErr) {
          console.error('discount update error:', discError, '· fallback error:', fbErr);
          return NextResponse.json({ error: 'No se pudo guardar el descuento' }, { status: 500 });
        }
      }
      const { data: totals, error: rErr } = await db.rpc('recalc_order_totals', { p_order_id: orderId });
      if (rErr || !totals) {
        console.error('discount recalc RPC error:', rErr);
        return NextResponse.json({ error: 'No se pudo recalcular el total' }, { status: 500 });
      }
      const t = totals as RecalcResult;
      return NextResponse.json({ ok: true, subtotal: t.subtotal, surcharge: t.surcharge, total: t.total });
    }

    if (paymentMethod !== undefined) {
      // Antes este campo no existía en el allow-list y se descartaba EN SILENCIO:
      // el admin no tenía forma de corregir un método de pago mal elegido.
      if (!isPaymentMethod(paymentMethod)) {
        return NextResponse.json({ error: 'Método de pago debe ser bank_transfer o credit_card' }, { status: 400 });
      }
      const { error: pmErr } = await db.from('pt_orders').update({ payment_method: paymentMethod }).eq('id', orderId);
      if (pmErr) {
        console.error('payment method update error:', pmErr);
        return NextResponse.json({ error: 'No se pudo actualizar el método de pago' }, { status: 500 });
      }
      // El recargo de tarjeta lo calcula compute_totals_raw dentro de la RPC, que
      // lee payment_method de la fila. No se duplica la regla del 5% en TypeScript.
      const { data: totals, error: rErr } = await db.rpc('recalc_order_totals', { p_order_id: orderId });
      if (rErr || !totals) {
        console.error('payment method recalc RPC error:', rErr);
        return NextResponse.json({ error: 'No se pudo recalcular el total' }, { status: 500 });
      }
      const t = totals as RecalcResult;
      return NextResponse.json({ ok: true, subtotal: t.subtotal, surcharge: t.surcharge, total: t.total });
    }

    if (editItems !== undefined) {
      if (!Array.isArray(editItems)) {
        return NextResponse.json({ error: 'editItems debe ser una lista' }, { status: 400 });
      }
      for (const item of editItems) {
        if (!item.id || typeof item.quantity !== 'number' || item.quantity < 1 || item.quantity > 999 || typeof item.unit_price !== 'number' || item.unit_price < 0 || item.unit_price > 99999) {
          return NextResponse.json({ error: 'Datos de item inválidos' }, { status: 400 });
        }
      }
      for (const item of editItems) {
        const lineTotal = round2(item.quantity * item.unit_price);
        const { error: updErr } = await db.from('pt_order_items').update({
          quantity: item.quantity,
          unit_price: item.unit_price,
          line_total: lineTotal,
        }).eq('id', item.id).eq('order_id', orderId); // Validate ownership
        if (updErr) {
          console.error('editItems update error:', updErr);
          return NextResponse.json({ error: 'No se pudieron actualizar los items' }, { status: 500 });
        }
      }
      const { error: rErr } = await db.rpc('recalc_order_totals', { p_order_id: orderId });
      if (rErr) {
        console.error('editItems recalc RPC error:', rErr);
        return NextResponse.json({ error: 'No se pudo recalcular el total' }, { status: 500 });
      }
      return NextResponse.json({ ok: true });
    }

    if (addItem !== undefined) {
      if (!addItem.product_name || typeof addItem.product_name !== 'string' || addItem.product_name.trim().length === 0) {
        return NextResponse.json({ error: 'Nombre de producto requerido' }, { status: 400 });
      }
      if (addItem.product_name.length > 200) {
        return NextResponse.json({ error: 'Nombre de producto demasiado largo' }, { status: 400 });
      }
      const qty = Number(addItem.quantity);
      const price = Number(addItem.unit_price);
      if (isNaN(qty) || qty < 1 || qty > 999) {
        return NextResponse.json({ error: 'Cantidad debe ser entre 1 y 999' }, { status: 400 });
      }
      if (isNaN(price) || price < 0 || price > 99999) {
        return NextResponse.json({ error: 'Precio inválido' }, { status: 400 });
      }
      const lineTotal = round2(qty * price);
      const { error: insertError } = await db.from('pt_order_items').insert({
        order_id: orderId,
        product_id: `manual-${Date.now()}`,
        product_name: addItem.product_name.trim(),
        category: 'manual',
        quantity: qty,
        unit_price: price,
        line_total: lineTotal,
      });
      if (insertError) {
        console.error('addItem insert error:', insertError);
        return NextResponse.json({ error: 'No se pudo guardar el ítem' }, { status: 500 });
      }
      const { error: rErr } = await db.rpc('recalc_order_totals', { p_order_id: orderId });
      if (rErr) {
        console.error('addItem recalc RPC error:', rErr);
        return NextResponse.json({ error: 'Item agregado pero no se pudo recalcular el total' }, { status: 500 });
      }
      return NextResponse.json({ ok: true });
    }

    if (removeItem !== undefined) {
      const { error: delErr } = await db.from('pt_order_items').delete().eq('id', removeItem).eq('order_id', orderId); // Validate ownership
      if (delErr) {
        console.error('removeItem delete error:', delErr);
        return NextResponse.json({ error: 'No se pudo eliminar el item' }, { status: 500 });
      }
      const { error: rErr } = await db.rpc('recalc_order_totals', { p_order_id: orderId });
      if (rErr) {
        console.error('removeItem recalc RPC error:', rErr);
        return NextResponse.json({ error: 'No se pudo recalcular el total' }, { status: 500 });
      }
      return NextResponse.json({ ok: true });
    }

    // Acá vivía una rama `confirmed` que hacía UPDATE del flag SIN pasar por la
    // matriz de transiciones: una puerta trasera para reabrir un pedido cerrado
    // en filas legacy sin `status`. Ningún cliente la usaba. El único camino
    // para mover el estado es la rama `status` de arriba, que sí valida.

    return NextResponse.json({ error: 'No action specified' }, { status: 400 });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    if (!isAdminAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = supabaseAdmin;
    if (!db) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    const url = new URL(request.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 100);
    const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);
    const q = (url.searchParams.get('q') || '').trim();
    const status = url.searchParams.get('status') || 'all';
    const month = url.searchParams.get('month') || '';
    const showDeleted = url.searchParams.get('deleted') === 'true';

    // event_date DESC: the first page carries all upcoming/recent events; "load more"
    // pages back into the past. count: 'exact' gives total for pagination + "load more".
    let query = db
      .from('pt_orders')
      .select('*', { count: 'exact' })
      .order('event_date', { ascending: false })
      .order('id', { ascending: false });

    // Soft-delete: default hides archived orders; ?deleted=true shows ONLY archived.
    query = showDeleted ? query.not('deleted_at', 'is', null) : query.is('deleted_at', null);

    // Status filter — mirrors getOrderStatus() mapping (incl. legacy values + null).
    if (status === 'pending') query = query.or('status.is.null,status.eq.pendiente,status.eq.nuevo');
    else if (status === 'confirmed') query = query.in('status', ['confirmado', 'aprobada', 'deposito']);
    else if (status === 'realizado') query = query.eq('status', 'realizado');
    else if (status === 'rejected') query = query.in('status', ['rechazado', 'rechazada']);

    // Event month filter (YYYY-MM).
    if (/^\d{4}-\d{2}$/.test(month)) {
      query = query.gte('event_date', `${month}-01`).lte('event_date', `${month}-31`);
    }

    // Text search: name/phone ilike + exact order_number when the term is numeric.
    if (q) {
      const term = q.replace(/[,%()*]/g, '').slice(0, 80);
      if (term) {
        let orFilter = `customer_name.ilike.%${term}%,customer_phone.ilike.%${term}%`;
        if (/^\d+$/.test(term)) orFilter += `,order_number.eq.${term}`;
        query = query.or(orFilter);
      }
    }

    const { data: orders, count, error } = await query.range(offset, offset + limit - 1);

    if (error) {
      console.error('Orders fetch error:', error);
      return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
    }

    const orderIds = (orders || []).map((o: { id: number }) => o.id);
    const allItems: Record<number, Array<{ product_name: string; quantity: number; unit_price: number; line_total: number }>> = {};

    if (orderIds.length > 0) {
      const { data: items } = await db
        .from('pt_order_items')
        .select('*')
        .in('order_id', orderIds);

      if (items) {
        for (const item of items) {
          if (!allItems[item.order_id]) allItems[item.order_id] = [];
          allItems[item.order_id].push(item);
        }
      }
    }

    const enriched = (orders || []).map((o: { id: number }) => ({
      ...o,
      items: allItems[o.id] || [],
    }));

    const total = count ?? enriched.length;
    return NextResponse.json({
      orders: enriched,
      total,
      hasMore: offset + (orders?.length || 0) < total,
    });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!isAdminAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const db = supabaseAdmin;
    if (!db) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }
    const { orderId } = await request.json();

    // Soft-delete (archivar): marca deleted_at en vez de borrar el registro contable.
    // Reversible vía PATCH { restore: true }. Los items se conservan.
    const { error } = await db
      .from('pt_orders')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', orderId);
    if (error) {
      console.error('Soft-delete error:', error);
      return NextResponse.json({ error: 'Failed to archive order' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
