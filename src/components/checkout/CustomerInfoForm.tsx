'use client';

import { OrderCustomer } from '@/lib/types';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';

interface Props {
  data: OrderCustomer;
  onChange: (data: OrderCustomer) => void;
  onNext: () => void;
}

export default function CustomerInfoForm({ data, onChange, onNext }: Props) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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
      <Input
        label="Celular"
        type="tel"
        value={data.phone}
        onChange={(e) => onChange({ ...data, phone: e.target.value })}
        required
        placeholder="+507 6XXX-XXXX"
      />
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
