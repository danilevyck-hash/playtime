'use client';

import { PaymentMethod } from '@/lib/types';
import { BANK_INFO } from '@/lib/constants';
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
      <h2 className="font-heading font-bold text-xl text-purple mb-4">Método de Pago</h2>

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

        {/* Bank info shown when selected */}
        {selected === 'bank_transfer' && (
          <div className="bg-cream rounded-xl p-4 ml-8 text-sm font-body space-y-1">
            <p><span className="font-semibold">Banco:</span> {BANK_INFO.bank}</p>
            <p><span className="font-semibold">Titular:</span> {BANK_INFO.name}</p>
            <p><span className="font-semibold">Tipo:</span> {BANK_INFO.accountType}</p>
            <p><span className="font-semibold">Cuenta:</span> {BANK_INFO.accountNumber}</p>
            <p className="text-xs text-gray-400 mt-2">Envía el comprobante de pago al WhatsApp para confirmar tu reserva.</p>
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
              Te enviaremos un link de pago seguro por WhatsApp después de confirmar tu pedido.
              El recargo del 5% será agregado al total.
            </p>
          </div>
        )}
      </div>

      <div className="pt-4 flex gap-3">
        <Button type="button" variant="outline" onClick={onBack} className="flex-1">Atrás</Button>
        <Button onClick={onNext} className="flex-1" size="lg">Revisar Pedido</Button>
      </div>
    </div>
  );
}
