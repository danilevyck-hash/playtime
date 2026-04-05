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

  // Time slots as grouped options
  const timeOptions = [
    { label: 'Mañana', slots: ['07:00', '07:30', '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30'] },
    { label: 'Mediodía', slots: ['12:00', '12:30', '13:00', '13:30'] },
    { label: 'Tarde', slots: ['14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00'] },
  ];

  const formatTime = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hr = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${hr}:${String(m).padStart(2, '0')} ${ampm}`;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: string[] = [];
    if (!data.date) errs.push('Selecciona la fecha de tu evento');
    if (!data.time) errs.push('Elige la hora del evento');
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

      {/* Time — dropdown with grouped options */}
      <div>
        <label className="block font-heading font-semibold text-sm text-gray-700 mb-1">{'\uD83D\uDD52'} Hora del evento</label>
        <select
          value={data.time}
          onChange={(e) => onChange({ ...data, time: e.target.value })}
          className="w-full border-2 border-gray-200 rounded-xl py-3 px-4 font-body text-base focus:border-purple focus:outline-none bg-white"
        >
          <option value="">Selecciona una hora</option>
          {timeOptions.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.slots.map((t) => (
                <option key={t} value={t}>{formatTime(t)}</option>
              ))}
            </optgroup>
          ))}
        </select>
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

      {/* Address */}
      <Input
        label="📍 Lugar del evento"
        value={data.address}
        onChange={(e) => onChange({ ...data, address: e.target.value })}
        placeholder="Edificio, residencia, piso..."
      />

      {/* Birthday child - collapsible, closed by default */}
      <details className="group">
        <summary className="font-heading font-semibold text-sm text-gray-400 cursor-pointer hover:text-purple transition-colors list-none flex items-center gap-2">
          <svg className="w-4 h-4 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
          {'\uD83C\uDF82'} Datos del cumpleañero/a (opcional)
        </summary>
        <div className="space-y-3 mt-3">
          <Input label="Nombre" value={data.birthdayChildName} onChange={(e) => onChange({ ...data, birthdayChildName: e.target.value })} placeholder="Nombre" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Edad" type="number" value={data.birthdayChildAge === '' ? '' : String(data.birthdayChildAge)} onChange={(e) => onChange({ ...data, birthdayChildAge: e.target.value === '' ? '' : Number(e.target.value) })} placeholder="5" min="1" max="18" />
            <Input label="Temática" value={data.theme} onChange={(e) => onChange({ ...data, theme: e.target.value })} placeholder="Patrulla Canina" />
          </div>
        </div>
      </details>

      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onBack} className="flex-1">Atrás</Button>
        <Button type="submit" className="flex-1" size="lg" disabled={!areasLoaded}>
          {areasLoaded ? 'Continuar \u2192' : 'Preparando magia... \u2728'}
        </Button>
      </div>
    </form>
  );
}
