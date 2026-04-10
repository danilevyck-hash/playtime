export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { isValidSession } from '@/lib/admin-auth';
import { CREDIT_CARD_SURCHARGE } from '@/lib/constants';
import { sendOrderNotification } from '@/lib/email';
import { sendPushNotification } from '@/lib/push';

function isAdminAuthorized(request: NextRequest): boolean {
  // Check session token first (works for both admin and vendedora), then fall back to PIN
  const token = request.headers.get('x-admin-token');
  if (isValidSession(token)) return true;
  const pin = request.headers.get('x-admin-pin');
  return pin === process.env.ADMIN_PIN;
}

/** Round to 2 decimal places to avoid floating-point issues */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
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

export async function POST(request: NextRequest) {
  try {
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

    // Recalculate totals server-side (never trust client totals)
    const serverSubtotal = round2(items.reduce((s: number, i: { unitPrice: number; quantity: number }) => s + i.unitPrice * i.quantity, 0));
    const serverSurcharge = paymentMethod === 'credit_card' ? round2(serverSubtotal * CREDIT_CARD_SURCHARGE) : 0;
    const serverTotal = round2(serverSubtotal + serverSurcharge);

    if (!supabase) {
      // Supabase not configured, return a mock order number
      const now = new Date();
      const datePart = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
      const randPart = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
      return NextResponse.json({ orderNumber: `${datePart}-${randPart}` });
    }

    // Insert order with server-calculated totals
    const { data: order, error: orderError } = await supabase
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

    const { error: itemsError } = await supabase
      .from('pt_order_items')
      .insert(orderItems);

    if (itemsError) {
      console.error('Order items insert error:', itemsError);
    }

    // Send email notifications (non-blocking)
    sendOrderNotification({
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
      surcharge: serverSurcharge,
      total: serverTotal,
      paymentMethod: paymentMethod as 'bank_transfer' | 'credit_card',
    }).catch(err => console.error('Email notification error:', err));

    // Send push notification (non-blocking)
    sendPushNotification(
      `Nuevo Pedido #${order.order_number}`,
      `${customer.name.trim()} — $${serverTotal.toFixed(2)}`,
      '/admin'
    ).catch(err => console.error('Push notification error:', err));

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
    const { orderId, confirmed, internalNote, status, editFields, depositAmount, deposits, transportCostConfirmed, discount, discountType, editItems, addItem, removeItem } = body;

    if (!orderId || typeof orderId !== 'number') {
      return NextResponse.json({ error: 'orderId requerido' }, { status: 400 });
    }

    if (internalNote !== undefined) {
      const { error: noteError } = await db
        .from('pt_orders')
        .update({ internal_note: internalNote })
        .eq('id', orderId);
      if (noteError) {
        const { data: existing } = await db.from('pt_orders').select('notes').eq('id', orderId).single();
        const currentNotes = existing?.notes || '';
        const separator = currentNotes ? '\n' : '';
        await db.from('pt_orders').update({ notes: `${currentNotes}${separator}\uD83D\uDCDD Nota interna: ${internalNote}` }).eq('id', orderId);
      }
      return NextResponse.json({ ok: true });
    }

    if (status !== undefined) {
      const validStatuses = ['pendiente', 'confirmado', 'realizado', 'rechazado'];
      if (!validStatuses.includes(status)) {
        return NextResponse.json({ error: 'Estado inválido' }, { status: 400 });
      }
      const isConfirmed = status === 'confirmado' || status === 'realizado';
      const updateData: Record<string, unknown> = { confirmed: isConfirmed };
      const { error: statusError } = await db.from('pt_orders').update({ status, confirmed: isConfirmed }).eq('id', orderId);
      if (statusError) {
        await db.from('pt_orders').update(updateData).eq('id', orderId);
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
        // Fallback: update deposit_amount only if deposits column doesn't exist yet
        if (depositAmount !== undefined) {
          await db.from('pt_orders').update({ deposit_amount: depositAmount }).eq('id', orderId);
        }
      }
      return NextResponse.json({ ok: true });
    }

    if (depositAmount !== undefined && deposits === undefined) {
      await db.from('pt_orders').update({ deposit_amount: depositAmount }).eq('id', orderId);
      return NextResponse.json({ ok: true });
    }

    if (transportCostConfirmed !== undefined) {
      const val = Number(transportCostConfirmed);
      if (isNaN(val) || val < 0) {
        return NextResponse.json({ error: 'Costo de transporte debe ser >= 0' }, { status: 400 });
      }
      await db.from('pt_orders').update({ transport_cost_confirmed: val }).eq('id', orderId);
      // Recalculate totals
      const { data: updatedItems } = await db.from('pt_order_items').select('line_total').eq('order_id', orderId);
      if (updatedItems) {
        const { data: orderData } = await db.from('pt_orders').select('discount, discount_type, payment_method').eq('id', orderId).single();
        const { itemsTotal, surcharge, total } = recalcTotals(updatedItems, {
          transport: val,
          discount: orderData?.discount ?? 0,
          discountType: orderData?.discount_type ?? 'fixed',
          paymentMethod: orderData?.payment_method ?? '',
        });
        await db.from('pt_orders').update({ subtotal: itemsTotal, surcharge, total }).eq('id', orderId);
        return NextResponse.json({ ok: true, subtotal: itemsTotal, surcharge, total });
      }
      return NextResponse.json({ ok: true });
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
        // Fallback: try without discount_type column (not migrated yet)
        await db.from('pt_orders').update({ discount: val }).eq('id', orderId);
      }
      // Recalculate totals
      const { data: updatedItems } = await db.from('pt_order_items').select('line_total').eq('order_id', orderId);
      if (updatedItems) {
        const { data: orderData } = await db.from('pt_orders').select('transport_cost_confirmed, payment_method').eq('id', orderId).single();
        const itemsTotal = round2(updatedItems.reduce((s, i) => s + i.line_total, 0));
        const discountAmount = dtype === 'percent' ? round2(itemsTotal * val / 100) : val;
        const { surcharge, total } = recalcTotals(updatedItems, {
          transport: orderData?.transport_cost_confirmed ?? 0,
          discount: discountAmount,
          paymentMethod: orderData?.payment_method ?? '',
        });
        await db.from('pt_orders').update({ subtotal: itemsTotal, surcharge, total }).eq('id', orderId);
        return NextResponse.json({ ok: true, subtotal: itemsTotal, surcharge, total });
      }
      return NextResponse.json({ ok: true });
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
        await db.from('pt_order_items').update({
          quantity: item.quantity,
          unit_price: item.unit_price,
          line_total: lineTotal,
        }).eq('id', item.id).eq('order_id', orderId); // Validate ownership
      }
      // Recalculate order totals (discount before surcharge)
      const { data: updatedItems } = await db.from('pt_order_items').select('line_total').eq('order_id', orderId);
      if (updatedItems) {
        const { data: orderData } = await db.from('pt_orders').select('transport_cost_confirmed, discount, discount_type, payment_method').eq('id', orderId).single();
        const { itemsTotal, surcharge, total } = recalcTotals(updatedItems, {
          transport: orderData?.transport_cost_confirmed ?? 0,
          discount: orderData?.discount ?? 0,
          discountType: orderData?.discount_type ?? 'fixed',
          paymentMethod: orderData?.payment_method ?? '',
        });
        await db.from('pt_orders').update({ subtotal: itemsTotal, surcharge, total }).eq('id', orderId);
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
      await db.from('pt_order_items').insert({
        order_id: orderId,
        product_id: `manual-${Date.now()}`,
        product_name: addItem.product_name.trim(),
        category: 'manual',
        quantity: qty,
        unit_price: price,
        line_total: lineTotal,
      });
      // Recalculate totals
      const { data: updatedItems } = await db.from('pt_order_items').select('line_total').eq('order_id', orderId);
      if (updatedItems) {
        const { data: orderData } = await db.from('pt_orders').select('transport_cost_confirmed, discount, discount_type, payment_method').eq('id', orderId).single();
        const { itemsTotal, surcharge, total } = recalcTotals(updatedItems, {
          transport: orderData?.transport_cost_confirmed ?? 0,
          discount: orderData?.discount ?? 0,
          discountType: orderData?.discount_type ?? 'fixed',
          paymentMethod: orderData?.payment_method ?? '',
        });
        await db.from('pt_orders').update({ subtotal: itemsTotal, surcharge, total }).eq('id', orderId);
      }
      return NextResponse.json({ ok: true });
    }

    if (removeItem !== undefined) {
      // Validate ownership before deleting
      await db.from('pt_order_items').delete().eq('id', removeItem).eq('order_id', orderId);
      // Recalculate totals
      const { data: updatedItems } = await db.from('pt_order_items').select('line_total').eq('order_id', orderId);
      if (updatedItems) {
        const { data: orderData } = await db.from('pt_orders').select('transport_cost_confirmed, discount, discount_type, payment_method').eq('id', orderId).single();
        const { itemsTotal, surcharge, total } = recalcTotals(updatedItems, {
          transport: orderData?.transport_cost_confirmed ?? 0,
          discount: orderData?.discount ?? 0,
          discountType: orderData?.discount_type ?? 'fixed',
          paymentMethod: orderData?.payment_method ?? '',
        });
        await db.from('pt_orders').update({ subtotal: itemsTotal, surcharge, total }).eq('id', orderId);
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
    const limit = Math.min(Number(url.searchParams.get('limit')) || 200, 500);
    const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);

    const { data: orders, error } = await db
      .from('pt_orders')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

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

    return NextResponse.json({ orders: enriched });
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

    await db.from('pt_order_items').delete().eq('order_id', orderId);

    const { error } = await db.from('pt_orders').delete().eq('id', orderId);
    if (error) {
      console.error('Delete error:', error);
      return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
