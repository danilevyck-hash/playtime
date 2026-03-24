'use client';

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
  // Extract country code and local number
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
    // Remove non-digits from local number
    const clean = number.replace(/\D/g, '');
    onChange({ ...data, phone: `${code}${clean}` });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!data.name.trim()) return;
    if (localNumber.length < 7) return;
    onNext();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md mx-auto">
      <h2 className="font-heading font-bold text-xl text-purple mb-4">Tus Datos</h2>
      <Input
        label="Nombre completo"
        value={data.name}
        onChange={(e) => onChange({ ...data, name: e.target.value })}
        required
        placeholder="María García"
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
            required
            placeholder="6XXX-XXXX"
            className="flex-1 border-2 border-gray-200 rounded-xl py-2.5 px-3 font-body text-sm focus:border-purple focus:outline-none"
          />
        </div>
      </div>

      <Input
        label="Email (opcional)"
        type="email"
        value={data.email}
        onChange={(e) => onChange({ ...data, email: e.target.value })}
        placeholder="maria@ejemplo.com"
      />
      <div className="pt-4">
        <Button type="submit" className="w-full" size="lg">Siguiente</Button>
      </div>
    </form>
  );
}
