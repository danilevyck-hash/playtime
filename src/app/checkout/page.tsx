'use client';

import { useState, useEffect, useCallback } from 'react';
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
import PaymentMethodForm from '@/components/checkout/PaymentMethodForm';
import OrderReview from '@/components/checkout/OrderReview';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import { BANK_INFO, CONTACT, CREDIT_CARD_SURCHARGE } from '@/lib/constants';

const CHECKOUT_STORAGE_KEY = 'playtime-checkout';

function loadCheckoutState() {
  try {
    const saved = sessionStorage.getItem(CHECKOUT_STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return null;
}

function clearCheckoutState() {
  try { sessionStorage.removeItem(CHECKOUT_STORAGE_KEY); } catch {}
}

export default function CheckoutPage() {
  const router = useRouter();
  const { items, subtotal, clearCart } = useCart();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [whatsappUrl, setWhatsappUrl] = useState('');
  const [orderNum, setOrderNum] = useState<string | number | null>(null);
  const [eventAreas, setEventAreas] = useState(DEFAULT_AREAS);
  const [areasLoaded, setAreasLoaded] = useState(false);

  useEffect(() => {
    fetchEventAreas().then(setEventAreas).catch((e) => console.error('Error loading areas:', e)).finally(() => setAreasLoaded(true));
  }, []);

  const saved = typeof window !== 'undefined' ? loadCheckoutState() : null;

  const [step, setStep] = useState(saved?.step ?? 0);
  const [customer, setCustomer] = useState<OrderCustomer>(saved?.customer ?? { name: '', phone: '', email: '' });
  const [event, setEvent] = useState<OrderEvent>(saved?.event ?? { date: '', time: '', area: '', address: '', birthdayChildName: '', birthdayChildAge: '', theme: '' });
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

  if (items.length === 0 && !whatsappUrl) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <div className="text-6xl mb-4">{'\uD83C\uDF89'}</div>
        <h1 className="font-heading font-bold text-2xl text-gray-400 mb-2">{'\u00a1'}Tu fiesta te est&aacute; esperando!</h1>
        <p className="font-body text-gray-400 mb-6">Explora nuestros servicios para empezar {'\uD83C\uDF89'}</p>
        <Link href="/catalogo">
          <Button>{'\u00a1'}Arma tu fiesta! {'\uD83C\uDF89'}</Button>
        </Link>
      </div>
    );
  }

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const subtotalWithTransport = subtotal + transportCost;
      const surcharge = paymentMethod === 'credit_card' ? subtotalWithTransport * CREDIT_CARD_SURCHARGE : 0;
      const total = subtotalWithTransport + surcharge;

      // Try to save to Supabase
      // Generate unique order number: YYMMDD + 4 random digits (e.g. 260404-7382)
      const now = new Date();
      const datePart = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
      const randPart = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
      let orderNumber: string | number = `${datePart}-${randPart}`;
      try {
        const res = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer,
            event,
            paymentMethod,
            items,
            subtotal: subtotalWithTransport,
            surcharge,
            total,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          orderNumber = data.orderNumber || orderNumber;
        } else {
          console.error('Order API error:', res.status);
          showToast('No se pudo guardar el pedido, pero puedes continuar por WhatsApp');
        }
      } catch (e) {
        console.error('Order save error:', e);
        showToast('No se pudo guardar el pedido, pero puedes continuar por WhatsApp');
      }

      // Generate PDF and upload to Supabase Storage
      const pdfLogoUrl = await fetchLogoUrl().catch(() => null);
      const pdfDoc = await generateOrderPDF({
        orderNumber,
        customer,
        event,
        items,
        subtotal: subtotalWithTransport,
        transportCost: isTransportPending ? -1 : transportCost,
        surcharge,
        total,
        paymentMethod,
        logoUrl: pdfLogoUrl,
      });

      let pdfUrl = '';
      try {
        const pdfBlob = pdfDoc.output('blob');
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (supabaseUrl && supabaseKey) {
          const sb = createClient(supabaseUrl, supabaseKey);
          const fileName = `pedidos/PlayTime-Pedido-${orderNumber}.pdf`;
          await sb.storage.from('playtime-images').upload(fileName, pdfBlob, {
            contentType: 'application/pdf',
            upsert: true,
          });
          const { data: urlData } = sb.storage.from('playtime-images').getPublicUrl(fileName);
          pdfUrl = urlData.publicUrl;
        }
      } catch (e) {
        console.error('PDF upload error:', e);
        // Continue without PDF link — order still goes through WhatsApp
      }

      // Build WhatsApp URL and store it — user will click a native link
      const message = buildWhatsAppOrderMessage({
        orderNumber,
        customerName: customer.name,
        customerPhone: customer.phone,
        eventDate: event.date,
        eventTime: event.time,
        eventAddress: `${event.area} - ${event.address}`,
        items,
        subtotal: subtotalWithTransport,
        surcharge,
        total,
        paymentMethod,
        transportCost: isTransportPending ? -1 : transportCost,
        pdfUrl,
      });

      setWhatsappUrl(getWhatsAppUrl(message));
      setOrderNum(orderNumber);
      clearCheckoutState();
      setStep(4);
    } catch (e) {
      console.error('Checkout error:', e);
      showToast('Ups, algo salió mal. Escríbenos por WhatsApp y te ayudamos');
    } finally {
      setLoading(false);
    }
  };

  const handleFinish = () => {
    clearCart();
    router.push(`/checkout/confirmacion?pedido=${orderNum || ''}&metodo=${paymentMethod}`);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 md:py-12">
      <h1 className="font-heading font-bold text-3xl text-purple mb-6 text-center">{'\u00a1'}Casi lista tu fiesta!</h1>
      <StepIndicator current={step} />

      {step === 0 && (
        <CustomerInfoForm data={customer} onChange={setCustomer} onNext={() => setStep(1)} />
      )}
      {step === 1 && (
        <EventDetailsForm data={event} onChange={setEvent} onNext={() => setStep(2)} onBack={() => setStep(0)} areasLoaded={areasLoaded} eventAreas={eventAreas} />
      )}
      {step === 2 && (
        <PaymentMethodForm selected={paymentMethod} onChange={setPaymentMethod} onNext={() => setStep(3)} onBack={() => setStep(1)} />
      )}
      {step === 3 && (
        <OrderReview
          customer={customer}
          event={event}
          paymentMethod={paymentMethod}
          items={items}
          subtotal={subtotal}
          transportCost={isTransportPending ? -1 : transportCost}
          onBack={() => setStep(2)}
          onSubmit={handleSubmit}
          onEditStep={(s) => setStep(s)}
          loading={loading}
        />
      )}
      {step === 4 && whatsappUrl && (
        <div className="max-w-md mx-auto text-center space-y-6">
          <div className="text-6xl mb-2 animate-bounce">{'\u2705'}</div>
          <h2 className="font-heading font-black text-2xl text-purple">{'\u00a1'}Tu solicitud fue enviada!</h2>
          {orderNum && <p className="font-heading font-bold text-lg text-purple">Pedido #{orderNum}</p>}
          <p className="font-body text-gray-600">
            Te contactamos por WhatsApp en menos de 2 horas para confirmar tu reserva.
          </p>

          {paymentMethod === 'bank_transfer' && (
            <div className="bg-teal/5 border border-teal/20 rounded-2xl p-5 text-left space-y-2">
              <p className="font-heading font-bold text-sm text-gray-800">Para confirmar tu reserva, env&iacute;a el dep&oacute;sito a:</p>
              <div className="font-body text-sm text-gray-600 space-y-0.5">
                <p><span className="font-semibold">Banco:</span> {BANK_INFO.bank}</p>
                <p><span className="font-semibold">Titular:</span> {BANK_INFO.name}</p>
                <p><span className="font-semibold">{BANK_INFO.accountType}:</span> {BANK_INFO.accountNumber}</p>
              </div>
              <button
                onClick={() => { navigator.clipboard.writeText(`${BANK_INFO.bank} | ${BANK_INFO.name} | ${BANK_INFO.accountType}: ${BANK_INFO.accountNumber}`); }}
                className="w-full mt-2 bg-teal/10 text-teal font-heading font-bold text-sm py-2.5 rounded-xl hover:bg-teal/20 transition-colors"
              >
                Copiar datos bancarios
              </button>
            </div>
          )}

          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 w-full bg-[#25D366] hover:bg-[#20bd5a] text-white font-heading font-bold text-lg py-4 px-6 rounded-2xl transition-colors shadow-lg"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
            Abrir WhatsApp
          </a>
          <button
            onClick={handleFinish}
            className="w-full font-heading font-semibold text-sm text-purple hover:text-purple/80 transition-colors py-2"
          >
            Ya envi&eacute; mi pedido &rarr; Ver confirmaci&oacute;n
          </button>
          <p className="font-body text-xs text-gray-400">
            {'\u00bf'}Tienes preguntas? Escr&iacute;benos al {CONTACT.phone}
          </p>
        </div>
      )}
    </div>
  );
}
