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

const FULL_MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DAYS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

// ─── COMPACT DATE PICKER ───
function DatePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const selectedDate = value ? new Date(value + 'T00:00:00') : null;

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  };
  const selectDay = (day: number) => {
    const m = String(viewMonth + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    onChange(`${viewYear}-${m}-${d}`);
  };
  const isPast = (day: number) => new Date(viewYear, viewMonth, day) <= new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const isSelected = (day: number) => selectedDate ? viewYear === selectedDate.getFullYear() && viewMonth === selectedDate.getMonth() && day === selectedDate.getDate() : false;
  const isToday = (day: number) => viewYear === today.getFullYear() && viewMonth === today.getMonth() && day === today.getDate();

  return (
    <div>
      {/* Month nav */}
      <div className="flex items-center justify-between mb-3">
        <button type="button" onClick={prevMonth} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100">
          <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        </button>
        <span className="font-heading font-bold text-sm text-purple">{FULL_MONTHS[viewMonth]} {viewYear}</span>
        <button type="button" onClick={nextMonth} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100">
          <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>
      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map((d, i) => <div key={i} className="text-center text-[11px] font-heading font-bold text-gray-300 py-1">{d}</div>)}
      </div>
      {/* Days */}
      <div className="grid grid-cols-7">
        {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const past = isPast(day);
          const sel = isSelected(day);
          const td = isToday(day);
          return (
            <button key={day} type="button" disabled={past} onClick={() => selectDay(day)}
              className={`w-full aspect-square flex items-center justify-center text-[13px] font-body rounded-lg transition-all
                ${sel ? 'bg-purple text-white font-bold' : ''}
                ${td && !sel ? 'text-teal font-bold ring-1 ring-teal' : ''}
                ${past ? 'text-gray-200' : ''}
                ${!sel && !past && !td ? 'text-gray-600 hover:bg-purple/5' : ''}
              `}
            >{day}</button>
          );
        })}
      </div>
      {value && (
        <p className="text-center text-xs font-body text-purple/70 mt-2">
          {new Date(value + 'T00:00:00').toLocaleDateString('es-PA', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      )}
    </div>
  );
}

// ─── COMPACT TIME PICKER (pill grid) ───
function TimePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const timeSlots = [
    '07:00', '07:30', '08:00', '08:30', '09:00', '09:30',
    '10:00', '10:30', '11:00', '11:30', '12:00', '12:30',
    '13:00', '13:30', '14:00', '14:30', '15:00', '15:30',
    '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00',
  ];

  const formatTime = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hr = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${hr}:${String(m).padStart(2, '0')} ${ampm}`;
  };

  return (
    <div className="flex flex-wrap gap-1.5">
      {timeSlots.map(t => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          className={`px-2.5 py-1 rounded-full text-[11px] font-heading font-semibold transition-all
            ${value === t ? 'bg-purple text-white shadow-sm' : 'bg-gray-50 text-gray-500 hover:bg-purple/10 hover:text-purple'}
          `}
        >
          {formatTime(t)}
        </button>
      ))}
    </div>
  );
}

// ─── MAIN FORM ───
export default function EventDetailsForm({ data, onChange, onNext, onBack, areasLoaded = true, eventAreas }: Props) {
  const areas = eventAreas || EVENT_AREAS;
  const [errors, setErrors] = useState<string[]>([]);

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
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md mx-auto" noValidate>
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

      {/* Date */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <label className="block font-heading font-semibold text-xs text-gray-400 uppercase tracking-wider mb-2">Fecha</label>
        <DatePicker value={data.date} onChange={(v) => onChange({ ...data, date: v })} />
      </div>

      {/* Time */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <label className="block font-heading font-semibold text-xs text-gray-400 uppercase tracking-wider mb-2">Hora</label>
        <TimePicker value={data.time} onChange={(v) => onChange({ ...data, time: v })} />
      </div>

      {/* Area + Address */}
      <div className="space-y-3">
        <div>
          <label className="block font-heading font-semibold text-sm text-gray-700 mb-1">Área del evento</label>
          <select
            value={data.area}
            onChange={(e) => onChange({ ...data, area: e.target.value })}
            className="w-full border-2 border-gray-200 rounded-xl py-2.5 px-3 font-body text-sm focus:border-purple focus:outline-none bg-white"
          >
            <option value="">Selecciona un área</option>
            {areas.map((area) => (
              <option key={area.name} value={area.name}>{area.name}</option>
            ))}
          </select>
        </div>
        <Input
          label="Lugar del evento y piso"
          value={data.address}
          onChange={(e) => onChange({ ...data, address: e.target.value })}
          placeholder="Edificio, residencia, piso..."
        />
      </div>

      {/* Birthday child - collapsible */}
      <details className="group">
        <summary className="font-heading font-semibold text-sm text-gray-500 cursor-pointer hover:text-purple transition-colors list-none flex items-center gap-2">
          <svg className="w-4 h-4 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
          Datos del cumpleañero/a (opcional)
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
