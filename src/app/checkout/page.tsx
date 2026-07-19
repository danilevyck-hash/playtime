'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useCart } from '@/context/CartContext';
import { OrderCustomer, OrderEvent, PaymentMethod, EVENT_AREAS as DEFAULT_AREAS } from '@/lib/types';
import { fetchEventAreas, fetchLogoUrl } from '@/lib/supabase-data';
import { buildWhatsAppOrderMessage, getWhatsAppUrl } from '@/lib/whatsapp';
import { generateOrderPDF } from '@/lib/pdf-order';
import { createClient } from '@supabase/supabase-js';
import { useToast } from '@/context/ToastContext';
import StepIndicator from '@/components/checkout/StepIndicator';
import CustomerInfoForm from '@/components/checkout/CustomerInfoForm';
import EventDetailsForm from '@/components/checkout/EventDetailsForm';

import OrderReview from '@/components/checkout/OrderReview';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import { CREDIT_CARD_SURCHARGE } from '@/lib/constants';
import { formatCurrency } from '@/lib/format';
import { getSiteTexts, DEFAULT_SITE_TEXTS, SiteTexts } from '@/lib/site-texts';

const CHECKOUT_STORAGE_KEY = 'playtime-checkout';

function loadCheckoutState() {
  try {
    const saved = sessionStorage.getItem(CHECKOUT_STORAGE_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    // Validate saved event date is not in the past
    if (parsed?.event?.date) {
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      if (parsed.event.date < todayStr) {
        parsed.event.date = '';
      }
    }
    return parsed;
  } catch {}
  return null;
}

function clearCheckoutState() {
  try { sessionStorage.removeItem(CHECKOUT_STORAGE_KEY); } catch {}
}

/** Round to 2 decimal places */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export default function CheckoutPage() {
  const router = useRouter();
  const { items, subtotal, clearCart } = useCart();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmData, setConfirmData] = useState<{ subtotalLine: string; transportLine: string; surchargeLine: string; totalLine: string; pendingNote: string } | null>(null);
  const [eventAreas, setEventAreas] = useState(DEFAULT_AREAS);
  const [texts, setTexts] = useState<SiteTexts>(DEFAULT_SITE_TEXTS);
  const [areasLoaded, setAreasLoaded] = useState(false);
  const submittingRef = useRef(false);
  // Idempotency key: generated once per order attempt, REUSED on retry so a
  // double-submit / retry-after-timeout returns the same order (no duplicate).
  const idempotencyKeyRef = useRef<string | null>(null);

  useEffect(() => {
    fetchEventAreas().then(setEventAreas).catch((e) => console.error('Error loading areas:', e)).finally(() => setAreasLoaded(true));
    getSiteTexts().then(setTexts);
  }, []);

  const saved = typeof window !== 'undefined' ? loadCheckoutState() : null;

  const [step, setStep] = useState(saved?.step ?? 0);
  const [customer, setCustomer] = useState<OrderCustomer>(saved?.customer ?? { name: '', phone: '', email: '' });
  const [event, setEvent] = useState<OrderEvent>(saved?.event ?? { date: '', time: '', showTime: '', area: '', address: '', birthdayChildName: '', birthdayChildAge: '', theme: '' });
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(saved?.paymentMethod ?? 'bank_transfer');

  const persistCheckout = useCallback((overrides?: { step?: number; customer?: OrderCustomer; event?: OrderEvent; paymentMethod?: PaymentMethod }) => {
    try {
      sessionStorage.setItem(CHECKOUT_STORAGE_KEY, JSON.stringify({
        step: overrides?.step ?? step,
        customer: overrides?.customer ?? customer,
        event: overrides?.event ?? event,
        paymentMethod: overrides?.paymentMethod ?? paymentMethod,
      }));
    } catch {}
  }, [step, customer, event, paymentMethod]);

  // Persist on every state change
  useEffect(() => {
    if (step < 4) persistCheckout();
  }, [step, customer, event, paymentMethod, persistCheckout]);

  // Calculate transport cost based on selected area
  const transportCost = eventAreas.find((a) => a.name === event.area)?.price ?? 0;
  const isTransportPending = event.area === 'Otra área';

  if (items.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <div className="text-6xl mb-4">{'\uD83C\uDF89'}</div>
        <h1 className="font-heading font-bold text-2xl text-gray-400 mb-2">{texts.cart_empty_title}</h1>
        <p className="font-body text-gray-400 mb-6">{texts.cart_empty_subtitle}</p>
        <Link href="/catalogo">
          <Button>{texts.catalog_cta}</Button>
        </Link>
      </div>
    );
  }

  const handleConfirmRequest = () => {
    if (submittingRef.current) return;

    const effectiveTransport = isTransportPending ? 0 : transportCost;
    const surcharge = paymentMethod === 'credit_card' ? round2((subtotal + effectiveTransport) * CREDIT_CARD_SURCHARGE) : 0;
    const total = round2(subtotal + effectiveTransport + surcharge);

    const transportLine = isTransportPending ? 'Transporte: Se confirma por WhatsApp' : (effectiveTransport > 0 ? `Transporte: ${formatCurrency(effectiveTransport)}` : '');
    const surchargeLine = surcharge > 0 ? `Recargo tarjeta (5%): ${formatCurrency(surcharge)}` : '';
    const pendingNote = isTransportPending ? '* El costo de transporte se confirma aparte' : '';
    const totalLine = `Total: ${formatCurrency(total)}${isTransportPending ? '*' : ''}`;
    const subtotalLine = `Subtotal: ${formatCurrency(subtotal)}`;

    setConfirmData({ subtotalLine, transportLine, surchargeLine, totalLine, pendingNote });
    setShowConfirmModal(true);
  };

  const handleSubmit = async () => {
    setShowConfirmModal(false);
    // Prevent double submissions
    if (submittingRef.current) return;

    const effectiveTransport = isTransportPending ? 0 : transportCost;
    const surcharge = paymentMethod === 'credit_card' ? round2((subtotal + effectiveTransport) * CREDIT_CARD_SURCHARGE) : 0;
    const total = round2(subtotal + effectiveTransport + surcharge);

    submittingRef.current = true;
    setLoading(true);
    setSubmitError(null);
    try {
      setLoadingStep('Guardando pedido...');

      // Persist the order in the DB FIRST. We only show the success screen if the
      // server confirms a real order (returns orderId). On any failure we keep the
      // cart, stay on this page, and surface a retry — never a fake "success".
      let orderNumber: string | number = '';
      try {
        if (!idempotencyKeyRef.current) idempotencyKeyRef.current = crypto.randomUUID();
        const res = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer,
            event,
            paymentMethod,
            items,
            idempotencyKey: idempotencyKeyRef.current,
          }),
        });
        if (!res.ok) {
          console.error('Order API error:', res.status);
          setSubmitError('No se pudo guardar tu pedido. Revisa tu conexión e intenta de nuevo.');
          return;
        }
        const data = await res.json();
        if (!data?.orderId) {
          console.error('Order API returned no orderId:', data);
          setSubmitError('No se pudo guardar tu pedido. Intenta de nuevo.');
          return;
        }
        orderNumber = data.orderNumber ?? data.orderId;
      } catch (e) {
        console.error('Order save error:', e);
        setSubmitError('No se pudo guardar tu pedido. Revisa tu conexión e intenta de nuevo.');
        return;
      }

      // The order now EXISTS in the DB. Everything below is best-effort: PDF
      // generation/upload is non-critical and must NOT block success or trigger a
      // re-POST on retry, so it is fully wrapped — the order goes through regardless.
      let pdfUrl = '';
      try {
        setLoadingStep('Generando factura...');
        const pdfLogoUrl = await fetchLogoUrl().catch(() => null) || `${window.location.origin}/logo-white.png`;
        const pdfDoc = await generateOrderPDF({
          orderNumber,
          customer,
          event,
          items,
          subtotal,
          transportCost: isTransportPending ? -1 : transportCost,
          surcharge,
          total,
          paymentMethod,
          logoUrl: pdfLogoUrl,
        });

        setLoadingStep('Subiendo PDF...');
        const pdfBlob = pdfDoc.output('blob');
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (supabaseUrl && supabaseKey) {
          const sb = createClient(supabaseUrl, supabaseKey);
          // Capability URL: append a random 128-bit token so the path is NOT guessable
          // from the (sequential) order number. The bucket stays public so the WhatsApp
          // link never expires, but order PDFs can no longer be enumerated.
          const token = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
          const fileName = `pedidos/PlayTime-Pedido-${orderNumber}-${token}.pdf`;
          await sb.storage.from('playtime-images').upload(fileName, pdfBlob, {
            contentType: 'application/pdf',
            upsert: true,
          });
          const { data: urlData } = sb.storage.from('playtime-images').getPublicUrl(fileName);
          pdfUrl = urlData.publicUrl;
        }
      } catch (e) {
        console.error('PDF generate/upload error (non-critical):', e);
        // Continue without PDF link — order already saved; WhatsApp still works.
      }

      // Build WhatsApp URL
      const message = buildWhatsAppOrderMessage({
        orderNumber,
        customerName: customer.name,
        customerPhone: customer.phone,
        pdfUrl,
        eventDate: event.date,
        eventTime: event.time,
        showTime: event.showTime,
        items: items.map(i => ({ name: i.name, quantity: i.quantity, unitPrice: i.unitPrice })),
        total,
      });

      const waUrl = getWhatsAppUrl(message);
      try {
        sessionStorage.setItem('playtime-order-summary', JSON.stringify({
          items: items.map(i => ({ name: i.name, quantity: i.quantity, unitPrice: i.unitPrice })),
          total,
          date: event.date,
          time: event.time,
        }));
      } catch {}

      clearCheckoutState();
      clearCart();

      // Navigate to confirmation page first, then let user tap WhatsApp from there
      router.push(`/checkout/confirmacion?pedido=${orderNumber}&metodo=${paymentMethod}&wa=${encodeURIComponent(waUrl)}`);
    } catch (e) {
      console.error('Checkout error:', e);
      showToast('Ups, algo salió mal. Escríbenos por WhatsApp y te ayudamos');
    } finally {
      setLoading(false);
      setLoadingStep('');
      submittingRef.current = false;
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 md:py-12">
      <h1 className="font-heading font-bold text-3xl text-purple mb-6 text-center">{texts.checkout_title}</h1>
      <StepIndicator current={step} />

      {submitError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 my-4 text-center">
          <p className="font-heading font-bold text-red-600 mb-1">No se pudo enviar tu pedido</p>
          <p className="font-body text-sm text-red-500 mb-3">{submitError} Tu carrito sigue intacto.</p>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="bg-purple text-white font-heading font-bold px-6 py-2.5 rounded-xl hover:bg-purple-light transition-colors disabled:opacity-50"
          >
            {loading ? 'Reintentando…' : 'Reintentar'}
          </button>
        </div>
      )}

      {/* Mini order summary — visible on steps 0-1 */}
      {step < 2 && items.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-3 mb-6 flex items-center justify-between text-sm">
          <span className="font-body text-gray-500">{items.reduce((s, i) => s + i.quantity, 0)} art{'\u00ed'}culos</span>
          <span className="font-heading font-bold text-purple">{formatCurrency(subtotal)}</span>
        </div>
      )}

      <div key={step} className="animate-slide-in">
      {step === 0 && (
        <CustomerInfoForm data={customer} onChange={setCustomer} onNext={() => setStep(1)} />
      )}
      {step === 1 && (
        <EventDetailsForm data={event} onChange={(patch) => setEvent((prev) => ({ ...prev, ...patch }))} onNext={() => setStep(2)} onBack={() => setStep(0)} areasLoaded={areasLoaded} eventAreas={eventAreas} />
      )}
      {step === 2 && (
        <OrderReview
          customer={customer}
          event={event}
          paymentMethod={paymentMethod}
          onPaymentMethodChange={setPaymentMethod}
          items={items}
          subtotal={subtotal}
          transportCost={isTransportPending ? -1 : transportCost}
          onBack={() => setStep(1)}
          onSubmit={handleConfirmRequest}
          onEditStep={(s) => setStep(s)}
          loading={loading}
          submitLabel={texts.checkout_submit}
          loadingLabel={loadingStep || texts.checkout_loading}
        />
      )}
      </div>

      {/* Confirm Modal */}
      {showConfirmModal && confirmData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowConfirmModal(false)} />
          <div className="relative bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4">
            <h3 className="font-heading font-bold text-lg text-purple text-center">{'\u00bf'}Confirmar pedido?</h3>
            <div className="space-y-1 font-body text-sm text-gray-600">
              <p>{confirmData.subtotalLine}</p>
              {confirmData.transportLine && <p>{confirmData.transportLine}</p>}
              {confirmData.surchargeLine && <p>{confirmData.surchargeLine}</p>}
              <p className="font-heading font-bold text-purple text-base pt-1">{confirmData.totalLine}</p>
              {confirmData.pendingNote && <p className="text-xs text-gray-400 pt-1">{confirmData.pendingNote}</p>}
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 py-2.5 rounded-xl font-heading font-bold text-sm text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                className="flex-1 py-2.5 rounded-xl font-heading font-bold text-sm text-white bg-black hover:bg-gray-800 transition-colors"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
