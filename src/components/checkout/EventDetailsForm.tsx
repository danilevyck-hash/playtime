'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
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

// ─── iOS-style drum-roll TimePicker ───
const HOURS = Array.from({ length: 12 }, (_, i) => i + 1); // 1..12
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5); // 0,5,...,55
const AMPM = ['AM', 'PM'] as const;
const ITEM_HEIGHT = 36;
const VISIBLE_ITEMS = 5;
const PICKER_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;
const PADDING = ITEM_HEIGHT * Math.floor(VISIBLE_ITEMS / 2);

function parseTime(value: string, defaultHour: number, defaultMinute: number, defaultAmpm: 'AM' | 'PM') {
  if (!value) return { hour: defaultHour, minute: defaultMinute, ampm: defaultAmpm };
  const trimmed = value.trim().toLowerCase();
  const m = /^(\d{1,2}):(\d{2})\s*(am|pm)?$/i.exec(trimmed);
  if (!m) return { hour: defaultHour, minute: defaultMinute, ampm: defaultAmpm };
  let hour = Number(m[1]);
  const rawMinute = Number(m[2]);
  const ampmRaw = m[3]?.toUpperCase() as 'AM' | 'PM' | undefined;
  let ampm: 'AM' | 'PM';
  if (ampmRaw) {
    ampm = ampmRaw;
  } else {
    ampm = hour >= 12 ? 'PM' : 'AM';
    if (hour === 0) hour = 12;
    else if (hour > 12) hour -= 12;
  }
  if (hour < 1 || hour > 12 || Number.isNaN(rawMinute)) return { hour: defaultHour, minute: defaultMinute, ampm: defaultAmpm };
  // Snap to nearest 5
  const minute = MINUTES.reduce((closest, m) => Math.abs(m - rawMinute) < Math.abs(closest - rawMinute) ? m : closest, MINUTES[0]);
  return { hour, minute, ampm };
}

function formatTime(hour: number, minute: number, ampm: 'AM' | 'PM') {
  return `${hour}:${String(minute).padStart(2, '0')} ${ampm.toLowerCase()}`;
}

interface ColumnProps<T> {
  items: readonly T[];
  selectedIndex: number;
  onChange: (index: number) => void;
  render: (item: T) => string;
  ariaLabel: string;
}

