import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { customer, event, paymentMethod, items, subtotal, surcharge, total } = body;

    if (!supabase) {
      // Supabase not configured, return a mock order number
      return NextResponse.json({ orderNumber: Math.floor(Math.random() * 9000) + 1000 });
    }

    // Insert order
    const { data: order, error: orderError } = await supabase
      .from('pt_orders')
      .insert({
        customer_name: customer.name,
        customer_phone: customer.phone,
        customer_email: customer.email || null,
        event_date: event.date,
        event_time: event.time,
        event_area: event.area || null,
        event_address: event.address,
        birthday_child_name: event.birthdayChildName || null,
        birthday_child_age: event.birthdayChildAge || null,
        payment_method: paymentMethod,
        subtotal,
        surcharge,
        total,
        notes: event.theme ? `Tema: ${event.theme}` : null,
      })
      .select('id, order_number')
      .single();

    if (orderError) {
      console.error('Order insert error:', orderError);
      return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
    }

    // Insert order items
    const orderItems = items.map((item: { productId: string; name: string; category: string; quantity: number; unitPrice: number }) => ({
      order_id: order.id,
      product_id: item.productId,
      product_name: item.name,
      category: item.category,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      line_total: item.quantity * item.unitPrice,
    }));

    const { error: itemsError } = await supabase
      .from('pt_order_items')
      .insert(orderItems);

    if (itemsError) {
      console.error('Order items insert error:', itemsError);
    }

    return NextResponse.json({ orderNumber: order.order_number, orderId: order.id });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const pin = request.headers.get('x-admin-pin');
    if (pin !== process.env.ADMIN_PIN) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }
    const body = await request.json();
    const { orderId, confirmed, internalNote, status, editFields, depositAmount, transportCostConfirmed } = body;

    if (internalNote !== undefined) {
      const { error: noteError } = await supabase
        .from('pt_orders')
        .update({ internal_note: internalNote })
        .eq('id', orderId);
      if (noteError) {
        const { data: existing } = await supabase.from('pt_orders').select('notes').eq('id', orderId).single();
        const currentNotes = existing?.notes || '';
        const separator = currentNotes ? '\n' : '';
        await supabase.from('pt_orders').update({ notes: `${currentNotes}${separator}\uD83D\uDCDD Nota interna: ${internalNote}` }).eq('id', orderId);
      }
      return NextResponse.json({ ok: true });
    }

    if (status !== undefined) {
      const isConfirmed = status !== 'nuevo';
      const updateData: Record<string, unknown> = { confirmed: isConfirmed };
      // Try status column, gracefully ignore if it doesn't exist
      const { error: statusError } = await supabase.from('pt_orders').update({ status, confirmed: isConfirmed }).eq('id', orderId);
      if (statusError) {
        // status column may not exist — just update confirmed
        await supabase.from('pt_orders').update(updateData).eq('id', orderId);
      }
      return NextResponse.json({ ok: true });
    }

    if (editFields !== undefined) {
      const mapped: Record<string, unknown> = {};
      if (editFields.customer_name !== undefined) mapped.customer_name = editFields.customer_name;
      if (editFields.customer_phone !== undefined) mapped.customer_phone = editFields.customer_phone;
      if (editFields.customer_email !== undefined) mapped.customer_email = editFields.customer_email || null;
      if (editFields.event_date !== undefined) mapped.event_date = editFields.event_date;
      if (editFields.event_time !== undefined) mapped.event_time = editFields.event_time;
      if (editFields.event_area !== undefined) mapped.event_area = editFields.event_area || null;
      if (editFields.event_address !== undefined) mapped.event_address = editFields.event_address;
      if (editFields.birthday_child_name !== undefined) mapped.birthday_child_name = editFields.birthday_child_name || null;
      if (editFields.birthday_child_age !== undefined) mapped.birthday_child_age = editFields.birthday_child_age || null;
      if (editFields.notes !== undefined) mapped.notes = editFields.notes || null;
      if (Object.keys(mapped).length > 0) {
        const { error } = await supabase.from('pt_orders').update(mapped).eq('id', orderId);
        if (error) {
          console.error('Edit error:', error);
          return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
        }
      }
      return NextResponse.json({ ok: true });
    }

    if (depositAmount !== undefined) {
      const { error: depError } = await supabase.from('pt_orders').update({ deposit_amount: depositAmount }).eq('id', orderId);
      if (depError) {
        // Column may not exist — store in notes as fallback
        const { data: existing } = await supabase.from('pt_orders').select('notes').eq('id', orderId).single();
        const currentNotes = existing?.notes || '';
        const separator = currentNotes ? '\n' : '';
        await supabase.from('pt_orders').update({ notes: `${currentNotes}${separator}\uD83D\uDCB0 Dep\u00f3sito: $${depositAmount}` }).eq('id', orderId);
      }
      return NextResponse.json({ ok: true });
    }

    if (transportCostConfirmed !== undefined) {
      const { error: tcError } = await supabase.from('pt_orders').update({ transport_cost_confirmed: transportCostConfirmed }).eq('id', orderId);
      if (tcError) {
        const { data: existing } = await supabase.from('pt_orders').select('notes').eq('id', orderId).single();
        const currentNotes = existing?.notes || '';
        const separator = currentNotes ? '\n' : '';
        await supabase.from('pt_orders').update({ notes: `${currentNotes}${separator}\uD83D\uDE9A Transporte confirmado: $${transportCostConfirmed}` }).eq('id', orderId);
      }
      return NextResponse.json({ ok: true });
    }

    if (confirmed !== undefined) {
      const { error } = await supabase.from('pt_orders').update({ confirmed }).eq('id', orderId);
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
    // Simple PIN auth via header
    const pin = request.headers.get('x-admin-pin');
    if (pin !== process.env.ADMIN_PIN) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!supabase) {
      return NextResponse.json({ orders: [], message: 'Supabase not configured' });
    }

    const { data: orders, error } = await supabase
      .from('pt_orders')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Orders fetch error:', error);
      return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
    }

    // Fetch items for each order
    const orderIds = (orders || []).map((o: { id: number }) => o.id);
    const allItems: Record<number, Array<{ product_name: string; quantity: number; unit_price: number; line_total: number }>> = {};

    if (orderIds.length > 0) {
      const { data: items } = await supabase
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
    const pin = request.headers.get('x-admin-pin');
    if (pin !== process.env.ADMIN_PIN) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }
    const { orderId } = await request.json();

    // Delete items first in case there's no CASCADE
    await supabase.from('pt_order_items').delete().eq('order_id', orderId);

    const { error } = await supabase.from('pt_orders').delete().eq('id', orderId);
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
