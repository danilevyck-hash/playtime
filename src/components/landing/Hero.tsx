import Image from 'next/image';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import ConfettiBackground from '@/components/ui/ConfettiBackground';


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
      <div className="max-w-6xl mx-auto px-4 py-12 md:py-20 text-center">
        <div className="mb-6">
          <Image src={logoUrl || "/logo.png"} alt="PlayTime" width={384} height={154} className="w-56 sm:w-72 md:w-96 h-auto object-contain mx-auto" priority />
        </div>

        <h1 className="font-heading font-black text-3xl sm:text-4xl md:text-6xl text-purple mb-4 leading-tight">
          {title}
        </h1>
        <p className="font-body text-lg md:text-xl text-gray-600 max-w-lg mx-auto mb-10 leading-relaxed">
          {subtitle}
        </p>

        <div className="flex justify-center">
          <Link href="/catalogo">
            <Button size="lg" className="bg-orange text-white hover:bg-orange/90 shadow-lg rounded-full px-10">
              {ctaPrimary}
            </Button>
          </Link>
        </div>

        <div className="flex items-center justify-center gap-2 mt-8 flex-wrap">
          <span className="bg-white/60 rounded-full px-3 py-1 text-sm font-heading font-semibold text-purple">+600 eventos {'\uD83C\uDF89'}</span>
          <span className="bg-white/60 rounded-full px-3 py-1 text-sm font-heading font-semibold text-purple">+400 familias felices {'\uD83D\uDC95'}</span>
        </div>
      </div>
    </ConfettiBackground>
  );
}
