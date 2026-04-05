'use client';

import { PaymentMethod } from '@/lib/types';
import Button from '@/components/ui/Button';

interface Props {
  selected: PaymentMethod;
  onChange: (method: PaymentMethod) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function PaymentMethodForm({ selected, onChange, onNext, onBack }: Props) {
  return (
    <div className="space-y-6 max-w-md mx-auto">
      <h2 className="font-heading font-bold text-xl text-purple mb-4">{'\u00bf'}C&oacute;mo prefieres pagar?</h2>

      <div className="space-y-3">
        {/* Bank Transfer */}
        <button
          type="button"
          onClick={() => onChange('bank_transfer')}
          className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
            selected === 'bank_transfer'
              ? 'border-teal bg-teal/5'
              : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
              selected === 'bank_transfer' ? 'border-teal' : 'border-gray-300'
            }`}>
              {selected === 'bank_transfer' && <div className="w-3 h-3 rounded-full bg-teal" />}
            </div>
            <div>
              <p className="font-heading font-semibold text-gray-800">Transferencia Bancaria</p>
              <p className="text-sm font-body text-gray-500">Sin recargo adicional</p>
            </div>
          </div>
        </button>

        {/* Bank transfer selected note */}
        {selected === 'bank_transfer' && (
          <div className="bg-cream rounded-xl p-4 ml-8 text-sm font-body">
            <p className="text-gray-600">Transferencia bancaria seleccionada. Los datos bancarios se muestran al confirmar tu pedido.</p>
          </div>
        )}

        {/* Credit Card */}
        <button
          type="button"
          onClick={() => onChange('credit_card')}
          className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
            selected === 'credit_card'
              ? 'border-teal bg-teal/5'
              : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
              selected === 'credit_card' ? 'border-teal' : 'border-gray-300'
            }`}>
              {selected === 'credit_card' && <div className="w-3 h-3 rounded-full bg-teal" />}
            </div>
            <div>
              <p className="font-heading font-semibold text-gray-800">Tarjeta de Crédito</p>
              <p className="text-sm font-body text-orange">+5% de recargo</p>
            </div>
          </div>
        </button>

        {selected === 'credit_card' && (
          <div className="bg-orange/5 border border-orange/20 rounded-xl p-4 ml-8 text-sm font-body">
            <p className="text-gray-600">
              Despu&eacute;s de confirmar tu pedido por WhatsApp, te enviaremos un link de pago seguro. El recargo del 5% se aplica al total.
            </p>
          </div>
        )}
      </div>

      <div className="pt-4 flex gap-3">
        <Button type="button" variant="outline" onClick={onBack} className="flex-1">Atrás</Button>
        <Button onClick={onNext} className="flex-1" size="lg">Casi listo &rarr;</Button>
      </div>
    </div>
  );
}
