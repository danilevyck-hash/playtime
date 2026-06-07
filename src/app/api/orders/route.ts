export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { isValidSession, getClientIP } from '@/lib/admin-auth';
import { CREDIT_CARD_SURCHARGE } from '@/lib/constants';
import { EVENT_AREAS } from '@/lib/types';
import { sendOrderNotification } from '@/lib/email';
import { sendPushNotification } from '@/lib/push';

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

/** Round to 2 decimal places to avoid floating-point issues */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
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

/** Recalculate order totals from items, applying discount before surcharge */
function recalcTotals(items: { line_total: number }[], opts: { transport: number; discount: number; discountType?: string; paymentMethod: string }) {
  const itemsTotal = round2(items.reduce((s, i) => s + i.line_total, 0));
  const discRaw = Math.max(0, opts.discount);
  const disc = opts.discountType === 'percent' ? round2(itemsTotal * discRaw / 100) : discRaw;
  const subtotalAfterDiscount = Math.max(0, itemsTotal - disc);
  const transportVal = Math.max(0, opts.transport);
  const base = subtotalAfterDiscount + transportVal;
  const surcharge = opts.paymentMethod === 'credit_card' ? round2(base * CREDIT_CARD_SURCHARGE) : 0;
  const total = round2(base + surcharge);
  return { itemsTotal, surcharge, total };
}

