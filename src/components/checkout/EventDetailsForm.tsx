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
}

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

// ─── DATE PICKER ───
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

  const isToday = (day: number) => {
    return viewYear === today.getFullYear() && viewMonth === today.getMonth() && day === today.getDate();
  };

  const isSelected = (day: number) => {
    if (!selectedDate) return false;
    return viewYear === selectedDate.getFullYear() && viewMonth === selectedDate.getMonth() && day === selectedDate.getDate();
  };

  const isPast = (day: number) => {
    const date = new Date(viewYear, viewMonth, day);
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return date < todayStart;
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-4">
        <button type="button" onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        </button>
        <span className="font-heading font-bold text-purple">{MONTHS[viewMonth]} {viewYear}</span>
        <button type="button" onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {DAYS.map(d => <div key={d} className="text-center text-xs font-heading font-semibold text-gray-400">{d}</div>)}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const past = isPast(day);
          const sel = isSelected(day);
          const td = isToday(day);
          return (
            <button
              key={day}
              type="button"
              disabled={past}
              onClick={() => selectDay(day)}
              className={`w-9 h-9 rounded-full text-sm font-body flex items-center justify-center transition-all mx-auto
                ${sel ? 'bg-purple text-white font-bold' : ''}
                ${td && !sel ? 'border-2 border-teal text-teal font-semibold' : ''}
                ${past ? 'text-gray-200 cursor-not-allowed' : ''}
                ${!sel && !past && !td ? 'text-gray-700 hover:bg-purple/10' : ''}
              `}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── TIME PICKER (15 min intervals, scroll style) ───
function TimePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const hours = Array.from({ length: 13 }, (_, i) => i + 7); // 7am - 7pm
  const minutes = ['00', '15', '30', '45'];

  const [selectedHour, setSelectedHour] = useState(() => {
    if (value) return parseInt(value.split(':')[0]);
    return 10;
  });
  const [selectedMin, setSelectedMin] = useState(() => {
    if (value) return value.split(':')[1] || '00';
    return '00';
  });

  const handleSelect = (h: number, m: string) => {
    setSelectedHour(h);
    setSelectedMin(m);
    const hh = String(h).padStart(2, '0');
    onChange(`${hh}:${m}`);
  };

  const formatHour = (h: number) => {
    if (h === 0) return '12 AM';
    if (h < 12) return `${h} AM`;
    if (h === 12) return '12 PM';
    return `${h - 12} PM`;
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <p className="font-heading font-semibold text-sm text-gray-600 mb-3">Hora del evento</p>
      <div className="flex gap-3">
        {/* Hours */}
        <div className="flex-1">
          <p className="text-xs font-heading text-gray-400 mb-2 text-center">Hora</p>
          <div className="h-40 overflow-y-auto rounded-xl bg-gray-50 scrollbar-hide">
            {hours.map(h => (
              <button
                key={h}
                type="button"
                onClick={() => handleSelect(h, selectedMin)}
                className={`w-full py-2 text-center text-sm font-body transition-colors ${
                  selectedHour === h ? 'bg-purple text-white font-bold' : 'text-gray-600 hover:bg-purple/10'
                }`}
              >
                {formatHour(h)}
              </button>
            ))}
          </div>
        </div>
        {/* Minutes */}
        <div className="w-20">
          <p className="text-xs font-heading text-gray-400 mb-2 text-center">Min</p>
          <div className="h-40 overflow-y-auto rounded-xl bg-gray-50 scrollbar-hide">
            {minutes.map(m => (
              <button
                key={m}
                type="button"
                onClick={() => handleSelect(selectedHour, m)}
                className={`w-full py-2 text-center text-sm font-body transition-colors ${
                  selectedMin === m ? 'bg-purple text-white font-bold' : 'text-gray-600 hover:bg-purple/10'
                }`}
              >
                :{m}
              </button>
            ))}
          </div>
        </div>
      </div>
      {value && (
        <p className="text-center mt-3 font-heading font-bold text-purple">
          {formatHour(selectedHour).replace(' ', ':')}:{selectedMin} {selectedHour < 12 ? 'AM' : 'PM'}
        </p>
      )}
    </div>
  );
}

// ─── MAIN FORM ───
export default function EventDetailsForm({ data, onChange, onNext, onBack }: Props) {
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
    <form onSubmit={handleSubmit} className="space-y-5 max-w-md mx-auto">
      <h2 className="font-heading font-bold text-xl text-purple mb-4">Detalles del Evento</h2>

      {errors.length > 0 && (
        <div className="bg-pink/10 border border-pink/30 rounded-xl p-4">
          {errors.map((err, i) => (
            <p key={i} className="font-body text-sm text-pink flex items-center gap-2">
              <span className="text-lg">*</span> {err}
            </p>
          ))}
        </div>
      )}

      {/* Date picker */}
      <div>
        <label className="block font-heading font-semibold text-sm text-gray-700 mb-2">Fecha del evento</label>
        <DatePicker value={data.date} onChange={(v) => onChange({ ...data, date: v })} />
      </div>

      {/* Time picker */}
      <TimePicker value={data.time} onChange={(v) => onChange({ ...data, time: v })} />

      {/* Area */}
      <div>
        <label className="block font-heading font-semibold text-sm text-gray-700 mb-1">Área del evento</label>
        <select
          value={data.area}
          onChange={(e) => onChange({ ...data, area: e.target.value })}
          className="w-full border-2 border-gray-200 rounded-xl py-2.5 px-3 font-body text-sm focus:border-purple focus:outline-none bg-white"
        >
          <option value="">Selecciona un área</option>
          {EVENT_AREAS.map((area) => (
            <option key={area.name} value={area.name}>{area.name}</option>
          ))}
        </select>
      </div>

      {/* Address */}
      <Input
        label="Lugar del evento y piso"
        value={data.address}
        onChange={(e) => onChange({ ...data, address: e.target.value })}
        placeholder="Nombre del edificio / residencia, piso..."
      />

      {/* Birthday child info */}
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
