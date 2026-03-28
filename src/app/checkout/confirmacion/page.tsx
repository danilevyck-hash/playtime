'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect } from 'react';
import { fetchLogoUrl } from '@/lib/supabase-data';
import { BANK_INFO, CONTACT } from '@/lib/constants';
import Button from '@/components/ui/Button';
import ConfettiBackground from '@/components/ui/ConfettiBackground';

export default function ConfirmacionPage() {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchLogoUrl().then(u => { if (u) setLogoUrl(u); }).catch(() => {});
  }, []);

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
        <p className="font-body text-lg text-gray-600 max-w-md mx-auto">
          Te contactamos por WhatsApp en menos de 2 horas para confirmar tu reserva.
        </p>

        {/* Bank info */}
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

        <div className="flex flex-col sm:flex-row gap-4 justify-center pt-2">
          <a href={`https://wa.me/${CONTACT.whatsapp}`} target="_blank" rel="noopener noreferrer">
            <Button size="lg" className="bg-[#25D366] hover:bg-[#20bd5a] text-white w-full">
              Abrir WhatsApp
            </Button>
          </a>
          <Link href="/">
            <Button variant="outline" size="lg">Volver al Inicio</Button>
          </Link>
        </div>

        <p className="font-body text-sm text-gray-400">
          {'\u00bf'}Tienes preguntas? Escr&iacute;benos al {CONTACT.phone}
        </p>
      </div>
    </ConfettiBackground>
  );
}
