'use client';

import { OrderEvent, EVENT_AREAS } from '@/lib/types';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';

interface Props {
  data: OrderEvent;
  onChange: (data: OrderEvent) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function EventDetailsForm({ data, onChange, onNext, onBack }: Props) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNext();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md mx-auto">
      <h2 className="font-heading font-bold text-xl text-purple mb-4">Detalles del Evento</h2>
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Fecha del evento"
          type="date"
          value={data.date}
          onChange={(e) => onChange({ ...data, date: e.target.value })}
          required
        />
        <Input
          label="Hora"
          type="time"
          value={data.time}
          onChange={(e) => onChange({ ...data, time: e.target.value })}
          required
        />
      </div>

      {/* Area del evento */}
      <div>
        <label className="block font-heading font-semibold text-sm text-gray-700 mb-1">
          Área del evento
        </label>
        <select
          value={data.area}
          onChange={(e) => onChange({ ...data, area: e.target.value })}
          required
          className="w-full border-2 border-gray-200 rounded-xl py-2.5 px-3 font-body text-sm focus:border-purple focus:outline-none bg-white appearance-none"
        >
          <option value="">Selecciona un área</option>
          {EVENT_AREAS.map((area) => (
            <option key={area.name} value={area.name}>
              {area.name}
            </option>
          ))}
        </select>
      </div>

      <Input
        label="Lugar del evento y piso"
        value={data.address}
        onChange={(e) => onChange({ ...data, address: e.target.value })}
        required
        placeholder="Nombre del edificio / residencia, piso..."
      />
      <div className="pt-2">
        <p className="font-heading font-semibold text-sm text-gray-600 mb-3">Datos del cumpleañero/a (opcional)</p>
        <div className="space-y-3">
          <Input
            label="Nombre del cumpleañero/a"
            value={data.birthdayChildName}
            onChange={(e) => onChange({ ...data, birthdayChildName: e.target.value })}
            placeholder="Nombre"
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Edad"
              type="number"
              value={data.birthdayChildAge === '' ? '' : String(data.birthdayChildAge)}
              onChange={(e) => onChange({ ...data, birthdayChildAge: e.target.value === '' ? '' : Number(e.target.value) })}
              placeholder="5"
              min="1"
              max="18"
            />
            <Input
              label="Temática"
              value={data.theme}
              onChange={(e) => onChange({ ...data, theme: e.target.value })}
              placeholder="Patrulla Canina"
            />
          </div>
        </div>
      </div>
      <div className="pt-4 flex gap-3">
        <Button type="button" variant="outline" onClick={onBack} className="flex-1">Atrás</Button>
        <Button type="submit" className="flex-1" size="lg">Siguiente</Button>
      </div>
    </form>
  );
}
