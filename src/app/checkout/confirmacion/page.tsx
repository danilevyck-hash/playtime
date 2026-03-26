'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { fetchLogoUrl } from '@/lib/supabase-data';
import Button from '@/components/ui/Button';
import ConfettiBackground from '@/components/ui/ConfettiBackground';

export default function ConfirmacionPage() {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    fetchLogoUrl().then(u => { if (u) setLogoUrl(u); }).catch(() => {});
  }, []);

  return (
    <ConfettiBackground className="bg-beige min-h-[70vh]">
      <div className="max-w-2xl mx-auto px-4 py-16 md:py-24 text-center">
        <div className="mb-6">
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
        <div className="text-6xl mb-6">{'\uD83C\uDF89'}</div>
        <h1 className="font-heading font-bold text-3xl md:text-4xl text-purple mb-4">
          {'\u00a1'}Pedido Enviado!
        </h1>
        <p className="font-body text-lg text-gray-600 mb-2 max-w-md mx-auto">
          Tu pedido ha sido enviado por WhatsApp. Nos pondremos en contacto contigo pronto para confirmar los detalles.
        </p>
        <p className="font-body text-sm text-gray-400 mb-8">
          Si elegiste transferencia bancaria, recuerda enviar el comprobante de pago.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/">
            <Button variant="outline">Volver al Inicio</Button>
          </Link>
          <a href="https://wa.me/50764332724" target="_blank" rel="noopener noreferrer">
            <Button>
              Contactar por WhatsApp
            </Button>
          </a>
        </div>
      </div>
    </ConfettiBackground>
  );
}
