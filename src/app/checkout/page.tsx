'use client';

import { useState } from 'react';
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

export default function CheckoutPage() {
  const router = useRouter();
  const { items, subtotal, clearCart } = useCart();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);

  const [customer, setCustomer] = useState<OrderCustomer>({
    name: '',
    phone: '',
    email: '',
  });

  const [event, setEvent] = useState<OrderEvent>({
    date: '',
    time: '',
    area: '',
    address: '',
    birthdayChildName: '',
    birthdayChildAge: '',
    theme: '',
  });

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('bank_transfer');

  // Calculate transport cost based on selected area
  const transportCost = EVENT_AREAS.find((a) => a.name === event.area)?.price ?? 0;
  const isTransportPending = event.area === 'Otra área';

  if (items.length === 0) {
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
      const pdfDoc = generateOrderPDF({
        orderNumber,
        customer,
        event,
        items,
        subtotal,
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

      // Open WhatsApp with order summary + PDF link
      const message = buildWhatsAppOrderMessage({
        orderNumber,
        customerName: customer.name,
        customerPhone: customer.phone,
        eventDate: event.date,
        eventTime: event.time,
        eventAddress: `${event.area} - ${event.address}`,
        items,
        subtotal,
        surcharge,
        total,
        paymentMethod,
        transportCost: isTransportPending ? -1 : transportCost,
        pdfUrl,
      });

      window.open(getWhatsAppUrl(message), '_blank');
      clearCart();
      router.push('/checkout/confirmacion');
    } catch {
      alert('Hubo un error. Por favor intenta de nuevo o contáctanos por WhatsApp.');
    } finally {
      setLoading(false);
    }
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
    </div>
  );
}
