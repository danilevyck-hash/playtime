'use client';

import { useState } from 'react';
import { OrderEvent, EVENT_AREAS } from '@/lib/types';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';

interface Props {
  data: OrderEvent;
  onChange: (data: OrderEvent) => void;
  onNext: () => void;
  onBack: () => void;
  areasLoaded?: boolean;
  eventAreas?: { name: string; price: number }[];
}

// ─── MAIN FORM ───
export default function EventDetailsForm({ data, onChange, onNext, onBack, areasLoaded = true, eventAreas }: Props) {
  const areas = eventAreas || EVENT_AREAS;
  const [errors, setErrors] = useState<string[]>([]);

  // Generate min date (tomorrow)
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().slice(0, 10);

  // Format selected date for display
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('es-PA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: string[] = [];
    if (!data.date) errs.push('Selecciona la fecha de tu evento');
    if (!data.time?.trim()) errs.push('Indica la hora de inicio de la fiesta');
    if (!data.area) errs.push('Selecciona el área donde será la fiesta');
    if (!data.address.trim()) errs.push('Indica el lugar del evento');
    setErrors(errs);
    if (errs.length === 0) onNext();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-md mx-auto" noValidate>
      <h2 className="font-heading font-bold text-xl text-purple">Cu&eacute;ntanos de tu fiesta {'\uD83C\uDF82'}</h2>

      {errors.length > 0 && (
        <div className="bg-pink/10 border border-pink/30 rounded-xl p-3">
          {errors.map((err, i) => (
            <p key={i} className="font-body text-xs text-pink flex items-center gap-1.5">
              <span>*</span> {err}
            </p>
          ))}
        </div>
      )}

      {/* Date — simple native input */}
      <div>
        <label className="block font-heading font-semibold text-sm text-gray-700 mb-1">{'\uD83D\uDCC5'} Fecha del evento</label>
        <input
          type="date"
          value={data.date}
          min={minDate}
          onChange={(e) => onChange({ ...data, date: e.target.value })}
          className="w-full border-2 border-gray-200 rounded-xl py-3 px-4 font-body text-base focus:border-purple focus:outline-none bg-white"
        />
        {data.date && (
          <p className="text-xs font-body text-purple/70 mt-1 ml-1">{formatDate(data.date)}</p>
        )}
      </div>

      {/* Time — free-text input */}
      <div>
        <label className="block font-heading font-semibold text-sm text-gray-700 mb-2">{'\uD83D\uDD52'} Hora de inicio de la fiesta</label>
        <input
          type="text"
          value={data.time || ''}
          onChange={(e) => onChange({ ...data, time: e.target.value })}
          placeholder="Ej: 4:00 pm"
          className="w-full border-2 border-gray-200 rounded-xl py-3 px-4 font-body text-base focus:border-purple focus:outline-none bg-white"
        />
      </div>

      {/* Hora del show / animaci{'\u00F3'}n */}
      <div>
        <label className="block font-heading font-semibold text-sm text-gray-700 mb-2">{'\uD83C\uDFAD'} Hora del show / animaci{'\u00F3'}n <span className="text-gray-300 font-normal">{'\u2014'} opcional</span></label>
        <input
          type="text"
          value={data.showTime || ''}
          onChange={(e) => onChange({ ...data, showTime: e.target.value })}
          placeholder="Ej: 5:30 pm"
          className="w-full border-2 border-gray-200 rounded-xl py-3 px-4 font-body text-base focus:border-purple focus:outline-none bg-white"
        />
      </div>

      {/* Area */}
      <div>
        <label className="block font-heading font-semibold text-sm text-gray-700 mb-1">{'\uD83D\uDCCD'} Área del evento</label>
        <select
          value={data.area}
          onChange={(e) => onChange({ ...data, area: e.target.value })}
          className="w-full border-2 border-gray-200 rounded-xl py-3 px-4 font-body text-base focus:border-purple focus:outline-none bg-white"
        >
          <option value="">Selecciona un área</option>
          {areas.map((area) => (
            <option key={area.name} value={area.name}>{area.name}</option>
          ))}
        </select>
        {data.area && (() => {
          const selectedArea = areas.find(a => a.name === data.area);
          if (data.area === 'Otra \u00e1rea' || !selectedArea) {
            return <p className="font-body text-sm text-teal mt-1 ml-1">{'\uD83D\uDE9A'} Transporte: se confirma por WhatsApp</p>;
          }
          if (selectedArea.price === 0) {
            return <p className="font-body text-sm text-teal mt-1 ml-1">{'\uD83D\uDE9A'} Transporte gratuito</p>;
          }
          return <p className="font-body text-sm text-orange mt-1 ml-1">{'\uD83D\uDE9A'} Transporte: ${selectedArea.price}</p>;
        })()}
      </div>

      {/* Address — auto-detect area */}
      <Input
        label={'\uD83D\uDCCD Lugar del evento'}
        value={data.address}
        onChange={(e) => {
          const val = e.target.value;
          onChange({ ...data, address: val });
          // Auto-detect area from address text
          if (!data.area && val.length > 3) {
            const match = areas.find(a => a.name !== 'Otra \u00e1rea' && val.toLowerCase().includes(a.name.toLowerCase()));
            if (match) onChange({ ...data, address: val, area: match.name });
          }
        }}
        placeholder="Edificio, residencia, piso..."
      />

      {/* Birthday child — always visible, optional */}
      <div className="space-y-3 pt-2">
        <p className="font-heading font-semibold text-sm text-gray-400">{'\uD83C\uDF82'} Datos del cumplea{'ñ'}ero/a <span className="text-gray-300 font-normal">— opcional</span></p>
        <Input label="Nombre" value={data.birthdayChildName} onChange={(e) => onChange({ ...data, birthdayChildName: e.target.value })} placeholder="Nombre del cumpleañero/a" />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Edad" type="number" value={data.birthdayChildAge === '' ? '' : String(data.birthdayChildAge)} onChange={(e) => onChange({ ...data, birthdayChildAge: e.target.value === '' ? '' : Number(e.target.value) })} placeholder="5" min="1" max="18" />
          <Input label="Temática" value={data.theme} onChange={(e) => onChange({ ...data, theme: e.target.value })} placeholder="Patrulla Canina" />
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onBack} className="flex-1">Atrás</Button>
        <Button type="submit" className="flex-1" size="lg" disabled={!areasLoaded}>
          {areasLoaded ? 'Continuar \u2192' : 'Preparando magia... \u2728'}
        </Button>
      </div>
    </form>
  );
}
