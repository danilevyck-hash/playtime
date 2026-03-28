'use client';

import { useState } from 'react';
import { OrderCustomer } from '@/lib/types';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';

const COUNTRY_CODES = [
  { code: '+507', country: 'Panamá', flag: '🇵🇦' },
  { code: '+1', country: 'USA', flag: '🇺🇸' },
  { code: '+57', country: 'Colombia', flag: '🇨🇴' },
  { code: '+52', country: 'México', flag: '🇲🇽' },
  { code: '+506', country: 'Costa Rica', flag: '🇨🇷' },
  { code: '+58', country: 'Venezuela', flag: '🇻🇪' },
];

interface Props {
  data: OrderCustomer;
  onChange: (data: OrderCustomer) => void;
  onNext: () => void;
}

export default function CustomerInfoForm({ data, onChange, onNext }: Props) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const getCountryCode = () => {
    for (const cc of COUNTRY_CODES) {
      if (data.phone.startsWith(cc.code)) return cc.code;
    }
    return '+507';
  };

  const getLocalNumber = () => {
    const cc = getCountryCode();
    return data.phone.replace(cc, '').trim();
  };

  const countryCode = getCountryCode();
  const localNumber = getLocalNumber();

  const handlePhoneChange = (code: string, number: string) => {
    const clean = number.replace(/\D/g, '');
    onChange({ ...data, phone: `${code}${clean}` });
    if (clean.length >= 7) setErrors(prev => { const n = { ...prev }; delete n.phone; return n; });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!data.name.trim()) errs.name = 'Necesitamos tu nombre para la reserva';
    if (localNumber.length < 7) errs.phone = 'Ingresa tu número de celular';
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) errs.email = 'El formato del email no es válido';
    setErrors(errs);
    if (Object.keys(errs).length === 0) onNext();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md mx-auto" noValidate>
      <h2 className="font-heading font-bold text-xl text-purple mb-4">{'\u00bf'}Con qui&eacute;n hablamos?</h2>
      <Input
        label="Nombre completo"
        value={data.name}
        onChange={(e) => { onChange({ ...data, name: e.target.value }); if (e.target.value.trim()) setErrors(prev => { const n = { ...prev }; delete n.name; return n; }); }}
        placeholder="María García"
        error={errors.name}
      />

      {/* Phone with country code */}
      <div>
        <label className="block font-heading font-semibold text-sm text-gray-700 mb-1">Celular</label>
        <div className="flex gap-2">
          <select
            value={countryCode}
            onChange={(e) => handlePhoneChange(e.target.value, localNumber)}
            className="border-2 border-gray-200 rounded-xl py-2.5 px-2 font-body text-sm focus:border-purple focus:outline-none bg-white w-28"
          >
            {COUNTRY_CODES.map((cc) => (
              <option key={cc.code} value={cc.code}>
                {cc.flag} {cc.code}
              </option>
            ))}
          </select>
          <input
            type="tel"
            value={localNumber}
            onChange={(e) => handlePhoneChange(countryCode, e.target.value)}
            placeholder="6XXX-XXXX"
            className={`flex-1 border-2 rounded-xl py-2.5 px-3 font-body text-sm focus:outline-none transition-colors ${errors.phone ? 'border-pink focus:border-pink' : 'border-gray-200 focus:border-purple'}`}
          />
        </div>
        {errors.phone && (
          <span className="text-xs text-pink font-body mt-1 flex items-center gap-1">
            <span>*</span> {errors.phone}
          </span>
        )}
      </div>

      <Input
        label="Email (opcional)"
        type="email"
        value={data.email}
        onChange={(e) => { onChange({ ...data, email: e.target.value }); if (errors.email) setErrors(prev => { const n = { ...prev }; delete n.email; return n; }); }}
        placeholder="maria@ejemplo.com"
        error={errors.email}
      />
      <div className="pt-4">
        <Button type="submit" className="w-full" size="lg">Continuar &rarr;</Button>
      </div>
    </form>
  );
}