function PickerColumn<T>({ items, selectedIndex, onChange, render, ariaLabel }: ColumnProps<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const lastReportedIndex = useRef(selectedIndex);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync external selectedIndex into scroll position
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (lastReportedIndex.current === selectedIndex) {
      const target = selectedIndex * ITEM_HEIGHT;
      if (Math.abs(el.scrollTop - target) > 1) {
        el.scrollTop = target;
      }
      return;
    }
    lastReportedIndex.current = selectedIndex;
    const target = selectedIndex * ITEM_HEIGHT;
    if (Math.abs(el.scrollTop - target) > 1) {
      el.scrollTo({ top: target, behavior: 'smooth' });
    }
  }, [selectedIndex]);

  // Initial position on mount
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = selectedIndex * ITEM_HEIGHT;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => {
      const idx = Math.round(el.scrollTop / ITEM_HEIGHT);
      const clamped = Math.max(0, Math.min(items.length - 1, idx));
      const target = clamped * ITEM_HEIGHT;
      if (Math.abs(el.scrollTop - target) > 1) {
        el.scrollTo({ top: target, behavior: 'smooth' });
      }
      if (clamped !== lastReportedIndex.current) {
        lastReportedIndex.current = clamped;
        onChange(clamped);
      }
    }, 90);
  }, [items.length, onChange]);

  useEffect(() => () => { if (scrollTimer.current) clearTimeout(scrollTimer.current); }, []);

  return (
    <div className="relative w-20 select-none" role="listbox" aria-label={ariaLabel}>
      {/* Highlight band */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-0 right-0 bg-purple/10 rounded-lg"
        style={{ top: PADDING, height: ITEM_HEIGHT }}
      />
      <div
        ref={ref}
        onScroll={handleScroll}
        className="overflow-y-auto scrollbar-hide snap-y snap-mandatory"
        style={{ height: PICKER_HEIGHT, scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
      >
        <div style={{ paddingTop: PADDING, paddingBottom: PADDING }}>
          {items.map((item, idx) => {
            const distance = Math.abs(idx - selectedIndex);
            const isSelected = idx === selectedIndex;
            const opacity = isSelected ? 1 : Math.max(0.25, 1 - distance * 0.3);
            const scale = isSelected ? 1 : Math.max(0.7, 1 - distance * 0.12);
            return (
              <button
                key={idx}
                type="button"
                onClick={() => onChange(idx)}
                aria-selected={isSelected}
                role="option"
                className="block w-full text-center font-heading snap-center transition-all"
                style={{
                  height: ITEM_HEIGHT,
                  lineHeight: `${ITEM_HEIGHT}px`,
                  opacity,
                  transform: `scale(${scale})`,
                  color: isSelected ? '#580459' : '#9ca3af',
                  fontWeight: isSelected ? 700 : 500,
                  fontSize: isSelected ? 18 : 16,
                }}
              >
                {render(item)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface TimePickerProps {
  value: string;
  onChange: (val: string) => void;
  defaultHour: number;
  defaultMinute: number;
  defaultAmpm: 'AM' | 'PM';
  // Only required fields auto-commit their visible default. Optional pickers
  // (e.g. show time) leave the value empty until the user actually spins the
  // wheel, so an untouched optional picker never fills in a phantom time.
  commitDefault?: boolean;
}

function TimePicker({ value, onChange, defaultHour, defaultMinute, defaultAmpm, commitDefault = false }: TimePickerProps) {
  const parsed = parseTime(value, defaultHour, defaultMinute, defaultAmpm);
  const [hour, setHour] = useState(parsed.hour);
  const [minute, setMinute] = useState(parsed.minute);
  const [ampm, setAmpm] = useState<'AM' | 'PM'>(parsed.ampm);

  // Commit the displayed default as the real value whenever the stored value is
  // empty, so the visible "4:00 PM" counts as selected from the first render —
  // no hidden invalid state that the form rejects until the user spins the wheel.
  // Keyed on `value` (not a one-shot mount ref) so it survives the step slide-in
  // remounts and StrictMode double-mounts that dropped the old mount-only commit.
  // Guarded by commitDefault so optional pickers never auto-fill.
  useEffect(() => {
    if (commitDefault && !value) onChange(formatTime(defaultHour, defaultMinute, defaultAmpm));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const update = (h: number, m: number, ap: 'AM' | 'PM') => {
    setHour(h);
    setMinute(m);
    setAmpm(ap);
    onChange(formatTime(h, m, ap));
  };

  const hourIdx = HOURS.indexOf(hour);
  const minuteIdx = MINUTES.indexOf(minute);
  const ampmIdx = AMPM.indexOf(ampm);

  return (
    <div className="bg-white border-2 border-gray-200 rounded-xl p-2">
      <div className="flex items-center justify-center gap-2">
        <PickerColumn
          items={HOURS}
          selectedIndex={hourIdx >= 0 ? hourIdx : 0}
          onChange={(idx) => update(HOURS[idx], minute, ampm)}
          render={(h) => String(h)}
          ariaLabel="Hora"
        />
        <span className="font-heading font-bold text-purple text-lg" aria-hidden="true">:</span>
        <PickerColumn
          items={MINUTES}
          selectedIndex={minuteIdx >= 0 ? minuteIdx : 0}
          onChange={(idx) => update(hour, MINUTES[idx], ampm)}
          render={(m) => String(m).padStart(2, '0')}
          ariaLabel="Minutos"
        />
        <PickerColumn
          items={AMPM as unknown as readonly string[]}
          selectedIndex={ampmIdx >= 0 ? ampmIdx : 0}
          onChange={(idx) => update(hour, minute, AMPM[idx])}
          render={(a) => a}
          ariaLabel="AM o PM"
        />
      </div>
    </div>
  );
}

// ─── MAIN FORM ───
export default function EventDetailsForm({ data, onChange, onNext, onBack, areasLoaded = true, eventAreas }: Props) {
  const areas = eventAreas || EVENT_AREAS;
  const [errors, setErrors] = useState<string[]>([]);

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
      <h2 className="font-heading font-bold text-xl text-purple">Cu&eacute;ntanos de tu fiesta {'🎂'}</h2>

      {errors.length > 0 && (
        <div role="alert" className="bg-pink/10 border border-pink/30 rounded-xl p-3">
          {errors.map((err, i) => (
            <p key={i} className="font-body text-xs text-pink-text flex items-center gap-1.5">
              <span>*</span> {err}
            </p>
          ))}
        </div>
      )}

      {/* Date — simple native input */}
      <div>
        <label htmlFor="event-date" className="block font-heading font-semibold text-sm text-gray-700 mb-1">{'📅'} Fecha del evento</label>
        <input
          id="event-date"
          type="date"
          value={data.date}
          min={minDate}
          onChange={(e) => onChange({ date: e.target.value })}
          className="w-full border-2 border-gray-200 rounded-xl py-3 px-4 font-body text-base focus:border-purple focus:outline-none bg-white"
        />
        {data.date && (
          <p className="text-xs font-body text-purple/70 mt-1 ml-1">{formatDate(data.date)}</p>
        )}
      </div>

      {/* Hora de inicio de la fiesta */}
      <div>
        <label className="block font-heading font-semibold text-sm text-gray-700 mb-2">{'🕒'} Hora de inicio de la fiesta</label>
        <TimePicker
          value={data.time || ''}
          onChange={(v) => onChange({ time: v })}
          defaultHour={4}
          defaultMinute={0}
          defaultAmpm="PM"
          commitDefault
        />
      </div>

      {/* Hora del show / animación — opcional */}
      <div>
        <label className="block font-heading font-semibold text-sm text-gray-700 mb-2">{'🎭'} Hora del show / animaci{'ó'}n <span className="text-gray-300 font-normal">{'—'} opcional</span></label>
        <TimePicker
          value={data.showTime || ''}
          onChange={(v) => onChange({ showTime: v })}
          defaultHour={5}
          defaultMinute={0}
          defaultAmpm="PM"
        />
      </div>

      {/* Area */}
      <div>
        <label htmlFor="event-area" className="block font-heading font-semibold text-sm text-gray-700 mb-1">{'📍'} Área del evento</label>
        <select
          id="event-area"
          value={data.area}
          onChange={(e) => onChange({ area: e.target.value })}
          className="w-full border-2 border-gray-200 rounded-xl py-3 px-4 font-body text-base focus:border-purple focus:outline-none bg-white"
        >
          <option value="">Selecciona un área</option>
          {areas.map((area) => (
            <option key={area.name} value={area.name}>{area.name}</option>
          ))}
        </select>
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
        label={'📍 Lugar del evento'}
        value={data.address}
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
