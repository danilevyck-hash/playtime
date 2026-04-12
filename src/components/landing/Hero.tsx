import Image from 'next/image';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import ConfettiBackground from '@/components/ui/ConfettiBackground';
import { CONTACT } from '@/lib/constants';


interface HeroProps {
  content?: {
    hero_title?: string;
    hero_subtitle?: string;
    hero_cta_primary?: string;
    hero_cta_secondary?: string;
    social_proof_text?: string;
  };
  logoUrl?: string | null;
}

export default function Hero({ content, logoUrl }: HeroProps) {
  const title = content?.hero_title || 'Fiestas que los ni\u00f1os nunca olvidan';
  const subtitle = content?.hero_subtitle || 'Animaci\u00f3n, alquiler y manualidades. Todo incluido, hasta tu puerta.';
  const ctaPrimary = content?.hero_cta_primary || '\u00a1Arma tu fiesta! \uD83C\uDF89';

  return (
    <ConfettiBackground className="bg-beige">
      <div className="max-w-6xl mx-auto px-4 py-8 md:py-16 text-center">
        <div className="mb-6">
          <Image src={logoUrl || "/logo.png"} alt="PlayTime" width={384} height={154} className="w-56 sm:w-72 md:w-96 h-auto object-contain mx-auto" priority />
        </div>

        <h1 className="font-heading font-black text-3xl sm:text-4xl md:text-6xl text-purple mb-4 leading-tight">
          {title}
        </h1>
        <p className="font-body text-lg md:text-xl text-gray-600 max-w-lg mx-auto mb-6 leading-relaxed">
          {subtitle}
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link href="/catalogo" className="w-full sm:w-auto">
            <Button size="lg" className="bg-orange text-white hover:bg-orange/90 shadow-lg rounded-full px-10 w-full sm:w-auto">
              {ctaPrimary}
            </Button>
          </Link>
          <a
            href={`https://wa.me/${CONTACT.whatsapp}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-heading font-semibold text-[#25D366] hover:text-[#20BD5A] transition-colors sm:border sm:border-[#25D366] sm:rounded-full sm:px-5 sm:py-2"
          >
            Escr&iacute;benos {'\uD83D\uDCAC'}
          </a>
        </div>

        <p className="mt-5 text-sm font-body text-gray-500 flex items-center justify-center gap-1.5">
          <span>&#9889;</span> Respondemos en menos de 2 horas
        </p>

        <div className="flex items-center justify-center gap-2 mt-5 flex-wrap">
          <span className="bg-white/80 rounded-full px-4 py-1.5 text-base font-heading font-bold text-purple shadow-sm">+600 eventos {'\uD83C\uDF89'}</span>
          <span className="bg-white/80 rounded-full px-4 py-1.5 text-base font-heading font-bold text-purple shadow-sm">+400 familias felices {'\uD83D\uDC95'}</span>
        </div>
      </div>
    </ConfettiBackground>
  );
}
