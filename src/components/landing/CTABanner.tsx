import Link from 'next/link';
import Button from '@/components/ui/Button';
import { CONTACT } from '@/lib/constants';

interface CTAProps {
  content?: { cta_section_title?: string; cta_section_subtitle?: string };
}

export default function CTABanner({ content }: CTAProps) {
  return (
    <section className="bg-teal py-16 md:py-20">
      <div className="max-w-3xl mx-auto px-4 text-center">
        <h2 className="font-heading font-bold text-3xl md:text-4xl text-white mb-4">
          {content?.cta_section_title || 'Haz tu reserva hoy'}
        </h2>
        <p className="font-body text-white/80 text-lg mb-8 max-w-lg mx-auto">
          {content?.cta_section_subtitle || 'Arma tu paquete ideal con todo lo que necesitas y recibe una cotizaci\u00f3n al instante.'}
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/catalogo">
            <Button variant="secondary" size="lg">
              Explorar Catálogo
            </Button>
          </Link>
          <a href={`https://wa.me/${CONTACT.whatsapp}`} target="_blank" rel="noopener noreferrer">
            <Button
              size="lg"
              className="bg-white text-teal hover:bg-white/90"
            >
              Contactar por WhatsApp
            </Button>
          </a>
        </div>
      </div>
    </section>
  );
}