// ─── Status transition matrix (validated server-side, mirrors UI) ───
type CanonStatus = 'pendiente' | 'confirmado' | 'realizado' | 'rechazado';
function canonicalStatus(o: { status?: string | null; confirmed?: boolean | null }): CanonStatus {
  const s = o.status;
  if (s === 'realizado') return 'realizado';
  if (s === 'rechazado' || s === 'rechazada') return 'rechazado';
  if (s === 'confirmado' || s === 'aprobada' || s === 'deposito') return 'confirmado';
  if (s === 'pendiente' || s === 'nuevo') return 'pendiente';
  if (o.confirmed) return 'confirmado';
  return 'pendiente';
}
const STATUS_TRANSITIONS: Record<CanonStatus, CanonStatus[]> = {
  pendiente: ['confirmado', 'rechazado'],
  confirmado: ['realizado', 'rechazado'],
  realizado: [], // estado cerrado
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
    const nowPanama = new Date(Date.now() - 5 * 60 * 60 * 1000);
    const todayStr = nowPanama.toISOString().slice(0, 10);
    if (event.date < todayStr) {
      return NextResponse.json({ error: 'Datos inválidos', details: 'La fecha del evento no puede ser en el pasado' }, { status: 400 });
    }
    if (!paymentMethod || !['bank_transfer', 'credit_card'].includes(paymentMethod)) {
      return NextResponse.json({ error: 'Datos inválidos', details: 'Método de pago debe ser bank_transfer o credit_card' }, { status: 400 });
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

    // Use the service-role client so public order creation does NOT depend on
    // anon RLS policies (those are being dropped to stop a PII leak on pt_orders).
    // Service role bypasses RLS for both the INSERT and the RETURNING select.
    const db = supabaseAdmin || supabase;
    if (!db) {
      // Supabase not configured, return a mock order number
      const now = new Date();
      const datePart = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
      const randPart = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
      return NextResponse.json({ orderNumber: `${datePart}-${randPart}` });
    }

    // Validate prices against the REAL catalog (pt_products + pt_product_variants) so a
    // crafted POST cannot set arbitrary prices. Cart ids are `productId` or
    // `productId--variantId`; a variant price (when set) overrides the base price. We
    // OVERRIDE each unitPrice with the DB price — never trust the client's number.
    const baseIds = Array.from(new Set(items.map((i: { productId: string }) => String(i.productId).split('--')[0])));
    const [{ data: dbProducts }, { data: dbVariants }] = await Promise.all([
      db.from('pt_products').select('id, price').in('id', baseIds),
      db.from('pt_product_variants').select('product_id, id, price').in('product_id', baseIds),
    ]);
    const priceByProduct = new Map<string, number>();
    for (const p of dbProducts || []) priceByProduct.set(p.id, Math.max(0, Number(p.price) || 0));
    const priceByVariant = new Map<string, number>();
    for (const v of dbVariants || []) {
      if (v.price != null) priceByVariant.set(`${v.product_id}--${v.id}`, Math.max(0, Number(v.price) || 0));
    }
    for (const item of items) {
      const cartId = String(item.productId);
      const baseId = cartId.split('--')[0];
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
    // Card surcharge applies to subtotal + transport, matching the client quote.
    const surchargeBase = serverSubtotal + serverTransport;
    const serverSurcharge = paymentMethod === 'credit_card' ? round2(surchargeBase * CREDIT_CARD_SURCHARGE) : 0;
    const serverTotal = round2(surchargeBase + serverSurcharge);

    // Insert order with server-calculated totals
    const { data: order, error: orderError } = await db
      .from('pt_orders')
      .insert({
        customer_name: customer.name.trim(),
        customer_phone: customer.phone,
        customer_email: customer.email || null,
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
      })
      .select('id, order_number')
      .single();

    if (orderError) {
      console.error('Order insert error:', orderError);
      return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
    }

    // Insert order items with server-calculated line totals
    const orderItems = items.map((item: { productId: string; name: string; category: string; quantity: number; unitPrice: number }) => ({
      order_id: order.id,
      product_id: item.productId,
      product_name: item.name,
      category: item.category,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      line_total: round2(item.quantity * item.unitPrice),
    }));

    const { error: itemsError } = await db
      .from('pt_order_items')
      .insert(orderItems);

    if (itemsError) {
      // Never report success for an order with no items. Roll back the order row
      // we just created and return an error so the client can retry cleanly.
      console.error('Order items insert error, rolling back order', order.id, ':', itemsError);
      await db.from('pt_orders').delete().eq('id', order.id);
      return NextResponse.json({ error: 'Failed to create order items' }, { status: 500 });
    }

    // Notifications must be AWAITED: on serverless the function is frozen/killed once
    // the response is returned, so fire-and-forget silently drops the email/push.
    // Failures are logged but never fail the order (it already exists).
    try {
      await sendOrderNotification({
        orderNumber: order.order_number,
        customerName: customer.name.trim(),
        customerPhone: customer.phone,
        customerEmail: customer.email || undefined,
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

    return NextResponse.json({ orderNumber: order.order_number, orderId: order.id });
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
    const db = supabaseAdmin || supabase;
    if (!db) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }
    const body = await request.json();
    const { orderId, confirmed, internalNote, status, editFields, depositAmount, deposits, transportCostConfirmed, discount, discountType, editItems, addItem, removeItem, restore } = body;

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
      const { data: cur } = await db.from('pt_orders').select('status, confirmed').eq('id', orderId).single();
      const current = canonicalStatus(cur || {});
      if (status !== current && !STATUS_TRANSITIONS[current].includes(status as CanonStatus)) {
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
      if (editFields.customer_email !== undefined) mapped.customer_email = editFields.customer_email || null;
      if (editFields.event_date !== undefined) mapped.event_date = editFields.event_date;
      if (editFields.event_time !== undefined) mapped.event_time = editFields.event_time;
      if (editFields.event_area !== undefined) mapped.event_area = editFields.event_area || null;
      if (editFields.event_address !== undefined) mapped.event_address = editFields.event_address;
      if (editFields.birthday_child_name !== undefined) mapped.birthday_child_name = editFields.birthday_child_name || null;
      if (editFields.birthday_child_age !== undefined) mapped.birthday_child_age = editFields.birthday_child_age || null;
      if (editFields.notes !== undefined) mapped.notes = editFields.notes || null;
      if (Object.keys(mapped).length > 0) {
        const { error } = await db.from('pt_orders').update(mapped).eq('id', orderId);
        if (error) {
          console.error('Edit error:', error);
          return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
        }
      }
      return NextResponse.json({ ok: true });
    }

    if (deposits !== undefined) {
      const updateData: Record<string, unknown> = { deposits };
      if (depositAmount !== undefined) updateData.deposit_amount = depositAmount;
      const { error: depError } = await db.from('pt_orders').update(updateData).eq('id', orderId);
      if (depError) {
        console.error('Deposits update error (deposits column may not exist):', depError);
        // Fallback: deposit_amount only (DBs without a deposits JSONB column).
        if (depositAmount !== undefined) {
          const { error: fbErr } = await db.from('pt_orders').update({ deposit_amount: depositAmount }).eq('id', orderId);
          if (fbErr) {
            console.error('Deposits fallback error:', fbErr);
            return NextResponse.json({ error: 'No se pudo guardar el depósito' }, { status: 500 });
          }
        } else {
          return NextResponse.json({ error: 'No se pudo guardar el depósito' }, { status: 500 });
        }
      }
      return NextResponse.json({ ok: true });
    }

    if (depositAmount !== undefined && deposits === undefined) {
      const { error } = await db.from('pt_orders').update({ deposit_amount: depositAmount }).eq('id', orderId);
      if (error) {
        console.error('deposit_amount update error:', error);
        return NextResponse.json({ error: 'No se pudo guardar el depósito' }, { status: 500 });
      }
      return NextResponse.json({ ok: true });
    }

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
      // Recalculate totals — a null/failed refetch means the stored total would be stale.
      const { data: updatedItems, error: itemsErr } = await db.from('pt_order_items').select('line_total').eq('order_id', orderId);
      if (itemsErr || !updatedItems) {
        console.error('transport recalc refetch error:', itemsErr);
        return NextResponse.json({ error: 'No se pudo recalcular el total' }, { status: 500 });
      }
      const { data: orderData } = await db.from('pt_orders').select('discount, discount_type, payment_method').eq('id', orderId).single();
      const { itemsTotal, surcharge, total } = recalcTotals(updatedItems, {
        transport: val,
        discount: orderData?.discount ?? 0,
        discountType: orderData?.discount_type ?? 'fixed',
        paymentMethod: orderData?.payment_method ?? '',
      });
      const { error: updErr } = await db.from('pt_orders').update({ subtotal: itemsTotal, surcharge, total }).eq('id', orderId);
      if (updErr) {
        console.error('transport total update error:', updErr);
        return NextResponse.json({ error: 'No se pudo guardar el total' }, { status: 500 });
      }
      return NextResponse.json({ ok: true, subtotal: itemsTotal, surcharge, total });
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
      const updateData: Record<string, unknown> = { discount: val, discount_type: dtype };
      const { error: discError } = await db.from('pt_orders').update(updateData).eq('id', orderId);
      if (discError) {
        // Fallback for DBs without a discount_type column.
        const { error: fbErr } = await db.from('pt_orders').update({ discount: val }).eq('id', orderId);
        if (fbErr) {
          console.error('discount update error:', discError, '· fallback error:', fbErr);
          return NextResponse.json({ error: 'No se pudo guardar el descuento' }, { status: 500 });
        }
      }
      // Recalculate totals — a null/failed refetch means the stored total would be stale.
      const { data: updatedItems, error: itemsErr } = await db.from('pt_order_items').select('line_total').eq('order_id', orderId);
      if (itemsErr || !updatedItems) {
        console.error('discount recalc refetch error:', itemsErr);
        return NextResponse.json({ error: 'No se pudo recalcular el total' }, { status: 500 });
      }
      const { data: orderData } = await db.from('pt_orders').select('transport_cost_confirmed, payment_method').eq('id', orderId).single();
      const itemsTotal = round2(updatedItems.reduce((s, i) => s + i.line_total, 0));
      const discountAmount = dtype === 'percent' ? round2(itemsTotal * val / 100) : val;
      const { surcharge, total } = recalcTotals(updatedItems, {
        transport: orderData?.transport_cost_confirmed ?? 0,
        discount: discountAmount,
        paymentMethod: orderData?.payment_method ?? '',
      });
      const { error: updErr } = await db.from('pt_orders').update({ subtotal: itemsTotal, surcharge, total }).eq('id', orderId);
      if (updErr) {
        console.error('discount total update error:', updErr);
        return NextResponse.json({ error: 'No se pudo guardar el total' }, { status: 500 });
      }
      return NextResponse.json({ ok: true, subtotal: itemsTotal, surcharge, total });
    }

    if (editItems !== undefined) {
      // Validate items
      for (const item of editItems) {
        if (!item.id || typeof item.quantity !== 'number' || item.quantity < 1 || typeof item.unit_price !== 'number' || item.unit_price < 0) {
          return NextResponse.json({ error: 'Datos de item inválidos' }, { status: 400 });
        }
      }
      // editItems: array of { id, quantity, unit_price }
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
      // Recalculate order totals (discount before surcharge)
      const { data: updatedItems, error: itemsErr } = await db.from('pt_order_items').select('line_total').eq('order_id', orderId);
      if (itemsErr || !updatedItems) {
        console.error('editItems recalc refetch error:', itemsErr);
        return NextResponse.json({ error: 'No se pudo recalcular el total' }, { status: 500 });
      }
      const { data: orderData } = await db.from('pt_orders').select('transport_cost_confirmed, discount, discount_type, payment_method').eq('id', orderId).single();
      const { itemsTotal, surcharge, total } = recalcTotals(updatedItems, {
        transport: orderData?.transport_cost_confirmed ?? 0,
        discount: orderData?.discount ?? 0,
        discountType: orderData?.discount_type ?? 'fixed',
        paymentMethod: orderData?.payment_method ?? '',
      });
      const { error: totErr } = await db.from('pt_orders').update({ subtotal: itemsTotal, surcharge, total }).eq('id', orderId);
      if (totErr) {
        console.error('editItems total update error:', totErr);
        return NextResponse.json({ error: 'No se pudo guardar el total' }, { status: 500 });
      }
      return NextResponse.json({ ok: true });
    }

    if (addItem !== undefined) {
      // Validate
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
      // addItem: { product_name, quantity, unit_price }
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
        return NextResponse.json({ error: insertError.message || 'Error al guardar item' }, { status: 500 });
      }
      // Recalculate totals
      const { data: updatedItems, error: itemsErr } = await db.from('pt_order_items').select('line_total').eq('order_id', orderId);
      if (itemsErr) {
        console.error('addItem refetch items error:', itemsErr);
        return NextResponse.json({ ok: true, warning: 'Item agregado pero no se pudieron recalcular los totales' });
      }
      if (updatedItems) {
        const { data: orderData, error: orderErr } = await db.from('pt_orders').select('transport_cost_confirmed, discount, discount_type, payment_method').eq('id', orderId).single();
        if (orderErr) {
          console.error('addItem fetch order error:', orderErr);
          return NextResponse.json({ ok: true, warning: 'Item agregado pero no se pudo recalcular el total' });
        }
        const { itemsTotal, surcharge, total } = recalcTotals(updatedItems, {
          transport: orderData?.transport_cost_confirmed ?? 0,
          discount: orderData?.discount ?? 0,
          discountType: orderData?.discount_type ?? 'fixed',
          paymentMethod: orderData?.payment_method ?? '',
        });
        const { error: updateErr } = await db.from('pt_orders').update({ subtotal: itemsTotal, surcharge, total }).eq('id', orderId);
        if (updateErr) {
          console.error('addItem update totals error:', updateErr);
          return NextResponse.json({ ok: true, warning: 'Item agregado pero el total puede estar desactualizado' });
        }
      }
      return NextResponse.json({ ok: true });
    }

    if (removeItem !== undefined) {
      // Validate ownership before deleting
      const { error: delErr } = await db.from('pt_order_items').delete().eq('id', removeItem).eq('order_id', orderId);
      if (delErr) {
        console.error('removeItem delete error:', delErr);
        return NextResponse.json({ error: 'No se pudo eliminar el item' }, { status: 500 });
      }
      // Recalculate totals — a null/failed refetch means the stored total would be stale.
      const { data: updatedItems, error: itemsErr } = await db.from('pt_order_items').select('line_total').eq('order_id', orderId);
      if (itemsErr || !updatedItems) {
        console.error('removeItem recalc refetch error:', itemsErr);
        return NextResponse.json({ error: 'No se pudo recalcular el total' }, { status: 500 });
      }
      const { data: orderData } = await db.from('pt_orders').select('transport_cost_confirmed, discount, discount_type, payment_method').eq('id', orderId).single();
      const { itemsTotal, surcharge, total } = recalcTotals(updatedItems, {
        transport: orderData?.transport_cost_confirmed ?? 0,
        discount: orderData?.discount ?? 0,
        discountType: orderData?.discount_type ?? 'fixed',
        paymentMethod: orderData?.payment_method ?? '',
      });
      const { error: totErr } = await db.from('pt_orders').update({ subtotal: itemsTotal, surcharge, total }).eq('id', orderId);
      if (totErr) {
        console.error('removeItem total update error:', totErr);
        return NextResponse.json({ error: 'No se pudo guardar el total' }, { status: 500 });
      }
      return NextResponse.json({ ok: true });
    }

    if (confirmed !== undefined) {
      const { error } = await db.from('pt_orders').update({ confirmed }).eq('id', orderId);
      if (error) {
        console.error('Update error:', error);
        return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
      }
      return NextResponse.json({ ok: true });
    }

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

    const db = supabaseAdmin || supabase;
    if (!db) {
      return NextResponse.json({ orders: [], message: 'Supabase not configured' });
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
    const db = supabaseAdmin || supabase;
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
