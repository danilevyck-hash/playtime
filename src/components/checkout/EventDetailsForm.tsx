'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { OrderEvent, EVENT_AREAS } from '@/lib/types';
import { panamaTomorrow } from '@/lib/timezone';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';

interface Props {
  data: OrderEvent;
  // Emits a PARTIAL patch, never the full object. The parent merges it onto the
  // latest state (setEvent(prev => ({ ...prev, ...patch }))), so two fields that
  // commit in the same render — e.g. both TimePickers on mount — compose instead
  // of the second overwriting the first with a stale snapshot.
  onChange: (patch: Partial<OrderEvent>) => void;
  onNext: () => void;
  onBack: () => void;
  areasLoaded?: boolean;
  eventAreas?: { name: string; price: number }[];
}

// ─── Native time field ───
// The stored value stays "h:mm am/pm" (what the PDF, WhatsApp and review already
// consume); the native <input type="time"> works in "HH:MM" (24h) and on iOS
// opens the system wheel picker — accessible by default, no custom drum-roll.
function storedTo24(value: string): string {
  const m = /^(\d{1,2}):(\d{2})\s*(am|pm)$/i.exec(value.trim());
  if (!m) return "";
  let h = Number(m[1]) % 12;
  if (m[3].toLowerCase() === "pm") h += 12;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}
