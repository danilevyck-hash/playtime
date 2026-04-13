import Link from 'next/link';

const STATS = [
  { value: '+600', label: 'Eventos realizados' },
  { value: '+400', label: 'Familias felices' },
  { value: '8', label: 'Servicios disponibles' },
];

export default function NosotrosPage() {
  return (
    <div className="bg-cream min-h-screen">
      <div className="max-w-3xl mx-auto px-4 py-12 md:py-20">
        {/* Hero text */}
        <h1 className="font-heading font-bold text-2xl md:text-3xl text-purple text-center mb-6">
          Nosotros
        </h1>
        <p className="text-center text-gray-600 text-sm md:text-base leading-relaxed max-w-xl mx-auto mb-12">
          Somos un equipo apasionado por crear momentos inolvidables para los más pequeños. Desde 2015, hemos llevado alegría a más de 600 eventos en Panamá, combinando creatividad, calidad y atención al detalle en cada fiesta.
        </p>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-12">
          {STATS.map((stat, i) => (
            <div key={i} className="bg-white rounded-2xl shadow-sm p-5 text-center">
              <span className="block font-heading font-bold text-2xl md:text-3xl text-purple">{stat.value}</span>
              <span className="text-xs md:text-sm text-gray-500 mt-1">{stat.label}</span>
            </div>
          ))}
        </div>

        {/* Team placeholder */}
        <div className="bg-white rounded-2xl shadow-sm p-6 md:p-8 mb-12">
          <h2 className="font-heading font-bold text-lg text-gray-800 mb-4">Nuestro equipo</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="text-center">
                <div className="w-20 h-20 mx-auto bg-teal/10 rounded-full flex items-center justify-center mb-2">
                  <svg className="w-8 h-8 text-teal/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                  </svg>
                </div>
                <p className="text-sm font-heading font-bold text-gray-400">Próximamente</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 text-center mt-4">
            Sección editable desde el panel de administración
          </p>
        </div>

        {/* CTA */}
        <div className="text-center">
          <p className="text-sm text-gray-500 mb-4">¿Lista para crear un momento mágico?</p>
          <Link
            href="/catalogo"
            className="inline-flex items-center justify-center gap-2 bg-purple text-white font-heading font-bold px-8 py-3.5 rounded-full text-sm hover:bg-purple/90 transition-colors"
          >
            Explorar catálogo
          </Link>
        </div>
      </div>
    </div>
  );
}
