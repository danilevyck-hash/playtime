'use client';

import { OrderCustomer, OrderEvent, PaymentMethod, CartItem } from '@/lib/types';
import { formatCurrency } from '@/lib/format';
import { BANK_INFO } from '@/lib/constants';
import Button from '@/components/ui/Button';

interface Props {
  customer: OrderCustomer;
  event: OrderEvent;
  paymentMethod: PaymentMethod;
  items: CartItem[];
  subtotal: number;
  onBack: () => void;
  onSubmit: () => void;
  loading: boolean;
}

export default function OrderReview({ customer, event, paymentMethod, items, subtotal, onBack, onSubmit, loading }: Props) {
  const surcharge = paymentMethod === 'credit_card' ? subtotal * 0.05 : 0;
  const total = subtotal + surcharge;

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <h2 className="font-heading font-bold text-xl text-purple mb-4">Revisa tu Pedido</h2>

      {/* Customer info */}
      <div className="bg-white rounded-xl p-4 border border-gray-100">
        <h3 className="font-heading font-semibold text-sm text-gray-500 uppercase tracking-wider mb-2">Datos de Contacto</h3>
        <p className="font-body text-gray-800">{customer.name}</p>
        <p className="font-body text-gray-600 text-sm">{customer.phone}</p>
        {customer.email && <p className="font-body text-gray-600 text-sm">{customer.email}</p>}
      </div>

      {/* Event info */}
      <div className="bg-white rounded-xl p-4 border border-gray-100">
        <h3 className="font-heading font-semibold text-sm text-gray-500 uppercase tracking-wider mb-2">Evento</h3>
        <p className="font-body text-gray-800">{event.date} a las {event.time}</p>
        <p className="font-body text-gray-600 text-sm">{event.address}</p>
        {event.birthdayChildName && (
          <p className="font-body text-gray-600 text-sm mt-1">
            Cumpleañero/a: {event.birthdayChildName}
            {event.birthdayChildAge ? ` (${event.birthdayChildAge} años)` : ''}
            {event.theme ? ` - Tema: ${event.theme}` : ''}
          </p>
        )}
      </div>

      {/* Items */}
      <div className="bg-white rounded-xl p-4 border border-gray-100">
        <h3 className="font-heading font-semibold text-sm text-gray-500 uppercase tracking-wider mb-3">Artículos</h3>
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.productId} className="flex justify-between text-sm font-body">
              <span className="text-gray-700">{item.name} x{item.quantity}</span>
              <span className="font-heading font-semibold text-gray-800">{formatCurrency(item.unitPrice * item.quantity)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Payment + Total */}
      <div className="bg-cream rounded-xl p-4">
        <div className="flex justify-between text-sm font-body mb-1">
          <span className="text-gray-600">Método de pago</span>
          <span className="font-heading font-semibold text-gray-800">
            {paymentMethod === 'bank_transfer' ? 'Transferencia' : 'Tarjeta (+5%)'}
          </span>
        </div>
        <div className="flex justify-between text-sm font-body mb-1">
          <span className="text-gray-600">Subtotal</span>
          <span className="font-heading font-semibold">{formatCurrency(subtotal)}</span>
        </div>
        {surcharge > 0 && (
          <div className="flex justify-between text-sm font-body mb-1">
            <span className="text-gray-600">Recargo (5%)</span>
            <span className="font-heading font-semibold text-orange">{formatCurrency(surcharge)}</span>
          </div>
        )}
        <div className="border-t border-gray-200 pt-2 mt-2 flex justify-between">
          <span className="font-heading font-bold text-gray-800">Total</span>
          <span className="font-heading font-bold text-2xl text-purple">{formatCurrency(total)}</span>
        </div>
      </div>

      {paymentMethod === 'bank_transfer' && (
        <div className="bg-teal/5 border border-teal/20 rounded-xl p-4 text-sm font-body text-gray-600">
          <p className="font-semibold mb-1">Datos bancarios para transferencia:</p>
          <p>{BANK_INFO.bank} | {BANK_INFO.name}</p>
          <p>{BANK_INFO.accountType}: {BANK_INFO.accountNumber}</p>
        </div>
      )}

      <div className="pt-2 flex gap-3">
        <Button type="button" variant="outline" onClick={onBack} className="flex-1" disabled={loading}>
          Atrás
        </Button>
        <Button onClick={onSubmit} className="flex-1" size="lg" disabled={loading}>
          {loading ? 'Enviando...' : 'Confirmar Pedido'}
        </Button>
      </div>
    </div>
  );
}