function from24ToStored(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return "";
  const h24 = Number(m[1]);
  const ampm = h24 >= 12 ? "pm" : "am";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${m[2]} ${ampm}`;
}

interface TimeFieldProps {
  id: string;
  label: ReactNode;
  value: string;
  onChange: (val: string) => void;
  defaultValue?: string;
  commitDefault?: boolean;
  required?: boolean;
  error?: string;
}

function TimeField({ id, label, value, onChange, defaultValue = "", commitDefault = false, required = false, error }: TimeFieldProps) {
  // Commit the visible default for REQUIRED fields. Sprint 1 patch contract: the
  // parent onChange receives only the partial patch (composed via merge), and an
  // optional field is never auto-filled. Keyed on `value` so it survives remounts.
  useEffect(() => {
    if (commitDefault && !value && defaultValue) onChange(defaultValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div>
      <label htmlFor={id} className="block font-heading font-semibold text-sm text-gray-700 mb-2">{label}</label>
      <input
        id={id}
        type="time"
        required={required}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        value={value ? storedTo24(value) : ""}
        onChange={(e) => onChange(e.target.value ? from24ToStored(e.target.value) : "")}
        className={`w-full border-2 rounded-xl py-3 px-4 font-body text-base bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-purple ${error ? "border-pink" : "border-gray-200 focus:border-purple"}`}
      />
      {error && <p id={`${id}-error`} role="alert" className="text-xs font-body text-pink-text mt-1">{error}</p>}
    </div>
  );
}

// ─── MAIN FORM ───
export default function EventDetailsForm({ data, onChange, onNext, onBack, areasLoaded = true, eventAreas }: Props) {
  const areas = eventAreas || EVENT_AREAS;
  const [errors, setErrors] = useState<{ date?: string; time?: string; area?: string; address?: string }>({});

  // Min bookable date = tomorrow in Panama (UTC-5). Computing this in UTC skipped
  // a day between 7pm and midnight Panama.
  const minDate = panamaTomorrow();

  // Format selected date for display
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('es-PA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: { date?: string; time?: string; area?: string; address?: string } = {};
    if (!data.date) errs.date = 'Selecciona la fecha de tu evento';
    if (!data.time?.trim()) errs.time = 'Indica la hora de inicio de la fiesta';
    if (!data.area) errs.area = 'Selecciona el área donde será la fiesta';
    if (!data.address.trim()) errs.address = 'Indica el lugar del evento';
    setErrors(errs);
    // Move focus to the first invalid field so keyboard/screen-reader users land
    // on the problem (and its error, linked via aria-describedby, is announced).
    const order: Array<keyof typeof errs> = ['date', 'time', 'area', 'address'];
    const firstBad = order.find((k) => errs[k]);
    if (!firstBad) { onNext(); return; }
    const idFor: Record<string, string> = { date: 'event-date', time: 'event-time', area: 'event-area', address: 'event-address' };
    requestAnimationFrame(() => document.getElementById(idFor[firstBad])?.focus());
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-md mx-auto" noValidate>
      <h2 className="font-heading font-bold text-xl text-purple">Cu&eacute;ntanos de tu fiesta {'🎂'}</h2>

      {/* Date — simple native input */}
      <div>
        <label htmlFor="event-date" className="block font-heading font-semibold text-sm text-gray-700 mb-1">{'📅'} Fecha del evento</label>
        <input
          id="event-date"
          type="date"
          required
          aria-required="true"
          value={data.date}
          min={minDate}
          onChange={(e) => onChange({ date: e.target.value })}
          aria-invalid={errors.date ? true : undefined}
          aria-describedby={errors.date ? 'event-date-error' : undefined}
          className={`w-full border-2 rounded-xl py-3 px-4 font-body text-base bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-purple ${errors.date ? 'border-pink' : 'border-gray-200 focus:border-purple'}`}
        />
        {errors.date ? (
          <p id="event-date-error" role="alert" className="text-xs font-body text-pink-text mt-1">{errors.date}</p>
        ) : data.date && (
          <p className="text-xs font-body text-purple/70 mt-1 ml-1">{formatDate(data.date)}</p>
        )}
      </div>

      {/* Hora de inicio de la fiesta */}
      <TimeField
        id="event-time"
        label={<>{'🕒'} Hora de inicio de la fiesta</>}
        value={data.time || ''}
        onChange={(v) => onChange({ time: v })}
        defaultValue="4:00 pm"
        commitDefault
        required
        error={errors.time}
      />

      {/* Hora del show / animación — opcional */}
      <TimeField
        id="event-show-time"
        label={<>{'🎭'} Hora del show / animaci{'ó'}n <span className="text-gray-300 font-normal">{'—'} opcional</span></>}
        value={data.showTime || ''}
        onChange={(v) => onChange({ showTime: v })}
      />

      {/* Area */}
      <div>
        <label htmlFor="event-area" className="block font-heading font-semibold text-sm text-gray-700 mb-1">{'📍'} Área del evento</label>
        <select
          id="event-area"
          required
          aria-required="true"
          value={data.area}
          onChange={(e) => onChange({ area: e.target.value })}
          aria-invalid={errors.area ? true : undefined}
          aria-describedby={errors.area ? 'event-area-error' : undefined}
          className={`w-full border-2 rounded-xl py-3 px-4 font-body text-base bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-purple ${errors.area ? 'border-pink' : 'border-gray-200 focus:border-purple'}`}
        >
          <option value="">Selecciona un área</option>
          {areas.map((area) => (
            <option key={area.name} value={area.name}>{area.name}</option>
          ))}
        </select>
        {errors.area && <p id="event-area-error" role="alert" className="text-xs font-body text-pink-text mt-1">{errors.area}</p>}
        {data.area && (() => {
          const selectedArea = areas.find(a => a.name === data.area);
          if (data.area === 'Otra área' || !selectedArea) {
            return <p className="font-body text-sm text-teal-text mt-1 ml-1">{'🚚'} Transporte: se confirma por WhatsApp</p>;
          }
          if (selectedArea.price === 0) {
            return <p className="font-body text-sm text-teal-text mt-1 ml-1">{'🚚'} Transporte gratuito</p>;
          }
          return <p className="font-body text-sm text-orange-text mt-1 ml-1">{'🚚'} Transporte: ${selectedArea.price}</p>;
        })()}
      </div>

      {/* Address — auto-detect area */}
      <Input
        id="event-address"
        label={'📍 Lugar del evento'}
        required
        value={data.address}
        error={errors.address}
        onChange={(e) => {
          const val = e.target.value;
          // Auto-detect area from address text
          if (!data.area && val.length > 3) {
            const match = areas.find(a => a.name !== 'Otra área' && val.toLowerCase().includes(a.name.toLowerCase()));
            if (match) { onChange({ address: val, area: match.name }); return; }
          }
          onChange({ address: val });
        }}
        placeholder="Edificio, residencia, piso..."
        autoComplete="street-address"
      />

      {/* Birthday child — always visible, optional */}
      <div className="space-y-3 pt-2">
        <p className="font-heading font-semibold text-sm text-gray-400">{'🎂'} Datos del cumplea{'ñ'}ero/a <span className="text-gray-300 font-normal">— opcional</span></p>
        <Input label="Nombre" value={data.birthdayChildName} onChange={(e) => onChange({ birthdayChildName: e.target.value })} placeholder="Nombre del cumpleañero/a" />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Edad" type="number" inputMode="numeric" value={data.birthdayChildAge === '' ? '' : String(data.birthdayChildAge)} onChange={(e) => onChange({ birthdayChildAge: e.target.value === '' ? '' : Number(e.target.value) })} placeholder="5" min="1" max="18" />
          <Input label="Temática" value={data.theme} onChange={(e) => onChange({ theme: e.target.value })} placeholder="Patrulla Canina" />
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onBack} className="flex-1">Atrás</Button>
        <Button type="submit" className="flex-1" size="lg" disabled={!areasLoaded}>
          {areasLoaded ? 'Continuar →' : 'Preparando magia... ✨'}
        </Button>
      </div>
    </form>
  );
}
