'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCart } from '@/context/CartContext';
import { OrderCustomer, OrderEvent, PaymentMethod } from '@/lib/types';
import { buildWhatsAppOrderMessage, getWhatsAppUrl } from '@/lib/whatsapp';
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
    address: '',
    birthdayChildName: '',
    birthdayChildAge: '',
    theme: '',
  });

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('bank_transfer');

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
      const surcharge = paymentMethod === 'credit_card' ? subtotal * 0.05 : 0;
      const total = subtotal + surcharge;

      // Try to save to Supabase (will silently fail if not configured)
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
            subtotal,
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

      // Open WhatsApp with order message
      const message = buildWhatsAppOrderMessage({
        orderNumber,
        customerName: customer.name,
        customerPhone: customer.phone,
        eventDate: event.date,
        eventTime: event.time,
        eventAddress: event.address,
        items,
        subtotal,
        surcharge,
        total,
        paymentMethod,
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
          onBack={() => setStep(2)}
          onSubmit={handleSubmit}
          loading={loading}
        />
      )}
    </div>
  );
}
