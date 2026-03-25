'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useCart } from '@/context/CartContext';
import { OrderCustomer, OrderEvent, PaymentMethod, EVENT_AREAS } from '@/lib/types';
import { buildWhatsAppOrderMessage, getWhatsAppUrl } from '@/lib/whatsapp';
import { generateOrderPDF } from '@/lib/pdf-order';
import { createClient } from '@supabase/supabase-js';
import StepIndicator from '@/components/checkout/StepIndicator';
import CustomerInfoForm from '@/components/checkout/CustomerInfoForm';
import EventDetailsForm from '@/components/checkout/EventDetailsForm';
import PaymentMethodForm from '@/components/checkout/PaymentMethodForm';
import OrderReview from '@/components/checkout/OrderReview';
import Link from 'next/link';
import Button from '@/components/ui/Button';

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
  const [loading, setLoading] = useState(false);
  const [whatsappUrl, setWhatsappUrl] = useState('');

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
  const transportCost = EVENT_AREAS.find((a) => a.name === event.area)?.price ?? 0;
  const isTransportPending = event.area === 'Otra área';

  if (items.length === 0 && !whatsappUrl) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <div className="text-6xl mb-4">🛒</div>
        <h1 className="font-heading font-bold text-2xl text-gray-400 mb-2">No hay productos en tu carrito</h1>
        <p className="font-body text-gray-400 mb-6">Agrega productos antes de hacer checkout</p>
        <Link href="/catalogo">
          <Button>Ir al Catálogo</Button>
        </Link>
      </div>
    );
  }

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const subtotalWithTransport = subtotal + transportCost;
      const surcharge = paymentMethod === 'credit_card' ? subtotalWithTransport * 0.05 : 0;
      const total = subtotalWithTransport + surcharge;

      // Try to save to Supabase
      let orderNumber = Math.floor(Math.random() * 9000) + 1000;
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
        }
      } catch {
        // Supabase not configured, continue with WhatsApp only
      }

      // Generate PDF and upload to Supabase Storage
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
      } catch {
        // If upload fails, continue without PDF link
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
      clearCheckoutState();
      setStep(4);
    } catch {
      alert('Hubo un error. Por favor intenta de nuevo o contáctanos por WhatsApp.');
    } finally {
      setLoading(false);
    }
  };

  const handleWhatsAppClick = () => {
    clearCheckoutState();
    clearCart();
    // Navigate to confirmation after a brief delay so the link opens first
    setTimeout(() => router.push('/checkout/confirmacion'), 500);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 md:py-12">
      <h1 className="font-heading font-bold text-3xl text-purple mb-6 text-center">Checkout</h1>
      <StepIndicator current={step} />

      {step === 0 && (
        <CustomerInfoForm data={customer} onChange={setCustomer} onNext={() => setStep(1)} />
      )}
      {step === 1 && (
        <EventDetailsForm data={event} onChange={setEvent} onNext={() => setStep(2)} onBack={() => setStep(0)} />
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
          loading={loading}
        />
      )}
      {step === 4 && whatsappUrl && (
        <div className="max-w-md mx-auto text-center space-y-6">
          <div className="text-6xl mb-2">🎉</div>
          <h2 className="font-heading font-bold text-2xl text-purple">¡Pedido Listo!</h2>
          <p className="font-body text-gray-600">
            Tu pedido fue guardado. Ahora envíalo por WhatsApp para que podamos confirmar tu reserva.
          </p>
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleWhatsAppClick}
            className="inline-flex items-center justify-center gap-2 w-full bg-[#25D366] hover:bg-[#20bd5a] text-white font-heading font-bold text-lg py-4 px-6 rounded-2xl transition-colors shadow-lg"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
            Enviar Pedido por WhatsApp
          </a>
          <p className="font-body text-xs text-gray-400">
            Al hacer click se abrirá WhatsApp con el resumen de tu pedido
          </p>
        </div>
      )}
    </div>
  );
}
