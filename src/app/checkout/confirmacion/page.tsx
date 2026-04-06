'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { fetchLogoUrl } from '@/lib/supabase-data';
import { BANK_INFO, CONTACT } from '@/lib/constants';
import Button from '@/components/ui/Button';
import ConfettiBackground from '@/components/ui/ConfettiBackground';

interface OrderSummaryData {
  items: { name: string; quantity: number; unitPrice: number }[];
  total: number;
  date: string;
  time?: string;
}

function ConfirmacionContent() {
  const searchParams = useSearchParams();
  const pedido = searchParams.get('pedido');
  const metodo = searchParams.get('metodo');
  const waParam = searchParams.get('wa');
  const showBankInfo = metodo !== 'credit_card';

  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [orderSummary, setOrderSummary] = useState<OrderSummaryData | null>(null);

  useEffect(() => {
    fetchLogoUrl().then(u => { if (u) setLogoUrl(u); else setLogoUrl('/logo.png'); }).catch(() => setLogoUrl('/logo.png'));
    try {
      const raw = sessionStorage.getItem('playtime-order-summary');
      if (raw) setOrderSummary(JSON.parse(raw));
    } catch {}
  }, []);

  // Auto-open WhatsApp after a brief delay
  useEffect(() => {
    if (waParam) {
      const timer = setTimeout(() => { window.open(waParam, '_blank'); }, 1200);
      return () => clearTimeout(timer);
    }
  }, [waParam]);

  const copyBank = () => {
    navigator.clipboard.writeText(`${BANK_INFO.bank} | ${BANK_INFO.name} | ${BANK_INFO.accountType}: ${BANK_INFO.accountNumber}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <ConfettiBackground className="bg-beige min-h-[70vh]">
      <div className="max-w-2xl mx-auto px-4 py-16 md:py-24 text-center space-y-6">
        <div className="mb-4">
          {logoUrl ? (
            <Image src={logoUrl} alt="PlayTime" width={160} height={64} className="h-16 w-auto object-contain mx-auto" />
          ) : (
            <div className="flex flex-col items-center leading-none">
              <span className="font-heading font-black text-3xl text-teal tracking-tight leading-none">play</span>
              <span className="font-heading font-black text-3xl text-teal tracking-tight leading-none -mt-1">time</span>
              <span className="font-script text-sm text-purple">creando momentos.</span>
            </div>
          )}
        </div>

        <div className="text-6xl animate-bounce">{'\u2705'}</div>

        <h1 className="font-heading font-black text-3xl md:text-4xl text-purple">
          {'\u00a1'}Tu solicitud fue enviada!
        </h1>
        {pedido && <p className="font-heading font-bold text-lg text-purple">Pedido #{pedido}</p>}
        <p className="font-body text-lg text-gray-600 max-w-md mx-auto">
          Te contactamos por WhatsApp en menos de 2 horas para confirmar tu reserva.
        </p>

        {/* WhatsApp warning */}
        <div className="bg-orange/10 border border-orange/30 rounded-xl p-4 max-w-md mx-auto">
          <p className="font-heading font-bold text-sm text-orange">
            {'\u26a0\ufe0f'} Tu pedido se confirma al enviar el mensaje por WhatsApp
          </p>
        </div>

        {orderSummary && (
          <details className="bg-white rounded-xl border border-gray-100 text-left max-w-sm mx-auto">
            <summary className="font-heading font-bold text-sm text-purple cursor-pointer p-4">
              Ver resumen de tu pedido
            </summary>
            <div className="px-4 pb-4 space-y-2">
              {orderSummary.items.map((item, idx) => (
                <div key={idx} className="flex justify-between font-body text-sm text-gray-600">
                  <span>{item.name} &times; {item.quantity}</span>
                  <span>${(item.quantity * item.unitPrice).toFixed(2)}</span>
                </div>
              ))}
              {orderSummary.date && (
                <p className="font-body text-sm text-gray-500 pt-2 border-t border-gray-100">
                  Fecha del evento: {orderSummary.date}
                </p>
              )}
              <div className="flex justify-between font-heading font-bold text-sm text-purple pt-2 border-t border-gray-100">
                <span>Total</span>
                <span>${orderSummary.total.toFixed(2)}</span>
              </div>
            </div>
          </details>
        )}

        {showBankInfo && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5 text-left max-w-sm mx-auto space-y-2 shadow-sm">
            <p className="font-heading font-bold text-sm text-gray-800">Para confirmar tu reserva, env&iacute;a el dep&oacute;sito a:</p>
            <div className="font-body text-sm text-gray-600 space-y-0.5">
              <p><span className="font-semibold">Banco:</span> {BANK_INFO.bank}</p>
              <p><span className="font-semibold">Titular:</span> {BANK_INFO.name}</p>
              <p><span className="font-semibold">{BANK_INFO.accountType}:</span> {BANK_INFO.accountNumber}</p>
            </div>
            <button
              onClick={copyBank}
              className="w-full mt-2 bg-teal/10 text-teal font-heading font-bold text-sm py-2.5 rounded-xl hover:bg-teal/20 transition-colors"
            >
              {copied ? '\u2705 Copiado!' : 'Copiar datos bancarios'}
            </button>
          </div>
        )}

        <div className="flex flex-col gap-4 justify-center pt-2 max-w-sm mx-auto">
          <a href={waParam || `https://wa.me/${CONTACT.whatsapp}`} target="_blank" rel="noopener noreferrer">
            <Button size="lg" className="bg-[#25D366] hover:bg-[#20bd5a] text-white w-full shadow-lg animate-pulse">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              Enviar pedido por WhatsApp
            </Button>
          </a>
          <Link href="/">
            <Button variant="ghost" size="md" className="w-full">Volver al inicio</Button>
          </Link>
          <button
            type="button"
            className="text-sm text-gray-500 hover:text-purple transition-colors font-body underline"
            onClick={() => {
              const eventDate = orderSummary?.date || '';
              const eventTime = orderSummary?.time || '12:00';
              const [hours, minutes] = eventTime.split(':').map(Number);
              const dateStr = eventDate.replace(/-/g, '');
              const timeStr = `${String(hours).padStart(2, '0')}${String(minutes).padStart(2, '0')}00`;
              const dtStart = dateStr ? `${dateStr}T${timeStr}` : new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
              const icsContent = [
                'BEGIN:VCALENDAR',
                'VERSION:2.0',
                'BEGIN:VEVENT',
                `DTSTART:${dtStart}`,
                `SUMMARY:PlayTime Fiesta #${pedido || ''}`,
                'DESCRIPTION:Pedido PlayTime',
                'END:VEVENT',
                'END:VCALENDAR',
              ].join('\r\n');
              const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `playtime-fiesta-${pedido || 'evento'}.ics`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }}
          >
            Agregar al calendario
          </button>
        </div>

        <p className="font-body text-sm text-gray-500">
          {'\u00bf'}No tienes WhatsApp? Ll&aacute;manos al {CONTACT.phone}
        </p>

        <p className="font-body text-sm text-gray-400">
          Tambi&eacute;n puedes enviarnos el comprobante de pago a {CONTACT.email}
        </p>
      </div>
    </ConfettiBackground>
  );
}

export default function ConfirmacionPage() {
  return (
    <Suspense fallback={<div className="min-h-[70vh] flex items-center justify-center"><p className="font-body text-gray-400">Cargando...</p></div>}>
      <ConfirmacionContent />
    </Suspense>
  );
}
