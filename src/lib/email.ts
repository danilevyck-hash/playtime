import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// From address — use verified domain in production, or Resend's default for testing
const FROM_EMAIL = process.env.EMAIL_FROM || 'PlayTime <onboarding@resend.dev>';
const ADMIN_EMAIL = 'playtimekidspty@gmail.com';

interface OrderEmailData {
  orderNumber: string | number;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  eventDate: string;
  eventTime: string;
  eventArea?: string;
  eventAddress: string;
  birthdayChildName?: string;
  theme?: string;
  items: { name: string; quantity: number; unitPrice: number }[];
  subtotal: number;
  surcharge: number;
  total: number;
  paymentMethod: 'bank_transfer' | 'credit_card';
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(amount);
}

function fmtDate(dateStr: string): string {
  try {
    const parts = dateStr.split('-').map(Number);
    const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    return `${parts[2]} de ${MESES[parts[1] - 1]} de ${parts[0]}`;
  } catch { return dateStr; }
}

function buildOrderHTML(data: OrderEmailData, isAdmin: boolean): string {
  const itemRows = data.items.map(i =>
    `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#333">${i.name}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#333;text-align:center">${i.quantity}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#333;text-align:right">${formatCurrency(i.unitPrice * i.quantity)}</td>
    </tr>`
  ).join('');

  const payLabel = data.paymentMethod === 'bank_transfer' ? 'Transferencia Bancaria' : 'Tarjeta de Crédito (+5%)';

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f9f7f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:600px;margin:0 auto;padding:24px">
    <div style="background:#580459;padding:20px 24px;border-radius:12px 12px 0 0">
      <h1 style="margin:0;color:#fff;font-size:20px">PlayTime</h1>
      <p style="margin:4px 0 0;color:#84D9D0;font-size:12px">Creando Momentos</p>
    </div>

    <div style="background:#fff;padding:24px;border-radius:0 0 12px 12px;border:1px solid #eee;border-top:none">
      <h2 style="margin:0 0 16px;color:#580459;font-size:18px">
        ${isAdmin ? 'Nuevo Pedido' : 'Tu pedido ha sido recibido'}  #${data.orderNumber}
      </h2>

      ${isAdmin ? `
      <div style="background:#f9f7f4;padding:12px 16px;border-radius:8px;margin-bottom:16px">
        <p style="margin:0;font-size:14px;color:#333"><strong>${data.customerName}</strong></p>
        <p style="margin:4px 0 0;font-size:13px;color:#666">${data.customerPhone}${data.customerEmail ? ` · ${data.customerEmail}` : ''}</p>
      </div>
      ` : `
      <p style="font-size:14px;color:#555;margin:0 0 16px">
        Hola <strong>${data.customerName}</strong>, recibimos tu pedido. Te contactaremos pronto por WhatsApp para confirmar los detalles.
      </p>
      `}

      <div style="background:#f9f7f4;padding:12px 16px;border-radius:8px;margin-bottom:16px">
        <p style="margin:0;font-size:13px;color:#888;text-transform:uppercase;font-weight:600">Evento</p>
        <p style="margin:6px 0 0;font-size:14px;color:#333">${fmtDate(data.eventDate)} · ${data.eventTime}</p>
        <p style="margin:4px 0 0;font-size:14px;color:#333">${data.eventArea ? data.eventArea + ' – ' : ''}${data.eventAddress}</p>
        ${data.birthdayChildName ? `<p style="margin:4px 0 0;font-size:14px;color:#333">Cumpleañero/a: ${data.birthdayChildName}</p>` : ''}
        ${data.theme ? `<p style="margin:4px 0 0;font-size:14px;color:#333">Tema: ${data.theme}</p>` : ''}
      </div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
        <thead>
          <tr style="background:#580459">
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#fff;font-weight:600">Producto</th>
            <th style="padding:8px 12px;text-align:center;font-size:12px;color:#fff;font-weight:600">Cant.</th>
            <th style="padding:8px 12px;text-align:right;font-size:12px;color:#fff;font-weight:600">Total</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>

      <div style="text-align:right;padding:8px 0;border-top:2px solid #580459">
        <p style="margin:4px 0;font-size:13px;color:#888">Subtotal: ${formatCurrency(data.subtotal)}</p>
        ${data.surcharge > 0 ? `<p style="margin:4px 0;font-size:13px;color:#888">Recargo tarjeta: ${formatCurrency(data.surcharge)}</p>` : ''}
        <p style="margin:8px 0 0;font-size:18px;color:#580459;font-weight:700">Total: ${formatCurrency(data.total)}</p>
        <p style="margin:4px 0 0;font-size:12px;color:#aaa">Método: ${payLabel}</p>
      </div>
    </div>

    <p style="text-align:center;font-size:11px;color:#bbb;margin-top:16px">
      PlayTime – Creando Momentos · Panamá
    </p>
  </div>
</body>
</html>`;
}

export async function sendOrderNotification(data: OrderEmailData): Promise<void> {
  console.log('[Email] sendOrderNotification called for order #' + data.orderNumber);
  console.log('[Email] RESEND_API_KEY present:', !!process.env.RESEND_API_KEY);
  console.log('[Email] resend client initialized:', !!resend);

  if (!resend) {
    console.warn('[Email] Resend not configured (RESEND_API_KEY missing), skipping email');
    return;
  }

  // 1. Send to admin
  try {
    console.log('[Email] Sending to admin:', ADMIN_EMAIL, 'from:', FROM_EMAIL);
    const adminResult = await resend.emails.send({
      from: FROM_EMAIL,
      to: ADMIN_EMAIL,
      subject: `Nuevo Pedido #${data.orderNumber} — ${data.customerName}`,
      html: buildOrderHTML(data, true),
    });
    console.log('[Email] Admin email result:', JSON.stringify(adminResult));
  } catch (err) {
    console.error('[Email] Admin email error:', err);
  }

  // 2. Send to customer (if email provided)
  if (data.customerEmail) {
    try {
      console.log('[Email] Sending to customer:', data.customerEmail);
      const custResult = await resend.emails.send({
        from: FROM_EMAIL,
        to: data.customerEmail,
        subject: `Tu pedido #${data.orderNumber} ha sido recibido — PlayTime`,
        html: buildOrderHTML(data, false),
      });
      console.log('[Email] Customer email result:', JSON.stringify(custResult));
    } catch (err) {
      console.error('[Email] Customer email error:', err);
    }
  }
}
