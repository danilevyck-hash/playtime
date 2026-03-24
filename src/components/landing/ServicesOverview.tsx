import Link from 'next/link';
import { CATEGORIES } from '@/lib/constants';

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
];

export default function ServicesOverview() {
  return (
    <section className="max-w-6xl mx-auto px-4 py-16 md:py-24">
      <div className="text-center mb-12">
        <h2 className="font-heading font-bold text-3xl md:text-4xl text-purple mb-3">
          Nuestros Servicios
        </h2>
        <p className="font-body text-gray-500 max-w-md mx-auto">
          Todo lo que necesitas para una fiesta inolvidable
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
        {CATEGORIES.map((cat, i) => (
          <Link
            key={cat.id}
            href={`/catalogo/${cat.id}`}
            className={`rounded-2xl border-2 p-6 transition-all duration-200 ${CATEGORY_COLORS[i % CATEGORY_COLORS.length]}`}
          >
            <span className="text-3xl md:text-4xl block mb-3">{cat.icon}</span>
            <h3 className="font-heading font-bold text-lg text-gray-800 mb-1">{cat.label}</h3>
            <p className="font-body text-sm text-gray-500 leading-relaxed">{cat.description}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
