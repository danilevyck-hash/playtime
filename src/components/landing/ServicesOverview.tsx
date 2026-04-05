import Link from 'next/link';
import { CATEGORIES } from '@/lib/constants';
import { Category } from '@/lib/types';
import { CATEGORY_DOODLES } from '@/components/ui/CategoryDoodles';

const STARTING_PRICES: Record<Category, string> = {
  planes: 'Desde $260',
  belleza: 'Desde $100',
  entretenimiento: 'Desde $150',
  snacks: 'Desde $100',
  gymboree: 'Desde $160',
  inflables: 'Desde $90',
  piscinas: 'Desde $40',
  alquiler: 'Desde $2',
  servicios: 'Desde $10',
  manualidades: 'Consultar',
};

const CATEGORY_COLORS = [
  'bg-teal/10 border-teal/30 hover:border-teal',
  'bg-pink/10 border-pink/30 hover:border-pink',
  'bg-orange/10 border-orange/30 hover:border-orange',
  'bg-yellow/10 border-yellow/30 hover:border-yellow',
  'bg-mint/10 border-mint/30 hover:border-mint',
  'bg-purple/10 border-purple/30 hover:border-purple',
  'bg-teal/10 border-teal/30 hover:border-teal',
  'bg-pink/10 border-pink/30 hover:border-pink',
  'bg-orange/10 border-orange/30 hover:border-orange',
  'bg-yellow/10 border-yellow/30 hover:border-yellow',
];

interface ServicesProps {
  content?: { services_title?: string; services_subtitle?: string };
}

export default function ServicesOverview({ content }: ServicesProps) {
  return (
    <section className="max-w-6xl mx-auto px-4 py-10 md:py-14">
      <div className="text-center mb-12">
        <h2 className="font-heading font-bold text-3xl md:text-4xl text-purple mb-3">
          {content?.services_title || 'Nuestros Servicios'}
        </h2>
        <p className="font-body text-gray-500 max-w-md mx-auto">
          {content?.services_subtitle || 'Todo lo que necesitas para una fiesta inolvidable'}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 md:gap-5">
        {CATEGORIES.map((cat, i) => {
          const Doodle = CATEGORY_DOODLES[cat.id];
          return (
            <Link
              key={cat.id}
              href={`/catalogo/${cat.id}`}
              className={`rounded-2xl border-2 p-5 transition-all duration-200 relative ${CATEGORY_COLORS[i % CATEGORY_COLORS.length]}`}
            >
              {cat.id === 'planes' && <span className="absolute top-3 right-3 bg-orange text-white text-[10px] font-heading font-bold px-2 py-0.5 rounded-full">Popular</span>}
              {Doodle ? <Doodle className="w-12 h-12 mb-2" /> : <span className="text-3xl block mb-2">{cat.icon}</span>}
              <h3 className="font-heading font-bold text-base text-gray-800 mb-1">{cat.label}</h3>
              <p className="font-body font-normal text-xs text-gray-500 leading-relaxed line-clamp-2">{cat.description}</p>
              <p className={`font-heading font-bold text-xs mt-1 ${STARTING_PRICES[cat.id] === 'Consultar' ? 'text-gray-500' : 'text-orange'}`}>
                {STARTING_PRICES[cat.id]}
              </p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
