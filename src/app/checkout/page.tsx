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
import { CREDIT_CARD_SURCHARGE } from '@/lib/constants';
import { getSiteTexts, DEFAULT_SITE_TEXTS, SiteTexts } from '@/lib/site-texts';

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
  const [eventAreas, setEventAreas] = useState(DEFAULT_AREAS);
  const [texts, setTexts] = useState<SiteTexts>(DEFAULT_SITE_TEXTS);
  const [areasLoaded, setAreasLoaded] = useState(false);

  useEffect(() => {
    fetchEventAreas().then(setEventAreas).catch((e) => console.error('Error loading areas:', e)).finally(() => setAreasLoaded(true));
    getSiteTexts().then(setTexts);
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

  const handleSubmit = async () => {
    const total = subtotal + transportCost + (paymentMethod === 'credit_card' ? (subtotal + transportCost) * CREDIT_CARD_SURCHARGE : 0);
    if (!window.confirm(`\u00bfConfirmar reserva por $${total.toFixed(2)}?`)) return;
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
      const pdfLogoUrl = await fetchLogoUrl().catch(() => null) || `${window.location.origin}/logo-white.png`;
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

      // Build WhatsApp URL for confirmation page
      const message = buildWhatsAppOrderMessage({
        orderNumber,
        customerName: customer.name,
        customerPhone: customer.phone,
        pdfUrl,
      });

      const waUrl = getWhatsAppUrl(message);
      clearCheckoutState();
      clearCart();

      // Open WhatsApp directly via location (works on mobile without popup blocker)
      window.location.href = waUrl;

      // After a short delay, redirect to confirmation page
      setTimeout(() => {
        router.push(`/checkout/confirmacion?pedido=${orderNumber}&metodo=${paymentMethod}`);
      }, 1000);
    } catch (e) {
      console.error('Checkout error:', e);
      showToast('Ups, algo salió mal. Escríbenos por WhatsApp y te ayudamos');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 md:py-12">
      <h1 className="font-heading font-bold text-3xl text-purple mb-6 text-center">{texts.checkout_title}</h1>
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
          submitLabel={texts.checkout_submit}
          loadingLabel={texts.checkout_loading}
        />
      )}
    </div>
  );
}
