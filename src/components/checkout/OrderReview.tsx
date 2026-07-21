'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { OrderCustomer, OrderEvent, PaymentMethod, CartItem } from '@/lib/types';
import { formatCurrency } from '@/lib/format';
import { CREDIT_CARD_SURCHARGE } from '@/lib/constants';
import { fetchSetting } from '@/lib/supabase-data';
import { useProducts } from '@/lib/useProducts';
import { useCart } from '@/context/CartContext';
import { getCrossSellRules, buildCrossSellSuggestions, CrossSellRules } from '@/lib/cross-sell';
import Button from '@/components/ui/Button';

interface Props {
  customer: OrderCustomer;
  event: OrderEvent;
  paymentMethod: PaymentMethod;
  onPaymentMethodChange?: (method: PaymentMethod) => void;
  items: CartItem[];
  subtotal: number;
  transportCost: number; // -1 means "por confirmar"
  onBack: () => void;
  onSubmit: () => void;
  onEditStep?: (step: number) => void;
  loading: boolean;
  submitLabel?: string;
  loadingLabel?: string;
}

export default function OrderReview({ customer, event, paymentMethod, onPaymentMethodChange, items, subtotal, transportCost, onBack, onSubmit, onEditStep, loading, submitLabel, loadingLabel }: Props) {
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [fallbackIds, setFallbackIds] = useState<string[]>([]);
  const [rules, setRules] = useState<CrossSellRules>({});
  const allProducts = useProducts();
  const { addItem } = useCart();

  useEffect(() => {
    fetchSetting<string[]>('checkout_suggestions').then(ids => {
      if (Array.isArray(ids)) setFallbackIds(ids);
    }).catch(() => { /* ignore */ });
    getCrossSellRules().then(setRules).catch(() => { /* ignore */ });
  }, []);

  const { products: suggestions } = useMemo(
    () => buildCrossSellSuggestions(items, allProducts, rules, fallbackIds, 6),
    [items, allProducts, rules, fallbackIds],
  );

  const isTransportPending = transportCost < 0;
  const effectiveTransport = isTransportPending ? 0 : transportCost;
  const subtotalWithTransport = subtotal + effectiveTransport;
  const surcharge = paymentMethod === 'credit_card' ? subtotalWithTransport * CREDIT_CARD_SURCHARGE : 0;
  const total = subtotalWithTransport + surcharge;

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <h2 className="font-heading font-bold text-xl text-purple mb-4">Lo que elegiste para tu fiesta</h2>

      {/* Customer info */}
      <div className="bg-white rounded-xl p-4 border border-gray-100">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-heading font-semibold text-sm text-gray-500 uppercase tracking-wider">{'\u00bf'}Con qui&eacute;n hablamos?</h3>
          {onEditStep && <button onClick={() => onEditStep(0)} className="text-xs text-purple font-heading font-semibold hover:underline">Editar</button>}
        </div>
        <p className="font-body text-gray-800">{customer.name}</p>
        <p className="font-body text-gray-600 text-sm">{customer.phone}</p>
        {customer.email && <p className="font-body text-gray-600 text-sm">{customer.email}</p>}
      </div>

      {/* Event info */}
      <div className="bg-white rounded-xl p-4 border border-gray-100">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-heading font-semibold text-sm text-gray-500 uppercase tracking-wider">Evento</h3>
          {onEditStep && <button onClick={() => onEditStep(1)} className="text-xs text-purple font-heading font-semibold hover:underline">Editar</button>}
        </div>
        <p className="font-body text-gray-800">{event.date} a las {event.time}</p>
        <p className="font-body text-gray-600 text-sm">{event.area} - {event.address}</p>
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
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-heading font-semibold text-sm text-gray-500 uppercase tracking-wider">Art&iacute;culos</h3>
          <Link href="/carrito" className="text-xs text-purple font-heading font-semibold hover:underline">Editar</Link>
        </div>
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.productId} className="flex justify-between text-sm font-body">
              <span className="text-gray-700">{item.name} x{item.quantity}</span>
              <span className="font-heading font-semibold text-gray-800">{formatCurrency(item.unitPrice * item.quantity)}</span>
            </div>
          ))}
          {/* Transport line */}
          <div className="flex justify-between text-sm font-body pt-2 border-t border-gray-100">
            <span className="text-gray-700">Transporte, montaje y desmontaje</span>
            <span className="font-heading font-semibold text-gray-800">
              {isTransportPending ? 'Se confirma por WhatsApp' : formatCurrency(effectiveTransport)}
            </span>
          </div>
        </div>
      </div>

      {/* Last-chance suggestions */}
      {suggestions.length > 0 && (
        <div className="bg-white rounded-xl p-4 border border-orange/20">
          <h3 className="font-heading font-bold text-sm text-orange mb-1">
            {'\u2728'} Completa tu experiencia con:
          </h3>
          <p className="font-body text-xs text-gray-500 mb-3">Otros clientes agregaron esto a su fiesta</p>
          <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
            {suggestions.map(p => (
              <div key={p.id} className="flex-shrink-0 w-[120px] bg-cream rounded-xl overflow-hidden">
                {p.image ? (
                  <Image src={p.image} alt={p.name} width={120} height={80} className="w-full h-[80px] object-cover" />
                ) : (
                  <div className="w-full h-[80px] bg-gradient-to-br from-purple/5 to-teal/10 flex items-center justify-center">
                    <span className="text-2xl">{'\uD83C\uDF88'}</span>
                  </div>
                )}
                <div className="p-2">
                  <p className="font-heading font-semibold text-xs text-gray-800 line-clamp-2 leading-tight mb-1">{p.name}</p>
                  <div className="flex items-center justify-between">
                    <span className="font-heading font-bold text-xs text-purple">{formatCurrency(p.price)}</span>
                    <button
                      onClick={() => addItem({
                        productId: p.id,
                        name: p.name,
                        category: p.category,
                        unitPrice: p.price,
                        image: p.image,
                        maxQuantity: p.maxQuantity,
                        minQuantity: p.minQuantity,
                        quantityStep: p.quantityStep,
                        quantity: p.minQuantity || 1,
                      })}
                      className="w-9 h-9 rounded-full bg-orange text-white flex items-center justify-center text-base font-bold hover:bg-orange/90 transition-colors"
                      aria-label={`Agregar ${p.name}`}
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Payment method inline toggle */}
      {onPaymentMethodChange && (
        <div className="bg-white rounded-xl p-4 border border-gray-100">
          <h3 className="font-heading font-semibold text-sm text-gray-500 uppercase tracking-wider mb-3">{'\u00bf'}C{'ó'}mo prefieres pagar?</h3>
          <div className="flex gap-2">
            <button onClick={() => onPaymentMethodChange('bank_transfer')} className={`flex-1 py-3 rounded-xl border-2 font-heading font-semibold text-sm text-center ${paymentMethod === 'bank_transfer' ? 'border-teal bg-teal/5 text-teal-text' : 'border-gray-200 text-gray-500'}`}>
              Transferencia
            </button>
            <button onClick={() => onPaymentMethodChange('credit_card')} className={`flex-1 py-3 rounded-xl border-2 font-heading font-semibold text-sm text-center ${paymentMethod === 'credit_card' ? 'border-teal bg-teal/5 text-teal-text' : 'border-gray-200 text-gray-500'}`}>
              Tarjeta <span className="text-orange-text text-xs">+5%</span>
            </button>
          </div>
        </div>
      )}

      {/* Total */}
      <div className="bg-cream rounded-xl p-4">
        <div className="flex justify-between text-sm font-body mb-1">
          <span className="text-gray-600">Subtotal</span>
          <span className="font-heading font-semibold">{formatCurrency(subtotal)}</span>
        </div>
        {effectiveTransport > 0 && (
          <div className="flex justify-between text-sm font-body mb-1">
            <span className="text-gray-600">Transporte</span>
            <span className="font-heading font-semibold">{formatCurrency(effectiveTransport)}</span>
          </div>
        )}
        {isTransportPending && (
          <div className="flex justify-between text-sm font-body mb-1">
            <span className="text-gray-600">Transporte</span>
            <span className="font-heading font-semibold text-orange-text">Se confirma por WhatsApp</span>
          </div>
        )}
        {surcharge > 0 && (
          <div className="flex justify-between text-sm font-body mb-1">
            <span className="text-gray-600">Recargo tarjeta (5%)</span>
            <span className="font-heading font-semibold text-orange-text">{formatCurrency(surcharge)}</span>
          </div>
        )}
        <div className="border-t border-gray-200 pt-2 mt-2 flex justify-between">
          <span className="font-heading font-bold text-gray-800">Total</span>
          <span className="font-heading font-bold text-2xl text-purple">
            {isTransportPending ? `${formatCurrency(total)}*` : formatCurrency(total)}
          </span>
        </div>
        {isTransportPending && (
          <p className="text-xs text-gray-500 font-body mt-1">*El costo de transporte se confirma por WhatsApp antes de proceder con el pago</p>
        )}
      </div>

      {paymentMethod === 'bank_transfer' && (
        <div className="bg-teal/5 border border-teal/20 rounded-xl p-4 text-sm font-body text-gray-600">
          <p>Transferencia bancaria seleccionada. Los datos bancarios se muestran al confirmar tu pedido.</p>
        </div>
      )}

      {/* Terms acceptance */}
      <label className="flex items-start gap-3 cursor-pointer select-none px-1">
        <input
          type="checkbox"
          checked={acceptedTerms}
          onChange={(e) => setAcceptedTerms(e.target.checked)}
          className="mt-0.5 w-4 h-4 rounded border-gray-300 text-purple focus:ring-purple accent-purple flex-shrink-0"
        />
        <span className="font-body text-xs text-gray-500 leading-relaxed">
          Acepto los{' '}
          <a href="/terminos" target="_blank" rel="noopener noreferrer" className="text-purple underline hover:text-purple/80">
            términos y condiciones
          </a>
        </span>
      </label>

      <div className="pt-2 flex gap-3">
        <Button type="button" variant="outline" onClick={onBack} className="flex-1" disabled={loading}>
          Atrás
        </Button>
        <Button onClick={onSubmit} className="flex-1" size="lg" disabled={loading || !acceptedTerms}>
          {loading ? (loadingLabel || 'Preparando magia... \u2728') : (submitLabel || '\u00a1Reservar mi fiesta! \uD83C\uDF88')}
        </Button>
      </div>
    </div>
  );
}
