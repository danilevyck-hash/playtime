import { SITE_URL } from './constants';

// Init guardado (igual que resend=null en email.ts): si faltan las env vars
// (típico en local), el módulo queda en no-op y nunca rompe el build ni el pedido.
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
// Destino: chat directo con la dueña (chat_id POSITIVO). El código no asume signo:
// usa el chat_id tal cual venga en la env var.
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
const TELEGRAM_ENABLED = Boolean(BOT_TOKEN && CHAT_ID);

interface TelegramOrderData {
  orderNumber: string | number;
  orderId: string | number;
  customerName: string;
  total: number;
  eventDate: string;
  eventTime?: string;
  transportCost?: number;
  transportPending?: boolean;
  paymentMethod: 'bank_transfer' | 'credit_card';
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(amount);
}

/** Escapar campos del cliente antes de meterlos en el HTML de Telegram.
 *  parse_mode=HTML solo requiere escapar & < > (mismo riesgo de inyección que los emails). */
function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function fmtDate(dateStr: string): string {
  try {
    const parts = dateStr.split('-').map(Number);
    const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    return `${parts[2]} de ${MESES[parts[1] - 1]} de ${parts[0]}`;
  } catch { return dateStr; }
}

function buildMessage(data: TelegramOrderData): string {
  const payLabel = data.paymentMethod === 'bank_transfer' ? 'Transferencia' : 'Tarjeta (+5%)';
  const transportLine = data.transportPending
    ? '🚚 Transporte: <i>Por confirmar</i>'
    : (data.transportCost && data.transportCost > 0 ? `🚚 Transporte: ${formatCurrency(data.transportCost)}` : '');
  const dateLine = data.eventTime
    ? `${escapeHtml(fmtDate(data.eventDate))} · ${escapeHtml(data.eventTime)}`
    : escapeHtml(fmtDate(data.eventDate));

  const lines = [
    `🎉 <b>Nuevo Pedido #${escapeHtml(data.orderNumber)}</b>`,
    `👤 ${escapeHtml(data.customerName)}`,
    `📅 ${dateLine}`,
    `💰 Total: <b>${formatCurrency(data.total)}</b> (${payLabel})`,
    transportLine,
    `➡️ ${SITE_URL}/admin/pedidos/${escapeHtml(data.orderId)}`,
  ].filter(Boolean);

  return lines.join('\n');
}

/** Envía la alerta de pedido nuevo al chat de Telegram de la dueña.
 *  Nunca lanza fatal: el call site ya está en try/catch y el pedido ya existe en DB. */
export async function sendTelegramNotification(data: TelegramOrderData): Promise<void> {
  console.log('[Telegram] sendTelegramNotification called for order #' + data.orderNumber);
  console.log('[Telegram] BOT_TOKEN present:', !!BOT_TOKEN, '· CHAT_ID present:', !!CHAT_ID);

  if (!TELEGRAM_ENABLED) {
    console.warn('[Telegram] No configurado (TELEGRAM_BOT_TOKEN/CHAT_ID ausentes), se omite');
    return;
  }

  // Timeout: un Telegram colgado no debe retrasar la respuesta del checkout en serverless.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: buildMessage(data),
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[Telegram] API error: status ${res.status} — ${body}`);
    } else {
      console.log('[Telegram] Alerta enviada para pedido #' + data.orderNumber);
    }
  } catch (err) {
    console.error('[Telegram] Error de envío:', err);
  } finally {
    clearTimeout(timeout);
  }
}
