import Link from 'next/link';

const STEPS = [
  {
    number: '1',
    title: 'Arma tu fiesta',
    text: 'Explora nuestro catálogo y elige los servicios que más te gusten. Puedes armar tu paquete a medida.',
    icon: (
      <svg className="w-8 h-8 text-purple" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
      </svg>
    ),
  },
  {
    number: '2',
    title: 'Reserva tu fecha',
    text: 'Envíanos tu pedido por WhatsApp y coordina la fecha. Asegura tu reserva con un depósito.',
    icon: (
      <svg className="w-8 h-8 text-purple" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
      </svg>
    ),
  },
  {
    number: '3',
    title: 'Nosotros nos encargamos',
    text: 'Llegamos, montamos todo y creamos una experiencia inolvidable. Tú solo disfruta.',
    icon: (
      <svg className="w-8 h-8 text-purple" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
      </svg>
    ),
  },
];

export default function ComoFuncionaPage() {
  return (
    <div className="bg-cream min-h-screen">
      <div className="max-w-3xl mx-auto px-4 py-12 md:py-20">
        <h1 className="font-heading font-bold text-2xl md:text-3xl text-purple text-center mb-2">
          Cómo Funciona
        </h1>
        <p className="text-center text-sm text-gray-500 mb-12">
          En 3 simples pasos, tu fiesta está lista
        </p>

        {/* Steps */}
        <div className="space-y-6 md:space-y-0 md:grid md:grid-cols-3 md:gap-8">
          {STEPS.map((step, i) => (
            <div key={i} className="relative">
              {/* Connector line on mobile */}
              {i < STEPS.length - 1 && (
                <div className="hidden max-md:block absolute left-8 top-[88px] w-0.5 h-6 bg-teal/30" />
              )}
              <div className="bg-white rounded-2xl shadow-sm p-6 text-center">
                <div className="w-16 h-16 mx-auto mb-4 bg-teal/10 rounded-2xl flex items-center justify-center">
                  {step.icon}
                </div>
                <span className="inline-block text-xs font-heading font-bold text-teal bg-teal/10 px-3 py-1 rounded-full mb-3">
                  Paso {step.number}
                </span>
                <h2 className="font-heading font-bold text-lg text-gray-800 mb-2">{step.title}</h2>
                <p className="text-sm text-gray-600 leading-relaxed">{step.text}</p>
              </div>
            </div>
          ))}
        </div>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-12">
          <Link
            href="/catalogo"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-purple text-white font-heading font-bold px-8 py-3.5 rounded-full text-sm hover:bg-purple/90 transition-colors"
          >
            ¡Arma tu fiesta!
          </Link>
          <a
            href="https://wa.me/50764332724"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-[#25D366] text-white font-heading font-semibold px-8 py-3.5 rounded-full text-sm hover:bg-[#20bd5a] transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
}
